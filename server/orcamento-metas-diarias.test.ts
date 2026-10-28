/**
 * orcamento-metas-diarias.test.ts
 * Task 6 do módulo Orçamento (Fase B): quebra do orçamento mensal aprovado em
 * metas diárias (uniforme por ora — sem ajuste de dia-da-semana).
 *
 * Cobre:
 *  1. `gerarMetasDiarias` calcula `diasNoMes` corretamente (30 dias em junho,
 *     28 dias em fevereiro não-bissexto) e distribui `receitaMensal / diasNoMes`
 *     uniformemente, 1 linha por dia, via UPSERT (`ON CONFLICT (store_id, data)`).
 *  2. `aprovarOrcamento` (Task 5) agora, após aprovar, carrega a linha do
 *     orçamento e SE `receita_bruta` não for null chama `gerarMetasDiarias`;
 *     se for null, NÃO gera (não quebra).
 *  3. `getMetasDiarias` sem dados → `[]`.
 *
 * Mocka `./db` (rawQuery) — sem banco real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  rawQuery: vi.fn(),
}));

import { rawQuery } from "./db";
import { gerarMetasDiarias, aprovarOrcamento, getMetasDiarias } from "./db-orcamento-v2";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gerarMetasDiarias", () => {
  it("junho (30 dias): gera 30 linhas, meta_receita = 10000 cada, soma = receitaMensal", async () => {
    (rawQuery as any).mockResolvedValue([]);

    const total = await gerarMetasDiarias(1, 10, "2026-06-01", 300000);

    expect(total).toBe(30);
    expect(rawQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = (rawQuery as any).mock.calls[0];

    expect(sql).toMatch(/ON CONFLICT \(store_id, data\) DO UPDATE SET/);
    expect(sql).toContain("EXCLUDED.");
    expect(sql).not.toMatch(/ON DUPLICATE KEY/i);

    // 5 params por linha (orcamento_id, store_id, data, meta_receita, peso_dia) * 30 dias
    expect(params.length).toBe(30 * 5);

    // Datas cobrem 2026-06-01 .. 2026-06-30
    const datas = params.filter((p: unknown) => typeof p === "string" && /^2026-06-\d{2}$/.test(p));
    expect(datas).toHaveLength(30);
    expect(datas).toContain("2026-06-01");
    expect(datas).toContain("2026-06-30");
    expect(datas).not.toContain("2026-06-31");

    // Cada meta_receita = 300000 / 30 = 10000; soma bate com receitaMensal
    const metas = params.filter((p: unknown) => p === 10000);
    expect(metas).toHaveLength(30);
    const somaMetas = metas.reduce((acc: number, v: number) => acc + v, 0);
    expect(somaMetas).toBe(300000);

    // storeId e orcamentoId aparecem nos params
    expect(params).toContain(10); // storeId
    expect(params).toContain(1); // orcamentoId
  });

  it("fevereiro não-bissexto (28 dias): gera 28 linhas", async () => {
    (rawQuery as any).mockResolvedValue([]);

    const total = await gerarMetasDiarias(2, 20, "2026-02-01", 280000);

    expect(total).toBe(28);
    const [, params] = (rawQuery as any).mock.calls[0];
    expect(params.length).toBe(28 * 5);
    const datas = params.filter((p: unknown) => typeof p === "string" && /^2026-02-\d{2}$/.test(p));
    expect(datas).toHaveLength(28);
    expect(datas).not.toContain("2026-02-29");
  });
});

describe("aprovarOrcamento → gera metas diárias", () => {
  it("receita_bruta presente → aprova E gera metas diárias (2 chamadas de rawQuery)", async () => {
    (rawQuery as any)
      .mockResolvedValueOnce([
        { id: 1, status: "aprovado", receita_bruta: "300000.00", periodo_inicio: "2026-06-01", store_id: 10 },
      ])
      .mockResolvedValueOnce([]);

    const result = await aprovarOrcamento(1, 99);

    expect(result).toEqual({ id: 1, status: "aprovado" });
    expect(rawQuery).toHaveBeenCalledTimes(2);

    const [updateSql] = (rawQuery as any).mock.calls[0];
    expect(updateSql).toMatch(/UPDATE orcamentos SET status = 'aprovado'/);

    const [metasSql, metasParams] = (rawQuery as any).mock.calls[1];
    expect(metasSql).toMatch(/ON CONFLICT \(store_id, data\) DO UPDATE SET/);
    expect(metasParams.length).toBe(30 * 5); // junho = 30 dias
  });

  it("receita_bruta null → aprova mas NÃO gera metas (não quebra, só 1 chamada de rawQuery)", async () => {
    (rawQuery as any).mockResolvedValueOnce([
      { id: 2, status: "aprovado", receita_bruta: null, periodo_inicio: "2026-06-01", store_id: 11 },
    ]);

    const result = await aprovarOrcamento(2, 99);

    expect(result).toEqual({ id: 2, status: "aprovado" });
    expect(rawQuery).toHaveBeenCalledTimes(1);
  });

  it("orçamento não encontrado → lança erro, não tenta gerar metas", async () => {
    (rawQuery as any).mockResolvedValueOnce([]);

    await expect(aprovarOrcamento(999, 1)).rejects.toThrow(/não encontrado/);
    expect(rawQuery).toHaveBeenCalledTimes(1);
  });
});

describe("getMetasDiarias", () => {
  it("loja sem metas geradas → [] (não quebra)", async () => {
    (rawQuery as any).mockResolvedValue([]);

    const result = await getMetasDiarias(10, "2026-06");

    expect(result).toEqual([]);
  });

  it("com dados → mapeia linhas (camelCase, números convertidos)", async () => {
    (rawQuery as any).mockResolvedValue([
      {
        id: 1,
        orcamento_id: 5,
        store_id: 10,
        data: "2026-06-01",
        meta_receita: "10000.00",
        meta_atendimentos: null,
        peso_dia: "1.0000",
      },
    ]);

    const result = await getMetasDiarias(10, "2026-06");

    expect(result).toEqual([
      {
        id: 1,
        orcamentoId: 5,
        storeId: 10,
        data: "2026-06-01",
        metaReceita: 10000,
        metaAtendimentos: null,
        pesoDia: 1,
      },
    ]);

    const [sql, params] = (rawQuery as any).mock.calls[0];
    expect(sql).toMatch(/WHERE store_id = \? AND data LIKE \? \|\| '%'/);
    expect(params).toEqual([10, "2026-06"]);
  });
});
