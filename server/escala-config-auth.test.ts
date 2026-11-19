/**
 * escala-config-auth.test.ts
 * Task 4 do módulo de Escala: camada de dados + router.
 *
 * Cobre (mesmo padrão de pessoas-auth.test.ts / orcamento-auth.test.ts):
 *  1. Teste GENÉRICO: toda procedure de `escalaRouter` chama
 *     `assertPodeAcessarLoja` antes de qualquer coisa — gerente sem vínculo
 *     com a loja → FORBIDDEN, e nenhuma função de `db-escala-config` é
 *     chamada. Iterar sobre o router (não listar procedure por procedure à
 *     mão) é o que torna este teste "sem exceção": uma procedure nova que
 *     esqueça o gate quebra este teste sem precisar lembrar de atualizá-lo.
 *  2. Validação de entrada: `salvarFuncao` rejeita `minPorBloco < 1` e
 *     `driver` fora de `tickets|pratos|cobertos`.
 *
 * Mocka `./db` (getStoresByUserId, getStoreById) e `./db-escala-config`
 * (todas as funções de dados) — sem banco real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getStoresByUserId: vi.fn(),
  getStoreById: vi.fn(),
}));

vi.mock("./db-escala-config", () => ({
  getFuncoes: vi.fn(),
  createFuncao: vi.fn(),
  updateFuncao: vi.fn(),
  desativarFuncao: vi.fn(),
  getRegras: vi.fn(),
  upsertRegraLoja: vi.fn(),
  getCatalogoVigente: vi.fn(),
  sugerirProdutividade: vi.fn(),
}));

import { getStoresByUserId, getStoreById } from "./db";
import * as dbEscalaConfig from "./db-escala-config";
import { escalaRouter } from "./routers/escala";

// ─── Fixtures de contexto tRPC ────────────────────────────────────────────────

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
const ctxGerenteLoja1 = makeCtx("user", 2);
const ctxSemLoja = makeCtx("user", 3);

const LOJA_1 = { id: 1, name: "Loja 1" };

beforeEach(() => {
  vi.clearAllMocks();
  (getStoresByUserId as any).mockImplementation(async (userId: number) => {
    if (userId === 2) return [LOJA_1];
    return [];
  });
  (getStoreById as any).mockResolvedValue({ id: 1, uf: "SP" });
  (dbEscalaConfig.getFuncoes as any).mockResolvedValue([]);
  (dbEscalaConfig.createFuncao as any).mockResolvedValue(1);
  (dbEscalaConfig.updateFuncao as any).mockResolvedValue(undefined);
  (dbEscalaConfig.desativarFuncao as any).mockResolvedValue(undefined);
  (dbEscalaConfig.getRegras as any).mockResolvedValue([]);
  (dbEscalaConfig.upsertRegraLoja as any).mockResolvedValue(undefined);
  (dbEscalaConfig.getCatalogoVigente as any).mockResolvedValue([]);
  (dbEscalaConfig.sugerirProdutividade as any).mockResolvedValue({ valor: null, amostras: 0 });
});

// ─── Entradas mínimas válidas por procedure (pra exercitar o handler até o
// gate, sem esbarrar em erro de validação zod antes de chegar lá) ────────────

const ENTRADA_VALIDA: Record<string, (storeId: number) => Record<string, unknown>> = {
  getConfig: (storeId) => ({ storeId }),
  salvarFuncao: (storeId) => ({
    storeId,
    nome: "Atendente",
    driver: "tickets",
    minPorBloco: 1,
  }),
  desativarFuncao: (storeId) => ({ storeId, id: 10 }),
  getRegrasVigentes: (storeId) => ({ storeId, data: "2026-11-19" }),
  salvarRegraLoja: (storeId) => ({
    storeId,
    chave: "jornada_max_semanal",
    valor: 44,
    tipo: "DURA",
    fonte: "teste",
  }),
  getCatalogo: (storeId) => ({ storeId, data: "2026-11-19" }),
  sugerirProdutividade: (storeId) => ({ storeId, funcaoId: 1 }),
};

// ─── Teste genérico: TODA procedure chama assertPodeAcessarLoja ──────────────

describe("escalaRouter — toda procedure chama assertPodeAcessarLoja (sem exceção)", () => {
  const nomesDeProcedures = Object.keys(escalaRouter._def.procedures ?? escalaRouter._def.record ?? {});

  it("router expõe exatamente as procedures esperadas pelo brief da Task 4", () => {
    expect(nomesDeProcedures.sort()).toEqual(
      [
        "getConfig",
        "salvarFuncao",
        "desativarFuncao",
        "getRegrasVigentes",
        "salvarRegraLoja",
        "getCatalogo",
        "sugerirProdutividade",
      ].sort()
    );
  });

  it.each(Object.keys(ENTRADA_VALIDA))(
    "%s — gerente sem vínculo com a loja → FORBIDDEN, nenhuma função de db-escala-config é chamada",
    async (nomeProcedure) => {
      const caller = escalaRouter.createCaller(ctxSemLoja);
      const input = ENTRADA_VALIDA[nomeProcedure](1);

      await expect((caller as any)[nomeProcedure](input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      for (const mockFn of Object.values(dbEscalaConfig)) {
        expect(mockFn).not.toHaveBeenCalled();
      }
    }
  );

  it.each(Object.keys(ENTRADA_VALIDA))(
    "%s — gerente da própria loja (loja 1) → não é bloqueado pelo gate",
    async (nomeProcedure) => {
      const caller = escalaRouter.createCaller(ctxGerenteLoja1);
      const input = ENTRADA_VALIDA[nomeProcedure](1);

      await expect((caller as any)[nomeProcedure](input)).resolves.toBeDefined();
      // getStoresByUserId foi consultado (prova que o gate rodou de verdade,
      // não que passou "por acaso" por ausência de checagem).
      expect(getStoresByUserId).toHaveBeenCalledWith(2);
    }
  );

  it.each(Object.keys(ENTRADA_VALIDA))(
    "%s — gerente da loja 1 pedindo a loja 2 → FORBIDDEN",
    async (nomeProcedure) => {
      const caller = escalaRouter.createCaller(ctxGerenteLoja1);
      const input = ENTRADA_VALIDA[nomeProcedure](2);

      await expect((caller as any)[nomeProcedure](input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  );

  it.each(Object.keys(ENTRADA_VALIDA))(
    "%s — admin acessa qualquer loja sem consultar user_stores",
    async (nomeProcedure) => {
      const caller = escalaRouter.createCaller(ctxAdmin);
      const input = ENTRADA_VALIDA[nomeProcedure](999);

      await (caller as any)[nomeProcedure](input);
      expect(getStoresByUserId).not.toHaveBeenCalled();
    }
  );
});

// ─── Validação de entrada: salvarFuncao ──────────────────────────────────────

describe("escala.salvarFuncao — validação de entrada", () => {
  it("rejeita minPorBloco = 0 (precisa ser >= 1)", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, nome: "Atendente", driver: "tickets", minPorBloco: 0 })
    ).rejects.toThrow();
    expect(dbEscalaConfig.createFuncao).not.toHaveBeenCalled();
  });

  it("rejeita minPorBloco negativo", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, nome: "Atendente", driver: "tickets", minPorBloco: -1 })
    ).rejects.toThrow();
  });

  it("aceita minPorBloco = 1", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, nome: "Atendente", driver: "tickets", minPorBloco: 1 })
    ).resolves.toBeDefined();
    expect(dbEscalaConfig.createFuncao).toHaveBeenCalled();
  });

  it("rejeita driver fora de tickets|pratos|cobertos", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({
        storeId: 1,
        nome: "Atendente",
        driver: "clientes" as any,
        minPorBloco: 1,
      })
    ).rejects.toThrow();
    expect(dbEscalaConfig.createFuncao).not.toHaveBeenCalled();
  });

  it.each(["tickets", "pratos", "cobertos"])("aceita driver = %s", async (driver) => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, nome: "Atendente", driver: driver as any, minPorBloco: 1 })
    ).resolves.toBeDefined();
  });
});

// ─── R13: aviso explícito quando a loja não tem UF cadastrada ────────────────

describe("escala.getRegrasVigentes — R13: aviso de UF ausente", () => {
  it("loja SEM uf cadastrada → avisoUfAusente true + aviso explícito, só busca regras de rede", async () => {
    (getStoreById as any).mockResolvedValue({ id: 1, uf: null });
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    const result = await caller.getRegrasVigentes({ storeId: 1, data: "2026-11-19" });

    expect(result.avisoUfAusente).toBe(true);
    expect(result.aviso).toBeTruthy();
    expect(dbEscalaConfig.getRegras).toHaveBeenCalledWith(1, null);
  });

  it("loja COM uf cadastrada → avisoUfAusente false, aviso null", async () => {
    (getStoreById as any).mockResolvedValue({ id: 1, uf: "SP" });
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    const result = await caller.getRegrasVigentes({ storeId: 1, data: "2026-11-19" });

    expect(result.avisoUfAusente).toBe(false);
    expect(result.aviso).toBeNull();
    expect(dbEscalaConfig.getRegras).toHaveBeenCalledWith(1, "SP");
  });
});
