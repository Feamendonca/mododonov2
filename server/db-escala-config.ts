/**
 * db-escala-config.ts — Camada de dados do módulo de Escala (Task 4)
 *
 * Primeira camada deste módulo que toca banco: lê/grava `funcoes_loja` e
 * `regras_escala`, lê `escalas_catalogo`, e monta as amostras de
 * produtividade histórica a partir de `daily_entries` + `schedules` +
 * `shift_blocks`. Toda a LÓGICA já está pronta e testada nas Tasks 1-3
 * (`escala-catalogo-seed.ts`, `escala-regras.ts`, `escala-produtividade.ts`)
 * — este arquivo só lê, grava, e passa pra frente (R2 do controlador, ver
 * .superpowers/sdd/2026-11-19-escala-configuracao/progress.md).
 *
 * `resolverRegras`/`ContextoResolucao` (Task 2) NÃO entram aqui: compor a
 * UF da loja com a resolução por data é orquestração de procedure, não
 * acesso a dado — fica em `server/routers/escala.ts`.
 */
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getDb, getDailyEntries } from "./db";
import {
  funcoesLoja,
  escalasCatalogo,
  regrasEscala,
  confirmacoesRegraLoja,
  type EscalaCatalogoRow,
  type InsertFuncaoLoja,
  type RegraEscalaRow,
} from "../drizzle/schema";
import { blockDurationHours, getScheduleForWeek, getShiftBlocks } from "./db-pessoas";
import {
  calcularProdutividadeHistorica,
  type AmostraProdutividade,
  type ResultadoProdutividadeHistorica,
} from "./escala-produtividade";
import { REGRAS_LEGAIS_INICIAIS } from "./escala-catalogo-seed";
import type { DriverFuncao, RegraSeed, TipoRegra } from "./escala-catalogo-seed";

// ─── Funções da loja (funcoes_loja) ───────────────────────────────────────────

export type ProdutividadeOrigem = "sugerida_historico" | "sugerida_benchmark" | "definida_gestor";

export type FuncaoLoja = {
  id: number;
  storeId: number;
  nome: string;
  driver: DriverFuncao;
  produtividadeAlvo: number | null;
  produtividadeOrigem: ProdutividadeOrigem | null;
  minPorBloco: number;
  maxPorBloco: number | null;
  ativo: boolean;
};

function toFuncaoLoja(row: {
  id: number;
  storeId: number;
  nome: string;
  driver: string;
  produtividadeAlvo: string | null;
  produtividadeOrigem: string | null;
  minPorBloco: number;
  maxPorBloco: number | null;
  ativo: boolean;
}): FuncaoLoja {
  return {
    id: row.id,
    storeId: row.storeId,
    nome: row.nome,
    driver: row.driver as DriverFuncao,
    produtividadeAlvo: row.produtividadeAlvo === null ? null : Number(row.produtividadeAlvo),
    produtividadeOrigem: row.produtividadeOrigem as ProdutividadeOrigem | null,
    minPorBloco: row.minPorBloco,
    maxPorBloco: row.maxPorBloco,
    ativo: row.ativo,
  };
}

export async function getFuncoes(storeId: number, includeInactive = false): Promise<FuncaoLoja[]> {
  const db = await getDb();
  if (!db) return [];
  const condition = includeInactive
    ? eq(funcoesLoja.storeId, storeId)
    : and(eq(funcoesLoja.storeId, storeId), eq(funcoesLoja.ativo, true));
  const rows = await db.select().from(funcoesLoja).where(condition).orderBy(funcoesLoja.nome);
  return rows.map(toFuncaoLoja);
}

export interface CreateFuncaoInput {
  nome: string;
  driver: DriverFuncao;
  produtividadeAlvo?: number | null;
  produtividadeOrigem?: ProdutividadeOrigem | null;
  minPorBloco: number;
  maxPorBloco?: number | null;
}

