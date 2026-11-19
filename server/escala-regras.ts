/**
 * escala-regras.ts — Resolvedor de regras por data e escopo
 *
 * Peça central do módulo de Escala: responde "qual regra vale nesta data,
 * nesta loja, nesta UF" a partir do array de regras (mesma forma de
 * `RegraSeed`, Task 1 — server/escala-catalogo-seed.ts). Função pura, sem
 * I/O: não faz query, não conhece banco, não conhece o significado de
 * nenhuma chave (não sabe o que é "42" em jornada_max_semanal — só sabe
 * resolver escopo e vigência).
 *
 * Regras de precedência (spec seção 1 + task-2-brief.md):
 *   1. Regras cuja vigência não cobre a data consultada são descartadas
 *      ANTES de qualquer comparação de escopo.
 *   2. Peso de escopo: loja (3) > uf (2) > rede (1). Uma regra com
 *      `storeId` preenchido é escopo loja; só com `uf` preenchido é
 *      escopo uf; sem nenhum dos dois é rede. (O campo `cct` não entra
 *      no cálculo de escopo nem no contexto de resolução desta task —
 *      resolução por CCT é tarefa de etapa futura do motor.)
 *   3. Empate de escopo → vence a `vigenciaInicio` mais recente.
 *
 * Falhar explícito é requisito: `regraObrigatoria` lança
 * `RegraAusenteError` quando a chave não tem regra aplicável na data —
 * nunca devolve undefined (que viraria NaN no motor e geraria escala
 * ilegal silenciosamente).
 *
 * Ver .superpowers/sdd/2026-11-19-escala-configuracao/task-2-brief.md.
 */
import type { RegraSeed, TipoRegra } from "./escala-catalogo-seed";

export type Escopo = "loja" | "uf" | "rede";

export interface RegraResolvida {
  chave: string;
  valor: unknown;
  tipo: TipoRegra;
  fonte: string;
  escopo: Escopo;
}

export interface ContextoResolucao {
  storeId: number;
  uf: string;
  data: string;
}

/**
 * Lançado por `regraObrigatoria` quando a chave pedida não existe no mapa
 * resolvido (nenhuma regra aplicável cobre a data/escopo consultados).
 * Propositalmente um erro, não um valor ausente silencioso.
 */
export class RegraAusenteError extends Error {
  readonly chave: string;

  constructor(chave: string) {
    super(`Nenhuma regra vigente encontrada para a chave "${chave}".`);
    this.name = "RegraAusenteError";
    this.chave = chave;
  }
}

const PESO_ESCOPO: Record<Escopo, number> = {
  loja: 3,
  uf: 2,
  rede: 1,
};

function escopoDaRegra(regra: RegraSeed): Escopo {
  if (regra.storeId !== null && regra.storeId !== undefined) return "loja";
  if (regra.uf !== null && regra.uf !== undefined) return "uf";
  return "rede";
}

/** Vigência cobre `data` quando data ∈ [vigenciaInicio, vigenciaFim], com
 * extremos nulos significando "sem limite" (nesse lado). Ambos os limites
 * são inclusivos — comparação lexicográfica funciona porque as datas vêm
 * sempre no formato ISO "AAAA-MM-DD". */
function vigeEmData(regra: RegraSeed, data: string): boolean {
  if (regra.vigenciaInicio !== null && data < regra.vigenciaInicio) return false;
  if (regra.vigenciaFim !== null && data > regra.vigenciaFim) return false;
  return true;
}

/** Uma regra só se aplica ao contexto se TODO campo de escopo que ela
 * preenche bater com o contexto — storeId !== ctx.storeId ou
 * uf !== ctx.uf descarta a regra inteira, não apenas "não prioriza". */
function aplicaAoContexto(regra: RegraSeed, ctx: ContextoResolucao): boolean {
  if (regra.storeId !== null && regra.storeId !== undefined && regra.storeId !== ctx.storeId) {
    return false;
  }
  if (regra.uf !== null && regra.uf !== undefined && regra.uf !== ctx.uf) {
    return false;
  }
  return true;
}

/** Entre duas regras candidatas da mesma chave, decide qual vence:
 * maior peso de escopo; no empate, vigenciaInicio mais recente (null =
 * "sempre", portanto o mais antigo possível). */
function vence(candidata: RegraSeed, atual: RegraSeed): boolean {
  const pesoCandidata = PESO_ESCOPO[escopoDaRegra(candidata)];
  const pesoAtual = PESO_ESCOPO[escopoDaRegra(atual)];
  if (pesoCandidata !== pesoAtual) return pesoCandidata > pesoAtual;

  const inicioCandidata = candidata.vigenciaInicio ?? "";
  const inicioAtual = atual.vigenciaInicio ?? "";
  return inicioCandidata > inicioAtual;
}

/**
 * Resolve, para o contexto dado (loja + UF + data), qual regra vale para
 * cada chave presente em `regras`. Pura: não faz I/O, não hardcoda nenhum
 * valor legal — só decide escopo e vigência.
 */
export function resolverRegras(
  regras: RegraSeed[],
  ctx: ContextoResolucao,
): Map<string, RegraResolvida> {
  const candidatas = regras.filter((r) => vigeEmData(r, ctx.data) && aplicaAoContexto(r, ctx));

  const melhorPorChave = new Map<string, RegraSeed>();
  for (const candidata of candidatas) {
    const atual = melhorPorChave.get(candidata.chave);
    if (atual === undefined || vence(candidata, atual)) {
      melhorPorChave.set(candidata.chave, candidata);
    }
  }

  const resultado = new Map<string, RegraResolvida>();
  for (const [chave, regra] of Array.from(melhorPorChave.entries())) {
    resultado.set(chave, {
      chave,
      valor: regra.valor,
      tipo: regra.tipo,
      fonte: regra.fonte,
      escopo: escopoDaRegra(regra),
    });
  }
  return resultado;
}

/**
 * Busca `chave` no mapa já resolvido por `resolverRegras`. Lança
 * `RegraAusenteError` em vez de devolver `undefined` — undefined virando
 * NaN no motor de escala gera escala ilegal com aparência de normal.
 */
export function regraObrigatoria(
  mapa: Map<string, RegraResolvida>,
  chave: string,
): RegraResolvida {
  const regra = mapa.get(chave);
  if (regra === undefined) {
    throw new RegraAusenteError(chave);
  }
  return regra;
}
