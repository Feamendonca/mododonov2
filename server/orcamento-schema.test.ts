/**
 * orcamento-schema.test.ts
 * Task 1 do módulo Orçamento (Fase B): valida que o schema Drizzle expõe
 * a nova tabela `orcamentoMetasDiarias` com as colunas (camelCase) corretas.
 *
 * Não toca banco de dados — só inspeciona a definição da tabela via
 * `getTableColumns` do drizzle-orm.
 */

import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { orcamentoMetasDiarias } from "../drizzle/schema";
import type { OrcamentoMetaDiariaRow } from "../drizzle/schema";

describe("orcamentoMetasDiarias (schema)", () => {
  it("expõe as 7 colunas esperadas em camelCase", () => {
    const columnNames = Object.keys(getTableColumns(orcamentoMetasDiarias));

    const expected = [
      "id",
      "orcamentoId",
      "storeId",
      "data",
      "metaReceita",
      "metaAtendimentos",
      "pesoDia",
    ];

    for (const col of expected) {
      expect(columnNames).toContain(col);
    }
  });

  it("tipa o $inferSelect com as chaves esperadas (checagem em tempo de compilação)", () => {
    const row = {} as OrcamentoMetaDiariaRow;
    // Se alguma destas chaves não existir no tipo, o build do TS falha.
    const _check: {
      id: number;
      orcamentoId: number;
      storeId: number;
      data: string;
      metaReceita: string | null;
      metaAtendimentos: number | null;
      pesoDia: string | null;
    } = row;
    expect(_check).toBeDefined();
  });
});