export async function createFuncao(storeId: number, data: CreateFuncaoInput): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const values: InsertFuncaoLoja = {
    storeId,
    nome: data.nome,
    driver: data.driver,
    produtividadeAlvo: data.produtividadeAlvo == null ? null : String(data.produtividadeAlvo),
    produtividadeOrigem: data.produtividadeOrigem ?? null,
    minPorBloco: data.minPorBloco,
    maxPorBloco: data.maxPorBloco ?? null,
  };
  const result = await db.insert(funcoesLoja).values(values).returning({ id: funcoesLoja.id });
  return result[0].id;
}

export interface UpdateFuncaoInput {
  nome?: string;
  driver?: DriverFuncao;
  produtividadeAlvo?: number | null;
  produtividadeOrigem?: ProdutividadeOrigem | null;
  minPorBloco?: number;
  maxPorBloco?: number | null;
}

/**
 * Devolve `true` quando a função existia nesta loja e foi atualizada,
 * `false` quando `id`/`storeId` não casam com nenhuma linha (id de outra
 * loja ou inexistente). Menor 9/10 do fix loop da Task 4: antes, `!db`
 * retornava em silêncio e nenhuma linha afetada também não era checada —
 * a procedure sempre respondia `{success: true}` mesmo sem ter mudado
 * nada. `db` indisponível agora LANÇA (padronizado com `createFuncao`),
 * em vez de fingir sucesso; o router decide o que fazer com `false`.
 */
export async function updateFuncao(id: number, storeId: number, data: UpdateFuncaoInput): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const set: Partial<InsertFuncaoLoja> = { updatedAt: new Date() };
  if (data.nome !== undefined) set.nome = data.nome;
  if (data.driver !== undefined) set.driver = data.driver;
  if (data.produtividadeAlvo !== undefined) {
    set.produtividadeAlvo = data.produtividadeAlvo == null ? null : String(data.produtividadeAlvo);
  }
  if (data.produtividadeOrigem !== undefined) set.produtividadeOrigem = data.produtividadeOrigem;
  if (data.minPorBloco !== undefined) set.minPorBloco = data.minPorBloco;
  if (data.maxPorBloco !== undefined) set.maxPorBloco = data.maxPorBloco;
  const result = await db
    .update(funcoesLoja)
    .set(set)
    .where(and(eq(funcoesLoja.id, id), eq(funcoesLoja.storeId, storeId)))
    .returning({ id: funcoesLoja.id });
  return result.length > 0;
}

/** Mesmo contrato de `updateFuncao`: devolve `true` só quando desativou de
 * verdade uma linha desta loja. */
export async function desativarFuncao(id: number, storeId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db
    .update(funcoesLoja)
    .set({ ativo: false, updatedAt: new Date() })
    .where(and(eq(funcoesLoja.id, id), eq(funcoesLoja.storeId, storeId)))
    .returning({ id: funcoesLoja.id });
  return result.length > 0;
}

// ─── Regras (regras_escala) ───────────────────────────────────────────────────

function toRegraSeed(row: RegraEscalaRow): RegraSeed {
  return {
    storeId: row.storeId,
    uf: row.uf,
    cct: row.cct,
    chave: row.chave,
    valor: row.valor,
    tipo: row.tipo as TipoRegra,
    vigenciaInicio: row.vigenciaInicio,
    vigenciaFim: row.vigenciaFim,
    fonte: row.fonte,
  };
}

/**
 * Candidatas a resolução para `storeId`/`uf`: regras de rede (storeId e uf
 * nulos), regras de UF (storeId nulo, uf = a da loja) e regras de loja
 * (storeId = storeId). `uf` já deve chegar normalizado (maiúsculo, sem
 * espaços) — normalizar é responsabilidade de quem monta o contexto
 * (server/routers/escala.ts), não desta query.
 *
 * `uf === null` (loja sem UF cadastrada, R13) busca só rede + loja — as
 * regras de escopo UF nunca entram como candidatas, então não há como uma
 * delas "escapar" por engano na resolução.
 */
