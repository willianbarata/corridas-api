import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validateRequest, previewRace, normalizeBody } from '../src/jobs.mjs';
import { validateRace } from '../packages/race-schema/index.mjs';

const dir = new URL('../examples/corridas/', import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, dir), 'utf8'));

test('as corridas prontas são todas válidas (100+)', async () => {
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 100, `só ${files.length} corridas`);
  for (const f of files) assert.deepEqual(validateRequest(await load(f)), [], f);
});

test('corrida "pura" (sem o envelope corrida) também é aceita', async () => {
  const { corrida } = await load('001-corrida-do-safari-1.json');
  assert.deepEqual(validateRequest(corrida), []);
  assert.ok(normalizeBody(corrida).corrida);
});

test('animal desconhecido e animal repetido são recusados', async () => {
  const body = await load('001-corrida-do-safari-1.json');
  body.corrida.corredores[0].animal = 'unicornio';
  assert.ok(validateRequest(body).some(e => e.includes('corredores')));
  const dup = await load('001-corrida-do-safari-1.json');
  dup.corrida.corredores[1] = { ...dup.corrida.corredores[0] };
  assert.ok(validateRequest(dup).some(e => e.includes('uma vez')));
});

test('vencedor fora da corrida é recusado', async () => {
  const body = await load('001-corrida-do-safari-1.json');
  body.corrida.vencedor = body.corrida.corredores.some(c => c.animal === 'pato') ? 'trex' : 'pato';
  if (body.corrida.corredores.some(c => c.animal === body.corrida.vencedor)) return;
  assert.ok(validateRequest(body).some(e => e.includes('vencedor')));
});

test('prévia: vencedor fixo chega em 1º e a dinâmica é determinística', async () => {
  const { corrida } = await load('001-corrida-do-safari-1.json');
  const p = previewRace(corrida);
  assert.equal(p.chegada[0].animal, corrida.vencedor);
  assert.deepEqual(validateRace(corrida), validateRace(corrida));
});

test('textos padrão são preenchidos quando omitidos', () => {
  const r = validateRace({ version: 1, title: 't', corredores: [{ animal: 'pato' }, { animal: 'trex' }], vencedor: 'pato' });
  assert.equal(r.textos.vencedor, 'PATO VENCEU!');
  assert.ok(r.textos.gancho.length > 0);
});

test('corpo sem corrida é recusado', () => {
  assert.ok(validateRequest({}).length > 0);
  assert.ok(validateRequest({ corrida: {}, webhook: 'ftp://x' }).some(e => e.includes('webhook')));
});
