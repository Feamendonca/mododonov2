/**
 * orcamento-plano-ia-endpoint.test.ts
 * Task P2: a procedure `gerarPlanoIA` do router liga o motor da IA (P1,
 * `orcamento-plano-ia.ts`) ao app. O endpoint SÓ repassa — não grava nada
 * (quem decide/aplica é o gestor, editando "Seu valor" na tela, que já salva
 * via `salvarLinhasOrcamento`).
 *
 * Mocka `../orcamento-plano-ia` (o motor em si já tem testes próprios em
 * orcamento-plano-ia.test.ts) e `./db` (getStoresByUserId, sem banco real).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { PlanoIA } from "./orcamento-plano-ia";

const gerarPlanoIAMock = vi.fn();

vi.mock("./orcamento-plano-ia", () => ({
  gerarPlanoIA: (...args: unknown[]) => gerarPlanoIAMock(...args),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
  rawQuery: vi.fn(),
  getStoresByUserId: vi.fn(),
  getStoreById: vi.fn(),
}));

import { getStoresByUserId } from "./db";
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

const linhasExemplo = [
  { codigo: "3.1", label: "CMV", nivel: 2, natureza: "custo", derivada: false, temFilhos: false, porMes: [-200000, -205000, -195000] },
];
const anoMesesExemplo = ["2026-06", "2026-07", "2026-08"];
const metaExemplo = { tipo: "ebitda_rs" as const, valor: 100000 };

const planoIAFixture: PlanoIA = {
  linhas: [{ codigo: "3.1", propostoIA: -198000, porque: "dentro da faixa histórica", confianca: "alta" }],
  planoBatalha: [
    { titulo: "Renegociar fornecedor de carnes", descricao: "...", linhasAfetadas: ["3.1"], impactoEstimadoRs: 2000, prioridade: "media" },
  ],
  meta: { alvoRs: 100000, alcancadoRs: 98000, atingiuMeta: false, motivo: "gap pequeno no CMV" },
};

beforeEach(() => {
  vi.clearAllMocks();
  (getStoresByUserId as any).mockImplementation(async (userId: number) => {
    if (userId === 2) return [{ id: 5, name: "Loja 5" }];
    return [];
  });
  gerarPlanoIAMock.mockResolvedValue(planoIAFixture);
});

describe("orcamento.gerarPlanoIA", () => {
  it("não-admin sem vínculo com a loja → FORBIDDEN, e NÃO chama o motor da IA", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteSemLoja);
    await expect(
      caller.gerarPlanoIA({ storeId: 5, linhas: linhasExemplo, anoMeses: anoMesesExemplo, meta: metaExemplo })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(gerarPlanoIAMock).not.toHaveBeenCalled();
  });

  it("não-admin vinculado à loja → chama o motor com {linhas, anoMeses, meta} e devolve o PlanoIA", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    const result = await caller.gerarPlanoIA({
      storeId: 5,
      linhas: linhasExemplo,
      anoMeses: anoMesesExemplo,
      meta: metaExemplo,
    });

    expect(result).toEqual(planoIAFixture);
    expect(gerarPlanoIAMock).toHaveBeenCalledTimes(1);
    expect(gerarPlanoIAMock).toHaveBeenCalledWith({
      linhas: linhasExemplo,
      anoMeses: anoMesesExemplo,
      meta: metaExemplo,
    });
  });

  it("admin chama para qualquer loja sem checar vínculo", async () => {
    const caller = orcamentoRouter.createCaller(ctxAdmin);

    const result = await caller.gerarPlanoIA({
      storeId: 999,
      linhas: linhasExemplo,
      anoMeses: anoMesesExemplo,
      meta: metaExemplo,
    });

    expect(result).toEqual(planoIAFixture);
    expect(getStoresByUserId).not.toHaveBeenCalled();
    expect(gerarPlanoIAMock).toHaveBeenCalledTimes(1);
  });

  it("NÃO grava nada — não chama nenhuma função de escrita (rawQuery/getDb)", async () => {
    const { rawQuery, getDb } = await import("./db");
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    await caller.gerarPlanoIA({
      storeId: 5,
      linhas: linhasExemplo,
      anoMeses: anoMesesExemplo,
      meta: metaExemplo,
    });

    expect(rawQuery).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("repassa o fallback silencioso do motor (PlanoIA vazio) sem alterar nada", async () => {
    const fallbackVazio: PlanoIA = {
      linhas: [],
      planoBatalha: [],
      meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "IA indisponível" },
    };
    gerarPlanoIAMock.mockResolvedValue(fallbackVazio);
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    const result = await caller.gerarPlanoIA({
      storeId: 5,
      linhas: linhasExemplo,
      anoMeses: anoMesesExemplo,
      meta: metaExemplo,
    });

    expect(result).toEqual(fallbackVazio);
  });
});
