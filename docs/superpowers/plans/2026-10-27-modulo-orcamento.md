# Módulo Orçamento (Modo Dono v2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir o módulo de Orçamento do Modo Dono v2 com a DRE como raiz: a planilha da DRE é lida por código (determinístico), o gerente confere/edita um rascunho numa tabela editável e aprova; a IA só **sugere** e **destaca alavancas fracas** por cima, nunca lê número cru nem grava. Orçamento aprovado vira metas diárias; loja negativa entra em rampa + "em atenção".

**Architecture:** Construir sobre a tabela mestre `orcamentos` que **já existe** (é uma DRE denormalizada por loja/período). Reaproveitar o leitor determinístico `extractDreHistorico` (+ `CATEGORIA_MAP`, `cellToNumberDre`) de `server/sheet-parser.ts` e o motor puro `calcularOrcamento()`/`resolveValor()` (portar de `db-orcamento.ts`). **Descartar** o caminho `simular`/`simularPorMeta`/`aprovarParaOrcamento` (IA lia texto, chutava defaults, gravava direto). Manter a FORMA do par `analisarPlanilha`→`confirmarImportacao` (propor sem gravar / salvar só o que o gerente confirmou). IA via `invokeLLM` com `response_format json_schema`, como camada aditiva.

**Tech Stack:** React 19 + Vite + tRPC 11 + Drizzle (Postgres/Supabase) + Vitest. IA: `invokeLLM` (`server/_core/llm.ts`, MODEL_DEEP=claude-sonnet-4-6). Planilha: `xlsx` (SheetJS). Storage: `server/storage.ts` (presigned PUT).

**Spec:** `docs/superpowers/specs/2026-10-27-modulo-orcamento-design.md`

## Global Constraints
- **A IA nunca grava estado.** Toda gravação (`orcamentos`, metas) vem de input confirmado pelo gerente. Nenhum endpoint de IA faz INSERT/UPDATE.
- **A IA nunca lê o número cru da planilha.** Extração é 100% por código (`extractDreHistorico`). A IA recebe números já extraídos e só sugere/analisa.
- **Nunca chutar default.** Campo sem dado no histórico fica **nulo/branco** no rascunho; proibido preencher com benchmark (sem `?? 32`, `?? 0.30`, `?? 3 colaboradores` etc.).
- **Nunca apagar dados.** Soft-delete/quarentena; migrations idempotentes e versionadas em `drizzle/`.
- **Autorização:** leitura/edição de orçamento exige `protectedProcedure` + `assertPodeAcessarLoja(ctx, storeId)`. Aprovar exige papel `admin` (regional/você).
- **Dinheiro** em `numeric(14,2)`, percentuais em `numeric(8,4)`, datas `varchar(10)` 'YYYY-MM-DD', epochs `bigint(mode:number)`.
- **Shim SQL:** usar funções Drizzle tipadas quando possível; em SQL cru, escrever `ON CONFLICT (...) DO UPDATE SET` (o shim NÃO traduz `ON DUPLICATE KEY UPDATE`).

## Review Focus
- **Planilha com formato inesperado** (meses em US vs pt-BR, R$, aba errada): `cellToNumberDre`/`detectDreSheetName` devem acertar ou falhar explícito — nunca retornar número errado silencioso. (Task 2)
- **Histórico incompleto** (2 meses só, ou linha ausente): rascunho deixa o campo **nulo**, não zero nem média chutada. (Task 3/4)
- **Loja sem orçamento aprovado** consultada pelo placar: retorna "sem orçamento", não quebra. (Task 6)
- **Gerente tenta aprovar** (sem papel admin): `FORBIDDEN`. (Task 5)
- **IA retorna JSON inválido/vazio ou cai:** o rascunho determinístico permanece intacto e editável. (Task 8)

---

### Task 1: Tabelas e colunas (migration + schema)

**Files:**
- Modify: `drizzle/schema.ts` (adicionar `orcamentoMetasDiarias`; colunas em `orcamentos`)
- Create: `drizzle/0029_orcamento_fase_b.sql`
- Test: `server/orcamento-schema.test.ts`

