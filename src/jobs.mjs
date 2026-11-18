// Fila de jobs de corrida persistida em disco (DATA_DIR/jobs/<id>.json). Um render por vez.
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir, renderStory } from '../packages/render-worker/index.mjs';
import { validateRace } from '../packages/race-schema/index.mjs';

export const jobsDir = path.join(dataDir, 'jobs');
export const outputRoot = path.join(dataDir, 'saida');
const ACTIVE = new Set(['na_fila', 'renderizando']);

const queue = [];
let running = null;          // { id, controller }
const memory = new Map();    // id -> job

const now = () => new Date().toISOString();
const slug = text => String(text || 'corrida').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'corrida';

async function save(job) {
  job.atualizadoEm = now();
  memory.set(job.id, job);
  await fs.writeFile(path.join(jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2));
}

export function getJob(id) { return memory.get(id); }
export function listJobs() { return [...memory.values()].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)); }
export function queuePosition(id) { const i = queue.indexOf(id); return i < 0 ? 0 : i + 1; }
export function stats() { return { fila: queue.length, renderizando: running?.id || null }; }

// Aceita { corrida: {...}, post?, webhook?, pasta? } ou a corrida "pura" (objeto com corredores).
export function normalizeBody(body) {
  if (body && typeof body === 'object' && !body.corrida && Array.isArray(body.corredores)) return { corrida: body };
  return body;
}

export function validateRequest(raw) {
  const body = normalizeBody(raw);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['Corpo deve ser um objeto JSON.'];
  const errors = [];
  if (!body.corrida || typeof body.corrida !== 'object') errors.push('Campo "corrida" é obrigatório.');
  if (body.webhook && !/^https?:\/\//.test(body.webhook)) errors.push('"webhook" deve ser uma URL http(s).');
  if (errors.length) return errors;
  try { validateRace(body.corrida); }
  catch (error) {
    const issues = error.issues || error.errors;
    if (issues) return issues.map(i => `${['corrida', ...(i.path || [])].join('.')}: ${i.message}`);
    return [String(error.message || error)];
  }
  return [];
}

// Resumo do que vai acontecer (sem renderizar): duração, vencedor e ordem de chegada.
export function previewRace(corrida) {
  const r = validateRace(corrida);
  return { titulo: r.title, duracao: r.duration, vencedor: r.vencedorId,
    chegada: [...r.corredores].sort((a, b) => a.posicao - b.posicao).map(c => ({ posicao: c.posicao, animal: c.id, nome: c.nome })) };
}

export async function createJob(raw) {
  const body = normalizeBody(raw);
  const id = `job_${crypto.randomBytes(5).toString('hex')}`;
  const date = new Date().toISOString().slice(0, 10);
  const folder = `${date}-${slug(body.pasta || body.corrida.title)}-${id.slice(4)}`;
  const job = {
    id, status: 'na_fila', etapa: 'aguardando a vez', criadoEm: now(), atualizadoEm: now(),
    titulo: body.corrida.title, pasta: folder, previa: previewRace(body.corrida),
    opcoes: { webhook: body.webhook || null, post: body.post || null },
    erro: null, resultado: null
  };
  await fs.writeFile(path.join(jobsDir, `${id}.request.json`), JSON.stringify(body, null, 2));
  await save(job);
  queue.push(id);
  pump();
  return job;
}

export async function cancelJob(id) {
  const job = memory.get(id);
  if (!job) return null;
  if (running?.id === id) { running.controller.abort(); return job; }
  const i = queue.indexOf(id);
  if (i >= 0) { queue.splice(i, 1); job.status = 'cancelado'; job.etapa = 'cancelado'; await save(job); }
  return job;
}

async function processJob(job) {
  const controller = new AbortController();
  running = { id: job.id, controller };
  const outDir = path.join(outputRoot, job.pasta);
  await fs.mkdir(outDir, { recursive: true });
  try {
    const body = JSON.parse(await fs.readFile(path.join(jobsDir, `${job.id}.request.json`), 'utf8'));
    await fs.writeFile(path.join(outDir, 'corrida.json'), JSON.stringify(body.corrida, null, 2));
    job.status = 'renderizando'; job.etapa = 'renderizando o vídeo'; await save(job);
    const result = await renderStory(body.corrida, {
      outDir, signal: controller.signal,
      onStage: stage => { job.etapa = { rendering: 'renderizando o vídeo', encoding: 'codificando o MP4', validating: 'conferindo o vídeo' }[stage] || job.etapa; save(job); }
    });
    await fs.rename(path.join(outDir, 'poster.png'), path.join(outDir, 'capa.png')).catch(() => {});
    await fs.rename(path.join(outDir, 'subtitles.srt'), path.join(outDir, 'legenda.srt')).catch(() => {});
    job.status = 'concluido';
    job.etapa = 'pronto';
    job.resultado = { duracao: result.metrics.duration, bytes: result.metrics.outputBytes, segundosDeProcessamento: Math.round(result.metrics.elapsedSeconds) };
    await fs.writeFile(path.join(outDir, 'info.json'), JSON.stringify({ id: job.id, titulo: job.titulo, post: job.opcoes.post, previa: job.previa, ...job.resultado, criadoEm: job.criadoEm, concluidoEm: now() }, null, 2));
  } catch (error) {
    const cancelled = controller.signal.aborted;
    job.status = cancelled ? 'cancelado' : 'erro';
    job.etapa = cancelled ? 'cancelado' : 'falhou';
    job.erro = cancelled ? 'Cancelado pelo usuário.' : String(error.message || error).slice(0, 4000);
  } finally {
    running = null;
    await save(job);
    notify(job).catch(() => {});
  }
}

async function notify(job) {
  if (!job.opcoes.webhook || !['concluido', 'erro'].includes(job.status)) return;
  const base = process.env.PUBLIC_URL || '';
  await fetch(job.opcoes.webhook, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: job.id, status: job.status, erro: job.erro, pasta: job.pasta, post: job.opcoes.post,
      download: job.status === 'concluido' ? `${base}/api/v1/corridas/${job.id}/download` : null }),
    signal: AbortSignal.timeout(15000)
  });
}

async function pump() {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  const job = memory.get(id);
  if (job && job.status === 'na_fila') await processJob(job);
  setImmediate(pump);
}

export async function initJobs() {
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.rm(path.join(dataDir, '.render.lock'), { force: true }); // trava de um processo que caiu
  const files = (await fs.readdir(jobsDir)).filter(f => /^job_[a-f0-9]+\.json$/.test(f));
  const pending = [];
  for (const f of files) {
    const job = JSON.parse(await fs.readFile(path.join(jobsDir, f), 'utf8'));
    if (ACTIVE.has(job.status)) { job.status = 'na_fila'; job.etapa = 'retomado após reinício'; pending.push(job); }
    memory.set(job.id, job);
  }
  pending.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  for (const job of pending) { await save(job); queue.push(job.id); }
  pump();
}

export function outputFile(job, name) {
  const allowed = { video: 'movie.mp4', capa: 'capa.png', legenda: 'legenda.srt', info: 'info.json', corrida: 'story.json' };
  const file = allowed[name];
  if (!file) return null;
  const full = path.join(outputRoot, job.pasta, file);
  return existsSync(full) ? full : null;
}
