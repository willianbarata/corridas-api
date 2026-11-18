import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
const audioRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../assets/audio');
export async function composeArgs(story){
  const sounds=[];let offset=0;
  // Corridas: sons já vêm com tempo absoluto em story.sounds; histórias: por cena.
  if(Array.isArray(story.sounds))sounds.push(...story.sounds);
  for(const scene of story.scenes||[]){for(const sound of scene.sounds)sounds.push({...sound,time:sound.time+offset});offset+=scene.duration;}
  if(!sounds.length)return {inputs:[],filters:[],map:['-map','0:a:0?']};
  const inputs=[];const filter=[];
  for(const [i,sound] of sounds.entries()){
    const file=path.resolve(audioRoot,sound.path);
    const relative=path.relative(audioRoot,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||path.extname(file).toLowerCase()!=='.wav')throw Error('Áudio deve ser WAV dentro de assets/audio');
    const real=await fs.realpath(file);const realRoot=await fs.realpath(audioRoot);
    if(path.relative(realRoot,real).startsWith('..'))throw Error('Áudio fora da pasta autorizada');
    await fs.access(file);inputs.push('-i',file);
    const delay=Math.round(sound.time*1000);
    filter.push(`[${i+1}:a]volume=${sound.volume},adelay=${delay}|${delay}[a${i}]`);
  }
  filter.push(`${sounds.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${sounds.length}:normalize=0,alimiter=limit=0.92:level=disabled,apad[mix]`);
  return {inputs,filters:['-filter_complex',filter.join(';')],map:['-map','[mix]']};
}
function timestamp(t){const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;}
export function subtitles(story){
  if(story.timeline&&story.textos){ // corridas: textos na tela como legenda
    const tl=story.timeline,end=story.duration,fim=Math.max(tl.winnerVideo+1.5,end-2.8);
    const items=[[0,tl.intro,story.textos.gancho],[0.6,tl.intro,story.textos.escolha],[tl.winnerVideo,fim,story.textos.vencedor],[fim,end,story.textos.final]].filter(i=>i[2]);
    return items.map(([a,b,text],i)=>`${i+1}\n${timestamp(a)} --> ${timestamp(b)}\n${text}\n`).join('\n');
  }
  let offset=0;const lines=[];for(const s of story.scenes||[]){for(const d of s.dialogues)lines.push(`${lines.length+1}\n${timestamp(offset+d.time)} --> ${timestamp(offset+d.time+d.duration)}\n${d.text}\n`);offset+=s.duration;}return lines.join('\n');}
// Providers implement synthesize({text,voice,outPath,signal}) -> WAV path.
export class UnconfiguredTTSProvider {async synthesize(){throw Error('TTS indisponível: configure um provedor. WAV local funciona sem TTS.');}}
