# Gestor de Escala — Plano 1: Configuração pelo Gerente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O gerente configura sozinho, dentro do app, tudo que o gerador de escala precisa saber sobre a loja dele: funções, produtividade, blocos de turno e regras — sem depender de admin.

**Architecture:** Três tabelas de parâmetro novas (`escalas_catalogo`, `funcoes_loja`, `regras_escala`) com **vigência por data**, um resolvedor que responde "qual regra vale nesta data, nesta loja" e uma aba de configuração em assistente. Regras legais são **dados**, nunca constantes — a EC 141/2026 muda o teto de 42h para 40h em 16/12/2027 e isso tem que ser um `UPDATE`, não um deploy.

**Tech Stack:** Drizzle + Postgres (Supabase) · tRPC 11 (`protectedProcedure` + `assertPodeAcessarLoja`) · React 19 + Vite · vitest

**Spec:** `docs/superpowers/specs/2026-11-19-gestor-de-escala-design.md`

## Global Constraints

- Segurança: navegador nunca fala com o Supabase para dados. Tudo por tRPC, com `assertPodeAcessarLoja(ctx, storeId)` em **toda** procedure. RLS não é a tranca aqui.
- Toda regra legal tem `vigenciaInicio` e `vigenciaFim` opcional. **Nenhum valor legal hardcoded** em `.ts`.
- Tipos de regra: `DURA` (trava), `MOLE` (sugere), `DEPENDE_CCT` (gera, mas marca).
- EC 141/2026: 44h→**42h** e 1→**2 repousos semanais** em **2026-12-16**; **40h** em **2027-12-16**. 6x1 recebe `vigenciaFim = 2026-12-15`.
- Drivers válidos: `tickets` · `pratos` · `cobertos`.
- Produtividade-alvo **nunca nasce vazia** — o app sugere, o gestor confirma.
- Português nos rótulos de tela e nos nomes de domínio; código em inglês onde o repo já é inglês.
- Testes: vitest, função pura sempre que possível, sem tocar banco.

## Review Focus

1. **Vigências sobrepostas** — duas regras `jornada_max_semanal` válidas na mesma data: o resolvedor tem que escolher a de escopo mais específico (loja > uf > rede) e, no empate, a de `vigenciaInicio` mais recente. Sem isso o motor roda com o teto errado.
2. **Data anterior a qualquer vigência** — consultar regra para uma data sem cobertura deve **falhar explicitamente**, não devolver `undefined` e virar `NaN` no motor.
3. **Loja sem histórico** — `sugerirProdutividade` com zero pessoas-hora não pode dividir por zero; devolve `null` + motivo, e a tela pede o número ao gestor.
4. **Escala fora de vigência** — selecionar 6x1 para semana a partir de 16/12/2026 tem que ser bloqueado na borda, com mensagem que cita a EC 141.
5. **Função sem `minPorBloco`** — piso ausente faz o motor propor zero pessoas num bloco com demanda baixa. O cadastro exige piso ≥ 1.

---

### Task 1: Tabelas de parâmetro + seed do catálogo legal

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `drizzle/0032_escala_config.sql`
- Create: `server/escala-catalogo-seed.ts`
- Test: `server/escala-catalogo-seed.test.ts`

**Interfaces:**
- Produces: `escalasCatalogo`, `funcoesLoja`, `regrasEscala` (tabelas Drizzle); `CATALOGO_INICIAL: EscalaCatalogoSeed[]`; `REGRAS_LEGAIS_INICIAIS: RegraSeed[]`
- Tipos exportados: `DriverFuncao = "tickets" | "pratos" | "cobertos"`; `TipoRegra = "DURA" | "MOLE" | "DEPENDE_CCT"`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { CATALOGO_INICIAL, REGRAS_LEGAIS_INICIAIS } from "./escala-catalogo-seed";

it("6x1 encerra em 15/12/2026 por causa da EC 141", () => {
  const seis = CATALOGO_INICIAL.find(e => e.codigo === "6x1")!;
  expect(seis.vigenciaFim).toBe("2026-12-15");
});

it("5x2 vale 42h a partir de 16/12/2026", () => {
  const cinco = CATALOGO_INICIAL.find(e => e.codigo === "5x2")!;
  expect(cinco.horasSemanaMedia).toBe(42);
  expect(cinco.vigenciaInicio).toBe("2026-12-16");
});

it("jornada semanal cai para 40h em 16/12/2027", () => {
  const r = REGRAS_LEGAIS_INICIAIS.filter(r => r.chave === "jornada_max_semanal");
  expect(r.map(x => [x.vigenciaInicio, x.valor])).toEqual([
    ["2026-12-16", 42], ["2027-12-16", 40],
  ]);
});

