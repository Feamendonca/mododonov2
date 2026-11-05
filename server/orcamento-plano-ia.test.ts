/**
 * orcamento-plano-ia.test.ts
 * Testes do motor da IA do "Proposto Inteligente" (Task P1 — ver
 * docs/superpowers/specs/2026-11-05-proposto-inteligente-ia.md).
 *
 * Cobre:
 *  1. montarRetratoLinhas: melhor/pior/média dos 3 meses por linha, DETERMINÍSTICO
 *     (sem IA envolvida) — melhor = menor custo em módulo (linha de custo) ou maior
 *     receita (linha de receita); ignora derivadas/subtotais; linha sem base → null.
 *  2. gerarPlanoIA: LLM retorna JSON válido → devolve PlanoIA igual; LLM retorna
 *     lixo/lança erro → fallback silencioso sem lançar.
 *  3. gerarPlanoIA NÃO grava nada (só chama invokeLLM) — espiona salvarLinhas.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeLLMMock = vi.fn();

vi.mock("./_core/llm", () => ({
  invokeLLM: (...args: unknown[]) => invokeLLMMock(...args),
}));

// Espião: prova que gerarPlanoIA nunca grava nada no banco — se algum dia
// alguém importar/chamar salvarLinhas dentro de orcamento-plano-ia.ts, este
// mock pegaria a chamada.
const salvarLinhasMock = vi.fn();
vi.mock("./db-orcamento-v2", async () => {
  const actual = await vi.importActual<typeof import("./db-orcamento-v2")>("./db-orcamento-v2");
  return {
    ...actual,
    salvarLinhas: salvarLinhasMock,
  };
});

import { montarRetratoLinhas, gerarPlanoIA } from "./orcamento-plano-ia";
import type { PlanoIA, MetaInput } from "./orcamento-plano-ia";
import type { LinhaProposta } from "./orcamento-arvore";

function mockInvokeLLMResolve(content: string) {
  invokeLLMMock.mockResolvedValue({
    choices: [{ message: { content } }],
  });
}

const anoMeses = ["2026-07", "2026-08", "2026-09"];

const linhasFixture: LinhaProposta[] = [
  {
    codigo: "1",
    label: "Receita Bruta",
    nivel: 1,
    derivada: false,
    temFilhos: true,
    natureza: "subtotal",
    histMedia: 700000,
    proposto: 700000,
    porMes: [680000, 700000, 720000],
  },
  {
    codigo: "1.1",
    label: "Vendas Loja",
    nivel: 2,
    derivada: false,
    temFilhos: false,
    natureza: "receita",
    histMedia: 700000,
    proposto: 700000,
    porMes: [680000, 700000, 720000],
  },
  {
    codigo: "4",
    label: "CMV",
    nivel: 1,
    derivada: false,
    temFilhos: false,
    natureza: "custo",
    histMedia: -201666.666667,
    proposto: -201666.666667,
    porMes: [-210000, -200000, -195000],
  },
  {
    codigo: "7",
    label: "Resultado Líquido",
    nivel: 1,
    derivada: true,
    temFilhos: false,
    natureza: "subtotal",
    histMedia: 100000,
    proposto: 100000,
    porMes: [90000, 100000, 110000],
  },
  {
    codigo: "9",
    label: "Linha Sem Dado",
    nivel: 1,
    derivada: false,
    temFilhos: false,
    natureza: "custo",
    histMedia: null,
    proposto: null,
    porMes: [null, null, null],
  },
];

describe("montarRetratoLinhas", () => {
  it("calcula melhor/pior/média corretamente e ignora derivadas/subtotais", () => {
    const retrato = montarRetratoLinhas(linhasFixture, anoMeses);

    // "1" (subtotal, temFilhos) e "7" (derivada) ficam de fora.
    const codigos = retrato.map((r) => r.codigo);
    expect(codigos).not.toContain("1");
    expect(codigos).not.toContain("7");
    expect(codigos).toEqual(["1.1", "4", "9"]);

    const receita = retrato.find((r) => r.codigo === "1.1")!;
    expect(receita.melhor).toBe(720000);
    expect(receita.pior).toBe(680000);
    expect(receita.media).toBeCloseTo(700000);
    expect(receita.porMes).toEqual([680000, 700000, 720000]);

    const custo = retrato.find((r) => r.codigo === "4")!;
    expect(custo.melhor).toBe(-195000); // menor custo em módulo
    expect(custo.pior).toBe(-210000); // maior custo em módulo
    expect(custo.media).toBeCloseTo(-201666.666667);
  });

  it("linha sem base nos 3 meses devolve melhor/pior/média null (nunca chuta)", () => {
    const retrato = montarRetratoLinhas(linhasFixture, anoMeses);
    const semDado = retrato.find((r) => r.codigo === "9")!;
    expect(semDado.melhor).toBeNull();
    expect(semDado.pior).toBeNull();
    expect(semDado.media).toBeNull();
    expect(semDado.porMes).toEqual([null, null, null]);
  });
});

describe("gerarPlanoIA", () => {
  const meta: MetaInput = { tipo: "ebitda_rs", valor: 120000 };

  beforeEach(() => {
    invokeLLMMock.mockReset();
    salvarLinhasMock.mockReset();
  });

  it("devolve o PlanoIA igual quando a LLM retorna JSON válido", async () => {
    const planoValido: PlanoIA = {
      linhas: [
        { codigo: "1.1", propostoIA: 730000, porque: "melhor mês foi 720k, dá pra mirar um pouco acima", confianca: "media" },
        { codigo: "4", propostoIA: -198000, porque: "CMV médio 28,8%, travar perto do melhor mês é viável", confianca: "alta" },
      ],
      planoBatalha: [
        {
          titulo: "Negociar CMV com fornecedor principal",
          descricao: "Renegociar preço de insumo X para sustentar o corte de custo.",
          linhasAfetadas: ["4"],
          impactoEstimadoRs: 3000,
          prioridade: "alta",
        },
      ],
      meta: { alvoRs: 120000, alcancadoRs: 120000, atingiuMeta: true, motivo: "" },
    };
    mockInvokeLLMResolve(JSON.stringify(planoValido));

    const resultado = await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(resultado).toEqual(planoValido);
  });

  it("retorna fallback silencioso quando a LLM retorna lixo (não é JSON)", async () => {
    mockInvokeLLMResolve("isso não é json");

    const resultado = await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(resultado).toEqual({
      linhas: [],
      planoBatalha: [],
      meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "IA indisponível" },
    });
  });

  it("retorna fallback silencioso quando a LLM lança erro, sem propagar", async () => {
    invokeLLMMock.mockRejectedValue(new Error("timeout de rede"));

    await expect(gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta })).resolves.toEqual({
      linhas: [],
      planoBatalha: [],
      meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "IA indisponível" },
    });
  });

  it("retorna fallback silencioso quando o JSON é válido mas tem formato inesperado", async () => {
    mockInvokeLLMResolve(JSON.stringify({ foo: "bar" }));

    const resultado = await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(resultado).toEqual({
      linhas: [],
      planoBatalha: [],
      meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "IA indisponível" },
    });
  });

  it("não grava nada — só chama invokeLLM, nunca salvarLinhas", async () => {
    mockInvokeLLMResolve(JSON.stringify({ linhas: [], planoBatalha: [], meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "x" } }));

    await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    expect(salvarLinhasMock).not.toHaveBeenCalled();
  });

  it("chama invokeLLM com MODEL_DEEP e response_format json_schema", async () => {
    mockInvokeLLMResolve(JSON.stringify({ linhas: [], planoBatalha: [], meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "x" } }));

    await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    const callArgs = invokeLLMMock.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-sonnet-4-6");
    expect(callArgs.response_format.type).toBe("json_schema");
  });
});