export async function getRegras(storeId: number, uf: string | null): Promise<RegraSeed[]> {
  const db = await getDb();
  if (!db) return [];
  const redeOuLoja = or(isNull(regrasEscala.storeId), eq(regrasEscala.storeId, storeId));
  const condition = uf
    ? and(redeOuLoja, or(isNull(regrasEscala.uf), eq(regrasEscala.uf, uf)))
    : and(redeOuLoja, isNull(regrasEscala.uf));
  const rows = await db.select().from(regrasEscala).where(condition);
  return rows.map(toRegraSeed);
}

export interface UpsertRegraLojaInput {
  chave: string;
  valor: unknown;
  tipo: TipoRegra;
  vigenciaInicio?: string | null;
  vigenciaFim?: string | null;
  fonte: string;
}

/** Chaves do catálogo legal de REDE (Task 1, `REGRAS_LEGAIS_INICIAIS`).
 * I6 do fix loop da Task 4: usada por `upsertRegraLoja` pra impedir que o
 * gestor da loja derrube uma trava legal (ex.: `jornada_max_semanal` da EC
 * 141) só cadastrando uma regra de escopo loja — pela precedência da Task
 * 2 (`escala-regras.ts`), escopo loja (peso 3) vence rede (peso 1), então
 * sem este guard um usuário comum reescreveria a lei pela tela. */
export const CHAVES_LEGAIS_REDE: ReadonlySet<string> = new Set(
  REGRAS_LEGAIS_INICIAIS.map((regra) => regra.chave)
);

/** Lançado quando `upsertRegraLoja` tentaria sobrescrever, em escopo loja,
 * uma chave do catálogo legal de rede com algo diferente de `MOLE` (I6).
 * `MOLE` é preferência, não trava — pode ser ajustada pela loja. `DURA`/
 * `DEPENDE_CCT` numa chave legal só entra pelo cadastro de rede (fora do
 * escopo desta task). */
export class RegraLojaNaoPermitidaError extends Error {
  readonly chave: string;

  constructor(chave: string) {
    super(
      `"${chave}" é uma chave do catálogo legal de rede — a loja só pode cadastrá-la como regra MOLE (preferência). Sobrescrever DURA/DEPENDE_CCT por aqui derrubaria uma trava legal; isso exige o cadastro de rede.`
    );
    this.name = "RegraLojaNaoPermitidaError";
    this.chave = chave;
  }
}

/**
 * Upsert de regra de ESCOPO LOJA (storeId fixo, uf/cct sempre nulos — regra
 * por UF/CCT não é cadastro de gestor, é dado do catálogo legal). Chave
 * lógica: `(storeId, chave, vigenciaInicio)`.
 *
 * NÃO usa `onConflictDoUpdate` sobre o unique index da tabela
 * (`uq_regras_escala_store_chave_vigencia`, que inclui `uf`/`cct`): em
 * Postgres, NULL nunca é igual a NULL para fins de unicidade — duas linhas
 * com `uf`/`cct`/`vigenciaInicio` todos NULL NÃO colidem no índice único, e
 * `ON CONFLICT` nunca dispara. Isso faria todo "upsert" de uma regra sem
 * data de fim virar um INSERT duplicado em silêncio, na mesma família de
 * defeito que este plano existe para evitar. Por isso o upsert é manual:
 * busca por `IS NULL` explícito, depois UPDATE ou INSERT.
 */
