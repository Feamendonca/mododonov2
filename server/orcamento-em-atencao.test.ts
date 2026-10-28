/**
 * orcamento-em-atencao.test.ts
 * Task 7 do módulo Orçamento (Fase B): loja "em atenção" + rampa + decisão.
 *
 * Regra dura (ver task-7-brief.md): `emAtencao` vem do RESULTADO OPERACIONAL
 * médio do histórico, calculado pelos COMPONENTES (soma dos grupos nível-1
 * "1".."11", que já vêm com sinal) — NUNCA relendo a linha de resultado
 * (grupo 12/14). Média < 0 → emAtencao=true, rampaMeses=3.
 *
 * `calcularPrazoDecisao` é PURA (soma meses a uma data 'YYYY-MM-DD' em UTC,
 * sem depender de "hoje").
 *
 * `registrarDecisao`: só admin|supervisor grava `decisao`; gerente/user →
 * FORBIDDEN (mesmo padrão de `aprovarRascunho`, ver orcamento-aprovar.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  proporOrcamento,
  calcularPrazoDecisao,
  type GrupoDreMes,
} from "./orcamento-proposta";
import type { TrpcContext } from "./_core/context";

// ─── proporOrcamento — emAtencao pelo resultado operacional real ──────────────

describe("proporOrcamento — emAtencao (resultado operacional médio)", () => {
  it("histórico com resultado operacional médio NEGATIVO (receita 500k/510k, custos somando mais que isso) → emAtencao=true, rampaMeses=3", () => {
    const gruposPorMes: GrupoDreMes[] = [
      {
        anoMes: "2026-07",
        grupos: {
          "1": 500000, // receita bruta
          "4": -150000, // CMV
          "5": -35000, // impostos
          "6": -10000, // royalties/fundo
          "7": -200000, // folha
          "8": -5000, // serviços de terceiros
          "9": -90000, // terceiros eventuais
          "10": -30000, // ocupação
          "11": -15000, // financeiras
        },
        // soma 1..11 = 500000-150000-35000-10000-200000-5000-90000-30000-15000 = -35000
      },
      {
        anoMes: "2026-08",
        grupos: {
          "1": 510000,
          "4": -150000,
          "5": -35000,
          "6": -10000,
          "7": -200000,
          "8": -5000,
          "9": -90000,
          "10": -30000,
          "11": -15000,
        },
        // soma 1..11 = -25000
      },
    ];

    const rascunho = proporOrcamento(gruposPorMes);

    expect(rascunho.emAtencao).toBe(true);
    expect(rascunho.rampaMeses).toBe(3);
  });

  it("histórico com resultado operacional médio POSITIVO → emAtencao=false, rampaMeses=null", () => {
    const gruposPorMes: GrupoDreMes[] = [
      {
        anoMes: "2026-07",
        grupos: {
          "1": 700000,
          "4": -200000,
          "5": -50000,
          "6": -15000,
          "7": -180000,
          "8": -10000,
          "10": -40000,
          "11": -12000,
        },
        // soma 1..11 = 700000-200000-50000-15000-180000-10000-40000-12000 = 193000
      },
      {
        anoMes: "2026-08",
        grupos: {
          "1": 720000,
          "4": -205000,
          "5": -51000,
          "6": -15500,
          "7": -185000,
          "8": -10200,
          "10": -41000,
          "11": -12300,
        },
      },
    ];

    const rascunho = proporOrcamento(gruposPorMes);

    expect(rascunho.emAtencao).toBe(false);
    expect(rascunho.rampaMeses).toBeNull();
  });

  it("NÃO relê o grupo 12/14 (linha de resultado) — soma só os componentes 1..11, mesmo que a linha 12 da planilha esteja presente e divirja", () => {
    // Monta um mês cujo "12" (lido, mas não deveria influenciar) diz uma
    // coisa e os componentes 1..11 dizem outra. O resultado tem que seguir
    // SEMPRE os componentes.
    const gruposPorMes: GrupoDreMes[] = [
      {
        anoMes: "2026-07",
        grupos: {
          "1": 500000,
          "4": -150000,
          "5": -35000,
          "7": -200000,
          "9": -150000, // puxa o resultado dos componentes pro vermelho
          "12": 999999, // linha de resultado da planilha — deve ser IGNORADA
        },
        // soma 1..11 = 500000-150000-35000-200000-150000 = -35000 (negativo)
      },
    ];

    const rascunho = proporOrcamento(gruposPorMes);

    expect(rascunho.emAtencao).toBe(true);
    expect(rascunho.rampaMeses).toBe(3);
  });
});

// ─── calcularPrazoDecisao — pura, soma meses em UTC ────────────────────────────

describe("calcularPrazoDecisao", () => {
  it("soma rampaMeses à data, mesmo ano", () => {
    expect(calcularPrazoDecisao("2026-06-01", 3)).toBe("2026-09-01");
  });

  it("soma rampaMeses à data, virando o ano", () => {
    expect(calcularPrazoDecisao("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("é pura: duas chamadas com o mesmo input devolvem exatamente o mesmo resultado", () => {
    const a = calcularPrazoDecisao("2026-01-31", 1);
    const b = calcularPrazoDecisao("2026-01-31", 1);
    expect(a).toBe(b);
  });
});

// ─── registrarDecisao — só admin|supervisor ────────────────────────────────────

vi.mock("./db-orcamento-v2", () => ({
  upsertOrcamentoRascunho: vi.fn(),
  aprovarOrcamento: vi.fn(),
  registrarDecisao: vi.fn(),
}));

import { registrarDecisao } from "./db-orcamento-v2";
import { orcamentoRouter } from "./routers/orcamento";

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

describe("orcamento.registrarDecisao", () => {
  it("admin → chama registrarDecisao(orcamentoId, decisao) e retorna o resultado", async () => {
    (registrarDecisao as any).mockResolvedValue({ id: 10, decisao: "seguir" });
    const caller = orcamentoRouter.createCaller(ctxAdmin);

    const result = await caller.registrarDecisao({ orcamentoId: 10, decisao: "seguir" });

    expect(result).toEqual({ id: 10, decisao: "seguir" });
    expect(registrarDecisao).toHaveBeenCalledWith(10, "seguir");
  });

  it("supervisor (regional) → permitido, idem admin", async () => {
    (registrarDecisao as any).mockResolvedValue({ id: 11, decisao: "encerrar" });
    const caller = orcamentoRouter.createCaller(ctxSupervisor);

    const result = await caller.registrarDecisao({ orcamentoId: 11, decisao: "encerrar" });

    expect(result).toEqual({ id: 11, decisao: "encerrar" });
    expect(registrarDecisao).toHaveBeenCalledWith(11, "encerrar");
  });

  it("gerente → FORBIDDEN, NÃO chama registrarDecisao", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerente);

    await expect(caller.registrarDecisao({ orcamentoId: 12, decisao: "seguir" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(registrarDecisao).not.toHaveBeenCalled();
  });

  it("user → FORBIDDEN, NÃO chama registrarDecisao", async () => {
    const caller = orcamentoRouter.createCaller(ctxUser);

    await expect(caller.registrarDecisao({ orcamentoId: 13, decisao: "encerrar" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(registrarDecisao).not.toHaveBeenCalled();
  });
});
