// Gera corridas prontas (pedidos da API) em examples/corridas/NNN-slug.json + INDICE.md.
// Determinístico: rodar de novo produz os mesmos arquivos. Uso: node tools/gerar-corridas.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRace } from '../packages/race-schema/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'examples', 'corridas');
const animals = JSON.parse(await fs.readFile(path.join(root, 'assets', 'animals.json'), 'utf8')).animals;
const nome = Object.fromEntries(animals.map(a => [a.id, a.nome]));
const femininos = new Set(['avestruz', 'zebra', 'vaca', 'ovelha', 'raposa', 'lebre']);
const art = id => (femininos.has(id) ? 'a' : 'o');      // o pato / a lebre
const em = id => (femininos.has(id) ? 'na' : 'no');     // no leão / na lebre

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(2026);
const pick = list => list[Math.floor(rand() * list.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
function sample(list, n) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, n);
}
const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

// ---------------- textos ----------------
const ganchosGerais = ['Qual animal vai ganhar?', 'Só 1% acerta quem ganha!', 'Aposto que você erra essa!', 'Quem chega primeiro?',
  'Escolhe um ANTES da largada!', 'Pausa e escolhe o seu!', 'Essa corrida vai te surpreender!', 'Quem você acha que ganha?'];
const escolhas = ['Escolhe o seu e comenta!', 'Comenta o seu antes de acabar!', 'Fala nos comentários quem você escolheu!',
  'Trava o vídeo e escolhe!', 'Escolheu? Agora assiste até o fim!'];
const vitorias = ['{nome} VENCEU!', '{nome} GANHOU!', 'DEU {nome}!', '{nome} CRUZOU PRIMEIRO!', '{nome} LEVOU A MELHOR!'];
const vitoriasZebra = ['ZEBRA! DEU {nome}!', 'NINGUÉM ESPERAVA: {nome}!', 'SURPRESA! {nome} GANHOU!'];
const finais = ['Você acertou? Comenta aí!', 'Acertou? Segue pra próxima corrida!', 'Quem você escolheu? Comenta!',
  'Marca quem escolheu errado!', 'Quer revanche? Comenta!', 'Acertou de primeira? Conta aí!'];
const pets = ['Rex', 'Pipoca', 'Thor', 'Bolinha', 'Fumaça', 'Trovão', 'Paçoca', 'Biscoito', 'Faísca', 'Tufão', 'Cometa',
  'Jujuba', 'Pingo', 'Bidu', 'Zeus', 'Mel', 'Nino', 'Tico', 'Foguete', 'Relâmpago', 'Bolota', 'Chiclete', 'Amora', 'Pé de Pano'];
const tagsBase = ['#corridadeanimais', '#quemganha', '#animais', '#desenhoanimado', '#shorts'];

// ---------------- grupos ----------------
const temas = [
  { id: 'safari', titulo: 'Corrida do Safari', gancho: 'Corrida do safari: quem ganha?', animais: ['leao', 'tigre', 'elefante', 'zebra', 'avestruz', 'rinoceronte', 'hipopotamo'], tags: ['#safari', '#savana'] },
  { id: 'fazenda', titulo: 'Corrida da Fazenda', gancho: 'Corrida da fazenda: quem ganha?', animais: ['cavalo', 'porco', 'vaca', 'ovelha', 'galo', 'pato', 'cachorro'], tags: ['#fazenda', '#animaisdafazenda'] },
  { id: 'aves', titulo: 'Corrida das Aves', gancho: 'Aves na pista! Qual é a mais rápida?', animais: ['avestruz', 'pinguim', 'galo', 'flamingo', 'pato'], tags: ['#aves', '#passaros'] },
  { id: 'dinos', titulo: 'Dinossauros na Pista', gancho: 'Dinossauros x animais de hoje!', animais: ['trex', 'triceratops', 'elefante', 'rinoceronte', 'hipopotamo', 'leao', 'cavalo'], tags: ['#dinossauro', '#trex'] },
  { id: 'velozes', titulo: 'Os Mais Velozes', gancho: 'Só os mais rápidos! Quem ganha?', animais: ['cavalo', 'lebre', 'avestruz', 'raposa', 'tigre', 'leao', 'zebra'], tags: ['#velocidade', '#animaisrapidos'] },
  { id: 'pesados', titulo: 'Pesos Pesados', gancho: 'Corrida dos gigantes! Quem aguenta?', animais: ['elefante', 'rinoceronte', 'hipopotamo', 'vaca', 'trex', 'triceratops'], tags: ['#gigantes', '#pesopesado'] },
  { id: 'fofinhos', titulo: 'Corrida dos Fofinhos', gancho: 'Os mais fofos na pista! Quem vence?', animais: ['cachorro', 'porco', 'ovelha', 'pinguim', 'pato', 'lebre'], tags: ['#fofura', '#fofinhos'] },
  { id: 'predadores', titulo: 'Corrida dos Predadores', gancho: 'Predadores na pista! Quem é o rei?', animais: ['leao', 'tigre', 'raposa', 'trex', 'cachorro'], tags: ['#predadores', '#leao'] }
];
const pequenos = ['pato', 'pinguim', 'lebre', 'cachorro', 'porco', 'galo', 'ovelha', 'raposa'];
const gigantes = ['elefante', 'rinoceronte', 'hipopotamo', 'trex', 'triceratops', 'vaca', 'cavalo', 'leao', 'tigre'];
const ids = animals.map(a => a.id);

