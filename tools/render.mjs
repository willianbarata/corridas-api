// Uso: node tools/render.mjs <corrida.json> <pasta_saida>   |   node tools/render.mjs --validar <corrida.json>
// Ferramentas: usa GODOT_PATH/FFMPEG_PATH/FFPROBE_PATH; se ausentes, as do projeto histórias (C:\dev\godot\tools\bin), só leitura.
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
const godotTools = 'C:/dev/godot/tools/bin';
if (process.platform === 'win32' && existsSync(godotTools)) {
  const ff = readdirSync(path.join(godotTools, 'ffmpeg')).find(d => d.startsWith('ffmpeg-'));
  process.env.GODOT_PATH ||= path.join(godotTools, 'godot', 'Godot_v4.7.2-stable_win64_console.exe');
  process.env.FFMPEG_PATH ||= path.join(godotTools, 'ffmpeg', ff, 'bin', 'ffmpeg.exe');
  process.env.FFPROBE_PATH ||= path.join(godotTools, 'ffmpeg', ff, 'bin', 'ffprobe.exe');
}
const { renderStory } = await import('../packages/render-worker/index.mjs');
const { validateRace } = await import('../packages/race-schema/index.mjs');
const args = process.argv.slice(2);
// aceita a corrida pura ou o pedido da API ({ corrida, post })
const load = async file => { const raw = JSON.parse(await readFile(file, 'utf8')); return raw.corrida ?? raw; };
if (args[0] === '--validar') {
  const r = validateRace(await load(args[1]));
  console.log(`Corrida válida: ${r.title}, ${r.duration}s, vencedor ${r.vencedorId}`);
} else {
  const [input, out] = args;
  const result = await renderStory(await load(input), { outDir: path.resolve(out), onStage: s => console.log(s) });
  console.log(JSON.stringify({ status: result.metrics.status, duration: result.metrics.duration, elapsed: result.metrics.elapsedSeconds }));
}