it("domingos de folga entram como DEPENDE_CCT, nunca DURA", () => {
  const d = REGRAS_LEGAIS_INICIAIS.filter(r => r.chave.startsWith("domingos_folga"));
  expect(d).toHaveLength(2);
  expect(d.every(r => r.tipo === "DEPENDE_CCT")).toBe(true);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run server/escala-catalogo-seed.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Criar as três tabelas em `drizzle/schema.ts`**

Campos exatos na seção "2. As três tabelas de parâmetro" do spec. `regrasEscala.valor` é `jsonb`. Índices: `funcoesLoja(storeId, ativo)` e `regrasEscala(storeId, chave, vigenciaInicio)`. Enums como `pgEnum`, seguindo o padrão dos enums já existentes no arquivo.

- [ ] **Step 4: Escrever `server/escala-catalogo-seed.ts`**

`CATALOGO_INICIAL` com 5x2, 4x3, 6x1, 12x36, 6x2 (tabela do spec, seção 2.2). `REGRAS_LEGAIS_INICIAIS` com as 10 chaves da seção 2.3, cada uma com `fonte` preenchida. São dados, não lógica.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run server/escala-catalogo-seed.test.ts`
Expected: PASS

- [ ] **Step 6: Gerar a migration e commitar**

```bash
npx drizzle-kit generate
git add drizzle/ server/escala-catalogo-seed.ts server/escala-catalogo-seed.test.ts
git commit -m "feat(escala): tabelas de parametro + catalogo legal EC 141"
```

---

### Task 2: Resolvedor de regras por data e escopo

**Files:**
- Create: `server/escala-regras.ts`
- Test: `server/escala-regras.test.ts`

**Interfaces:**
- Consumes: tipos da Task 1
- Produces:
  - `resolverRegras(regras: RegraEscala[], ctx: { storeId: number; uf: string; data: string }): Map<string, RegraResolvida>`
  - `RegraResolvida = { chave: string; valor: unknown; tipo: TipoRegra; fonte: string; escopo: "loja"|"uf"|"rede" }`
  - `regraObrigatoria(mapa, chave): RegraResolvida` — lança `RegraAusenteError` se faltar

- [ ] **Step 1: Escrever o teste que falha**

```ts
it("escopo de loja vence o de uf, que vence o de rede", () => { /* 3 regras mesma chave */ });
it("no empate de escopo, vence a vigenciaInicio mais recente", () => {});
it("ignora regra cuja vigenciaFim já passou", () => {});
it("regraObrigatoria lança RegraAusenteError quando a data não tem cobertura", () => {
  expect(() => regraObrigatoria(vazio, "jornada_max_semanal")).toThrow(RegraAusenteError);
});
it("em 2026-12-15 jornada é 44h; em 2026-12-16 é 42h; em 2027-12-16 é 40h", () => {});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run server/escala-regras.test.ts`

- [ ] **Step 3: Implementar `resolverRegras` e `regraObrigatoria` em `server/escala-regras.ts`**

Funções puras, sem I/O. Ordenação: filtra por vigência cobrindo `data`, agrupa por `chave`, escolhe por peso de escopo (loja=3, uf=2, rede=1) e desempata por `vigenciaInicio` desc.

- [ ] **Step 4: Rodar e confirmar que passa**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(escala): resolvedor de regras por data e escopo"
```

---

### Task 3: Produtividade sugerida a partir do histórico

**Files:**
- Create: `server/escala-produtividade.ts`
- Test: `server/escala-produtividade.test.ts`

**Interfaces:**
- Produces: `calcularProdutividadeHistorica(amostras: { atendimentos: number; pessoasHora: number }[]): { valor: number | null; motivo?: string; amostras: number }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
it("devolve atendimentos por pessoa-hora da mediana dos dias", () => {});
it("devolve null com motivo quando não há pessoas-hora", () => {
  const r = calcularProdutividadeHistorica([{ atendimentos: 100, pessoasHora: 0 }]);
  expect(r.valor).toBeNull();
  expect(r.motivo).toMatch(/sem escala/i);
});
it("devolve null com motivo quando há menos de 5 dias de amostra", () => {});
it("descarta dias com atendimentos zerados (loja fechada)", () => {});
```

- [ ] **Step 2: Rodar e confirmar que falha**

- [ ] **Step 3: Implementar em `server/escala-produtividade.ts`**

Mediana, não média — um feriado atípico não pode mover a régua. Mínimo de 5 dias válidos.

- [ ] **Step 4: Rodar e confirmar que passa**

- [ ] **Step 5: Commit**

---

### Task 4: Camada de dados e router

**Files:**
- Create: `server/db-escala-config.ts`
- Create: `server/routers/escala.ts`
- Modify: `server/routers.ts` (registrar `escala: escalaRouter`, junto de `pessoas`)
- Test: `server/escala-config-auth.test.ts`

**Interfaces:**
- Produces (db): `getFuncoes(storeId)`, `createFuncao`, `updateFuncao`, `desativarFuncao`, `getRegras(storeId, uf)`, `upsertRegraLoja`, `getCatalogoVigente(data)`, `sugerirProdutividade(storeId, funcaoId)`
- Produces (router): `escala.getConfig`, `escala.salvarFuncao`, `escala.desativarFuncao`, `escala.getRegrasVigentes`, `escala.salvarRegraLoja`, `escala.getCatalogo`, `escala.sugerirProdutividade`

- [ ] **Step 1: Escrever o teste que falha**

```ts
it("toda procedure de escala chama assertPodeAcessarLoja", () => {
  // mesmo padrão de server/pessoas-auth.test.ts e orcamento-auth.test.ts
});
it("salvarFuncao rejeita minPorBloco menor que 1", () => {});
it("salvarFuncao rejeita driver fora de tickets|pratos|cobertos", () => {});
```

- [ ] **Step 2: Rodar e confirmar que falha**

- [ ] **Step 3: Implementar db + router**

Seguir exatamente o padrão de `server/routers/pessoas.ts`: `protectedProcedure`, `await assertPodeAcessarLoja(ctx, input.storeId)` na primeira linha, validação com zod. `sugerirProdutividade` lê `daily_entries.atendimentos` e `schedules` do período e chama `calcularProdutividadeHistorica` da Task 3.

- [ ] **Step 4: Rodar e confirmar que passa**

- [ ] **Step 5: `npm run check` para garantir que o tipo do router fechou**

- [ ] **Step 6: Commit**

---

### Task 5: Aba "Configuração da Escala" — funções

**Files:**
- Create: `client/src/components/escala/ConfiguracaoFuncoes.tsx`
- Modify: `client/src/pages/PessoasPage.tsx` (nova aba ao lado de "Escala de Trabalho")
- Test: `client/src/components/escala/ConfiguracaoFuncoes.test.tsx`

**Interfaces:**
- Consumes: `trpc.escala.getConfig`, `salvarFuncao`, `sugerirProdutividade`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it("mostra a produtividade sugerida e o gestor pode sobrescrever", () => {});
it("quando a sugestão vem null, exibe o motivo e pede o número", () => {});
it("bloqueia salvar com minPorBloco = 0", () => {});
```

- [ ] **Step 2: Rodar e confirmar que falha**

- [ ] **Step 3: Implementar o componente**

Lista de funções da loja + formulário. Campo de produtividade pré-preenchido com a sugestão, com rótulo dizendo de onde veio (`histórico da loja` / `melhor loja da rede` / `definida por você`). Componentes de UI do `components.json` já existente no repo.

- [ ] **Step 4: Rodar e confirmar que passa**

- [ ] **Step 5: Commit**

---

### Task 6: Assistente de configuração (o gerente faz sozinho)

**Files:**
- Create: `client/src/components/escala/AssistenteConfiguracao.tsx`
- Modify: `client/src/components/escala/ConfiguracaoFuncoes.tsx` (entrar como passo 2)
- Test: `client/src/components/escala/AssistenteConfiguracao.test.tsx`

**Interfaces:**
- Consumes: procedures da Task 4 + `pessoas.getShiftBlocks` / `createShiftBlock` (já existem — **reusar, não recriar**)

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it("mostra os 4 passos: horário de funcionamento, blocos, funções, regras", () => {});
it("não libera 'Gerar escala' enquanto houver passo incompleto", () => {});
it("marca o passo de regras como pendente quando há DEPENDE_CCT não confirmada", () => {});
it("avisa que a 6x1 não está disponível a partir de 16/12/2026, citando a EC 141", () => {});
```

- [ ] **Step 2: Rodar e confirmar que falha**

- [ ] **Step 3: Implementar o assistente**

Quatro passos, cada um com estado completo/incompleto: **1.** horário de funcionamento (`store_people_config.operationStartHour/EndHour`) · **2.** blocos de turno (reusa o CRUD existente) · **3.** funções (Task 5) · **4.** regras — mostra as legais vigentes como somente-leitura, e pede confirmação explícita nas `DEPENDE_CCT`.

- [ ] **Step 4: Rodar e confirmar que passa**

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: tudo verde, incluindo os 526 testes que já existiam

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(escala): assistente de configuracao pelo gerente"
```

---

## Fora deste plano (vão para os planos 2 e 3)

- **Plano 2 — Demanda:** `demanda_bloco`, calibração da curva típica, distribuição a partir do total do dia, extensão do `parsePdvPaste` para quantidade.
- **Plano 3 — Motor:** `escala-motor.ts` (dimensionar → quadro mínimo → alocar → folgas → validar → custear), tela de geração, laço de crítica do gestor.