export async function upsertRegraLoja(storeId: number, data: UpsertRegraLojaInput): Promise<void> {
  if (CHAVES_LEGAIS_REDE.has(data.chave) && data.tipo !== "MOLE") {
    throw new RegraLojaNaoPermitidaError(data.chave);
  }

  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const vigenciaInicio = data.vigenciaInicio ?? null;
  const vigenciaInicioCondition =
    vigenciaInicio === null ? isNull(regrasEscala.vigenciaInicio) : eq(regrasEscala.vigenciaInicio, vigenciaInicio);

  const existentes = await db
    .select({ id: regrasEscala.id })
    .from(regrasEscala)
    .where(
      and(
        eq(regrasEscala.storeId, storeId),
        isNull(regrasEscala.uf),
        isNull(regrasEscala.cct),
        eq(regrasEscala.chave, data.chave),
        vigenciaInicioCondition
      )
    )
    .limit(1);

  if (existentes[0]) {
    await db
      .update(regrasEscala)
      .set({
        valor: data.valor,
        tipo: data.tipo,
        vigenciaFim: data.vigenciaFim ?? null,
        fonte: data.fonte,
      })
      .where(eq(regrasEscala.id, existentes[0].id));
    return;
  }

  await db.insert(regrasEscala).values({
    storeId,
    uf: null,
    cct: null,
    chave: data.chave,
    valor: data.valor,
    tipo: data.tipo,
    vigenciaInicio,
    vigenciaFim: data.vigenciaFim ?? null,
    fonte: data.fonte,
  });
}

// ─── Confirmações de regra DEPENDE_CCT por loja (confirmacoes_regra_loja) ────
//
// R24 (revisão da Task 6, .superpowers/sdd/2026-11-19-escala-configuracao/):
// a versão anterior "confirmava" uma `DEPENDE_CCT` chamando `upsertRegraLoja`
// com a MESMA chave/valor em escopo loja — e por precedência (Task 2,
// escala-regras.ts: loja > uf > rede), essa cópia venceria PARA SEMPRE,
// inclusive depois que a regra de rede mudasse (a EC 141/2026 tem duas
// viradas programadas: 16/12/2026 e 16/12/2027). Esta tabela é o caminho de
// menor acoplamento pedido pelo controlador: registra só QUE o gerente
// confirmou uma chave para a loja dele — nunca o valor legal. Sem coluna
// `valor`/`tipo`/`vigencia` de propósito: duplicar o valor aqui criaria um
// segundo lugar pra ficar desatualizado em silêncio, exatamente o defeito
// que este plano existe para evitar. `resolverRegras` NUNCA lê esta tabela —
// nenhuma query de resolução a consulta (ver drizzle/schema.ts e a migration
// 0034 para o mesmo argumento).

/** Marca `chave` como confirmada para `storeId` — idempotente (confirmar de
 * novo só atualiza `confirmadoEm`, não cria linha duplicada). */
export async function confirmarRegraLoja(storeId: number, chave: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(confirmacoesRegraLoja)
    .values({ storeId, chave })
    .onConflictDoUpdate({
      target: [confirmacoesRegraLoja.storeId, confirmacoesRegraLoja.chave],
      set: { confirmadoEm: new Date() },
    });
}

/** Chaves que esta loja já confirmou — usado só para a tela decidir o que
 * ainda está pendente (`client/src/lib/escala-assistente.ts`,
 * `regrasPendentesDeConfirmacao`). NUNCA consultado por `resolverRegras`:
 * a resolução de regras continua vendo só `regras_escala`, sem saber que
 * esta tabela existe. */
export async function getChavesConfirmadas(storeId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ chave: confirmacoesRegraLoja.chave })
    .from(confirmacoesRegraLoja)
    .where(eq(confirmacoesRegraLoja.storeId, storeId));
  return rows.map((r) => r.chave);
}

// ─── Catálogo legal (escalas_catalogo) ────────────────────────────────────────

export type EscalaCatalogo = {
  id: number;
  codigo: string;
  nome: string;
  diasTrabalho: number;
  diasFolga: number;
  horasDiaPadrao: number;
  horasSemanaMedia: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  exigeAcordoIndividual: boolean;
  exigeCCT: boolean;
  observacaoLegal: string | null;
};

