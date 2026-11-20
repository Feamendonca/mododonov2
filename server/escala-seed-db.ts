/**
 * escala-seed-db.ts — Seed (idempotente) dos parâmetros do catálogo legal
 *
 * R14 (ruling do controlador, 2026-11-19 — lacuna do plano, não da Task 4):
 * a Task 1 criou as constantes (`CATALOGO_INICIAL`, `REGRAS_LEGAIS_INICIAIS`)
 * + os mappers já testados (`toInsertCatalogo`/`toInsertRegra`); a Task 4
 * (`db-escala-config.ts`) LÊ `escalas_catalogo`/`regras_escala`; nenhuma
 * task até agora GRAVA. Sem isso as tabelas nascem vazias em produção:
 * `resolverRegras` recebe array vazio e `regraObrigatoria` lança para toda
 * chave — o módulo não funciona no dia 1. `semearParametrosEscala` fecha
 * esse buraco.
 *
 * NÃO reescreve nenhum valor legal: deriva 100% de `CATALOGO_INICIAL`/
 * `REGRAS_LEGAIS_INICIAIS` via os mappers testados na Task 1. Duplicar
 * 44h/42h/40h em SQL aqui garantiria que os dois lugares divergem no
 * primeiro UPDATE feito só num deles.
 *
 * Idempotência NÃO é feita com `ON CONFLICT DO NOTHING` sobre os uniques da
 * Task 1 — mesmo defeito do `upsertRegraLoja` (db-escala-config.ts), só que
 * mais grave aqui: em Postgres uma unique index nunca detecta conflito
 * entre duas linhas quando QUALQUER coluna indexada é NULL nas duas (NULL
 * não é igual a NULL). `regras_escala` é 100% escopo rede neste seed —
 * `storeId`/`uf`/`cct` são NULL em TODAS as linhas de
 * `REGRAS_LEGAIS_INICIAIS` — logo `ON CONFLICT
 * (storeId,uf,cct,chave,vigenciaInicio) DO NOTHING` NUNCA dispara para
 * nenhuma delas: rodar o seed duas vezes duplicaria as 13 linhas por
 * completo. Em `escalas_catalogo` o problema é parcial: só dispara para as
 * 4 das 9 linhas com `vigenciaInicio` preenchida; as outras 5 (uma por
 * código, a "desde sempre") têm `vigenciaInicio: null` e colidiriam de
 * novo a cada execução pelo mesmo motivo.
 *
 * Por isso a idempotência é feita em memória: lê as chaves já existentes
 * (uma SELECT por tabela, sem WHERE — tabelas pequenas, de parâmetro), e
 * `catalogoParaInserir`/`regrasParaInserir` (funções PURAS, sem I/O, testadas
 * isoladamente) filtram os seeds que já têm uma linha com a mesma chave
 * lógica, usando igualdade de valor em JS — que TRATA null===null como
 * igual, ao contrário do Postgres. Só então insere o que sobrou.
 */
import { getDb } from "./db";
import { escalasCatalogo, regrasEscala } from "../drizzle/schema";
import {
  CATALOGO_INICIAL,
  REGRAS_LEGAIS_INICIAIS,
  toInsertCatalogo,
  toInsertRegra,
  type EscalaCatalogoSeed,
  type RegraSeed,
} from "./escala-catalogo-seed";
import type { InsertEscalaCatalogo, InsertRegraEscala } from "../drizzle/schema";

/** Instância de banco já conectada — o mesmo tipo que `getDb()` devolve,
 * sem o `| null` (quem chama `semearParametrosEscala` decide o que fazer
 * se `getDb()` devolver null; a função não acessa `getDb()` por conta
 * própria, pra ficar testável com um db fake). */
export type EscalaSeedDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface ContagemSemeadura {
  inseridos: number;
  ignorados: number;
}

export interface ResultadoSemeadura {
  catalogo: ContagemSemeadura;
  regras: ContagemSemeadura;
}

// ─── Chaves lógicas (espelham os uniques da Task 1) ───────────────────────────