const races = [];
const seen = new Set();
function add(kind, { title, corredores, vencedor, gancho, vitoria, tags, tempo, comprimento, musica }) {
  const key = `${kind}|${corredores.map(c => c.animal).sort().join(',')}|${vencedor}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const n = races.length + 1;
  const corrida = {
    version: 1,
    title,
    pista: { comprimento: comprimento ?? between(50, 70) },
    corredores,
    vencedor,
    seed: 1000 + n * 37,
    tempoCorrida: tempo ?? between(14, 18),
    textos: { gancho, escolha: pick(escolhas), vencedor: vitoria ?? pick(vitorias), final: pick(finais) },
    musica: musica ?? (rand() < 0.3 ? 'music/suspense.wav' : 'music/alegre.wav')
  };
  const lista = corredores.map(c => c.nome || nome[c.animal]).join(', ');
  const post = {
    titulo: title.replace(/ #?\d+$/, ''),
    legenda: `${gancho} Corredores: ${lista}. Escolhe o seu e comenta antes do final! 🏁`,
    hashtags: [...tagsBase, ...(tags || [])]
  };
  races.push({ kind, corrida, post });
  return true;
}

// A) temas (6 por tema): 4 a 6 corredores, vencedor sorteado entre eles
for (const tema of temas) {
  let made = 0, tries = 0;
  while (made < 6 && tries++ < 100) {
    const grupo = sample(tema.animais, between(4, Math.min(6, tema.animais.length)));
    const v = pick(grupo);
    if (add('tema', { title: `${tema.titulo} #${made + 1}`, corredores: grupo.map(a => ({ animal: a })), vencedor: v,
      gancho: made % 2 === 0 ? tema.gancho : pick(ganchosGerais), tags: tema.tags })) made++;
  }
}

// B) duelos 1x1 (60): dois animais, corrida curta
{
  let made = 0, tries = 0;
  while (made < 60 && tries++ < 2000) {
    const [a, b] = sample(ids, 2);
    const v = rand() < 0.5 ? a : b;
    if (add('duelo', { title: `Duelo: ${nome[a]} x ${nome[b]}`, corredores: [{ animal: a }, { animal: b }], vencedor: v,
      gancho: `DUELO: ${nome[a]} x ${nome[b]}! Quem ganha?`, tempo: between(10, 13), comprimento: between(40, 55), tags: ['#duelo'] })) made++;
  }
}

