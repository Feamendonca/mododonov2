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
    // R24 (revisão da Task 6): confirmar uma DEPENDE_CCT passou a usar
    // esta tabela separada (confirmacoes_regra_loja), nunca
    // `upsertRegraLoja` — mockadas à parte para o teste dedicado provar
    // que `confirmarRegraLoja` (procedure) nunca toca `upsertRegraLoja`.
    confirmarRegraLoja: vi.fn(),
    getChavesConfirmadas: vi.fn(),
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
  dbEscalaConfig.confirmarRegraLoja,
  dbEscalaConfig.getChavesConfirmadas,
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
  (dbEscalaConfig.confirmarRegraLoja as any).mockResolvedValue(undefined);
  (dbEscalaConfig.getChavesConfirmadas as any).mockResolvedValue([]);
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
  // R20: `funcaoId` é opcional desde o fix pós-revisão da Task 5 — a
  // entrada mínima válida do caso MAIS COMUM (função ainda não criada)
  // não leva `funcaoId`, só `driver`.
  sugerirProdutividade: (storeId) => ({ storeId, driver: "tickets" }),
  // R24 (revisão da Task 6): procedure nova, substitui o uso de
  // `salvarRegraLoja` para confirmar uma DEPENDE_CCT.
  confirmarRegraLoja: (storeId) => ({ storeId, chave: "domingos_folga_mulher_mes" }),
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

// ─── R20 (pós-revisão da Task 5): sugerirProdutividade aceita funcaoId
// opcional — a sugestão deriva do histórico da loja por driver, não da
// identidade da função. Sem isto, TODA função nova nascia com a
// produtividade vazia (o caso mais comum: gestor cadastrando a loja do
// zero), contradizendo o requisito "a produtividade nunca aparece como
// campo vazio". ────────────────────────────────────────────────────────────

