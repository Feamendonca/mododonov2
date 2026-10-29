/**
 * orcamento-linhas-endpoints.test.ts
 * Task L3 (reforma "orçamento linha a linha"): a procedure
 * `salvarLinhasOrcamento` liga a árvore (L1) + a tabela `orcamento_linhas`
 * (L2) — grava as linhas confirmadas/editadas pelo gerente E garante o
 * cabeçalho em `orcamentos` com `receitaBruta` calculada das FOLHAS (via
 * `calcularResumoLinhas`), pro `aprovarRascunho`/`gerarMetasDiarias`
 * continuarem funcionando.
 *
 * Mocka `./db` (rawQuery/getStoresByUserId) — sem banco real. `salvarLinhas`/
 * `upsertOrcamentoRascunho` (db-orcamento-v2.ts) e `calcularResumoLinhas`
 * (orcamento-resumo.ts) rodam de VERDADE (não mockados) — é o que prova a
 * integração ponta a ponta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  rawQuery: vi.fn(),
  getStoresByUserId: vi.fn(),
}));

import { rawQuery, getStoresByUserId } from "./db";
import { orcamentoRouter } from "./routers/orcamento";

function makeCtx(role: "admin" | "user", id: number): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: {
      id,
      openId: `open-${id}`,
      email: `user${id}@example.com`,
      name: `User ${id}`,
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as TrpcContext["user"],
  };
}

const ctxAdmin = makeCtx("admin", 1);
const ctxGerenteLoja5 = makeCtx("user", 2);
const ctxGerenteSemLoja = makeCtx("user", 3);

beforeEach(() => {
  vi.clearAllMocks();
  (getStoresByUserId as any).mockImplementation(async (userId: number) => {
    if (userId === 2) return [{ id: 5, name: "Loja 5" }];
    return [];
  });
  (rawQuery as any).mockResolvedValue([{ id: 77 }]);
});

// Linhas de exemplo: grupo "1 - Receita Bruta" com 2 filhos (Balcão+Delivery),
// grupo "2 - Ocupação" com 2 filhos (Aluguel+Energia; Energia SEM valor —
// `editavel` mas ainda não preenchida pelo gerente, valor=null). Os GRUPOS
// (nível 1, com filhos) carregam valor agregado só pra provar que NÃO entram
// duas vezes no cálculo de receitaBruta.
const linhasExemplo = [
  { codigo: "1", label: "Receita Bruta", nivel: 1, valor: 1_000_000, ordem: 1, editavel: false },
  { codigo: "1.1", label: "Vendas Balcão", nivel: 2, valor: 600_000, ordem: 2, editavel: true },
  { codigo: "1.2", label: "Vendas Delivery", nivel: 2, valor: 400_000, ordem: 3, editavel: true },
  { codigo: "2", label: "Ocupação", nivel: 1, valor: -50_000, ordem: 4, editavel: false },
  { codigo: "2.1", label: "Aluguel", nivel: 2, valor: -50_000, ordem: 5, editavel: true },
  { codigo: "2.2", label: "Energia", nivel: 2, valor: null, ordem: 6, editavel: true },
];

describe("orcamento.salvarLinhasOrcamento", () => {
  it("não-admin sem vínculo com a loja → FORBIDDEN, e NÃO grava nada", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteSemLoja);
    await expect(
      caller.salvarLinhasOrcamento({ storeId: 5, periodoInicio: "2026-11-01", linhas: linhasExemplo })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rawQuery).not.toHaveBeenCalled();
  });

  it("não-admin vinculado à loja → grava o cabeçalho (receitaBruta das FOLHAS) + as linhas", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    const result = await caller.salvarLinhasOrcamento({
      storeId: 5,
      periodoInicio: "2026-11-01",
      linhas: linhasExemplo,
    });

    expect(result).toEqual({ orcamentoId: 77 });
    expect(rawQuery).toHaveBeenCalledTimes(2);

    // 1ª chamada: upsertOrcamentoRascunho (cabeçalho) — receitaBruta = SÓ as
    // folhas de receita (600k+400k=1.000.000), NÃO o grupo "1" somado junto.
    const [sqlHeader, paramsHeader] = (rawQuery as any).mock.calls[0];
    expect(sqlHeader).toMatch(/ON CONFLICT \(store_id, periodo_inicio\) DO UPDATE SET/);
    expect(sqlHeader).toContain("receita_bruta");
    expect(paramsHeader).toContain(1_000_000);
    expect(paramsHeader).not.toContain(2_000_000); // nunca dobro (grupo+filhos)

    // 2ª chamada: salvarLinhas (orcamento_linhas) — grava TODAS as linhas
    // (inclui grupo nível-1 e folhas nível-2), incluindo valor=null sem chutar.
    const [sqlLinhas, paramsLinhas] = (rawQuery as any).mock.calls[1];
    expect(sqlLinhas).toMatch(/ON CONFLICT \(orcamento_id, codigo\) DO UPDATE SET/);
    expect(paramsLinhas).toContain(77); // orcamentoId usado em todas as linhas
    expect(paramsLinhas).toContain("2.2"); // Energia (valor null) foi incluída
    expect(paramsLinhas).toContain(null); // valor null preservado, não virou 0
  });

  it("admin grava para qualquer loja sem checar vínculo", async () => {
    const caller = orcamentoRouter.createCaller(ctxAdmin);

    const result = await caller.salvarLinhasOrcamento({
      storeId: 999,
      periodoInicio: "2026-11-01",
      linhas: linhasExemplo,
    });

    expect(result).toEqual({ orcamentoId: 77 });
    expect(getStoresByUserId).not.toHaveBeenCalled();
    expect(rawQuery).toHaveBeenCalledTimes(2);
  });

  it("linhas vazias → ainda grava o cabeçalho (receitaBruta=null), mas NÃO chama o INSERT de linhas", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    const result = await caller.salvarLinhasOrcamento({
      storeId: 5,
      periodoInicio: "2026-11-01",
      linhas: [],
    });

    expect(result).toEqual({ orcamentoId: 77 });
    // salvarLinhas([]) não chama rawQuery (ver orcamento-linhas.test.ts) —
    // só a 1ª chamada (cabeçalho) acontece.
    expect(rawQuery).toHaveBeenCalledTimes(1);
    const [sqlHeader, paramsHeader] = (rawQuery as any).mock.calls[0];
    expect(sqlHeader).toContain("receita_bruta");
    expect(paramsHeader).toContain(null);
  });
});
