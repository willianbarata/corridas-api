# Corridas API

API que recebe uma **corrida de animais em JSON**, **renderiza** o vídeo 3D vertical no **Godot 4.7.2**
(contagem, corrida, câmera lenta na chegada, pódio, música e efeitos) e devolve o **MP4** para download.
Feita para rodar em Docker (Easypanel) e ser chamada pelo **n8n**. Não usa voz nem serviço pago: só CPU.

Já vem com **200 corridas prontas** em `examples/corridas/` (lista em `examples/corridas/INDICE.md`):
48 temáticas (safari, fazenda, aves, dinossauros, velozes, pesos pesados, fofinhos, predadores),
60 duelos 1x1, 30 "zebras" (o pequeno vence os gigantes), 25 mega corridas com 8 animais,
25 com nomes de bichinhos e 12 do "favorito". Cada arquivo é o corpo pronto do POST.

---

## Fluxo com o n8n

```
[n8n] POST /api/v1/corridas  ──▶  { "id": "job_xxx", "status": "na_fila", "previa": {...} }   (HTTP 202)
[n8n] GET  /api/v1/corridas/job_xxx
        ├─ HTTP 202 → { "pronto": false, "mensagem": "Ainda não está pronto... Tente novamente em 30 segundos." }
        ├─ HTTP 200 → { "pronto": true, "download": { "video": ".../download", "capa": ..., "legenda": ..., "info": ... } }
        └─ HTTP 422 → { "pronto": false, "status": "erro", "erro": "motivo" }
[n8n] GET  /api/v1/corridas/job_xxx/download   →  MP4 (binário)
```

Todas as rotas `/api/v1/*` exigem o cabeçalho **`Authorization: Bearer <API_KEY>`** (ou `X-API-Key`).

### Rotas
| Método | Rota | O que faz |
|---|---|---|
| GET | `/health` | saúde do serviço (sem chave) |
| GET | `/api/v1/catalogo` | animais, músicas e limites |
| GET | `/api/v1/exemplos` | nomes das 200 corridas prontas |
| GET | `/api/v1/exemplos/{nome}` | uma corrida pronta (ex.: `001-corrida-do-safari-1`) |
| GET | `/api/v1/exemplos/aleatorio` | uma corrida pronta sorteada (bom para postar todo dia) |
| POST | `/api/v1/validar` | só valida e mostra a prévia (vencedor, ordem de chegada, duração) |
| POST | `/api/v1/corridas` | envia a corrida → devolve `id` (HTTP 202) |
| GET | `/api/v1/corridas` | últimos 50 jobs |
| GET | `/api/v1/corridas/{id}` | status: **202** processando · **200** pronto · **422** erro |
| GET | `/api/v1/corridas/{id}/download` | baixa o MP4 (`?arquivo=capa`, `legenda`, `info`, `corrida`) |
| DELETE | `/api/v1/corridas/{id}` | cancela (se ainda na fila/renderizando) |

### Corpo do POST `/api/v1/corridas`
```json
{
  "webhook": null,
  "post": { "titulo": "Duelo: Leão x Tigre", "legenda": "...", "hashtags": ["#corridadeanimais"] },
  "corrida": {
    "version": 1,
    "title": "Duelo: Leão x Tigre",
    "pista": { "comprimento": 50 },
    "corredores": [ { "animal": "leao" }, { "animal": "tigre", "nome": "Tigrão" } ],
    "vencedor": "tigre",
    "seed": 7,
    "tempoCorrida": 12,
    "textos": { "gancho": "DUELO: Leão x Tigre! Quem ganha?", "escolha": "Escolhe o seu e comenta!",
                "vencedor": "{nome} VENCEU!", "final": "Você acertou? Comenta aí!" },
    "musica": "music/alegre.wav"
  }
}
```
- `corrida` (obrigatório). Também dá para mandar só o objeto da corrida, sem o envelope.
  - `corredores`: 2 a 8, sem repetir animal. `nome` opcional (até 20 letras) aparece no vídeo no lugar do nome do animal.
  - Animais: `cachorro, leao, tigre, elefante, zebra, avestruz, rinoceronte, hipopotamo, cavalo, raposa, lebre, porco, vaca, ovelha, pinguim, galo, flamingo, pato, trex, triceratops`.
  - `vencedor`: id de um corredor ou `"sorteio"`. `seed` muda a dinâmica (quem lidera no meio, diferenças na chegada).
  - `tempoCorrida`: 8 a 40 s (o vídeo fica ~15 s mais longo: apresentação, contagem, câmera lenta e comemoração).
  - `textos.vencedor` aceita `{nome}` (vira o nome em MAIÚSCULAS). `musica`: `music/alegre.wav` ou `music/suspense.wav`.
- `webhook`: opcional — a API faz um POST nele quando terminar (além do polling).
- `post`: livre; volta no status e no `info.json` para o fluxo que posta.