**Interfaces:**
- Produces: tabela `orcamento_metas_diarias` (`id` serial, `orcamento_id` int, `store_id` int, `data` varchar(10), `meta_receita` numeric(14,2), `meta_atendimentos` int null, `peso_dia` numeric(8,4), unique(store_id,data)); colunas novas em `orcamentos`: `em_atencao` boolean default false, `prazo_decisao` varchar(10) null, `decisao` varchar(20) null ('seguir'|'encerrar'), `rampa_meses` integer null.
- Consumes: padrão de definição de tabela de `drizzle/schema.ts:786` (`dreHistoricoMensal`).

- [ ] **Step 1:** Escrever teste em `orcamento-schema.test.ts` que importa `orcamentoMetasDiarias` de `drizzle/schema.ts` e afirma que `$inferSelect` tem as chaves `id, orcamentoId, storeId, data, metaReceita, metaAtendimentos, pesoDia`.
- [ ] **Step 2:** Rodar `npx vitest run server/orcamento-schema.test.ts` → FAIL (export não existe).
- [ ] **Step 3:** Adicionar `orcamentoMetasDiarias` em `drizzle/schema.ts` seguindo o padrão `dreHistoricoMensal`; adicionar as 4 colunas em `orcamentos`. Escrever `0029_orcamento_fase_b.sql` idempotente (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- [ ] **Step 4:** Rodar o teste → PASS. Rodar a migration no banco (`npm run db:push` ou aplicar o `.sql`) e confirmar que as tabelas existem (`\d orcamento_metas_diarias`).
- [ ] **Step 5:** Commit `feat(orcamento): tabelas metas_diarias + colunas em_atencao`.

---

### Task 2: Leitura determinística da DRE histórica (import por upload)

**Files:**
- Verify/port: `server/sheet-parser.ts` (`extractDreHistorico`, `CATEGORIA_MAP`, `cellToNumberDre`, `parseMesLabel`) — confirmar que já está portado; se faltar, portar de `~/Documents/modo-dono-app/server/sheet-parser.ts`.
- Create: `server/orcamento-import.ts`
- Test: `server/orcamento-import.test.ts` + fixture `server/__fixtures__/dre-exemplo.xlsx`

**Interfaces:**
- Consumes: `extractDreHistorico(fileBuffer: Buffer, fileName: string, selectedSheet?: string): DreHistoricoResult`; `storageDownload(relKey)`.
- Produces: `async function lerDreHistorico(storageKey: string, fileName: string, meses?: number): Promise<DreHistoricoMes[]>` — baixa do storage, extrai, devolve os últimos `meses` (default 3) meses; **não grava**.

- [ ] **Step 1:** Criar fixture `.xlsx` com uma DRE de 3 meses (receita, CMV, folha, custos fixos/variáveis, impostos) em pt-BR.
- [ ] **Step 2:** Escrever teste: `lerDreHistorico` sobre a fixture retorna 3 `DreHistoricoMes` com `anoMes` e `faturamento`/`cmv`/`folha` iguais aos valores da fixture; e um teste de formato US para `cellToNumberDre`.
- [ ] **Step 3:** Rodar → FAIL.
- [ ] **Step 4:** Implementar `server/orcamento-import.ts` (`lerDreHistorico`) reusando `extractDreHistorico`. Confirmar `sheet-parser.ts` portado; portar o que faltar.
- [ ] **Step 5:** Rodar → PASS. Commit `feat(orcamento): leitura determinística da DRE histórica`.

---

### Task 3: Motor de proposta determinística (sem IA)

**Files:**
- Create: `server/orcamento-proposta.ts` (porta `calcularOrcamento`/`resolveValor` de `db-orcamento.ts` como módulo puro)
- Test: `server/orcamento-proposta.test.ts`

**Interfaces:**
- Consumes: `DreHistoricoMes[]` (Task 2).
- Produces: `function proporOrcamento(historico: DreHistoricoMes[]): RascunhoOrcamento` — média/tendência dos meses → campos de `orcamentos` (receitaBruta, cmv_pct, folha, despesas...). Campo sem base no histórico = **null** (nunca default). `function calcularDre(rascunho): DreCalculada` (ebitda, ebitdaPct, pontoEquilibrio, metaDiaria) — porta pura de `calcularOrcamento`.

- [ ] **Step 1:** Teste: `proporOrcamento` com 3 meses conhecidos → `receitaBruta` = média, `cmvPct` = média; um campo ausente no histórico → `null` (asserção explícita de que NÃO é zero nem benchmark).
- [ ] **Step 2:** Teste: `calcularDre` sobre um rascunho conhecido → `ebitda`/`pontoEquilibrio`/`metaDiaria` esperados (reusar casos do `orcamento.test.ts` existente).
- [ ] **Step 3:** Rodar → FAIL.
- [ ] **Step 4:** Implementar `orcamento-proposta.ts` portando o motor puro. **Zero** `?? default`.
- [ ] **Step 5:** Rodar → PASS. Commit `feat(orcamento): proposta determinística + motor de DRE`.

---

### Task 4: Endpoints propor→confirmar→salvar (rascunho)

**Files:**
- Modify: `server/routers/orcamento.ts`
- Create: `server/db-orcamento-v2.ts` (gravação limpa em `orcamentos`)
- Test: `server/orcamento-salvar.test.ts` (mock `./db`)

**Interfaces:**
- Produces (tRPC):
  - `orcamento.proporDaDre`: `protectedProcedure.input({storeId, storageKey, fileName, meses?})` → chama Task 2+3 → retorna `RascunhoOrcamento` + `DreCalculada`. **Não grava.**
  - `orcamento.salvarRascunho`: `protectedProcedure.input({storeId, periodoInicio, campos: <todos nullable>})` → `assertPodeAcessarLoja` → upsert em `orcamentos` com status `'rascunho'`, salvando **só os campos recebidos** (null permanece null). Retorna o id.
- Consumes: `proporOrcamento`, `lerDreHistorico`, `assertPodeAcessarLoja`.

- [ ] **Step 1:** Teste: `salvarRascunho` com campos parciais → `upsertOrcamento` chamado com exatamente esses campos, os ausentes como `null`; status `'rascunho'`.
- [ ] **Step 2:** Teste de autorização: não-admin sem vínculo → `FORBIDDEN` (mock `getStoresByUserId`).
- [ ] **Step 3:** Rodar → FAIL.
- [ ] **Step 4:** Implementar os dois procedures + `db-orcamento-v2.ts` (`upsertOrcamento` com `ON CONFLICT (store_id, periodo_inicio) DO UPDATE SET`).
- [ ] **Step 5:** Rodar → PASS. Commit `feat(orcamento): propor da DRE + salvar rascunho (IA não grava)`.

---

### Task 5: Aprovação (vira oficial)

**Files:**
- Modify: `server/routers/orcamento.ts`
- Test: `server/orcamento-aprovar.test.ts`

**Interfaces:**
- Produces: `orcamento.aprovar`: `adminProcedure.input({orcamentoId})` → status `'aprovado'`, `aprovadoPor=ctx.user.id`, `aprovadoEm=now`. (Gerente monta; admin/regional aprova.)

- [ ] **Step 1:** Teste: admin aprova → status `aprovado`, `aprovadoPor` setado. Gerente (role !== admin) → `FORBIDDEN`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar `aprovar` como `adminProcedure`.
- [ ] **Step 4:** Rodar → PASS. Commit `feat(orcamento): aprovação por admin/regional`.

---

### Task 6: Quebra em metas diárias (ao aprovar)

**Files:**
- Modify: `server/routers/orcamento.ts` (disparo na aprovação), `server/db-orcamento-v2.ts`
- Test: `server/orcamento-metas-diarias.test.ts`

**Interfaces:**
- Produces: `function gerarMetasDiarias(orcamentoId, storeId, periodoInicio, receitaMensal, diasOperacao): MetaDiaria[]` — distribui uniforme (peso 1.0) por dia do mês; grava em `orcamento_metas_diarias` (`ON CONFLICT (store_id, data) DO UPDATE`). `orcamento.getMetasDiarias({storeId, anoMes})` query.

- [ ] **Step 1:** Teste: receita 300.000 / 30 dias → 30 linhas de `meta_receita` = 10.000. Loja sem orçamento aprovado → `getMetasDiarias` retorna `[]` (não quebra).
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar `gerarMetasDiarias` (chamado dentro de `aprovar`) + a query.
- [ ] **Step 4:** Rodar → PASS. Commit `feat(orcamento): metas diárias na aprovação`.

---

### Task 7: Loja em atenção + rampa (recuperação)

**Files:**
- Modify: `server/orcamento-proposta.ts`, `server/routers/orcamento.ts`
- Test: `server/orcamento-em-atencao.test.ts`

**Interfaces:**
- Produces: em `proporOrcamento`, se o EBITDA médio do histórico < 0 → marca `emAtencao=true`, sugere `rampaMeses=3` e `prazoDecisao` = +3 meses. `orcamento.registrarDecisao`: `adminProcedure.input({orcamentoId, decisao:'seguir'|'encerrar'})`.

- [ ] **Step 1:** Teste: histórico com EBITDA negativo → rascunho `emAtencao=true`, `rampaMeses=3`, `prazoDecisao` setado. Histórico positivo → `emAtencao=false`.
- [ ] **Step 2:** Teste: `registrarDecisao` grava `decisao`; só admin.
- [ ] **Step 3:** Rodar → FAIL.
- [ ] **Step 4:** Implementar a detecção + o procedure.
- [ ] **Step 5:** Rodar → PASS. Commit `feat(orcamento): loja em atenção + rampa + decisão`.

---

### Task 8: Camada de IA — sugerir valores + destacar alavancas fracas (aditiva)

**Files:**
- Create: `server/orcamento-ia.ts`
- Modify: `server/routers/orcamento.ts`
- Test: `server/orcamento-ia.test.ts` (mock `invokeLLM`)

**Interfaces:**
- Consumes: `DreHistoricoMes[]`, `RascunhoOrcamento` (determinístico), `invokeLLM`.
- Produces: `orcamento.sugestaoIA`: `protectedProcedure.input({storeId, historico, rascunho})` → `invokeLLM` com `response_format json_schema` → `{ sugestoes: Record<campo, number|null>, alavancasFracas: {campo, nota}[] }`. **Não grava.** A IA recebe números já extraídos; nunca lê planilha. Fallback: JSON inválido/erro → retorna `{sugestoes:{}, alavancasFracas:[]}` e o rascunho determinístico segue intacto.

- [ ] **Step 1:** Teste (mock `invokeLLM` com JSON válido): `sugestaoIA` retorna sugestões + alavancas. Teste (mock retornando lixo): retorna vazio sem lançar.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar `orcamento-ia.ts` + procedure (prompt deixa claro: "não invente; se não houver base, retorne null").
- [ ] **Step 4:** Rodar → PASS. Commit `feat(orcamento): camada de IA aditiva (sugere, não grava)`.

---

### Task 9: UI — tela de conferência editável (DRE linha a linha)

**Files:**
- Rewrite: `client/src/pages/OrcamentoPage.tsx` (fluxo: importar DRE → tabela editável pré-preenchida → alavancas destacadas → aprovar)
- Create: `client/src/components/orcamento/DreEditavel.tsx`
- Test: `client/src/components/orcamento/DreEditavel.test.tsx` (se houver setup de teste de componente; senão, verificação manual documentada)

**Interfaces:**
- Consumes: `orcamento.proporDaDre`, `salvarRascunho`, `sugestaoIA`, `aprovar` (tRPC).

- [ ] **Step 1:** `DreEditavel`: tabela com colunas [linha, histórico, proposto, **editável**], campos nulos em branco, alavancas fracas com destaque visual. Inputs controlados; salvar chama `salvarRascunho` com o que foi editado.
- [ ] **Step 2:** Fluxo em `OrcamentoPage`: upload (presigned) → `proporDaDre` → preenche a tabela → botão "Sugestão da IA" (opcional) → "Salvar rascunho" → "Aprovar" (visível só pra admin).
- [ ] **Step 3:** Verificar no app (build + rota) que o fluxo roda ponta a ponta com a loja-piloto. Commit `feat(orcamento): tela de conferência editável`.

---

### Task 10: Reexibir o módulo

**Files:**
- Modify: `client/src/config/hiddenModules.ts`

- [ ] **Step 1:** Remover `/orcamento`, `/orcamento/editar/:id`, `/orcamento-assistido` de `HIDDEN_MODULES`.
- [ ] **Step 2:** Confirmar no app que "Orçamento" aparece no menu e a página real renderiza. Commit `feat(orcamento): reexibir módulo no menu`.

---

## Fora deste plano (fast-follow)
- **Fonte SharePoint:** puxar a DRE direto do SharePoint (reusar o acesso do app Azure da automação financeira). Precisa da pasta das DREs (Fernando) + reusar Microsoft Graph. Vira um plano/endpoint separado (`orcamento.importarDoSharePoint`) que entrega o mesmo `storageKey`/buffer pro Task 2.
- **Folha por colaborador** (`orcamento_colaboradores`) e `dre_template_linhas` versionado: só se o fluxo pedir detalhe de headcount (hoje folha entra como linha agregada).
