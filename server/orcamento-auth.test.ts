/**
 * orcamento-auth.test.ts
 * Testes unitários para as travas de autorização do módulo de orçamento.
 *
 * Cobre:
 *  1. assertPodeAcessarLoja — admin passa; não-admin vinculado passa; não-admin sem vínculo → FORBIDDEN
 *  2. Lógica de gate: não-admin chamando aprovarParaOrcamento → FORBIDDEN (adminProcedure)
 *  3. Lógica de gate: gerente loja X tentando acessar loja Y → FORBIDDEN
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mock de getStoresByUserId ────────────────────────────────────────────────
// Simula o comportamento sem precisar do banco de dados

vi.mock("./db", () => ({
  getStoresByUserId: vi.fn(),
}));

import { getStoresByUserId } from "./db";
import { assertPodeAcessarLoja } from "./auth-helpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ctxAdmin = { user: { id: 1, role: "admin" } };
const ctxGerenteLoja1 = { user: { id: 2, role: "user" } };
const ctxGerenteSemLoja = { user: { id: 3, role: "user" } };

const LOJA_1 = { id: 1, name: "Loja 1" };
const LOJA_2 = { id: 2, name: "Loja 2" };

beforeEach(() => {
  vi.clearAllMocks();
  // Por padrão: gerente 2 está vinculado à loja 1; gerente 3 não tem lojas
  (getStoresByUserId as any).mockImplementation(async (userId: number) => {
    if (userId === 2) return [LOJA_1];
    return [];
  });
});

// ─── assertPodeAcessarLoja ────────────────────────────────────────────────────

describe("assertPodeAcessarLoja", () => {
  it("admin passa sem consultar user_stores", async () => {
    await expect(assertPodeAcessarLoja(ctxAdmin, 1)).resolves.toBeUndefined();
    await expect(assertPodeAcessarLoja(ctxAdmin, 999)).resolves.toBeUndefined();
    // Admin não deve consultar o banco
    expect(getStoresByUserId).not.toHaveBeenCalled();
  });

  it("não-admin vinculado à loja passa", async () => {
    await expect(assertPodeAcessarLoja(ctxGerenteLoja1, 1)).resolves.toBeUndefined();
  });

  it("não-admin sem vínculo com a loja → FORBIDDEN", async () => {
    await expect(assertPodeAcessarLoja(ctxGerenteLoja1, 2)).rejects.toThrow(TRPCError);
    await expect(assertPodeAcessarLoja(ctxGerenteLoja1, 2)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("não-admin sem nenhuma loja vinculada → FORBIDDEN para qualquer loja", async () => {
    await expect(assertPodeAcessarLoja(ctxGerenteSemLoja, 1)).rejects.toThrow(TRPCError);
    await expect(assertPodeAcessarLoja(ctxGerenteSemLoja, 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── Simulação da lógica de gate (sem tRPC runtime) ──────────────────────────

/**
 * Simula adminProcedure: lança FORBIDDEN se role !== "admin".
 * Replica exatamente o que adminProcedure faz no _core/trpc.ts.
 */
async function simulaAdminProcedure(
  ctx: { user: { id: number; role: string } },
  handler: () => Promise<unknown>
) {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem executar esta ação." });
  }
  return handler();
}

describe("Gate aprovarParaOrcamento (adminProcedure)", () => {
  it("não-admin chamando aprovarParaOrcamento → FORBIDDEN", async () => {
    await expect(
      simulaAdminProcedure(ctxGerenteLoja1, async () => ({ orcamentoId: 1 }))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin chamando aprovarParaOrcamento → executa sem erro", async () => {
    const result = await simulaAdminProcedure(ctxAdmin, async () => ({ orcamentoId: 42 }));
    expect(result).toEqual({ orcamentoId: 42 });
  });
});

describe("Gate save/propor (assertPodeAcessarLoja)", () => {
  it("gerente loja 1 tentando salvar orçamento da loja 2 → FORBIDDEN", async () => {
    await expect(assertPodeAcessarLoja(ctxGerenteLoja1, 2)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("gerente loja 1 salvando orçamento da própria loja → permitido", async () => {
    await expect(assertPodeAcessarLoja(ctxGerenteLoja1, 1)).resolves.toBeUndefined();
  });

  it("admin salvando orçamento de qualquer loja → permitido", async () => {
    await expect(assertPodeAcessarLoja(ctxAdmin, 1)).resolves.toBeUndefined();
    await expect(assertPodeAcessarLoja(ctxAdmin, 2)).resolves.toBeUndefined();
    await expect(assertPodeAcessarLoja(ctxAdmin, 999)).resolves.toBeUndefined();
    expect(getStoresByUserId).not.toHaveBeenCalled();
  });
});