### Teste rápido com curl
```bash
curl -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \
     --data-binary @examples/corridas/049-duelo-lebre-x-zebra.json https://SEU_DOMINIO/api/v1/corridas
curl -H "Authorization: Bearer SUA_CHAVE" https://SEU_DOMINIO/api/v1/corridas/job_xxx
curl -H "Authorization: Bearer SUA_CHAVE" -o corrida.mp4 https://SEU_DOMINIO/api/v1/corridas/job_xxx/download
```
(Os nomes dos arquivos estão em `examples/corridas/INDICE.md`.)

### Montando no n8n (polling)
1. *(opcional)* **HTTP Request** — GET `.../api/v1/exemplos/aleatorio` para pegar uma corrida pronta.
2. **HTTP Request** — POST `https://SEU_DOMINIO/api/v1/corridas`, header `Authorization: Bearer {{API_KEY}}`,
   body JSON = a corrida (ou `{{$json}}` do passo 1). Guarde `{{$json.id}}`.
3. **Wait** — 30 segundos (ou o valor de `tenteNovamenteEm`).
4. **HTTP Request** — GET `.../api/v1/corridas/{{id}}`. Em *Options*, ative **Include Response Headers and Status**
   e **Never Error** (para o 422 não quebrar o fluxo).
5. **IF** — `statusCode == 200` → segue; `statusCode == 202` → volta ao **Wait**; `422` → trate o erro.
6. **HTTP Request** — GET `{{$json.download.video}}` com o mesmo header, *Response Format* = **File**.
7. Poste usando `{{$json.post.titulo}}`, `{{$json.post.legenda}}` e `{{$json.post.hashtags}}`.

---

## Saídas no servidor
Cada vídeo fica em `/data/saida/<data>-<titulo>-<id>/`:
`movie.mp4`, `capa.png`, `legenda.srt`, `info.json` (post + prévia + duração), `corrida.json` (recebida),
`story.json` (corrida calculada), logs. Os jobs ficam em `/data/jobs/`. **Monte `/data` como volume**
(a fila é retomada automaticamente após reinício).

---

## Implantação no Easypanel
1. Coloque esta pasta num repositório Git (GitHub/GitLab) — o `.gitignore` já exclui `node_modules`, `data` e segredos.
2. No Easypanel: **Create Service → App** → *Source*: o repositório → *Build*: **Dockerfile**.
3. *Environment*: copie de `.env.example` — no mínimo `API_KEY` (longa e aleatória) e `PUBLIC_URL` (o domínio do app).
4. *Mounts*: **Volume** montado em **`/data`**.
5. *Domains*: aponte o domínio para a porta **3000**. Confira `https://SEU_DOMINIO/health`.

Teste local antes: `cp .env.example .env`, edite a chave e rode `docker compose up --build`.

### Se o render falhar no servidor
Veja `/data/saida/<pasta>/godot.log` e `ffmpeg.log` (e `GET /api/v1/corridas/{id}` traz o erro).
Godot sem tela: a imagem usa `RENDER_WRAPPER=xvfb-run` com OpenGL por software (llvmpipe). Para testar
dentro do container: `xvfb-run -a godot --version`.

**Status do teste:** o fluxo completo (POST → 202 → 200 → download) foi testado no Windows com estes mesmos
arquivos; a imagem Docker não foi construída aqui (sem Docker nesta máquina). Rode `docker compose up --build`
e envie uma corrida de `examples/corridas/` antes de subir para produção.

### Recursos do servidor
- Render **por CPU** (sem placa de vídeo). Reserve **2+ vCPUs e 2–4 GB de RAM**. Uma corrida de ~30 s leva
  ~35 s num PC desktop; em VPS pode levar alguns minutos — o polling cuida disso.
- Um vídeo por vez (fila). Disco: ~8–15 MB por vídeo em `/data/saida`; apague pastas antigas quando quiser.

---

## Estrutura
```
src/server.mjs           API HTTP (Node puro, sem framework)
src/jobs.mjs             fila persistida em disco, render → saída
packages/race-schema     validação Zod da corrida + dinâmica determinística (seed)
packages/render-worker   Godot (Movie Maker) → FFmpeg (MP4 H.264 + AAC), conferência do vídeo
packages/audio-pipeline  mixagem de música/efeitos e legenda SRT
engine/godot             projeto Godot: pista, arquibancada, animais, câmeras, textos na tela
assets/animals.json      animais disponíveis (id, nome, altura)
assets/audio             músicas e efeitos (licenças em assets/audio/LICENSES.md)
examples/corridas        200 corridas prontas + INDICE.md
tools/gerar-corridas.mjs gera de novo as corridas prontas (npm run gerar)
tools/render.mjs         render direto sem API: node tools/render.mjs <corrida.json> <pasta>
tests/                   testes (npm test)
```

Licenças: animais **Gobkit** (CC0), peças de pista **Kenney Racing Kit** (CC0), músicas/efeitos em
`assets/audio/LICENSES.md` (CC0 ou gerados). Detalhes em `docs/CATALOGO_MODELOS.md`.
