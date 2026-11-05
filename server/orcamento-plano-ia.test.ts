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

import { montarRetratoLinhas, gerarPlanoIA, calcularRetratoEbitda, calcularAlvoRs } from "./orcamento-plano-ia";
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

describe("calcularRetratoEbitda", () => {
  it("calcula o EBITDA por mês somando as folhas operacionais (receita + custo), determinístico", () => {
    const retrato = calcularRetratoEbitda(linhasFixture, anoMeses);

    // mês 0: receita 680000 + custo -210000 = 470000
    // mês 1: receita 700000 + custo -200000 = 500000
    // mês 2: receita 720000 + custo -195000 = 525000
    expect(retrato.porMes).toEqual([470000, 500000, 525000]);
    expect(retrato.melhor).toBe(525000);
    expect(retrato.pior).toBe(470000);
    expect(retrato.media).toBeCloseTo((470000 + 500000 + 525000) / 3);
    expect(retrato.receitaMedia).toBeCloseTo(700000);
  });
});

describe("calcularAlvoRs", () => {
  const retrato = calcularRetratoEbitda(linhasFixture, anoMeses);

  it("ebitda_rs: alvoRs é o valor direto da meta", () => {
    expect(calcularAlvoRs({ tipo: "ebitda_rs", valor: 120000 }, retrato)).toBe(120000);
  });

  it("ebitda_pct: alvoRs = valor% × receita média", () => {
    // 20% de 700000 = 140000
    expect(calcularAlvoRs({ tipo: "ebitda_pct", valor: 20 }, retrato)).toBeCloseTo(140000);
  });

  it("melhoria_pct: alvoRs = melhor mês × (1 + valor%)", () => {
    // melhor mês = 525000; 15% de melhoria → 525000 * 1.15 = 603750
    expect(calcularAlvoRs({ tipo: "melhoria_pct", valor: 15 }, retrato)).toBeCloseTo(603750);
  });

  it("sem base (retrato vazio) → alvoRs null, nunca chuta", () => {
    const retratoVazio = { porMes: [null, null, null], melhor: null, pior: null, media: null, receitaMedia: null };
    expect(calcularAlvoRs({ tipo: "ebitda_pct", valor: 20 }, retratoVazio)).toBeNull();
    expect(calcularAlvoRs({ tipo: "melhoria_pct", valor: 15 }, retratoVazio)).toBeNull();
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
      indisponivel: true,
    });
  });

  it("retorna fallback silencioso quando a LLM lança erro, sem propagar", async () => {
    invokeLLMMock.mockRejectedValue(new Error("timeout de rede"));

    await expect(gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta })).resolves.toEqual({
      linhas: [],
      planoBatalha: [],
      meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "IA indisponível" },
      indisponivel: true,
    });
  });

  it("retorna fallback silencioso quando o JSON é válido mas tem formato inesperado", async () => {
    mockInvokeLLMResolve(JSON.stringify({ foo: "bar" }));

    const resultado = await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(resultado).toEqual({
      linhas: [],
      planoBatalha: [],
      meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "IA indisponível" },
      indisponivel: true,
    });
  });

  it("flag indisponivel é diferente de 'IA respondeu com linhas vazias válidas'", async () => {
    // Resposta VÁLIDA da LLM, só que sem sugestões (ex.: histórico insuficiente
    // em todas as linhas) — isso NÃO é "IA caiu", é "IA não teve o que sugerir".
    const planoVazioValido: PlanoIA = {
      linhas: [],
      planoBatalha: [],
      meta: { alvoRs: 120000, alcancadoRs: null, atingiuMeta: false, motivo: "sem base suficiente" },
    };
    mockInvokeLLMResolve(JSON.stringify(planoVazioValido));

    const resultado = await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(resultado.linhas).toEqual([]);
    expect(resultado.indisponivel).not.toBe(true);
  });

  it("não grava nada — só chama invokeLLM, nunca salvarLinhas", async () => {
    mockInvokeLLMResolve(JSON.stringify({ linhas: [], planoBatalha: [], meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "x" } }));

    await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    expect(salvarLinhasMock).not.toHaveBeenCalled();
  });

  it("sobrescreve meta.alvoRs com o determinístico mesmo se a LLM mandar outro número", async () => {
    const metaMelhoria: MetaInput = { tipo: "melhoria_pct", valor: 15 };
    const planoComAlvoErrado: PlanoIA = {
      linhas: [],
      planoBatalha: [],
      // LLM "chutou" um alvoRs qualquer, errado (deveria ser 603750 — 15% sobre
      // o melhor mês de EBITDA, 525000).
      meta: { alvoRs: 999999, alcancadoRs: 500000, atingiuMeta: false, motivo: "" },
    };
    mockInvokeLLMResolve(JSON.stringify(planoComAlvoErrado));

    const resultado = await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta: metaMelhoria });

    expect(resultado.meta.alvoRs).toBeCloseTo(603750);
    expect(resultado.meta.alvoRs).not.toBe(999999);
    // alcancadoRs continua vindo da IA (não é recalculado nesta task).
    expect(resultado.meta.alcancadoRs).toBe(500000);
  });

  it("injeta o contexto determinístico do EBITDA (por mês/melhor/pior/média/alvoRs) no prompt do usuário", async () => {
    mockInvokeLLMResolve(JSON.stringify({ linhas: [], planoBatalha: [], meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "x" } }));

    await gerarPlanoIA({ linhas: linhasFixture, anoMeses, meta });

    const callArgs = invokeLLMMock.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: { role: string }) => m.role === "user").content as string;
    expect(userMsg).toContain("525000"); // melhor mês de EBITDA
    expect(userMsg).toContain("470000"); // pior mês de EBITDA
    expect(userMsg).toContain("120000"); // alvoRs determinístico (ebitda_rs direto)
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
