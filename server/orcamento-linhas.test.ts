/**
 * orcamento-linhas.test.ts
 * Task L2 (reforma "orçamento linha a linha"): tabela `orcamento_linhas`
 * guarda as linhas do orçamento (folhas editadas pelo gerente, espelhando a
 * DRE — ver `server/orcamento-arvore.ts`, Task L1).
 *
 * Cobre:
 *  1. Schema Drizzle expõe `orcamentoLinhas` com as colunas (camelCase)
 *     esperadas.
 *  2. `salvarLinhas` faz UPSERT (`ON CONFLICT (orcamento_id, codigo) DO
 *     UPDATE SET`) com os valores certos — mock de `./db` (rawQuery), sem
 *     banco real.
 *  3. `getLinhas` lê as linhas de um orçamento, ORDER BY ordem.
 *
 * Mocka `./db` (rawQuery) — mesmo padrão de orcamento-metas-diarias.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { orcamentoLinhas } from "../drizzle/schema";
import type { OrcamentoLinhaRow } from "../drizzle/schema";

vi.mock("./db", () => ({
  rawQuery: vi.fn(),
}));

import { rawQuery } from "./db";
import { salvarLinhas, getLinhas } from "./db-orcamento-v2";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("orcamentoLinhas (schema)", () => {
  it("expõe as 8 colunas esperadas em camelCase", () => {
    const columnNames = Object.keys(getTableColumns(orcamentoLinhas));

    const expected = [
      "id",
      "orcamentoId",
      "codigo",
      "label",
      "nivel",
      "valor",
      "ordem",
      "editavel",
    ];

    for (const col of expected) {
      expect(columnNames).toContain(col);
    }
  });

  it("tipa o $inferSelect com as chaves esperadas (checagem em tempo de compilação)", () => {
    const row = {} as OrcamentoLinhaRow;
    const _check: {
      id: number;
      orcamentoId: number;
      codigo: string;
      label: string | null;
      nivel: number | null;
      valor: string | null;
      ordem: number | null;
      editavel: boolean | null;
    } = row;
    expect(_check).toBeDefined();
  });
});

describe("salvarLinhas", () => {
  it("grava as linhas via UPSERT ON CONFLICT (orcamento_id, codigo) DO UPDATE SET", async () => {
    (rawQuery as any).mockResolvedValue([]);

    await salvarLinhas(1, [
      { codigo: "10", label: "Receita Bruta", nivel: 1, valor: 300000, ordem: 1, editavel: true },
      { codigo: "10.1", label: "Vendas Balcão", nivel: 2, valor: 200000, ordem: 2, editavel: true },
    ]);

    expect(rawQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = (rawQuery as any).mock.calls[0];

    expect(sql).toMatch(/ON CONFLICT \(orcamento_id, codigo\) DO UPDATE SET/);
    expect(sql).toContain("valor = EXCLUDED.valor");
    expect(sql).toContain("label = EXCLUDED.label");
    expect(sql).toContain("nivel = EXCLUDED.nivel");
    expect(sql).toContain("ordem = EXCLUDED.ordem");
    expect(sql).toContain("editavel = EXCLUDED.editavel");
    expect(sql).not.toMatch(/ON DUPLICATE KEY/i);

    // 6 params por linha (orcamento_id, codigo, label, nivel, valor, ordem, editavel = 7)
    expect(params.length).toBe(2 * 7);
    expect(params).toContain(1); // orcamentoId
    expect(params).toContain("10");
    expect(params).toContain("10.1");
    expect(params).toContain("Receita Bruta");
    expect(params).toContain(300000);
    expect(params).toContain(200000);
  });

  it("linhas vazias → não chama rawQuery", async () => {
    await salvarLinhas(1, []);
    expect(rawQuery).not.toHaveBeenCalled();
  });
});

describe("getLinhas", () => {
  it("sem dados → []", async () => {
    (rawQuery as any).mockResolvedValue([]);

    const result = await getLinhas(1);

    expect(result).toEqual([]);
  });

  it("com dados → SELECT ORDER BY ordem, mapeia linhas", async () => {
    (rawQuery as any).mockResolvedValue([
      { id: 1, orcamento_id: 1, codigo: "10", label: "Receita Bruta", nivel: 1, valor: "300000.00", ordem: 1, editavel: true },
      { id: 2, orcamento_id: 1, codigo: "10.1", label: "Vendas Balcão", nivel: 2, valor: "200000.00", ordem: 2, editavel: true },
    ]);

    const result = await getLinhas(1);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, codigo: "10", ordem: 1 });
    expect(result[1]).toMatchObject({ id: 2, codigo: "10.1", ordem: 2 });

    const [sql, params] = (rawQuery as any).mock.calls[0];
    expect(sql).toMatch(/ORDER BY ordem/);
    expect(params).toEqual([1]);
  });
});
