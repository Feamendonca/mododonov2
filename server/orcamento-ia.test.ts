/**
 * orcamento-ia.test.ts
 * Testes da camada de IA aditiva do Orçamento (Task 8, Fase B).
 *
 * Cobre (ver task-8-brief.md):
 *  1. LLM retorna JSON válido → gerarSugestaoIA devolve igual.
 *  2. LLM retorna lixo (não é JSON) → fallback silencioso { sugestoes:{}, alavancasFracas:[] }.
 *  3. LLM lança erro → idem (fallback), sem propagar.
 *  4. gerarSugestaoIA não chama nenhuma função de escrita/parse de planilha (só invokeLLM).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeLLMMock = vi.fn();

vi.mock("./_core/llm", () => ({
  invokeLLM: (...args: unknown[]) => invokeLLMMock(...args),
}));

// Espiões para provar que gerarSugestaoIA NUNCA lê planilha nem grava nada —
// se algum dia alguém importar/chamar essas funções dentro de orcamento-ia.ts,
// estes mocks pegariam a chamada.
const extrairGruposPorMesMock = vi.fn();
vi.mock("./orcamento-proposta", async () => {
  const actual = await vi.importActual<typeof import("./orcamento-proposta")>("./orcamento-proposta");
  return {
    ...actual,
    extrairGruposPorMes: extrairGruposPorMesMock,
  };
});

import { gerarSugestaoIA } from "./orcamento-ia";
import type { GrupoDreMes, RascunhoOrcamento } from "./orcamento-proposta";

const historicoFixture: GrupoDreMes[] = [
  { anoMes: "2026-07", cats: { receitaBruta: 700000, cmv: -200000, folha: -180000 } },
  { anoMes: "2026-08", cats: { receitaBruta: 720000, cmv: -205000, folha: -185000 } },
];

const rascunhoFixture: RascunhoOrcamento = {
  receitaBruta: 710000,
  cmvPct: 0.285,
  impostosPct: null,
  royaltiesPct: null,
  fundoMarketingPct: null,
  folha: 182500,
  aluguel: null,
  condominio: null,
  energia: null,
  gas: null,
  agua: null,
  outrosOcupacao: null,
  contabilidade: null,
  sistemas: null,
  outrosServicos: null,
  taxaCartaoPct: null,
  juros: null,
  tarifasBancarias: null,
  marketing: null,
  outrasDespesas: null,
  proLabore: null,
  emAtencao: false,
  rampaMeses: null,
};

function mockInvokeLLMResolve(content: string) {
  invokeLLMMock.mockResolvedValue({
    choices: [{ message: { content } }],
  });
}

describe("gerarSugestaoIA", () => {
  beforeEach(() => {
    invokeLLMMock.mockReset();
    extrairGruposPorMesMock.mockReset();
  });

  it("devolve as sugestões e alavancas fracas quando a LLM retorna JSON válido", async () => {
    const jsonValido = {
      sugestoes: { cmvPct: 0.33 },
      alavancasFracas: [{ campo: "cmvPct", nota: "CMV acima do saudável (32-35%)" }],
    };
    mockInvokeLLMResolve(JSON.stringify(jsonValido));

    const resultado = await gerarSugestaoIA({ historico: historicoFixture, rascunho: rascunhoFixture });

    expect(resultado).toEqual(jsonValido);
  });

  it("retorna fallback silencioso quando a LLM retorna lixo (não é JSON)", async () => {
    mockInvokeLLMResolve("não é json");

    const resultado = await gerarSugestaoIA({ historico: historicoFixture, rascunho: rascunhoFixture });

    expect(resultado).toEqual({ sugestoes: {}, alavancasFracas: [] });
  });

  it("retorna fallback silencioso quando a LLM lança erro, sem propagar", async () => {
    invokeLLMMock.mockRejectedValue(new Error("timeout de rede"));

    await expect(
      gerarSugestaoIA({ historico: historicoFixture, rascunho: rascunhoFixture })
    ).resolves.toEqual({ sugestoes: {}, alavancasFracas: [] });
  });

  it("retorna fallback silencioso quando o JSON é válido mas tem formato inesperado", async () => {
    mockInvokeLLMResolve(JSON.stringify({ foo: "bar" }));

    const resultado = await gerarSugestaoIA({ historico: historicoFixture, rascunho: rascunhoFixture });

    expect(resultado).toEqual({ sugestoes: {}, alavancasFracas: [] });
  });

  it("não chama nenhuma função de leitura de planilha/escrita — só invokeLLM", async () => {
    const jsonValido = { sugestoes: {}, alavancasFracas: [] };
    mockInvokeLLMResolve(JSON.stringify(jsonValido));

    await gerarSugestaoIA({ historico: historicoFixture, rascunho: rascunhoFixture });

    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    expect(extrairGruposPorMesMock).not.toHaveBeenCalled();
  });

  it("chama invokeLLM com MODEL_DEEP e response_format json_schema", async () => {
    mockInvokeLLMResolve(JSON.stringify({ sugestoes: {}, alavancasFracas: [] }));

    await gerarSugestaoIA({ historico: historicoFixture, rascunho: rascunhoFixture });

    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    const callArgs = invokeLLMMock.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-sonnet-4-6");
    expect(callArgs.response_format.type).toBe("json_schema");
  });
});
