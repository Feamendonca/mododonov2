# Port Modo Dono (fora do Manus) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]`.

**Goal:** Rodar o Modo Dono em infra própria (Supabase + Vercel) sem perder funcionalidade, com os 526 testes verdes e a lógica de negócio intacta.

**Architecture:** Copiar o código salvável do app antigo (`~/Documents/modo-dono-app`) para o repo novo (`~/Documents/mododonov2`); substituir os 4 adaptadores Manus (`server/_core/`) + remover plugins Vite; migrar o banco MySQL→Postgres; publicar na Vercel. Routers, `shared/`, `db-*.ts` (lógica) e client ficam iguais.

**Tech Stack:** React 19 · Vite 7 · Express 4 · tRPC 11 · Drizzle (dialeto **postgresql**) · Supabase (Postgres + Auth + Storage) · Anthropic (Claude) · node-cron · Vercel · Vitest.

**Spec:** `~/Documents/modo-dono-app/docs/superpowers/specs/2026-10-23-port-off-manus-design.md`

## Global Constraints
- **Lógica de negócio NÃO muda.** `shared/engine.ts`, `shared/calculations.ts` e a lógica dos routers são copiados sem alteração de regra. Mudança só na camada de adaptadores e no dialeto do banco.
- **Cada task termina com `pnpm test`/`vitest` verde** (o subconjunto relevante) e `tsc --noEmit` limpo.
- **IA do orçamento NÃO é consertada aqui** (é a Fase 1). Só repontar o gateway pra Claude.
- Segredos só em `.env` (gitignored). Nunca comitar `.env`.
- Banco: **Postgres via Supabase**. Drizzle `dialect: "postgresql"`.

## Review Focus
- **Mapeamento de tipos MySQL→Postgres** (`decimal`/`tinyint(1)`→`boolean`/`json`→`jsonb`/`bigint`/`datetime`→`timestamp`): precisão e semântica têm que bater com os valores do motor de cálculo → coberto pelos testes de `engine`/`calculations`/`cmv` (Task 4).
- **Upserts** `ON DUPLICATE KEY UPDATE` → `ON CONFLICT (...) DO UPDATE`: a chave natural tem que ser a mesma → teste de idempotência em `upsertDailyEntryFields`/`bulkUpsertValores` (Task 4).
- **Auth**: rotas protegidas continuam negando sem sessão → os `*-auth.test.ts` existentes rodam verdes contra o novo auth (Task 6).
- **Datas/fuso** (lançamentos por dia, projeção do mês): Postgres `timestamptz` vs MySQL `datetime` → teste de `projecao-mes` (Task 4).
- **LLM multimodal** (OCR da nota de compra, `cmv.ts:extrairNotaCompra`): o modelo Claude escolhido tem que aceitar imagem → smoke test (Task 5).

---

### Task 1: Scaffold — copiar o código salvável pro repo novo
**Files:**
- Copiar de `~/Documents/modo-dono-app` → `~/Documents/mododonov2`: `client/`, `server/`, `shared/`, `drizzle/`, `patches/`, `components.json`, `tsconfig.json`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, `.prettierrc`.
- **NÃO copiar:** `template.json`, `client/public/__manus__/`, qualquer `.manus*`.

**Interfaces:** Produz a árvore base do projeto no repo novo.

- [ ] Copiar os diretórios acima; remover `template.json` e `__manus__/`.
- [ ] `npm install` (migrar de pnpm→npm, já que pnpm não está na máquina — ou instalar pnpm; decidir no 1º passo).
- [ ] Rodar `vitest run` dos testes **que não tocam banco nem Manus** (`shared/engine.test.ts`, `calculations*`): verde.
- [ ] Commit `chore: scaffold mododonov2 from modo-dono-app (sem arquivos Manus)`.

### Task 2: Remover plugins Manus do Vite + build
**Files:** Modify `vite.config.ts` (remover `vitePluginManusRuntime`, `manus-debug-collector`, `allowedHosts` `.manus*`), `package.json` (remover devDep `vite-plugin-manus-runtime`).

- [ ] Remover os plugins e o `allowedHosts`; `npm run build` do client conclui sem erro.
- [ ] Commit `chore: remove Manus Vite plugins`.

### Task 3: Migrar o schema do banco MySQL→Postgres
**Files:** Modify `drizzle/schema.ts` (todas as `mysqlTable`→`pgTable`), `drizzle.config.ts` (`dialect: "postgresql"`, usar `DATABASE_URL` do Supabase).

**Regras de conversão (decisões):** `mysqlTable`→`pgTable`; `varchar/text`→iguais; `int`→`integer`; `bigint`→`bigint`; `decimal(p,s)`→`numeric(p,s)`; `tinyint(1)`→`boolean`; `datetime/timestamp`→`timestamp` (ou `timestamptz` onde houver fuso); `json`→`jsonb`; `.onDuplicateKeyUpdate` (se houver no schema) tratado na Task 4; manter nomes de tabela/coluna idênticos.

