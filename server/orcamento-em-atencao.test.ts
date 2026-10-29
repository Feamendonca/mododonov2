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
        cats: {
          receitaBruta: 500000,
          cmv: -150000,
          impostos: -35000,
          franquias: -10000, // royalties/fundo
          folha: -200000,
          terceiros: -95000, // serviços de terceiros (-5000) + terceiros eventuais (-90000), já somados
          ocupacao: -30000,
          financeiras: -15000,
        },
        // receitaLiq(500000+0) + custos = 500000-150000-35000-10000-200000-95000-30000-15000 = -35000
      },
      {
        anoMes: "2026-08",
        cats: {
          receitaBruta: 510000,
          cmv: -150000,
          impostos: -35000,
          franquias: -10000,
          folha: -200000,
          terceiros: -95000,
          ocupacao: -30000,
          financeiras: -15000,
        },
        // soma = -25000
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
        cats: {
          receitaBruta: 700000,
          cmv: -200000,
          impostos: -50000,
          franquias: -15000,
          folha: -180000,
          terceiros: -10000,
          ocupacao: -40000,
          financeiras: -12000,
        },
        // receitaLiq(700000) + custos = 700000-200000-50000-15000-180000-10000-40000-12000 = 193000
      },
      {
        anoMes: "2026-08",
        cats: {
          receitaBruta: 720000,
          cmv: -205000,
          impostos: -51000,
          franquias: -15500,
          folha: -185000,
          terceiros: -10200,
          ocupacao: -41000,
          financeiras: -12300,
        },
      },
    ];

    const rascunho = proporOrcamento(gruposPorMes);

    expect(rascunho.emAtencao).toBe(false);
    expect(rascunho.rampaMeses).toBeNull();
  });

  it("DRE F360 REAL (com redutores e linha de resultado presentes): loja no vermelho (receita líquida ~700k, custos ~-750k) → emAtencao=true, SEM dupla contagem de receita bruta + receita líquida", () => {
    // Na DRE F360 real, a linha "Receita Líquida" é DERIVADA (= Receita
    // Bruta + Redutores) e vem preenchida no arquivo, mas é IGNORADA na
    // classificação por categoria (REGEX_DERIVADA) — nunca entra em `cats`.
    // O resultado operacional correto é reconstruído: receitaBruta +
    // redutores + custos.
    const gruposPorMes: GrupoDreMes[] = [
      {
        anoMes: "2026-07",
        cats: {
          receitaBruta: 720000,
          redutores: -20000, // Redutores de Venda
          // "Receita Líquida" (derivada) NUNCA aparece aqui — classificada como null.
          cmv: -250000,
          impostos: -55000,
          franquias: -16000, // royalties/fundo
          folha: -300000,
          terceiros: -52000, // serviços (-12000) + terceiros eventuais (-40000)
          ocupacao: -62000,
          financeiras: -15000,
          // "Lucro Operacional" (derivada) também NUNCA aparece — ignorada.
        },
        // receitaLiq(720000-20000=700000) + custos(-750000) = -50000 (vermelho).
      },
      {
        anoMes: "2026-08",
        cats: {
          receitaBruta: 720000,
          redutores: -20000,
          cmv: -250000,
          impostos: -55000,
          franquias: -16000,
          folha: -300000,
          terceiros: -52000,
          ocupacao: -62000,
          financeiras: -15000,
        },
      },
    ];

    const rascunho = proporOrcamento(gruposPorMes);

    expect(rascunho.emAtencao).toBe(true);
    expect(rascunho.rampaMeses).toBe(3);
  });

  it("DRE F360 REAL com redutores presentes mas loja saudável (receita líquida 700k, custos ~-507k) → emAtencao=false", () => {
    const gruposPorMes: GrupoDreMes[] = [
      {
        anoMes: "2026-07",
        cats: {
          receitaBruta: 720000,
          redutores: -20000,
          cmv: -200000,
          impostos: -50000,
          franquias: -15000,
          folha: -180000,
          terceiros: -10000,
          ocupacao: -40000,
          financeiras: -12000,
        },
        // 700000 + custos(-507000) = +193000 (saudável).
      },
    ];

    const rascunho = proporOrcamento(gruposPorMes);

    expect(rascunho.emAtencao).toBe(false);
    expect(rascunho.rampaMeses).toBeNull();
  });

  it("NUNCA relê a linha de resultado derivada — soma só as categorias de custo, mesmo que uma linha de nome inesperado 'pareça' resultado", () => {
    // Monta um mês cujos componentes somam negativo. Uma linha de nome
    // "Resultado Parcial" (derivada pelo REGEX_DERIVADA) existiria na
    // planilha real mas, como `extrairGruposPorMes` já a exclui na origem,
    // aqui simulamos diretamente o `cats` sem ela — o resultado tem que
    // seguir SEMPRE os componentes, nunca uma linha de resultado.
    const gruposPorMes: GrupoDreMes[] = [
      {
        anoMes: "2026-07",
        cats: {
          receitaBruta: 500000,
          cmv: -150000,
          impostos: -35000,
          folha: -200000,
          terceiros: -150000, // puxa o resultado dos componentes pro vermelho
        },
        // receitaLiq(500000) + custos = 500000-150000-35000-200000-150000 = -35000 (negativo)
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
