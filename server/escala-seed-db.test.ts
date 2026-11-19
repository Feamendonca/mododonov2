/**
 * escala-seed-db.test.ts
 * R14 (ruling do controlador, 2026-11-19): fecha o buraco de nenhuma task
 * gravar `CATALOGO_INICIAL`/`REGRAS_LEGAIS_INICIAIS` no banco.
 *
 * Cobre:
 *  1. `catalogoParaInserir`/`regrasParaInserir` (puras, sem banco) — toda
 *     entrada das constantes é derivada (nenhuma fica de fora) e a
 *     "segunda execução" (existentes = tudo que a primeira inseriria) não
 *     insere nada.
 *  2. `semearParametrosEscala(db)` com um `db` fake no mesmo formato de
 *     `.select()/.insert()` usado no resto do app — sem banco real.
 */
import { describe, it, expect, vi } from "vitest";
import { escalasCatalogo, regrasEscala } from "../drizzle/schema";
import { CATALOGO_INICIAL, REGRAS_LEGAIS_INICIAIS, toInsertCatalogo, toInsertRegra } from "./escala-catalogo-seed";
import {
  catalogoParaInserir,
  regrasParaInserir,
  semearParametrosEscala,
  type ChaveCatalogo,
  type ChaveRegra,
  type EscalaSeedDb,
} from "./escala-seed-db";

// ─── catalogoParaInserir / regrasParaInserir — funções puras ─────────────────

describe("catalogoParaInserir", () => {
  it("sem nada existente, deriva TODA entrada de CATALOGO_INICIAL (nenhuma fica de fora)", () => {
    const resultado = catalogoParaInserir([]);
    expect(resultado).toHaveLength(CATALOGO_INICIAL.length);
    expect(resultado).toEqual(CATALOGO_INICIAL.map(toInsertCatalogo));
  });

  it("segunda execução (existentes = tudo que a primeira inseriria) não insere nada", () => {
    const existentes: ChaveCatalogo[] = CATALOGO_INICIAL.map((s) => ({
      codigo: s.codigo,
      vigenciaInicio: s.vigenciaInicio,
    }));
    expect(catalogoParaInserir(existentes)).toEqual([]);
  });

  it("existente com mesmo código mas vigenciaInicio DIFERENTE não bloqueia a entrada nova", () => {
    // 5x2 tem 3 entradas (vigenciaInicio null / 2026-12-16 / 2027-12-16).
    // Só a chave EXATA (codigo + vigenciaInicio) deve casar.
    const existentes: ChaveCatalogo[] = [{ codigo: "5x2", vigenciaInicio: "2026-12-16" }];
    const resultado = catalogoParaInserir(existentes);
    const codigosVigencias = resultado.map((r) => [r.codigo, r.vigenciaInicio]);
    expect(codigosVigencias).toContainEqual(["5x2", null]);
    expect(codigosVigencias).toContainEqual(["5x2", "2027-12-16"]);
    expect(codigosVigencias).not.toContainEqual(["5x2", "2026-12-16"]);
    expect(resultado).toHaveLength(CATALOGO_INICIAL.length - 1);
  });

  it("null em vigenciaInicio do existente só casa com seed de vigenciaInicio null (não com qualquer um)", () => {
    // Regressão direta do bug que o ON CONFLICT teria: confirmar que a
    // comparação é por igualdade exata (incluindo os dois lados null),
    // não "null casa com tudo".
    const existentes: ChaveCatalogo[] = [{ codigo: "4x3", vigenciaInicio: null }];
    const resultado = catalogoParaInserir(existentes);
    expect(resultado.some((r) => r.codigo === "4x3")).toBe(false);
    expect(resultado).toHaveLength(CATALOGO_INICIAL.length - 1);
  });
});