describe("escala.sugerirProdutividade — R20: driver é o parâmetro principal, funcaoId é opcional", () => {
  it("aceita {storeId, driver} SEM funcaoId (função ainda não criada) — passa driver e funcaoId=undefined pra camada de dados", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    await expect(caller.sugerirProdutividade({ storeId: 1, driver: "tickets" })).resolves.toBeDefined();

    expect(dbEscalaConfig.sugerirProdutividade).toHaveBeenCalledWith(1, "tickets", undefined);
  });

  it("aceita {storeId, driver, funcaoId} (função já existe) — refinamento opcional chega intacto pra camada de dados", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    await expect(
      caller.sugerirProdutividade({ storeId: 1, driver: "pratos", funcaoId: 7 })
    ).resolves.toBeDefined();

    expect(dbEscalaConfig.sugerirProdutividade).toHaveBeenCalledWith(1, "pratos", 7);
  });

  it("rejeita entrada sem driver — driver passou a ser obrigatório no contrato novo", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.sugerirProdutividade({ storeId: 1, funcaoId: 7 } as any)
    ).rejects.toThrow();
    expect(dbEscalaConfig.sugerirProdutividade).not.toHaveBeenCalled();
  });

  it("rejeita driver fora de tickets|pratos|cobertos — mesma validação de salvarFuncao, não afrouxada aqui", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.sugerirProdutividade({ storeId: 1, driver: "clientes" as any })
    ).rejects.toThrow();
    expect(dbEscalaConfig.sugerirProdutividade).not.toHaveBeenCalled();
  });

  it("continua atrás do gate: loja de outro gestor → FORBIDDEN mesmo com entrada válida", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.sugerirProdutividade({ storeId: 999, driver: "tickets" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbEscalaConfig.sugerirProdutividade).not.toHaveBeenCalled();
  });
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

  // M3 (pós-revisão da Task 5): a TELA (client/src/lib/escala-config-ui.ts)
  // já rejeitava nome só de espaços, mas o servidor (sem `.trim()`)
  // aceitava — tela mais restritiva que o servidor, ao contrário da
  // premissa (tela espelha o servidor, nunca o oposto). Corrigido
  // apertando o servidor com `.trim()` em vez de afrouxar a tela: nome só
  // de espaços é lixo nos dois lados.
  it("rejeita nome só com espaços — M3: servidor aperta com .trim() para não ficar mais permissivo que a tela", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, nome: "   ", driver: "tickets", minPorBloco: 1 })
    ).rejects.toThrow();
    expect(dbEscalaConfig.createFuncao).not.toHaveBeenCalled();
  });

  it("aceita nome com espaços nas pontas e grava já sem eles (.trim() roda antes de min(1)/max(64))", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(
      caller.salvarFuncao({ storeId: 1, nome: "  Atendente  ", driver: "tickets", minPorBloco: 1 })
    ).resolves.toBeDefined();
    expect(dbEscalaConfig.createFuncao).toHaveBeenCalledWith(1, expect.objectContaining({ nome: "Atendente" }));
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

  // 🔴 R26 (C1 da review final) — ESTE TESTE FOI INVERTIDO.
  // A versão anterior afirmava que `MOLE` numa chave legal "passa do
  // whitelist (segue pro banco)". Era a consagração do furo: até a
  // correção do R26, `vence()` (escala-regras.ts) não olhava `tipo`, e
  // essa MOLE de escopo loja DERRUBAVA a DURA de 42h da EC 141 — provado
  // rodando o resolvedor real (ver o teste ponta a ponta em
  // escala-regras.test.ts). Agora chave legal é rejeitada em tipo nenhum.
  it("chave do catálogo legal de rede + tipo MOLE → TAMBÉM rejeita (R26: qualquer tipo)", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    await expect(
      real.upsertRegraLoja(1, { chave: "jornada_max_semanal", valor: 60, tipo: "MOLE", fonte: "teste" })
    ).rejects.toBeInstanceOf(real.RegraLojaNaoPermitidaError);
  });

  it("TODA chave de REGRAS_LEGAIS_INICIAIS é rejeitada, em TODOS os três tipos — nenhuma escapa por omissão", async () => {
    const real = await vi.importActual<typeof import("./db-escala-config")>("./db-escala-config");
    const seed = await vi.importActual<typeof import("./escala-catalogo-seed")>("./escala-catalogo-seed");
    const chaves = Array.from(new Set(seed.REGRAS_LEGAIS_INICIAIS.map((r) => r.chave)));
    expect(chaves.length).toBeGreaterThan(0);

    for (const chave of chaves) {
      for (const tipo of ["DURA", "MOLE", "DEPENDE_CCT"] as const) {
        await expect(
          real.upsertRegraLoja(1, { chave, valor: 1, tipo, fonte: "teste" }),
          `${chave} / ${tipo} deveria ser rejeitada em escopo loja`
        ).rejects.toBeInstanceOf(real.RegraLojaNaoPermitidaError);
      }
    }
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

  // R24 (revisão da Task 6): a resposta agora leva `chavesConfirmadas`,
  // vindo de `getChavesConfirmadas` — uma leitura paralela a `getRegras`,
  // nunca usada para resolver nada (resolverRegras só recebe `candidatas`).
  it("R24: devolve chavesConfirmadas a partir de getChavesConfirmadas, sem alterar a resolução", async () => {
    (dbEscalaConfig.getChavesConfirmadas as any).mockResolvedValue(["domingos_folga_mulher_mes"]);
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    const result = await caller.getRegrasVigentes({ storeId: 1, data: "2026-11-19" });

    expect(result.chavesConfirmadas).toEqual(["domingos_folga_mulher_mes"]);
    expect(dbEscalaConfig.getChavesConfirmadas).toHaveBeenCalledWith(1);
  });
});