function toEscalaCatalogo(row: EscalaCatalogoRow): EscalaCatalogo {
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    diasTrabalho: row.diasTrabalho,
    diasFolga: row.diasFolga,
    horasDiaPadrao: Number(row.horasDiaPadrao),
    horasSemanaMedia: Number(row.horasSemanaMedia),
    vigenciaInicio: row.vigenciaInicio,
    vigenciaFim: row.vigenciaFim,
    exigeAcordoIndividual: row.exigeAcordoIndividual,
    exigeCCT: row.exigeCCT,
    observacaoLegal: row.observacaoLegal,
  };
}

/** Entradas do catálogo vigentes em `data` (ISO "AAAA-MM-DD" — validado por
 * zod na procedure, antes de chegar aqui). Extremos de vigência nulos
 * significam "sem limite", mesma convenção de `escala-regras.ts`. */
export async function getCatalogoVigente(data: string): Promise<EscalaCatalogo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(escalasCatalogo)
    .where(
      and(
        or(isNull(escalasCatalogo.vigenciaInicio), lte(escalasCatalogo.vigenciaInicio, data)),
        or(isNull(escalasCatalogo.vigenciaFim), gte(escalasCatalogo.vigenciaFim, data))
      )
    )
    .orderBy(escalasCatalogo.codigo);
  return rows.map(toEscalaCatalogo);
}

// ─── Produtividade sugerida (Task 3: calcularProdutividadeHistorica) ─────────

/** Janela de histórico usada para sugerir produtividade: últimos 60 dias
 * corridos (inclui folgas/feriados — `calcularProdutividadeHistorica`
 * descarta os dias sem operação). Suficiente pra cobrir o piso de 5 dias
 * válidos exigido pela Task 3 mesmo em lojas com operação irregular. */
const JANELA_DIAS_PRODUTIVIDADE = 60;

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function subtrairDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Normaliza `workDate` pra string ISO "AAAA-MM-DD". `getScheduleForWeek`
 * (server/db-pessoas.ts) lê `schedules` pelo shim raw do `pg`, sem o
 * override de type parser do Drizzle — a coluna `date` pode voltar como
 * `string` OU como objeto `Date`, dependendo do caminho de leitura.
 *
 * I2 (fix loop da Task 4): sem esta normalização, `getPessoasHoraPorDia`
 * chavava o Map por `entry.workDate` (possivelmente um `Date`), e
 * `sugerirProdutividade` lia com `pessoasHoraPorDia.get(entrada.entryDate)`
 * — `entryDate` é sempre `string` (`daily_entries.entryDate` é
 * `varchar(10)`). `Map.get(string)` num mapa chaveado por objeto `Date`
 * NUNCA casa: toda amostra ficava com `pessoasHora: 0`, a Task 3 descartava
 * todo dia por "sem escala registrada", e a mensagem de guarda (plausível!)
 * escondia um bug de encanamento — exatamente a classe de defeito que este
 * plano inteiro existe para evitar.
 */
export function workDateParaIso(workDate: string | Date): string {
  return typeof workDate === "string" ? workDate : workDate.toISOString().slice(0, 10);
}

/** Pessoas-hora por dia no período, a partir de `schedules` + `shift_blocks`
 * — reusa `blockDurationHours` (server/db-pessoas.ts) em vez de recalcular
 * duração de bloco. Soma todas as pessoas escaladas em todos os blocos do
 * dia, independente de função (a produtividade sugerida é por função via o
 * driver de atendimentos, não por pessoas-hora segregada por função — o
 * schema de `schedules` não guarda a função da pessoa no turno). */