export type ChaveCatalogo = Pick<EscalaCatalogoSeed, "codigo" | "vigenciaInicio">;
export type ChaveRegra = Pick<RegraSeed, "storeId" | "uf" | "cct" | "chave" | "vigenciaInicio">;

function chaveCatalogoBate(seed: EscalaCatalogoSeed, existente: ChaveCatalogo): boolean {
  return seed.codigo === existente.codigo && seed.vigenciaInicio === existente.vigenciaInicio;
}

function chaveRegraBate(seed: RegraSeed, existente: ChaveRegra): boolean {
  return (
    seed.storeId === existente.storeId &&
    seed.uf === existente.uf &&
    seed.cct === existente.cct &&
    seed.chave === existente.chave &&
    seed.vigenciaInicio === existente.vigenciaInicio
  );
}

/**
 * Função PURA: dado o que já existe em `escalas_catalogo` (chaves lógicas)
 * e os seeds (default `CATALOGO_INICIAL`), devolve só as linhas que ainda
 * não existem, já no formato `InsertEscalaCatalogo` (via `toInsertCatalogo`,
 * Task 1). Nenhuma entrada de `seeds` fica de fora: cada uma aparece no
 * resultado a menos que `existentes` já tenha sua chave exata.
 */
export function catalogoParaInserir(
  existentes: ChaveCatalogo[],
  seeds: EscalaCatalogoSeed[] = CATALOGO_INICIAL
): InsertEscalaCatalogo[] {
  return seeds
    .filter((seed) => !existentes.some((existente) => chaveCatalogoBate(seed, existente)))
    .map(toInsertCatalogo);
}

/**
 * Função PURA, mesmo contrato de `catalogoParaInserir`, para
 * `regras_escala` / `REGRAS_LEGAIS_INICIAIS`.
 */
export function regrasParaInserir(
  existentes: ChaveRegra[],
  seeds: RegraSeed[] = REGRAS_LEGAIS_INICIAIS
): InsertRegraEscala[] {
  return seeds
    .filter((seed) => !existentes.some((existente) => chaveRegraBate(seed, existente)))
    .map(toInsertRegra);
}

/**
 * Grava em `escalas_catalogo`/`regras_escala` o que ainda não existe,
 * derivando das constantes da Task 1. Idempotente: rodar duas vezes
 * devolve `inseridos: 0` na segunda vez (ver nota do módulo sobre por que
 * isso não é feito com `ON CONFLICT DO NOTHING`).
 *
 * Recebe `db` já conectado (não chama `getDb()`) — decisão deliberada pra
 * ficar testável sem banco real, injetando um objeto fake com o mesmo
 * formato de `.select()/.insert()` usado em todo o resto do app
 * (`server/db.ts`).
 */
export async function semearParametrosEscala(db: EscalaSeedDb): Promise<ResultadoSemeadura> {
  const catalogoExistente = (await db
    .select({ codigo: escalasCatalogo.codigo, vigenciaInicio: escalasCatalogo.vigenciaInicio })
    .from(escalasCatalogo)) as ChaveCatalogo[];

  const regrasExistentes = (await db
    .select({
      storeId: regrasEscala.storeId,
      uf: regrasEscala.uf,
      cct: regrasEscala.cct,
      chave: regrasEscala.chave,
      vigenciaInicio: regrasEscala.vigenciaInicio,
    })
    .from(regrasEscala)) as ChaveRegra[];

  const catalogoNovo = catalogoParaInserir(catalogoExistente);
  const regrasNovas = regrasParaInserir(regrasExistentes);

  if (catalogoNovo.length > 0) {
    await db.insert(escalasCatalogo).values(catalogoNovo);
  }
  if (regrasNovas.length > 0) {
    await db.insert(regrasEscala).values(regrasNovas);
  }

  return {
    catalogo: {
      inseridos: catalogoNovo.length,
      ignorados: CATALOGO_INICIAL.length - catalogoNovo.length,
    },
    regras: {
      inseridos: regrasNovas.length,
      ignorados: REGRAS_LEGAIS_INICIAIS.length - regrasNovas.length,
    },
  };
}
