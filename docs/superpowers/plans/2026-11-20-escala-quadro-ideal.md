# Gestor de Escala — Plano 2: Quadro Ideal e Diagnóstico de Cobertura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** responder "de quantas pessoas esta loja precisa?" — com dado que o gerente realmente tem, e mostrando onde falta E onde sobra.

**Architecture:** o sistema **propõe** os momentos da operação e as metas (lendo a curva de movimento), o gerente corrige, e o quadro ideal sai do cruzamento entre metas, turnos escalonados e as regras legais vigentes do Plano 1. Funções puras testadas em node; componentes finos sem teste próprio (repo não tem jsdom).

**Tech Stack:** Drizzle + Postgres (Supabase) · tRPC 11 (`protectedProcedure` + `assertPodeAcessarLoja`) · React 19 · vitest

**Spec:** `docs/superpowers/specs/2026-11-20-plano2-demanda-design.md` — a seção **"MODELO FINAL"** é a normativa; o desenho de bloco acima dela foi substituído.

**Base:** Plano 1 (`docs/superpowers/plans/2026-11-19-escala-configuracao.md`), já em produção. Reusar: `escala-regras.ts` (resolvedor), `escala-produtividade.ts`, `funcoes_loja`, `shift_blocks`.

## Global Constraints

- Segurança: navegador nunca fala com o banco. Tudo por tRPC, com `assertPodeAcessarLoja(ctx, storeId)` na **primeira linha** de toda procedure. O servidor é a única tranca.
- **O gerente nunca encara formulário em branco.** Todo número tem sugestão com origem rotulada. Campo vazio mata a adoção.
- **O app propõe, o humano confirma, nunca grava sozinho.** Correção do gerente sempre vence.
- **Falhar alto, nunca degradar em silêncio.** Foi a família de todos os 26 achados do Plano 1.
- Nenhuma regra legal em código — vem do resolvedor do Plano 1, por data.
- Testes: vitest, função pura, `environment: "node"`. Sem teste de componente (ruling R19 do Plano 1).
- Português nos nomes de domínio e na interface.

## Review Focus

1. **Loja sem curva de movimento** — a detecção de momentos não pode devolver lista vazia marcada como sucesso; tem que dizer que não há base e pedir ao gerente.
2. **Momentos sobrepostos ou com buraco** — se a soma dos momentos não cobre o horário de funcionamento, há hora sem meta e o quadro sai subdimensionado, em silêncio.
3. **Turno com intervalo maior que o permitido** pela regra vigente (`intervalo_intrajornada`) tem que ser **recusado ou marcado `DEPENDE_CCT`** — nunca aceito como normal.
4. **Meta zero ou negativa** num momento — divisão por zero no quadro, ou cobertura "perfeita" de uma loja vazia.
5. **Excesso não sinalizado** — cobertura acima da meta tem que aparecer como 🟡. É a razão de ser do módulo; se só mostrar falta, entrega metade.

---

### Task 1: Schema — turnos com intervalo, momentos e metas

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `drizzle/0037_escala_quadro.sql`
- Test: `server/escala-quadro-schema.test.ts`

**Interfaces:**
- Produces: tabelas `momentos_operacao`, `metas_cobertura`; colunas novas em `shift_blocks` (`intervaloInicioMinuto`, `intervaloFimMinuto`, nullable); tipo `OrigemMeta = "declarada" | "sugerida_demanda" | "ajustada_gestor"`