// C) zebra: o pequeno vence os grandes (30)
{
  let made = 0, tries = 0;
  while (made < 30 && tries++ < 2000) {
    const small = pick(pequenos);
    const big = sample(gigantes, between(2, 5));
    const grupo = sample([small, ...big], big.length + 1);
    if (add('zebra', { title: `${nome[small]} contra os Gigantes ${made + 1}`, corredores: grupo.map(a => ({ animal: a })), vencedor: small,
      gancho: pick([`${art(small).toUpperCase()} ${nome[small].toLowerCase()} tem chance contra os gigantes?`, 'O menor tem alguma chance?', 'Ninguém aposta no pequeno...']),
      vitoria: pick(vitoriasZebra), tags: ['#zebra', '#surpresa'], musica: 'music/suspense.wav' })) made++;
  }
}

// D) mega corrida com 8 animais (25)
{
  let made = 0, tries = 0;
  while (made < 25 && tries++ < 500) {
    const grupo = sample(ids, 8);
    if (add('mega', { title: `Mega Corrida #${made + 1}`, corredores: grupo.map(a => ({ animal: a })), vencedor: 'sorteio',
      gancho: pick(['MEGA CORRIDA com 8 animais!', '8 animais, só 1 vence! Qual?', 'A maior corrida de todas!']),
      tempo: between(17, 20), comprimento: between(65, 80), tags: ['#megacorrida'] })) made++;
  }
}

// E) bichinhos com nome (25): apelidos de pet
{
  let made = 0, tries = 0;
  while (made < 25 && tries++ < 500) {
    const grupo = sample(ids, between(3, 5));
    const names = sample(pets, grupo.length);
    const corredores = grupo.map((a, i) => ({ animal: a, nome: names[i] }));
    if (add('pets', { title: `Corrida da Turma: ${names.slice(0, 3).join(', ')}`, corredores, vencedor: pick(grupo),
      gancho: pick(['Torce pro seu favorito!', `${names[0]}, ${names[1]} ou ${names[2] ?? 'outro'}?`, 'Qual bichinho vai ganhar?']), tags: ['#pets'] })) made++;
  }
}

// F) o favorito (12): todo mundo aposta no gigante/veloz... e às vezes ele perde
{
  const favoritos = ['trex', 'cavalo', 'leao', 'tigre', 'avestruz', 'lebre'];
  let made = 0, tries = 0;
  while (made < 12 && tries++ < 500) {
    const fav = favoritos[made % favoritos.length];
    const outros = sample(ids.filter(i => i !== fav), between(3, 4));
    const grupo = sample([fav, ...outros], outros.length + 1);
    const perde = made % 2 === 1;
    if (add('favorito', { title: `${nome[fav]} é ${art(fav) === 'a' ? 'a Favorita' : 'o Favorito'}? ${made + 1}`, corredores: grupo.map(a => ({ animal: a })), vencedor: perde ? pick(outros) : fav,
      gancho: `Todo mundo aposta ${em(fav)} ${nome[fav]}... e você?`, vitoria: perde ? pick(vitoriasZebra) : pick(vitorias), tags: ['#favorito'] })) made++;
  }
}

// ---------------- grava ----------------
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
const rows = [];
for (const [i, r] of races.entries()) {
  const n = String(i + 1).padStart(3, '0');
  const file = `${n}-${slug(r.corrida.title)}.json`;
  const v = validateRace(r.corrida); // falha aqui se algum texto/limite estiver errado
  await fs.writeFile(path.join(outDir, file), JSON.stringify({ corrida: r.corrida, post: r.post }, null, 2) + '\n');
  const venc = v.corredores.find(c => c.id === v.vencedorId).nome;
  rows.push(`| ${n} | ${r.kind} | ${r.corrida.title} | ${v.corredores.map(c => c.nome).join(', ')} | ${venc} | ${v.duration.toFixed(1)} s |`);
}
const kinds = races.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {});
await fs.writeFile(path.join(outDir, 'INDICE.md'), `# Corridas prontas (${races.length})

Gerado por \`node tools/gerar-corridas.mjs\`. Cada arquivo é o corpo pronto para \`POST /api/v1/corridas\`.
Tipos: ${Object.entries(kinds).map(([k, v]) => `${k} (${v})`).join(', ')}.

| Nº | Tipo | Título | Corredores | Vencedor | Vídeo |
|---|---|---|---|---|---|
${rows.join('\n')}
`);
console.log(`Gerados ${races.length} pedidos em examples/corridas`, kinds);
