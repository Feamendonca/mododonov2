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
 *   4. Empate total (mesmo escopo, mesma vigenciaInicio — ex.: duas regras
 *      iguais diferindo só em `cct`/`fonte`, que o unique de regras_escala
 *      permite) → desempate final determinístico por `fonte` em ordem
 *      alfabética ascendente. Nunca pela ordem de chegada no array: um
 *      SELECT sem ORDER BY não garante ordem, e "ordem de chegada" não é
 *      um critério de negócio — é um acidente de execução.
 *
 * Falhar explícito é requisito: `regraObrigatoria` lança
 * `RegraAusenteError` quando a chave não tem regra aplicável na data —
 * nunca devolve undefined (que viraria NaN no motor e geraria escala
 * ilegal silenciosamente). Pelo mesmo motivo, `resolverRegras` valida o
 * formato de TODAS as datas que manuseia (ctx.data e toda vigência das
 * regras recebidas) e lança `FormatoDataInvalidoError` em vez de aceitar
 * silenciosamente um formato fora de ISO "AAAA-MM-DD" — "20/01/2028" não
 * pode cair no regime antigo sem erro só porque comparação de string
 * lexicográfica "funcionou por acaso".
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

/**
 * Lançado quando uma data (ctx.data ou a vigência de alguma regra) não
 * está no formato ISO "AAAA-MM-DD". A resolução de vigência compara datas
 * como string (lexicograficamente) — isso só é correto sob essa forma
 * exata; qualquer outro formato ("20/01/2028", "2027-12-15T12:00:00Z")
 * compara "por acaso" e pode devolver um resultado incorreto sem avisar.
 */
export class FormatoDataInvalidoError extends Error {
  constructor(campo: string, valor: string) {
    super(
      `${campo} inválida: "${valor}" — esperado formato ISO "AAAA-MM-DD" (exatamente 10 caracteres, ex.: "2026-11-19").`,
    );
    this.name = "FormatoDataInvalidoError";
  }
}

const PESO_ESCOPO: Record<Escopo, number> = {
  loja: 3,
  uf: 2,
  rede: 1,
};

const FORMATO_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validarFormatoData(valor: string, campo: string): void {
  if (typeof valor !== "string" || !FORMATO_DATA_ISO.test(valor)) {
    throw new FormatoDataInvalidoError(campo, valor);
  }
}

/** Normaliza UF para comparação: maiúsculas e sem espaços nas pontas.
 * A tabela `stores` não tem coluna `uf` estruturada (só `location` de
 * texto livre) — quem monta `ctx.uf` à mão pode mandar "sp", " SP " etc.
 * Sem normalizar, isso não dá erro: simplesmente não casa com a regra de
 * UF e cai, em silêncio, para a regra de rede — valor errado, não
 * ausência. Normalizamos os dois lados (ctx e regra) pelo mesmo motivo.
 *
 * `""` (string vazia, após trim) normaliza para `null` — mesma convenção
 * de "sem UF" usada por `server/routers/escala.ts` para sinalizar loja sem
 * UF cadastrada (R13). Exportada para ser a ÚNICA implementação no módulo
 * de Escala (Menor 11 do fix loop da Task 4): havia uma cópia divergente
 * no router (`"" → ""`, em vez de `"" → null`); duas implementações da
 * mesma normalização é como nasce um "sp" ≠ "SP" novo mais tarde. */
export function normalizarUf(uf: string | null | undefined): string | null {
  if (uf === null || uf === undefined) return null;
  const limpa = uf.trim().toUpperCase();
  return limpa.length > 0 ? limpa : null;
}

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
  const ufRegra = normalizarUf(regra.uf);
  if (ufRegra !== null && ufRegra !== normalizarUf(ctx.uf)) {
    return false;
  }
  return true;
}

/** Entre duas regras candidatas da mesma chave, decide qual vence:
 * (1) maior peso de escopo; (2) no empate, vigenciaInicio mais recente
 * (null = "sempre", portanto o mais antigo possível); (3) no empate
 * total — mesmo escopo E mesma vigenciaInicio —, `fonte` em ordem
 * alfabética ascendente, nunca a ordem de chegada no array. */
function vence(candidata: RegraSeed, atual: RegraSeed): boolean {
  const pesoCandidata = PESO_ESCOPO[escopoDaRegra(candidata)];
  const pesoAtual = PESO_ESCOPO[escopoDaRegra(atual)];
  if (pesoCandidata !== pesoAtual) return pesoCandidata > pesoAtual;

  const inicioCandidata = candidata.vigenciaInicio ?? "";
  const inicioAtual = atual.vigenciaInicio ?? "";
  if (inicioCandidata !== inicioAtual) return inicioCandidata > inicioAtual;

  return candidata.fonte < atual.fonte;
}

/** Clona profundamente e congela `valor` antes de devolvê-lo em
 * `RegraResolvida`. Sem isso, o chamador recebe uma referência direta ao
 * objeto do seed/regra original (comum em chaves como
 * `intervalo_intrajornada`, cujo valor é um objeto) — mutar o resultado
 * mutaria o seed e envenenaria toda resolução seguinte no mesmo
 * processo. Clone resolve o aliasing; freeze é defesa extra para o
 * próprio clone não ser mutado em silêncio por quem o recebeu. */
function clonarValorImutavel(valor: unknown): unknown {
  if (valor === null || typeof valor !== "object") return valor;
  const clone = structuredClone(valor);
  congelarProfundo(clone);
  return clone;
}

function congelarProfundo(valor: unknown): void {
  if (valor === null || typeof valor !== "object" || Object.isFrozen(valor)) return;
  Object.freeze(valor);
  for (const chave of Object.keys(valor as Record<string, unknown>)) {
    congelarProfundo((valor as Record<string, unknown>)[chave]);
  }
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
  validarFormatoData(ctx.data, "ctx.data");
  for (const r of regras) {
    if (r.vigenciaInicio !== null) {
      validarFormatoData(r.vigenciaInicio, `vigenciaInicio da regra "${r.chave}"`);
    }
    if (r.vigenciaFim !== null) {
      validarFormatoData(r.vigenciaFim, `vigenciaFim da regra "${r.chave}"`);
    }
  }

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
      valor: clonarValorImutavel(regra.valor),
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
