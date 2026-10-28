/**
 * orcamento-aprovar.test.ts
 * Task 5 do módulo Orçamento (Fase B): aprovação do rascunho.
 *
 * Regra dura: só `admin` ou `supervisor` (regional) aprova — `gerente` e
 * `user` → FORBIDDEN. `aprovarRascunho` NÃO recalcula valores, só muda
 * status/aprovador (a função que grava, `aprovarOrcamento`, é mockada aqui).
 *
 * Mocka `./db-orcamento-v2` (upsertOrcamentoRascunho + aprovarOrcamento) —
 * sem banco real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./db-orcamento-v2", () => ({
  upsertOrcamentoRascunho: vi.fn(),
  aprovarOrcamento: vi.fn(),
}));

import { aprovarOrcamento } from "./db-orcamento-v2";
import { orcamentoRouter } from "./routers/orcamento";

// ─── Fixtures de contexto tRPC ──────────────────────────────────────────────

function makeCtx(role: "admin" | "supervisor" | "gerente" | "user", id: number): TrpcContext {
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
const ctxSupervisor = makeCtx("supervisor", 2);
const ctxGerente = makeCtx("gerente", 3);
const ctxUser = makeCtx("user", 4);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("orcamento.aprovarRascunho", () => {
  it("admin → chama aprovarOrcamento(orcamentoId, adminId) e retorna status 'aprovado'", async () => {
    (aprovarOrcamento as any).mockResolvedValue({ id: 10, status: "aprovado" });
    const caller = orcamentoRouter.createCaller(ctxAdmin);

    const result = await caller.aprovarRascunho({ orcamentoId: 10 });

    expect(result).toEqual({ id: 10, status: "aprovado" });
    expect(aprovarOrcamento).toHaveBeenCalledWith(10, 1);
  });

  it("supervisor (regional) → permitido, idem admin", async () => {
    (aprovarOrcamento as any).mockResolvedValue({ id: 11, status: "aprovado" });
    const caller = orcamentoRouter.createCaller(ctxSupervisor);

    const result = await caller.aprovarRascunho({ orcamentoId: 11 });

    expect(result).toEqual({ id: 11, status: "aprovado" });
    expect(aprovarOrcamento).toHaveBeenCalledWith(11, 2);
  });

  it("gerente → FORBIDDEN, NÃO chama aprovarOrcamento", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerente);

    await expect(caller.aprovarRascunho({ orcamentoId: 12 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(aprovarOrcamento).not.toHaveBeenCalled();
  });

  it("user → FORBIDDEN, NÃO chama aprovarOrcamento", async () => {
    const caller = orcamentoRouter.createCaller(ctxUser);

    await expect(caller.aprovarRascunho({ orcamentoId: 13 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(aprovarOrcamento).not.toHaveBeenCalled();
  });
});