async function getPessoasHoraPorDia(storeId: number, inicio: string, fim: string): Promise<Map<string, number>> {
  const [blocks, scheduleEntries] = await Promise.all([
    getShiftBlocks(storeId),
    getScheduleForWeek(storeId, inicio, fim),
  ]);
  const blockById = new Map(blocks.map((b) => [b.id, b]));

  const pessoasHoraPorDia = new Map<string, number>();
  for (const entry of scheduleEntries) {
    const block = blockById.get(entry.shiftBlockId);
    if (!block) continue;
    const dia = workDateParaIso(entry.workDate as unknown as string | Date);
    const horas = blockDurationHours({ startMinute: block.startMinute, endMinute: block.endMinute });
    pessoasHoraPorDia.set(dia, (pessoasHoraPorDia.get(dia) ?? 0) + horas);
  }
  return pessoasHoraPorDia;
}

/**
 * Monta as amostras de `daily_entries.atendimentos` + pessoas-hora do
 * período (últimos 60 dias) e devolve o que `calcularProdutividadeHistorica`
 * (Task 3) calcular — mediana dos dias válidos, ou `{valor: null, motivo}`
 * quando não há base suficiente. Procedure fina: zero lógica de negócio
 * aqui, só leitura + montagem de amostra (R2 do controlador).
 *
 * R20 (pós-revisão da Task 5): a assinatura original exigia `funcaoId`,
 * o que tornava IMPOSSÍVEL sugerir produtividade para uma função que
 * ainda não existe — exatamente o caso mais comum (gestor cadastrando a
 * loja do zero). A sugestão nunca dependeu da IDENTIDADE da função: ela
 * deriva do histórico da loja (`atendimentos` ÷ pessoas-hora), ponto.
 * `driver` agora é o parâmetro principal e `funcaoId` passou a ser
 * OPCIONAL — serve só para, quando a função já existe, confirmar que ela
 * pertence a esta loja antes de sugerir (refinamento, não pré-requisito).
 *
 * `driver` é aceito e obrigatório no contrato (forward-compat com um
 * cálculo segregado por driver), mas `daily_entries` tem uma única
 * coluna `atendimentos` — não há, hoje, contagem separada de
 * tickets/pratos/cobertos no schema. Por isso o valor de `driver` não
 * muda o cálculo abaixo; é a mesma limitação já registrada na
 * Preocupação 4 do relatório da Task 4, agora explícita na assinatura
 * em vez de escondida atrás de um parâmetro que fingia ser usado.
 */
export async function sugerirProdutividade(
  storeId: number,
  driver: DriverFuncao,
  funcaoId?: number,
): Promise<ResultadoProdutividadeHistorica> {
  void driver; // ver comentário acima: aceito pelo contrato, não usado no cálculo hoje.

  const db = await getDb();
  if (!db) return { valor: null, motivo: "Banco de dados indisponível.", amostras: 0 };

  // Refinamento opcional: só valida que a função pertence à loja quando
  // `funcaoId` é informado. Sem `funcaoId` (caso de função nova, ainda
  // não salva), a sugestão vem direto do histórico da loja.
  if (funcaoId != null) {
    const funcaoRows = await db
      .select()
      .from(funcoesLoja)
      .where(and(eq(funcoesLoja.id, funcaoId), eq(funcoesLoja.storeId, storeId)))
      .limit(1);
    if (!funcaoRows[0]) {
      return {
        valor: null,
        motivo: `Função ${funcaoId} não encontrada na loja ${storeId}.`,
        amostras: 0,
      };
    }
  }

  const fim = hojeISO();
  const inicio = subtrairDias(fim, JANELA_DIAS_PRODUTIVIDADE);

  const [entradas, pessoasHoraPorDia] = await Promise.all([
    getDailyEntries(storeId, inicio, fim),
    getPessoasHoraPorDia(storeId, inicio, fim),
  ]);

  const amostras: AmostraProdutividade[] = entradas.map((entrada) => ({
    atendimentos: Number(entrada.atendimentos ?? 0),
    pessoasHora: pessoasHoraPorDia.get(entrada.entryDate) ?? 0,
  }));

  return calcularProdutividadeHistorica(amostras);
}
