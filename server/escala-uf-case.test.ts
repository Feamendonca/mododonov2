/**
 * escala-uf-case.test.ts
 *
 * 🔴 I5 (review final do módulo de Escala): case de UF.
 *
 * `getRegras` filtrava com `eq(regrasEscala.uf, uf)` — comparação exata.
 * Uma regra gravada como "sp" nunca entrava nas candidatas; e, como a loja
 * TEM uf, `avisoUfAusente` é `false` e nada avisava. A loja perdia as
 * regras estaduais em silêncio — valor errado com cara de normalidade,
 * que é a classe de defeito que este plano inteiro existe para evitar.
 *
 * Testa os DOIS lados da correção, sem banco:
 *  - ESCRITA: `toInsertRegra` normaliza a UF (maiúsculas, sem espaços);
 *  - LEITURA: `condicaoRegrasCandidatas` (usada por `getRegras`) compara
 *    `upper(trim(uf))` contra a UF do contexto já normalizada — o SQL
 *    gerado é inspecionado com o QueryBuilder do drizzle, que monta a
 *    query sem precisar de conexão.
 */
import { describe, expect, it } from "vitest";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { regrasEscala } from "../drizzle/schema";
import { condicaoRegrasCandidatas } from "./db-escala-config";
import { toInsertRegra, type RegraSeed } from "./escala-catalogo-seed";
import { normalizarUf, resolverRegras, regraObrigatoria } from "./escala-regras";

function sqlDe(storeId: number, uf: string | null) {
  return new QueryBuilder()
    .select()
    .from(regrasEscala)
    .where(condicaoRegrasCandidatas(storeId, uf))
    .toSQL();
}

describe("condicaoRegrasCandidatas — I5: comparação de UF é case/space-insensitive", () => {
  it('UF do contexto em minúsculas ("sp") vira "SP" no parâmetro da query', () => {
    const { params } = sqlDe(10, "sp");
    expect(params).toContain("SP");
    expect(params).not.toContain("sp");
  });

  it("UF com espaços (' SP ') é aparada antes de virar parâmetro", () => {
    expect(sqlDe(10, " SP ").params).toContain("SP");
  });

  it("a coluna entra na comparação dentro de upper(trim(...)) — linha gravada 'sp' casa com loja 'SP'", () => {
    const { sql } = sqlDe(10, "SP");
    expect(sql.toLowerCase()).toContain("upper(trim(");
  });

  it("UF nula (loja sem UF, R13) → só rede + loja: nenhuma comparação de UF, nenhum parâmetro de UF", () => {
    const { sql, params } = sqlDe(10, null);
    expect(sql.toLowerCase()).not.toContain("upper(");
    expect(params).toEqual([10]);
  });

  it('UF vazia ("" / "   ") é tratada como ausência, igual a null (mesma convenção de normalizarUf)', () => {
    for (const vazia of ["", "   "]) {
      const { sql, params } = sqlDe(10, vazia);
      expect(sql.toLowerCase()).not.toContain("upper(");
      expect(params).toEqual([10]);
    }
  });

  it("regras de rede (uf NULL) continuam entrando junto com as da UF", () => {
    const { sql } = sqlDe(10, "SP");
    expect(sql.toLowerCase()).toContain("is null");
  });
});

describe("toInsertRegra — I5: UF é normalizada na ESCRITA", () => {
  function seed(uf: string | null): RegraSeed {
    return {
      storeId: null,
      uf,
      cct: null,
      chave: "domingos_folga_mulher_mes",
      valor: 2,
      tipo: "DEPENDE_CCT",
      vigenciaInicio: null,
      vigenciaFim: null,
      fonte: "CCT da praça",
    };
  }

  it('"sp" é gravada como "SP"', () => {
    expect(toInsertRegra(seed("sp")).uf).toBe("SP");
  });

  it('" sp " perde os espaços e sobe maiúscula', () => {
    expect(toInsertRegra(seed(" sp ")).uf).toBe("SP");
  });

  it("null continua null (regra de rede não ganha UF do nada)", () => {
    expect(toInsertRegra(seed(null)).uf).toBeNull();
  });

  it('"" vira null — "sem UF" tem UMA representação só no banco', () => {
    expect(toInsertRegra(seed("")).uf).toBeNull();
  });
});

describe("resolverRegras — a normalização da escrita e a do resolvedor concordam", () => {
  it("regra gravada via toInsertRegra com 'sp' é aplicada a uma loja de UF 'SP'", () => {
    const gravada = toInsertRegra({
      storeId: null,
      uf: "sp",
      cct: null,
      chave: "jornada_max_semanal",
      valor: 40,
      tipo: "DURA",
      vigenciaInicio: null,
      vigenciaFim: null,
      fonte: "CCT SINDHA-SP",
    });
    const comoVoltaDoBanco: RegraSeed = {
      storeId: gravada.storeId ?? null,
      uf: gravada.uf ?? null,
      cct: gravada.cct ?? null,
      chave: gravada.chave,
      valor: gravada.valor,
      tipo: "DURA",
      vigenciaInicio: gravada.vigenciaInicio ?? null,
      vigenciaFim: gravada.vigenciaFim ?? null,
      fonte: gravada.fonte,
    };

    const mapa = resolverRegras([comoVoltaDoBanco], { storeId: 10, uf: "SP", data: "2026-11-19" });
    expect(regraObrigatoria(mapa, "jornada_max_semanal").valor).toBe(40);
  });

  it("normalizarUf é a mesma função usada pela query e pelo resolvedor (implementação única)", () => {
    expect(normalizarUf(" sp ")).toBe("SP");
    expect(normalizarUf("")).toBeNull();
  });
});
