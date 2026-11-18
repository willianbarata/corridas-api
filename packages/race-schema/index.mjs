// Corrida de animais: valida o JSON de entrada e monta a disputa (determinística pela seed).
// validateRace(input) -> objeto normalizado que o Godot (race_player.gd) e o mixer de áudio usam.
import { z } from 'zod';
import { readFileSync } from 'node:fs';

const animals = JSON.parse(readFileSync(new URL('../../assets/animals.json', import.meta.url), 'utf8')).animals;
export const animalIds = animals.map(a => a.id);
const animalName = Object.fromEntries(animals.map(a => [a.id, a.nome]));
const animalHeight = Object.fromEntries(animals.map(a => [a.id, a.height]));

export const musicas = ['music/alegre.wav', 'music/suspense.wav'];
const id = z.enum(animalIds);
export const RaceSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(120),
  video: z.object({
    width: z.number().int().min(240).max(1920).multipleOf(2),
    height: z.number().int().min(240).max(1920).multipleOf(2),
    fps: z.union([z.literal(24), z.literal(30)])
  }).strict().default({ width: 720, height: 1280, fps: 24 }),
  pista: z.object({ comprimento: z.number().min(30).max(120).default(60) }).strict().default({ comprimento: 60 }),
  corredores: z.array(z.object({ animal: id, nome: z.string().min(1).max(20).optional() }).strict()).min(2).max(8),
  vencedor: z.union([id, z.literal('sorteio')]).default('sorteio'),
  seed: z.number().int().min(0).max(1e9).default(1),
  tempoCorrida: z.number().min(8).max(40).default(16),
  textos: z.object({
    gancho: z.string().max(80).default('Qual animal vai ganhar?'),
    escolha: z.string().max(80).default('Escolhe o seu e comenta!'),
    vencedor: z.string().max(60).default('{nome} VENCEU!'),
    final: z.string().max(80).default('Você acertou? Comenta aí!')
  }).strict().prefault({}),
  musica: z.enum(musicas).default('music/alegre.wav')
}).strict().superRefine((race, ctx) => {
  const ids = race.corredores.map(c => c.animal);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Cada animal só pode correr uma vez', path: ['corredores'] });
  if (race.vencedor !== 'sorteio' && !ids.includes(race.vencedor)) ctx.addIssue({ code: 'custom', message: 'O vencedor precisa estar entre os corredores', path: ['vencedor'] });
});

// PRNG determinístico (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function validateRace(value) {
  const race = RaceSchema.parse(value);
  const rand = rng(race.seed * 7919 + 13);
  const ids = race.corredores.map(c => c.animal);
  const winner = race.vencedor === 'sorteio' ? ids[Math.floor(rand() * ids.length)] : race.vencedor;
  const R = race.tempoCorrida;

  // Ordem de chegada: vencedor, depois os outros embaralhados; 2º chega por um triz (photo finish).
  const others = ids.filter(i => i !== winner).sort(() => rand() - 0.5);
  const order = [winner, ...others];
  const finish = {};
  finish[winner] = R;
  let t = R + 0.12 + rand() * 0.12;
  for (const [k, a] of others.entries()) { finish[a] = t; t += 0.35 + rand() * (k === 0 ? 0.4 : 1.1); }

  // Curva de cada corredor: f(u)=u + a1 sin(pi u) + a2 sin(2pi u) + a3 sin(3pi u) (f(0)=0, f(1)=1, crescente).
  // Vencedor fica para trás no meio (a1<0) e arranca no fim; outros com lideranças passageiras.
  const runners = race.corredores.map((c, lane) => {
    const isWinner = c.animal === winner;
    let a1 = isWinner ? -(0.05 + rand() * 0.03) : -0.02 + rand() * 0.09;
    let a2 = (rand() - 0.5) * 0.06;
    let a3 = (rand() - 0.5) * 0.04;
    const slope = Math.PI * (Math.abs(a1) + 2 * Math.abs(a2) + 3 * Math.abs(a3));
    if (slope > 0.85) { const k = 0.85 / slope; a1 *= k; a2 *= k; a3 *= k; }
    return { id: c.animal, nome: c.nome || animalName[c.animal], altura: animalHeight[c.animal], raia: lane,
      chegada: Number(finish[c.animal].toFixed(3)), curva: [a1, a2, a3].map(v => Number(v.toFixed(4))),
      posicao: order.indexOf(c.animal) + 1 };
  });

  // Linha do tempo do vídeo (s): apresentação, contagem, corrida (com câmera lenta no final) e comemoração.
  const intro = 3.2, countdown = 3.0, slowFactor = 0.35;
  const slowStart = Math.max(R - 1.4, R * 0.6), slowEnd = R + 0.45;
  const raceStart = intro + countdown;
  const toVideo = rt => rt <= slowStart ? raceStart + rt
    : rt <= slowEnd ? raceStart + slowStart + (rt - slowStart) / slowFactor
    : raceStart + slowStart + (slowEnd - slowStart) / slowFactor + (rt - slowEnd);
  const winnerVideo = toVideo(R);
  const outro = 5.0;
  const duration = Number((toVideo(slowEnd) + outro).toFixed(3));

  const beep = 'sfx/bip.wav', go = 'sfx/largada.wav';
  const sounds = [
    { time: 0.0, path: 'sfx/swish_1.wav', volume: 0.5 },
    { time: intro, path: beep, volume: 0.8 },
    { time: intro + 0.75, path: beep, volume: 0.8 },
    { time: intro + 1.5, path: beep, volume: 0.8 },
    { time: intro + 2.25, path: go, volume: 0.9 },
    { time: intro + 2.3, path: race.musica, volume: 0.45 },
    { time: intro + 2.4, path: 'sfx/torcida.wav', volume: 0.35 },
    { time: toVideo(slowStart) - 0.05, path: 'sfx/camera_lenta.wav', volume: 0.6 },
    { time: winnerVideo, path: 'sfx/confete.wav', volume: 0.85 },
    { time: winnerVideo + 0.05, path: 'sfx/vitoria.wav', volume: 0.75 },
    { time: winnerVideo + 0.3, path: 'sfx/palmas.wav', volume: 0.6 },
    { time: winnerVideo + 0.4, path: 'sfx/torcida.wav', volume: 0.5 }
  ].filter(s => s.time < duration).map(s => ({ ...s, time: Number(s.time.toFixed(3)) }));

  const vencedorNome = runners.find(r => r.id === winner).nome;
  return {
    ...race, duration, vencedorId: winner,
    textos: { ...race.textos, vencedor: race.textos.vencedor.replace('{nome}', vencedorNome.toUpperCase()) },
    corredores: runners,
    timeline: { intro, countdown, raceStart, slowStart, slowEnd, slowFactor, winnerVideo: Number(winnerVideo.toFixed(3)), duration },
    sounds
  };
}
