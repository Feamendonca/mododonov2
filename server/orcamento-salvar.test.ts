/**
 * orcamento-salvar.test.ts
 * Task 4 do módulo Orçamento (Fase B): fluxo propor→confirmar→salvar.
 *
 * Cobre:
 *  1. `upsertOrcamentoRascunho` grava SOMENTE as chaves presentes em `campos`
 *     (mapeadas camelCase→snake_case), nunca preenche o que não veio.
 *  2. Autorização: `salvarRascunho`/`proporDaDre` → FORBIDDEN para não-admin
 *     sem vínculo com a loja; passa para admin e para vinculado.
 *  3. `proporDaDre` NÃO grava nada (nenhuma função de escrita é chamada) e
 *     devolve `{ rascunho, dre }`.
 *
 * Mocka `./db` (rawQuery/getStoresByUserId/getDb), `./storage` e
 * `./orcamento-proposta` — sem banco real, sem storage real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(),
  rawQuery: vi.fn(),
  getStoresByUserId: vi.fn(),
}));

vi.mock("./storage", () => ({
  storageDownload: vi.fn(),
}));

vi.mock("./orcamento-proposta", () => ({
  extrairGruposPorMes: vi.fn(),
  proporOrcamento: vi.fn(),
  calcularDre: vi.fn(),
}));

import { rawQuery, getStoresByUserId } from "./db";
import { storageDownload } from "./storage";
import { extrairGruposPorMes, proporOrcamento, calcularDre } from "./orcamento-proposta";
import { upsertOrcamentoRascunho } from "./db-orcamento-v2";
import { orcamentoRouter } from "./routers/orcamento";

// ─── Fixtures de contexto tRPC ──────────────────────────────────────────────

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
});

// ─── upsertOrcamentoRascunho (gravação pura, direto no módulo) ─────────────

describe("upsertOrcamentoRascunho", () => {
  it("grava SOMENTE as chaves presentes em campos (mapeadas p/ snake_case)", async () => {
    (rawQuery as any).mockResolvedValue([{ id: 42 }]);

    const result = await upsertOrcamentoRascunho({
      storeId: 5,
      periodoInicio: "2026-11-01",
      campos: { receitaBruta: 700000, cmvPct: 0.31 },
    });

    expect(result).toEqual({ id: 42 });
    expect(rawQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = (rawQuery as any).mock.calls[0];

    // ON CONFLICT correto (store_id, periodo_inicio) — não ON DUPLICATE KEY.
    expect(sql).toMatch(/ON CONFLICT \(store_id, periodo_inicio\) DO UPDATE SET/);
    expect(sql).not.toMatch(/ON DUPLICATE KEY/i);

    // Status sempre 'rascunho'.
    expect(sql).toContain("'rascunho'");

    // Só as colunas enviadas aparecem — mapeadas corretamente.
    expect(sql).toContain("receita_bruta");
    expect(sql).toContain("cmv_pct");
    // Nenhuma outra coluna de campo (ex.: aluguel, folha) deve aparecer.
    expect(sql).not.toContain("aluguel");
    expect(sql).not.toContain("folha");

    // Os valores passados batem com os informados (nada de 0 inventado).
    expect(params).toContain(700000);
    expect(params).toContain(0.31);
    expect(params).toContain(5); // storeId
    expect(params).toContain("2026-11-01"); // periodoInicio
  });

  it("chave ausente nunca vira 0 — só as chaves de `campos` entram no SQL", async () => {
    (rawQuery as any).mockResolvedValue([{ id: 7 }]);

    await upsertOrcamentoRascunho({
      storeId: 1,
      periodoInicio: "2026-01-01",
      campos: { proLabore: 5000 },
    });

    const [sql] = (rawQuery as any).mock.calls[0];
    expect(sql).toContain("pro_labore");
    expect(sql).not.toContain("receita_bruta");
    expect(sql).not.toContain("cmv_pct");
  });
});

// ─── salvarRascunho (tRPC) ───────────────────────────────────────────────────

describe("orcamento.salvarRascunho", () => {
  it("não-admin sem vínculo com a loja → FORBIDDEN, e NÃO grava", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteSemLoja);
    await expect(
      caller.salvarRascunho({ storeId: 5, periodoInicio: "2026-11-01", campos: { receitaBruta: 700000 } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rawQuery).not.toHaveBeenCalled();
  });

  it("não-admin vinculado à loja → passa e grava via upsertOrcamentoRascunho", async () => {
    (rawQuery as any).mockResolvedValue([{ id: 99 }]);
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    const result = await caller.salvarRascunho({
      storeId: 5,
      periodoInicio: "2026-11-01",
      campos: { receitaBruta: 700000, cmvPct: 0.31 },
    });

    expect(result).toEqual({ id: 99 });
    expect(rawQuery).toHaveBeenCalledTimes(1);
  });

  it("admin passa para qualquer loja", async () => {
    (rawQuery as any).mockResolvedValue([{ id: 100 }]);
    const caller = orcamentoRouter.createCaller(ctxAdmin);

    const result = await caller.salvarRascunho({
      storeId: 999,
      periodoInicio: "2026-11-01",
      campos: { receitaBruta: 700000 },
    });

    expect(result).toEqual({ id: 100 });
    expect(getStoresByUserId).not.toHaveBeenCalled();
  });
});

// ─── proporDaDre (tRPC) — NÃO grava ─────────────────────────────────────────

describe("orcamento.proporDaDre", () => {
  const rascunhoFake = { receitaBruta: 700000, cmvPct: 0.31, emAtencao: false } as any;
  const dreFake = { receitaLiquida: 700000, cmvRs: 217000, ebitda: 100000, ebitdaPct: 0.14, pontoEquilibrio: 500000, metaDiaria: 23333, parcial: false };

  beforeEach(() => {
    (storageDownload as any).mockResolvedValue(Buffer.from("fake-xlsx"));
    (extrairGruposPorMes as any).mockReturnValue([{ anoMes: "2026-09", grupos: { "1": 700000 } }]);
    (proporOrcamento as any).mockReturnValue(rascunhoFake);
    (calcularDre as any).mockReturnValue(dreFake);
  });

  it("não-admin sem vínculo com a loja → FORBIDDEN, e NÃO baixa/propõe nada", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteSemLoja);
    await expect(
      caller.proporDaDre({ storeId: 5, storageKey: "k", fileName: "dre.xlsx" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("devolve { rascunho, dre } e NÃO chama nenhuma função de escrita", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    const result = await caller.proporDaDre({
      storeId: 5,
      storageKey: "uploads/dre.xlsx",
      fileName: "dre.xlsx",
      meses: 3,
    });

    expect(result).toEqual({ rascunho: rascunhoFake, dre: dreFake });
    expect(storageDownload).toHaveBeenCalledWith("uploads/dre.xlsx");
    expect(extrairGruposPorMes).toHaveBeenCalledWith(
      expect.any(Buffer),
      "dre.xlsx",
      undefined,
      3
    );
    expect(proporOrcamento).toHaveBeenCalled();
    expect(calcularDre).toHaveBeenCalled();

    // Nunca grava — nenhuma chamada de escrita no banco.
    expect(rawQuery).not.toHaveBeenCalled();
  });

  it("admin passa para qualquer loja", async () => {
    const caller = orcamentoRouter.createCaller(ctxAdmin);
    const result = await caller.proporDaDre({ storeId: 999, storageKey: "k", fileName: "dre.xlsx" });
    expect(result).toEqual({ rascunho: rascunhoFake, dre: dreFake });
    expect(getStoresByUserId).not.toHaveBeenCalled();
  });
});