- [ ] **Step 1: Escrever o teste que falha** — que `shift_blocks` aceita turno com intervalo (jornada partida) e sem; que `metas_cobertura` exige `diaSemana` 0-6 e meta ≥ 0.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run server/escala-quadro-schema.test.ts`
- [ ] **Step 3: Criar as tabelas e colunas.** Campos na seção "Modelo de dados" do spec. `momentos_operacao`: storeId, nome, horaInicio, horaFim, ordem. `metas_cobertura`: storeId, momentoId, diaSemana, funcaoId (nullable = meta total), meta, origem.
- [ ] **Step 4: Rodar e ver passar**
- [ ] **Step 5: Escrever a migration à mão** (o `drizzle-kit generate` está quebrado neste repo — ver runbook), idempotente, camelCase citado.
- [ ] **Step 6: Commit**

---

### Task 2: Detectar os momentos da operação a partir da curva

**Files:** Create `server/escala-momentos.ts` + `.test.ts`

**Interfaces:**
- Produces: `detectarMomentos(curva: {hora:number, valor:number}[], horario:{abre:number,fecha:number}): { momentos: MomentoSugerido[] } | { momentos: [], motivo: string }`

- [ ] **Step 1: Escrever o teste que falha**
```ts
it("separa abertura, pico de almoço, vale, pico de jantar e fechamento numa curva de dois picos", ...)
it("numa curva de pico único devolve menos momentos, não força cinco", ...)
it("curva vazia devolve motivo, nunca lista vazia silenciosa", ...)
it("os momentos cobrem o horário inteiro, sem buraco e sem sobreposição", ...)
```
- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Detecção por derivada/limiar relativo, não por horário fixo — loja de aeroporto tem pico diferente de shopping. Garantir cobertura contígua do horário de funcionamento.
- [ ] **Step 4: Rodar e ver passar** · **Step 5: Commit**

---

### Task 3: Propor as metas e calcular o Quadro Ideal

**Files:** Create `server/escala-quadro.ts` + `.test.ts`

**Interfaces:**
- Consumes: `resolverRegras`/`regraObrigatoria` (Plano 1), `calcularProdutividadeHistorica` (Plano 1)
- Produces: `proporMetas(momentos, curva, funcoes)`, `calcularQuadroIdeal(metas, turnos, regras, data): { porFuncao, total, avisos[] }`

- [ ] **Step 1: Escrever o teste que falha**
```ts
it("converte pessoas-turno em quadro usando os turnos que a escala vigente cobre", ...)
it("em 2026-12-16 usa 42h e 2 repousos; em 2027-12-16 usa 40h", ...)   // vem do resolvedor
it("meta zero num momento gera aviso, não quadro zero silencioso", ...)
it("dia de recebimento soma ao momento, quando a loja marcar", ...)
it("arredonda para cima por função, nunca para baixo", ...)
```
- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** A jornada semanal e os repousos **vêm do resolvedor por data**, nunca hardcoded. Turno com intervalo conta as horas efetivas, não o tempo total na loja.
- [ ] **Step 4: Rodar e ver passar** · **Step 5: Commit**

---

### Task 4: Diagnóstico de cobertura com três estados

**Files:** Create `server/escala-cobertura.ts` + `.test.ts`

**Interfaces:**
- Produces: `diagnosticarCobertura(metas, quadroAtual, turnos): { porDiaMomento: Celula[], periodosCobertos: {ok:number,total:number}, maiorGap: {dia,momento,delta} | null }` com `Celula.estado: "falta" | "atende" | "excede"`

- [ ] **Step 1: Escrever o teste que falha**
```ts
it("marca falta, atende e EXCEDE — os três estados", ...)
it("aponta o maior gap pelo nome do dia e do momento", ...)
it("conta períodos 100% cobertos sobre o total", ...)
it("usa o pior caso do dia da semana no mês, não a média", ...)
```
- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** O estado `excede` é requisito, não detalhe: é o desperdício de folha que o módulo existe para achar.
- [ ] **Step 4: Rodar e ver passar** · **Step 5: Commit**

---

### Task 5: Camada de dados e router

**Files:** Create `server/db-escala-quadro.ts`, `server/routers/escala-quadro.ts`; Modify `server/routers.ts`; Test `server/escala-quadro-auth.test.ts`

**Interfaces:**
- Produces: `escalaQuadro.getMomentos`, `sugerirMomentos`, `salvarMomentos`, `getMetas`, `salvarMeta`, `getQuadroIdeal`, `getCobertura`

- [ ] **Step 1: Escrever o teste que falha** — o teste genérico de gate **deve ser derivado de `_def.procedures` do router real**, no padrão endurecido do Plano 1 (`escala-config-auth.test.ts`), não lista escrita à mão.
- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Procedures finas: leem, chamam as funções puras das Tasks 2-4, devolvem. Sem regra de negócio aqui.
- [ ] **Step 4: Rodar e ver passar** · **Step 5: `npm run check`** · **Step 6: Commit**

---

### Task 6: Tela — momentos, metas e quadro ideal

**Files:** Create `client/src/lib/escala-quadro-ui.ts` + `.test.ts`, `client/src/components/escala/QuadroIdeal.tsx`; Modify `client/src/components/escala/AssistenteConfiguracao.tsx`

**Interfaces:** Consumes as procedures da Task 5

- [ ] **Step 1: Escrever o teste que falha** (no módulo puro): rótulo de origem da meta; formatação; regra de quando mostrar o aviso de "sem base para sugerir"; cor por estado de cobertura.
- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** **O número grande no topo** ("Quadro ideal: 14 pessoas"), a tabela de cobertura por dia × momento com os três estados, e "Maior gap" apontado pelo nome. Momentos e metas vêm **pré-preenchidos** pela sugestão, com origem rotulada e editáveis. Erro de mutation sempre visível.
- [ ] **Step 4: Rodar e ver passar** · **Step 5: `npm test`** (suíte inteira) · **Step 6: Commit**

---

## Fora deste plano
Simulador com cenários salvos e modo "quadro desejado" · alocação de pessoas por nome (Plano 3) · upload de CCT e pauta sindical (Plano 4) · contrato intermitente e extras.