// ─── R24: confirmar uma DEPENDE_CCT não pode criar regra concorrente ────────
//
// Achado do controlador: a versão anterior confirmava chamando
// `upsertRegraLoja` com a MESMA chave/valor em escopo loja — por
// precedência (Task 2: loja > uf > rede), essa cópia venceria PARA SEMPRE,
// inclusive depois que a regra de rede mudasse (a EC 141/2026 tem duas
// viradas programadas: 16/12/2026 e 16/12/2027). A procedure nova
// (`confirmarRegraLoja`) só grava "o gerente confirmou esta chave" numa
// tabela separada — nunca toca `regras_escala`/`upsertRegraLoja`.

describe("escala.confirmarRegraLoja — R24: registra confirmação sem criar regra concorrente", () => {
  it("chama dbEscalaConfig.confirmarRegraLoja(storeId, chave) — nada mais", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    await expect(
      caller.confirmarRegraLoja({ storeId: 1, chave: "domingos_folga_mulher_mes" })
    ).resolves.toEqual({ success: true });

    expect(dbEscalaConfig.confirmarRegraLoja).toHaveBeenCalledWith(1, "domingos_folga_mulher_mes");
  });

  it("NUNCA chama upsertRegraLoja — confirmar não grava regra de escopo loja", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    await caller.confirmarRegraLoja({ storeId: 1, chave: "domingos_folga_mulher_mes" });

    expect(dbEscalaConfig.upsertRegraLoja).not.toHaveBeenCalled();
  });

  it("rejeita chave vazia", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);
    await expect(caller.confirmarRegraLoja({ storeId: 1, chave: "" })).rejects.toThrow();
    expect(dbEscalaConfig.confirmarRegraLoja).not.toHaveBeenCalled();
  });

  // Prova de ponta a ponta do cenário pedido pelo controlador: confirmar
  // uma chave, a regra de rede mudar de valor, e `getRegrasVigentes`
  // devolver o valor NOVO — a confirmação nunca guarda/trava valor.
  it("cenário completo: confirma a chave, a regra de rede muda de valor, getRegrasVigentes devolve a NOVA — não a confirmada", async () => {
    const caller = escalaRouter.createCaller(ctxGerenteLoja1);

    // 1) Gerente confirma hoje, com a regra de rede valendo 2.
    (dbEscalaConfig.getRegras as any).mockResolvedValue([
      {
        storeId: null,
        uf: null,
        cct: null,
        chave: "domingos_folga_mulher_mes",
        valor: 2,
        tipo: "DEPENDE_CCT",
        vigenciaInicio: null,
        vigenciaFim: null,
        fonte: "CLT art. 386",
      },
    ]);
    await caller.confirmarRegraLoja({ storeId: 1, chave: "domingos_folga_mulher_mes" });
    expect(dbEscalaConfig.upsertRegraLoja).not.toHaveBeenCalled();

    // 2) A regra de rede muda de valor (ex.: nova virada da EC 141) — a
    // confirmação (passo 1) não escreveu nada em `regras_escala`, então
    // não há nenhuma cópia antiga para competir com o valor novo.
    (dbEscalaConfig.getRegras as any).mockResolvedValue([
      {
        storeId: null,
        uf: null,
        cct: null,
        chave: "domingos_folga_mulher_mes",
        valor: 3,
        tipo: "DEPENDE_CCT",
        vigenciaInicio: null,
        vigenciaFim: null,
        fonte: "CLT art. 386 (revisão)",
      },
    ]);
    (dbEscalaConfig.getChavesConfirmadas as any).mockResolvedValue(["domingos_folga_mulher_mes"]);

    const result = await caller.getRegrasVigentes({ storeId: 1, data: "2026-11-19" });

    const regraDomingos = result.regras.find((r) => r.chave === "domingos_folga_mulher_mes");
    expect(regraDomingos?.valor).toBe(3);
    // E a chave continua marcada como confirmada — o gerente não precisa
    // reconfirmar só porque o VALOR mudou, mas o valor que a tela mostra é
    // sempre o resolvido agora, nunca o que valia quando ele confirmou.
    expect(result.chavesConfirmadas).toContain("domingos_folga_mulher_mes");
  });
});