- [ ] Reescrever `schema.ts` aplicando as regras; `tsc --noEmit` limpo no schema.
- [ ] `drizzle-kit push` contra o Supabase (`DATABASE_URL` do `.env`): 35 tabelas criadas.
- [ ] Commit `feat(db): migrar schema para Postgres (Supabase)`.

### Task 4: Migrar o SQL cru dos `db-*.ts` para Postgres
**Files:** Modify todos os `server/db.ts` e `server/db-*.ts` que usam `$client.promise().execute(...)`, `ON DUPLICATE KEY UPDATE`, `VALUES()`, placeholders `?`.

**Regras (decisões):** driver `drizzle-orm/mysql2`→`drizzle-orm/node-postgres` (`pg`); `ON DUPLICATE KEY UPDATE col=VALUES(col)`→`ON CONFLICT (<chave>) DO UPDATE SET col=EXCLUDED.col`; placeholders `?`→`$1,$2,...`; `LAST_INSERT_ID`/auto-increment→`RETURNING id`. Onde der, trocar SQL cru por query builder do Drizzle (reduz dívida). **Não mudar a lógica** — só a sintaxe do banco.

- [ ] Converter arquivo a arquivo (podem ir em subagentes paralelos por grupo de arquivos).
- [ ] Rodar **toda** a suíte (`vitest run`) apontando pro Postgres de teste: **526 verdes**. Foco: `cmv*`, `remuneracao*`, `projecao-mes`, `upsertDailyEntryFields` (idempotência), `*-auth`.
- [ ] Commit `feat(db): migrar SQL cru para Postgres`.

### Task 5: Adaptador de IA → Claude (Anthropic)
**Files:** Modify `server/_core/llm.ts` (endpoint/headers Anthropic ou gateway compatível), `server/_core/llm-models.ts` (IDs de modelo Claude), `server/_core/env.ts` (`ANTHROPIC_API_KEY`).

**Decisões:** usar a Messages API da Anthropic (ou gateway OpenAI-compat apontando pra Claude); `MODEL_FAST`/`MODEL_DEEP`→modelos Claude atuais; o multimodal (OCR) usa um modelo Claude com visão.

- [ ] Smoke test: uma chamada de texto e uma de imagem (OCR) retornam resposta válida.
- [ ] Commit `feat(ia): repontar gateway LLM para Claude`.

### Task 6: Login → Supabase Auth
**Files:** Modify `server/_core/sdk.ts`, `server/_core/oauth.ts`, `server/context.ts`; Create página de login mínima no client.

**Decisões:** substituir `WebDevAuthPublicService` (code→token→userinfo) por Supabase Auth (e-mail+senha); o servidor valida o JWT do Supabase (lib `jose` já presente); admin cria contas. Manter o shape do `context` (quem é o usuário) pros routers não mudarem.

- [ ] Rodar os `*-auth.test.ts`: rotas protegidas negam sem sessão, liberam com sessão válida — verde.
- [ ] Login manual funciona (criar 1 usuário admin).
- [ ] Commit `feat(auth): migrar login para Supabase Auth`.

### Task 7: Armazenamento → Supabase Storage
**Files:** Modify `server/storage.ts`, `server/_core/storageProxy.ts`.

**Decisões:** presign/upload via Supabase Storage (S3-compat, SDK S3 já presente); bucket privado; servir arquivo via URL assinada.

- [ ] Smoke test: upload de um arquivo e leitura por URL assinada.
- [ ] Commit `feat(storage): migrar para Supabase Storage`.

### Task 8: Tarefas agendadas → node-cron
**Files:** Modify `server/_core/heartbeat.ts`, `server/_core/register-crons.ts`; manter `server/scheduled/*` (lógica intacta).

**Decisões:** `node-cron` dispara os handlers `/api/scheduled/*` nos mesmos horários; remover dependência do serviço Forge e do header `x-manus-user-session`.

- [ ] Smoke: um cron dispara um endpoint scheduled em dev.
- [ ] Commit `feat(crons): substituir Forge por node-cron`.

### Task 9: Deploy Vercel + fumaça do piloto
**Files:** Create `vercel.json` (build do client + função do server Express), ajustar `package.json` scripts (`build`, `start`), configurar env vars no Vercel (as mesmas do `.env`).

- [ ] Deploy na Vercel conclui; app abre.
- [ ] Fumaça: usuário logado (gerente Giraffas Curitiba) vê os módulos e consegue lançar um dia.
- [ ] Commit `chore: deploy inicial na Vercel`.

---

## Observações de execução
- Tasks 3 e 4 são o grosso (banco). Boas candidatas a **subagentes paralelos** (Task 4, por grupo de arquivos `db-*.ts`), com a suíte de testes como portão.
- Precisa do `.env` preenchido (DATABASE_URL + chaves Supabase) antes da Task 3; `ANTHROPIC_API_KEY` só na Task 5.
- A IA do orçamento continua "como está" até a Fase 1 — só muda o gateway.
