import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRace as validateStory } from '../race-schema/index.mjs';
import { composeArgs, subtitles } from '../audio-pipeline/index.mjs';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
async function find(dir,name){
  for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){const result=await find(file,name);if(result)return result;}
    else if(entry.name.toLowerCase()===name.toLowerCase()) return file;
  }
}
// Pasta de dados (jobs, saídas, cache do Godot). No Docker: volume em /data.
export const dataDir=process.env.DATA_DIR||path.join(root,'data');
const isWindows=process.platform==='win32';
export async function executables(){
  // Linux (Docker): binários no PATH. Windows (testes locais): variáveis de ambiente ou tools/bin.
  const result={
    godot:process.env.GODOT_PATH||(isWindows?await find(path.join(root,'tools/bin/godot'),'Godot_v4.7.2-stable_win64_console.exe'):'godot'),
    ffmpeg:process.env.FFMPEG_PATH||(isWindows?await find(path.join(root,'tools/bin/ffmpeg'),'ffmpeg.exe'):'ffmpeg'),
    ffprobe:process.env.FFPROBE_PATH||(isWindows?await find(path.join(root,'tools/bin/ffmpeg'),'ffprobe.exe'):'ffprobe')
  };
  for(const [key,value] of Object.entries(result))if(!value)throw Error(`${key} ausente: defina ${key.toUpperCase()}_PATH.`);
  return result;
}
export async function processRun(executable,args,{log,signal,timeout=30*60*1000,env={}}={}){
  const output=[];
  try{return await new Promise((resolve,reject)=>{
    let settled=false;
    let abortError=null;
    const child=spawn(executable,args,{cwd:root,shell:false,windowsHide:true,signal,env:{...process.env,APPDATA:path.join(dataDir,'roaming'),LOCALAPPDATA:path.join(dataDir,'local'),XDG_DATA_HOME:path.join(dataDir,'xdg-data'),XDG_CONFIG_HOME:path.join(dataDir,'xdg-config'),XDG_CACHE_HOME:path.join(dataDir,'xdg-cache'),...env}});
    const timer=setTimeout(()=>{child.kill();},timeout);
    const receive=chunk=>{output.push(chunk.toString());};
    child.stdout.on('data',receive);child.stderr.on('data',receive);
    child.on('error',error=>{abortError=error;});
    child.on('close',(code)=>{
      clearTimeout(timer);if(settled)return;settled=true;
      const text=output.join('');
      if(abortError)reject(abortError);
      else if(code!==0)reject(Error(`Processo terminou com código ${code}: ${path.basename(executable)}\n${text.slice(-3000)}`));
      else resolve(text);
    });
  });}finally{if(log)await fs.writeFile(log,output.join(''));}
}
export async function probeVideo(file,story,tools){
  if((await fs.stat(file)).size===0)throw Error('Vídeo vazio');
  const metadata=JSON.parse(await processRun(tools.ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file]));
  const video=metadata.streams.find(s=>s.codec_type==='video');
  const [n,d]=video.avg_frame_rate.split('/').map(Number);
  if(video.width!==story.video.width || video.height!==story.video.height || Math.abs(n/d-story.video.fps)>0.001 || Math.abs(Number(metadata.format.duration)-story.duration)>1/story.video.fps || Number(video.nb_read_frames)!==Math.round(story.duration*story.video.fps))throw Error('Metadados do vídeo divergem do roteiro');
  await processRun(tools.ffmpeg,['-v','error','-xerror','-i',file,'-f','null','-']);
  return metadata;
}
export async function renderStory(value,{outDir=path.join(dataDir,'output',`render-${Date.now()}`),signal,onStage=()=>{},keepWorkFiles=false}={}){
  const story=validateStory(value);
  const tools=await executables();
  await fs.mkdir(outDir,{recursive:true});
  await fs.rm(path.join(outDir,'error.txt'),{force:true}); // não deixar erro de execução anterior
  for(const dir of ['roaming','local','xdg-data','xdg-config','xdg-cache'])await fs.mkdir(path.join(dataDir,dir),{recursive:true});
  const lockPath=path.join(dataDir,'.render.lock');
  await fs.mkdir(path.dirname(lockPath),{recursive:true});
  let lock;
  try{lock=await fs.open(lockPath,'wx');}catch{throw Error('Há uma renderização em andamento (trava em DATA_DIR/.render.lock).');}
  const started=performance.now();
  try{
    const storyPath=path.join(outDir,'story.json');
    const avi=path.join(outDir,'movie.avi');
    const mp4=path.join(outDir,'movie.mp4');
    await fs.writeFile(storyPath,JSON.stringify(story,null,2));
    // MovieWriter chooses its dimensions at startup, before scene _ready().
    // Use an isolated project per job so renders never edit the shared project.
    const engineDir=path.join(outDir,'engine');
    await fs.cp(path.join(root,'engine/godot'),engineDir,{recursive:true,filter:source=>path.basename(source)!=='.godot'});
    let config=await fs.readFile(path.join(engineDir,'project.godot'),'utf8');
    config=config.replace(/window\/size\/viewport_width=\d+/,`window/size/viewport_width=${story.video.width}`).replace(/window\/size\/viewport_height=\d+/,`window/size/viewport_height=${story.video.height}`);
    config=config.replace('[display]','[display]\nwindow/stretch/mode="viewport"');
    await fs.writeFile(path.join(engineDir,'project.godot'),config);
    onStage('rendering');
    // Sem monitor (servidor/Docker): RENDER_WRAPPER=xvfb-run cria uma tela virtual para o Godot.
    const godotArgs=['--path',engineDir,'--rendering-method','gl_compatibility','--audio-driver','Dummy','--disable-vsync','--write-movie',avi,'--fixed-fps',String(story.video.fps),'--quit-after',String(Math.round(story.duration*story.video.fps)),'--log-file',path.join(outDir,'engine.log'),'--',`--story=${storyPath}`];
    const wrapper=process.env.RENDER_WRAPPER;
    const output=wrapper
      ? await processRun(wrapper,[...(process.env.RENDER_WRAPPER_ARGS||'-a -s -screen_0_1920x1920x24').split(' ').map(a=>a.replace(/_/g,' ')),tools.godot,...godotArgs],{log:path.join(outDir,'godot.log'),signal})
      : await processRun(tools.godot,godotArgs,{log:path.join(outDir,'godot.log'),signal});
    if(/SCRIPT ERROR|Parse Error|Invalid story/.test(output))throw Error('Godot reportou erro de roteiro/script; consulte godot.log');
    if((await fs.stat(avi)).size===0)throw Error('Godot não produziu vídeo');
    onStage('encoding');
    const audio=await composeArgs(story);
    await fs.writeFile(path.join(outDir,'subtitles.srt'),subtitles(story));
    await processRun(tools.ffmpeg,['-hide_banner','-y','-i',avi,...audio.inputs,...audio.filters,'-map','0:v:0',...audio.map,'-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-movflags','+faststart','-t',String(story.duration),mp4],{log:path.join(outDir,'ffmpeg.log'),signal});
    onStage('validating');
    const metadata=await probeVideo(mp4,story,tools);
    await processRun(tools.ffmpeg,['-v','error','-y','-i',mp4,'-frames:v','1','-update','1',path.join(outDir,'poster.png')],{signal});
    const metrics={status:'completed',duration:story.duration,frames:Math.round(story.duration*story.video.fps),width:story.video.width,height:story.video.height,fps:story.video.fps,elapsedSeconds:(performance.now()-started)/1000,outputBytes:(await fs.stat(mp4)).size,metadata};
    await fs.writeFile(path.join(outDir,'result.json'),JSON.stringify(metrics,null,2));
    if(!keepWorkFiles){await fs.rm(engineDir,{recursive:true,force:true});await fs.rm(avi,{force:true});}
    onStage('completed');return {mp4,outDir,metrics};
  }catch(error){await fs.writeFile(path.join(outDir,'error.txt'),String(error.stack??error));throw error;}
  finally{await lock.close();await fs.unlink(lockPath);}
}
