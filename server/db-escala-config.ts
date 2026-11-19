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

export async function updateFuncao(id: number, storeId: number, data: UpdateFuncaoInput): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const set: Partial<InsertFuncaoLoja> = { updatedAt: new Date() };
  if (data.nome !== undefined) set.nome = data.nome;
  if (data.driver !== undefined) set.driver = data.driver;
  if (data.produtividadeAlvo !== undefined) {
    set.produtividadeAlvo = data.produtividadeAlvo == null ? null : String(data.produtividadeAlvo);
  }
  if (data.produtividadeOrigem !== undefined) set.produtividadeOrigem = data.produtividadeOrigem;
  if (data.minPorBloco !== undefined) set.minPorBloco = data.minPorBloco;
  if (data.maxPorBloco !== undefined) set.maxPorBloco = data.maxPorBloco;
  await db.update(funcoesLoja).set(set).where(and(eq(funcoesLoja.id, id), eq(funcoesLoja.storeId, storeId)));
}

export async function desativarFuncao(id: number, storeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(funcoesLoja)
    .set({ ativo: false, updatedAt: new Date() })
    .where(and(eq(funcoesLoja.id, id), eq(funcoesLoja.storeId, storeId)));
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
  const db = await getDb();
  if (!db) return;
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
    const horas = blockDurationHours({ startMinute: block.startMinute, endMinute: block.endMinute });
    pessoasHoraPorDia.set(entry.workDate, (pessoasHoraPorDia.get(entry.workDate) ?? 0) + horas);
  }
  return pessoasHoraPorDia;
}

/**
 * Monta as amostras de `daily_entries.atendimentos` + pessoas-hora do
 * período (últimos 60 dias) e devolve o que `calcularProdutividadeHistorica`
 * (Task 3) calcular — mediana dos dias válidos, ou `{valor: null, motivo}`
 * quando não há base suficiente. Procedure fina: zero lógica de negócio
 * aqui, só leitura + montagem de amostra (R2 do controlador).
 */
export async function sugerirProdutividade(storeId: number, funcaoId: number): Promise<ResultadoProdutividadeHistorica> {
  const db = await getDb();
  if (!db) return { valor: null, motivo: "Banco de dados indisponível.", amostras: 0 };

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