describe("regrasParaInserir", () => {
  it("sem nada existente, deriva TODA entrada de REGRAS_LEGAIS_INICIAIS (nenhuma fica de fora)", () => {
    const resultado = regrasParaInserir([]);
    expect(resultado).toHaveLength(REGRAS_LEGAIS_INICIAIS.length);
    expect(resultado).toEqual(REGRAS_LEGAIS_INICIAIS.map(toInsertRegra));
  });

  it("segunda execução (existentes = tudo que a primeira inseriria) não insere nada", () => {
    const existentes: ChaveRegra[] = REGRAS_LEGAIS_INICIAIS.map((s) => ({
      storeId: s.storeId,
      uf: s.uf,
      cct: s.cct,
      chave: s.chave,
      vigenciaInicio: s.vigenciaInicio,
    }));
    expect(regrasParaInserir(existentes)).toEqual([]);
  });

  it("distingue regras da mesma chave por vigenciaInicio — storeId/uf/cct todos NULL em todo o seed", () => {
    // jornada_max_semanal tem 3 entradas, todas storeId=uf=cct=null,
    // diferindo só por vigenciaInicio. Se a comparação ignorasse
    // vigenciaInicio (ou tratasse null como "casa com tudo"), as 3
    // colapsariam numa só.
    const existentes: ChaveRegra[] = [
      { storeId: null, uf: null, cct: null, chave: "jornada_max_semanal", vigenciaInicio: null },
    ];
    const resultado = regrasParaInserir(existentes);
    const restantesJornada = resultado.filter((r) => r.chave === "jornada_max_semanal");
    expect(restantesJornada).toHaveLength(2);
    expect(restantesJornada.map((r) => r.vigenciaInicio).sort()).toEqual(
      ["2026-12-16", "2027-12-16"].sort()
    );
  });
});

// ─── semearParametrosEscala(db) — com db fake, sem banco real ────────────────

/** `db` fake no mesmo formato de `.select(cols).from(table)` /
 * `.insert(table).values(rows)` usado no resto do app (server/db.ts). */
function makeDbFake(catalogoExistente: ChaveCatalogo[], regrasExistentes: ChaveRegra[]) {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insertCalls: { table: "catalogo" | "regras"; rows: unknown[] }[] = [];

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (table === escalasCatalogo) return Promise.resolve(catalogoExistente);
        if (table === regrasEscala) return Promise.resolve(regrasExistentes);
        throw new Error("tabela inesperada no mock de select");
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (rows: unknown[]) => {
        insertCalls.push({ table: table === escalasCatalogo ? "catalogo" : "regras", rows });
        return insertValues(rows);
      },
    })),
  } as unknown as EscalaSeedDb;

  return { db, insertCalls };
}

describe("semearParametrosEscala", () => {
  it("banco vazio → insere TODAS as linhas do catálogo e das regras, reporta a contagem certa", async () => {
    const { db, insertCalls } = makeDbFake([], []);

    const resultado = await semearParametrosEscala(db);

    expect(resultado).toEqual({
      catalogo: { inseridos: CATALOGO_INICIAL.length, ignorados: 0 },
      regras: { inseridos: REGRAS_LEGAIS_INICIAIS.length, ignorados: 0 },
    });
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls.find((c) => c.table === "catalogo")?.rows).toHaveLength(CATALOGO_INICIAL.length);
    expect(insertCalls.find((c) => c.table === "regras")?.rows).toHaveLength(REGRAS_LEGAIS_INICIAIS.length);
  });

  it("segunda execução (tudo já existe) → 0 inseridos, nenhum insert disparado", async () => {
    const catalogoExistente: ChaveCatalogo[] = CATALOGO_INICIAL.map((s) => ({
      codigo: s.codigo,
      vigenciaInicio: s.vigenciaInicio,
    }));
    const regrasExistentes: ChaveRegra[] = REGRAS_LEGAIS_INICIAIS.map((s) => ({
      storeId: s.storeId,
      uf: s.uf,
      cct: s.cct,
      chave: s.chave,
      vigenciaInicio: s.vigenciaInicio,
    }));
    const { db, insertCalls } = makeDbFake(catalogoExistente, regrasExistentes);

    const resultado = await semearParametrosEscala(db);

    expect(resultado).toEqual({
      catalogo: { inseridos: 0, ignorados: CATALOGO_INICIAL.length },
      regras: { inseridos: 0, ignorados: REGRAS_LEGAIS_INICIAIS.length },
    });
    // Nenhuma chamada a insert — não só "inseriu 0 linhas", literalmente não
    // disparou INSERT nenhum na segunda execução.
    expect(insertCalls).toHaveLength(0);
  });

  it("estado parcial (só o catálogo já existe) → insere só as regras faltantes", async () => {
    const catalogoExistente: ChaveCatalogo[] = CATALOGO_INICIAL.map((s) => ({
      codigo: s.codigo,
      vigenciaInicio: s.vigenciaInicio,
    }));
    const { db, insertCalls } = makeDbFake(catalogoExistente, []);

    const resultado = await semearParametrosEscala(db);

    expect(resultado.catalogo).toEqual({ inseridos: 0, ignorados: CATALOGO_INICIAL.length });
    expect(resultado.regras).toEqual({ inseridos: REGRAS_LEGAIS_INICIAIS.length, ignorados: 0 });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe("regras");
  });
});
