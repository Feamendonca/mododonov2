/**
 * escala-config-auth.test.ts
 * Task 4 do módulo de Escala: camada de dados + router.
 *
 * Cobre (mesmo padrão de pessoas-auth.test.ts / orcamento-auth.test.ts):
 *  1. Teste GENÉRICO: toda procedure de `escalaRouter` chama
 *     `assertPodeAcessarLoja` antes de qualquer coisa — gerente sem vínculo
 *     com a loja → FORBIDDEN, e nenhuma função de `db-escala-config` é
 *     chamada. A lista de procedures a exercitar vem do ROUTER REAL
 *     (`escalaRouter._def.record`), não de uma lista escrita à mão — ver
 *     I3 do fix loop abaixo.
 *  2. Validação de entrada: `salvarFuncao` (minPorBloco, driver,
 *     produtividadeAlvo, maxPorBloco>=minPorBloco), `salvarRegraLoja`
 *     (valor não-nulo, whitelist contra sobrescrever trava legal de rede).
 *  3. R13: aviso explícito quando a loja não tem UF.
 *  4. I2: normalização de `workDate` (string ou `Date`) em `db-escala-config.ts`.
 *  5. Menor 9/10: NOT_FOUND quando `salvarFuncao`/`desativarFuncao` não
 *     afetam nenhuma linha.
 *
 * Mocka `./db` (getStoresByUserId, getStoreById) e `./db-escala-config`
 * (todas as funções de dados, mas reexporta a classe de erro REAL
 * `RegraLojaNaoPermitidaError` — ver comentário no `vi.mock` abaixo) — sem
 * banco real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getStoresByUserId: vi.fn(),
  getStoreById: vi.fn(),
}));

vi.mock("./db-escala-config", async () => {
  // `RegraLojaNaoPermitidaError` é reexportada DE VERDADE (não mockada):
  // é só uma classe de erro (sem I/O), e o router faz
  // `erro instanceof RegraLojaNaoPermitidaError` — se o mock desse
  // `undefined` pra ela, esse `instanceof` quebraria em runtime.
  const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
  return {
    getFuncoes: vi.fn(),
    createFuncao: vi.fn(),
    updateFuncao: vi.fn(),
    desativarFuncao: vi.fn(),
    getRegras: vi.fn(),
    upsertRegraLoja: vi.fn(),
    getCatalogoVigente: vi.fn(),
    sugerirProdutividade: vi.fn(),
    RegraLojaNaoPermitidaError: real.RegraLojaNaoPermitidaError,
  };
});

import { getStoresByUserId, getStoreById } from "./db";
import * as dbEscalaConfig from "./db-escala-config";
import { escalaRouter } from "./routers/escala";

// Só as funções mockadas (vi.fn()) — `RegraLojaNaoPermitidaError` (reexportada
// de verdade, ver vi.mock acima) não é uma mock function e quebraria
// `expect(...).not.toHaveBeenCalled()`.
const DB_MOCK_FNS = [
  dbEscalaConfig.getFuncoes,
  dbEscalaConfig.createFuncao,
  dbEscalaConfig.updateFuncao,
  dbEscalaConfig.desativarFuncao,
  dbEscalaConfig.getRegras,
  dbEscalaConfig.upsertRegraLoja,
  dbEscalaConfig.getCatalogoVigente,
  dbEscalaConfig.sugerirProdutividade,
];

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
  // updateFuncao/desativarFuncao agora devolvem boolean (linha afetada ou
  // não — Menor 9/10); default "feliz" é `true` (achou e afetou a linha).
  (dbEscalaConfig.updateFuncao as any).mockResolvedValue(true);
  (dbEscalaConfig.desativarFuncao as any).mockResolvedValue(true);
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
    // Chave inventada (NÃO está em REGRAS_LEGAIS_INICIAIS) de propósito:
    // esta entrada só precisa passar pelo gate de auth, não pelo whitelist
    // do I6 (que tem teste dedicado mais abaixo).
    chave: "preferencia_teste_generica",
    valor: 44,
    tipo: "MOLE",
    fonte: "teste",
  }),
  getCatalogo: (storeId) => ({ storeId, data: "2026-11-19" }),
  sugerirProdutividade: (storeId) => ({ storeId, funcaoId: 1 }),
};

// ─── Teste genérico: TODA procedure chama assertPodeAcessarLoja ──────────────

describe("escalaRouter — toda procedure chama assertPodeAcessarLoja (sem exceção)", () => {
  const nomesDeProcedures = Object.keys(escalaRouter._def.procedures ?? escalaRouter._def.record ?? {});

  it("ENTRADA_VALIDA cobre exatamente as procedures reais do router — nenhuma fica sem teste de gate", () => {
    // I3 do fix loop: a versão anterior comparava `nomesDeProcedures`
    // contra uma LISTA FIXA escrita à mão — o revisor provou por mutação
    // que adicionar uma `publicProcedure` nova (sem gate) ao router deixa
    // os 28 testes verdes, porque nada ali olha pro router de verdade.
    // Esta asserção compara ENTRADA_VALIDA direto contra as procedures que
    // o router REALMENTE expõe: uma procedure nova sem entrada aqui quebra
    // este teste imediatamente, em vez de passar por omissão.
    expect(Object.keys(ENTRADA_VALIDA).sort()).toEqual(nomesDeProcedures.sort());
  });

  it.each(nomesDeProcedures)(
    "%s — gerente sem vínculo com a loja → FORBIDDEN, nenhuma função de db-escala-config é chamada",
    async (nomeProcedure) => {
      const caller = escalaRouter.createCaller(ctxSemLoja);
      const input = ENTRADA_VALIDA[nomeProcedure](1);

      await expect((caller as any)[nomeProcedure](input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      for (const mockFn of DB_MOCK_FNS) {
        expect(mockFn).not.toHaveBeenCalled();
      }
    }
  );

  it.each(nomesDeProcedures)(
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

  it.each(nomesDeProcedures)(
    "%s — gerente da loja 1 pedindo a loja 2 → FORBIDDEN",
    async (nomeProcedure) => {
      const caller = escalaRouter.createCaller(ctxGerenteLoja1);
      const input = ENTRADA_VALIDA[nomeProcedure](2);

      await expect((caller as any)[nomeProcedure](input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  );

  it.each(nomesDeProcedures)(
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

// ─── I7: produtividadeAlvo > 0 e maxPorBloco >= minPorBloco ──────────────────

describe("escala.salvarFuncao — I7: produtividadeAlvo > 0 e maxPorBloco >= minPorBloco", () => {
  it("rejeita produtividadeAlvo = 0 (demanda ÷ 0 = Infinity no dimensionamento)", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({
        storeId: 1,
        nome: "Atendente",
        driver: "tickets",
        minPorBloco: 1,
        produtividadeAlvo: 0,
      })
    ).rejects.toThrow();
  });

  it("rejeita produtividadeAlvo negativo", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({
        storeId: 1,
        nome: "Atendente",
        driver: "tickets",
        minPorBloco: 1,
        produtividadeAlvo: -5,
      })
    ).rejects.toThrow();
  });

  it("aceita produtividadeAlvo > 0", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({
        storeId: 1,
        nome: "Atendente",
        driver: "tickets",
        minPorBloco: 1,
        produtividadeAlvo: 12,
      })
    ).resolves.toBeDefined();
  });

  it("aceita produtividadeAlvo null (ainda sem sugestão)", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({
        storeId: 1,
        nome: "Atendente",
        driver: "tickets",
        minPorBloco: 1,
        produtividadeAlvo: null,
      })
    ).resolves.toBeDefined();
  });

  it("rejeita maxPorBloco < minPorBloco (restrição insatisfazível)", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({
        storeId: 1,
        nome: "Atendente",
        driver: "tickets",
        minPorBloco: 5,
        maxPorBloco: 2,
      })
    ).rejects.toThrow();
  });

  it("aceita maxPorBloco >= minPorBloco", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({
        storeId: 1,
        nome: "Atendente",
        driver: "tickets",
        minPorBloco: 2,
        maxPorBloco: 5,
      })
    ).resolves.toBeDefined();
  });

  it("aceita maxPorBloco omitido (sem teto)", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, nome: "Atendente", driver: "tickets", minPorBloco: 5 })
    ).resolves.toBeDefined();
  });
});

// ─── Menor 9/10: NOT_FOUND quando 0 linhas são afetadas ──────────────────────

describe("escala.salvarFuncao / desativarFuncao — Menor 9/10: NOT_FOUND sem sucesso falso", () => {
  it("salvarFuncao (update) com id de outra loja/inexistente → NOT_FOUND, não {success:true}", async () => {
    (dbEscalaConfig.updateFuncao as any).mockResolvedValue(false);
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, id: 999, nome: "Atendente", driver: "tickets", minPorBloco: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("desativarFuncao com id de outra loja/inexistente → NOT_FOUND, não {success:true}", async () => {
    (dbEscalaConfig.desativarFuncao as any).mockResolvedValue(false);
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(caller.desativarFuncao({ storeId: 1, id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("salvarFuncao (update) que afeta uma linha → {success:true} normal", async () => {
    (dbEscalaConfig.updateFuncao as any).mockResolvedValue(true);
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, id: 10, nome: "Atendente", driver: "tickets", minPorBloco: 1 })
    ).resolves.toEqual({ id: 10, success: true });
  });
});

// ─── Menor 14: valor não pode ser nulo ────────────────────────────────────────

describe("escala.salvarRegraLoja — Menor 14: valor não pode ser nulo", () => {
  it("rejeita valor: null (violaria o NOT NULL do jsonb — 500 crua)", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarRegraLoja({ storeId: 1, chave: "preferencia_x", valor: null, tipo: "MOLE", fonte: "teste" })
    ).rejects.toThrow();
    expect(dbEscalaConfig.upsertRegraLoja).not.toHaveBeenCalled();
  });

  it("aceita valor: 0 (zero é dado legítimo, só null/undefined são rejeitados)", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarRegraLoja({ storeId: 1, chave: "preferencia_x", valor: 0, tipo: "MOLE", fonte: "teste" })
    ).resolves.toEqual({ success: true });
  });
});

// ─── I6: whitelist contra sobrescrever trava legal de rede ──────────────────

describe("escala.salvarRegraLoja — I6: FORBIDDEN ao tentar sobrescrever trava legal de rede", () => {
  it("upsertRegraLoja lança RegraLojaNaoPermitidaError → router converte para FORBIDDEN, não 500", async () => {
    (dbEscalaConfig.upsertRegraLoja as any).mockRejectedValue(
      new dbEscalaConfig.RegraLojaNaoPermitidaError("jornada_max_semanal")
    );
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    await expect(
      caller.salvarRegraLoja({
        storeId: 1,
        chave: "jornada_max_semanal",
        valor: 60,
        tipo: "DURA",
        fonte: "teste",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("erro genérico de upsertRegraLoja NÃO é mascarado de FORBIDDEN — propaga como está", async () => {
    (dbEscalaConfig.upsertRegraLoja as any).mockRejectedValue(new Error("falha de banco qualquer"));
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    await expect(
      caller.salvarRegraLoja({ storeId: 1, chave: "preferencia_x", valor: 1, tipo: "MOLE", fonte: "teste" })
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("upsertRegraLoja (função real, sem mock) — I6: whitelist de verdade", () => {
  it("chave do catálogo legal de rede + tipo DURA → RegraLojaNaoPermitidaError, sem tocar o banco", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    await expect(
      real.upsertRegraLoja(1, { chave: "jornada_max_semanal", valor: 60, tipo: "DURA", fonte: "teste" })
    ).rejects.toBeInstanceOf(real.RegraLojaNaoPermitidaError);
  });

  it("chave do catálogo legal de rede + tipo DEPENDE_CCT → também rejeita", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    await expect(
      real.upsertRegraLoja(1, {
        chave: "domingos_folga_mulher_mes",
        valor: 0,
        tipo: "DEPENDE_CCT",
        fonte: "teste",
      })
    ).rejects.toBeInstanceOf(real.RegraLojaNaoPermitidaError);
  });

  it("chave do catálogo legal de rede + tipo MOLE → passa do whitelist (segue pro banco)", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    await expect(
      real.upsertRegraLoja(1, { chave: "jornada_max_semanal", valor: 60, tipo: "MOLE", fonte: "teste" })
    ).rejects.not.toBeInstanceOf(real.RegraLojaNaoPermitidaError);
  });

  it("chave que não existe no catálogo legal de rede → passa do whitelist mesmo com DURA", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    await expect(
      real.upsertRegraLoja(1, { chave: "regra_inventada_da_loja", valor: 1, tipo: "DURA", fonte: "teste" })
    ).rejects.not.toBeInstanceOf(real.RegraLojaNaoPermitidaError);
  });
});

// ─── I2: normalização de workDate (string OU Date) ───────────────────────────

describe("workDateParaIso (db-escala-config.ts) — I2: workDate pode voltar como string ou Date", () => {
  it("string ISO passa direto", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    expect(real.workDateParaIso("2026-11-19")).toBe("2026-11-19");
  });

  it("objeto Date é convertido para AAAA-MM-DD — o bug real: getScheduleForWeek (shim raw do pg, sem type parser do Drizzle) pode devolver workDate como Date, e o Map de pessoas-hora precisa casar com entryDate (sempre string)", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    expect(real.workDateParaIso(new Date("2026-11-19T00:00:00.000Z"))).toBe("2026-11-19");
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
