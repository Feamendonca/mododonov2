/**
 * pessoas-auth.test.ts
 * Testes unitários para as travas de autorização do módulo de Pessoas.
 *
 * Cobre:
 *  1. assertPodeAcessarLoja — reutiliza o helper já testado em orcamento-auth.test.ts
 *  2. Simulação de cada categoria de procedure de pessoas:
 *     - Leitura de folha (getPayrollSummary) — dado sensível
 *     - Leitura de funcionários (getEmployees)
 *     - Escrita de funcionário (createEmployee / updateEmployee)
 *     - Leitura de escala (getScheduleForWeek)
 *     - Análise (getSuggestions, getTurnoverStats)
 *  3. Cenários: gerente loja X → loja Y = FORBIDDEN; gerente → própria loja = ok; admin = ok
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mock de getStoresByUserId ────────────────────────────────────────────────

vi.mock("./db", () => ({
  getStoresByUserId: vi.fn(),
}));

import { getStoresByUserId } from "./db";
import { assertPodeAcessarLoja } from "./auth-helpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ctxAdmin = { user: { id: 1, role: "admin" } };
const ctxGerenteLoja1 = { user: { id: 2, role: "user" } };
const ctxGerenteLoja2 = { user: { id: 3, role: "user" } };
const ctxSemLoja = { user: { id: 4, role: "user" } };

const LOJA_1 = { id: 1, name: "Loja 1" };
const LOJA_2 = { id: 2, name: "Loja 2" };

beforeEach(() => {
  vi.clearAllMocks();
  (getStoresByUserId as any).mockImplementation(async (userId: number) => {
    if (userId === 2) return [LOJA_1];
    if (userId === 3) return [LOJA_2];
    return [];
  });
});

// ─── Helper para simular a lógica de gate de uma procedure de pessoas ─────────

async function simulaProcedurePessoas(
  ctx: { user: { id: number; role: string } },
  storeId: number,
  handler: () => Promise<unknown>
) {
  await assertPodeAcessarLoja(ctx, storeId);
  return handler();
}

// ─── Testes de leitura de folha (dado sensível) ───────────────────────────────

describe("getPayrollSummary — proteção de dado sensível", () => {
  it("gerente da loja 1 lendo folha da loja 2 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja1, 2, async () => ({ payrollPercent: 22 }))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gerente da loja 1 lendo folha da própria loja → permitido", async () => {
    const result = await simulaProcedurePessoas(ctxGerenteLoja1, 1, async () => ({ payrollPercent: 18 }));
    expect(result).toEqual({ payrollPercent: 18 });
  });

  it("admin lendo folha de qualquer loja → permitido", async () => {
    const r1 = await simulaProcedurePessoas(ctxAdmin, 1, async () => ({ payrollPercent: 18 }));
    const r2 = await simulaProcedurePessoas(ctxAdmin, 2, async () => ({ payrollPercent: 22 }));
    expect(r1).toEqual({ payrollPercent: 18 });
    expect(r2).toEqual({ payrollPercent: 22 });
    // Admin não consulta user_stores
    expect(getStoresByUserId).not.toHaveBeenCalled();
  });

  it("usuário sem loja vinculada → FORBIDDEN para qualquer loja", async () => {
    await expect(
      simulaProcedurePessoas(ctxSemLoja, 1, async () => ({}))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Testes de leitura de funcionários ───────────────────────────────────────

describe("getEmployees — leitura de quadro", () => {
  it("gerente loja 2 lendo funcionários da loja 1 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja2, 1, async () => [])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gerente loja 2 lendo funcionários da própria loja → permitido", async () => {
    const result = await simulaProcedurePessoas(ctxGerenteLoja2, 2, async () => [{ id: 1, name: "João" }]);
    expect(result).toHaveLength(1);
  });

  it("admin lendo funcionários de qualquer loja → permitido", async () => {
    await expect(simulaProcedurePessoas(ctxAdmin, 1, async () => [])).resolves.toEqual([]);
    await expect(simulaProcedurePessoas(ctxAdmin, 2, async () => [])).resolves.toEqual([]);
  });
});

// ─── Testes de escrita de funcionário ────────────────────────────────────────

describe("createEmployee / updateEmployee — escrita de dado sensível", () => {
  it("gerente loja 1 criando funcionário na loja 2 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja1, 2, async () => ({ id: 99 }))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gerente loja 1 criando funcionário na própria loja → permitido", async () => {
    const result = await simulaProcedurePessoas(ctxGerenteLoja1, 1, async () => ({ id: 10 }));
    expect(result).toEqual({ id: 10 });
  });

  it("gerente loja 1 editando salário na loja 2 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja1, 2, async () => ({ success: true }))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin criando funcionário em qualquer loja → permitido", async () => {
    await expect(simulaProcedurePessoas(ctxAdmin, 1, async () => ({ id: 1 }))).resolves.toEqual({ id: 1 });
    await expect(simulaProcedurePessoas(ctxAdmin, 2, async () => ({ id: 2 }))).resolves.toEqual({ id: 2 });
  });
});

// ─── Testes de escala ─────────────────────────────────────────────────────────

describe("getScheduleForWeek / setScheduleForBlock — escala", () => {
  it("gerente loja 1 lendo escala da loja 2 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja1, 2, async () => [])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gerente loja 1 gravando escala na loja 2 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja1, 2, async () => ({ success: true }))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gerente loja 1 gravando escala na própria loja → permitido", async () => {
    const result = await simulaProcedurePessoas(ctxGerenteLoja1, 1, async () => ({ success: true }));
    expect(result).toEqual({ success: true });
  });
});

// ─── Testes de análise/insights ───────────────────────────────────────────────

describe("getSuggestions / getTurnoverStats — análise", () => {
  it("gerente loja 2 acessando sugestões da loja 1 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja2, 1, async () => [])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gerente loja 2 acessando turnover da própria loja → permitido", async () => {
    const result = await simulaProcedurePessoas(ctxGerenteLoja2, 2, async () => ({ turnoverRate: 5 }));
    expect(result).toEqual({ turnoverRate: 5 });
  });

  it("admin acessando análise de qualquer loja → permitido", async () => {
    await expect(simulaProcedurePessoas(ctxAdmin, 1, async () => [])).resolves.toEqual([]);
    await expect(simulaProcedurePessoas(ctxAdmin, 999, async () => [])).resolves.toEqual([]);
    expect(getStoresByUserId).not.toHaveBeenCalled();
  });
});

// ─── Testes de config de pessoas ─────────────────────────────────────────────

describe("getConfig / saveConfig — configuração da loja", () => {
  it("gerente loja 1 lendo config da loja 2 → FORBIDDEN", async () => {
    await expect(
      simulaProcedurePessoas(ctxGerenteLoja1, 2, async () => ({}))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gerente loja 1 salvando config da própria loja → permitido", async () => {
    const result = await simulaProcedurePessoas(ctxGerenteLoja1, 1, async () => ({ success: true }));
    expect(result).toEqual({ success: true });
  });
});
