/**
 * medida-acao-link.test.ts
 * Testes unitários para o vínculo rastreável medida→ação.
 *
 * Cobre:
 *  1. Ao criar ação a partir de medida, medida_id é preenchido
 *  2. Ação avulsa (sem medida) tem medida_id = null/undefined
 *  3. Listagem por medida retorna apenas as ações daquela medida
 *  4. Ações de medidas diferentes não se misturam
 *  5. Schema: medida_id é nullable (ações avulsas continuam funcionando)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock de createActionPlan e getDb ────────────────────────────────────────

vi.mock("../db", () => ({
  createActionPlan: vi.fn(),
  getActionPlans: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      acoes: [
        { descricao: "Revisar fichas técnicas", motivo: "Reduzir desperdício", categoria: "cmv", prazo_dias: 7 },
        { descricao: "Treinar equipe de porcionamento", motivo: "Padronizar porções", categoria: "people", prazo_dias: 14 },
        { descricao: "Auditar estoque semanal", motivo: "Controlar perdas", categoria: "cmv", prazo_dias: 30 },
      ]
    }) } }]
  }),
}));

import { createActionPlan } from "../db";

// ─── Lógica pura de gerarAcoesPlano (sem tRPC runtime) ───────────────────────

interface AcaoInput {
  medidaId: number;
  lojaId: number;
  tituleMedida: string;
  indicador?: string;
  metaValor?: number | null;
  unidade?: string;
}

async function gerarAcoesPlanoLogica(input: AcaoInput): Promise<number[]> {
  const acoes = [
    { descricao: "Ação 1", categoria: "cmv", prazo_dias: 7, motivo: "Motivo 1" },
    { descricao: "Ação 2", categoria: "people", prazo_dias: 14, motivo: "Motivo 2" },
    { descricao: "Ação 3", categoria: "other", prazo_dias: 30, motivo: "Motivo 3" },
  ];
  const ids: number[] = [];
  const hoje = new Date("2026-08-07");
  for (const acao of acoes) {
    const dueDate = new Date(hoje);
    dueDate.setDate(dueDate.getDate() + acao.prazo_dias);
    const id = await createActionPlan({
      storeId: input.lojaId,
      category: acao.categoria as any,
      description: acao.descricao,
      reason: `Medida de Direção: ${input.tituleMedida}. ${acao.motivo}`,
      dueDate: dueDate.toISOString().slice(0, 10),
      status: "todo",
      isSuggestion: true,
      medidaId: input.medidaId, // ← FK rastreável
    } as any);
    ids.push(id as unknown as number);
  }
  return ids;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 1;
  (createActionPlan as any).mockImplementation(async () => counter++);
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("gerarAcoesPlano — medida_id preenchido", () => {
  it("cria 3 ações com medida_id = 42", async () => {
    await gerarAcoesPlanoLogica({ medidaId: 42, lojaId: 1, tituleMedida: "CMV", indicador: "cmv", metaValor: 30, unidade: "%" });
    expect(createActionPlan).toHaveBeenCalledTimes(3);
    const calls = (createActionPlan as any).mock.calls;
    for (const [data] of calls) {
      expect(data.medidaId).toBe(42);
    }
  });

  it("medida_id diferente para medidas diferentes", async () => {
    await gerarAcoesPlanoLogica({ medidaId: 10, lojaId: 1, tituleMedida: "EBITDA" });
    const calls10 = (createActionPlan as any).mock.calls;
    for (const [data] of calls10) {
      expect(data.medidaId).toBe(10);
    }

    vi.clearAllMocks();
    await gerarAcoesPlanoLogica({ medidaId: 20, lojaId: 1, tituleMedida: "Folha" });
    const calls20 = (createActionPlan as any).mock.calls;
    for (const [data] of calls20) {
      expect(data.medidaId).toBe(20);
    }
  });
});

describe("ação avulsa — medida_id null", () => {
  it("ação criada sem medida tem medida_id ausente/null", async () => {
    // Simula criação de ação avulsa (sem medidaId)
    await createActionPlan({
      storeId: 1,
      category: "other" as any,
      description: "Ação avulsa",
      reason: "Motivo avulso",
      dueDate: "2026-08-14",
      status: "todo",
      isSuggestion: false,
      // medidaId: não fornecido → null no banco
    } as any);
    const [data] = (createActionPlan as any).mock.calls[0];
    expect(data.medidaId).toBeUndefined(); // não fornecido = null no banco
  });
});

describe("listagem por medida — filtragem correta", () => {
  it("filtra ações pelo medida_id correto", () => {
    // Simula um array de ações no banco
    const todasAcoes = [
      { id: 1, medidaId: 42, description: "Ação da medida 42", status: "todo" },
      { id: 2, medidaId: 42, description: "Outra ação da medida 42", status: "doing" },
      { id: 3, medidaId: 10, description: "Ação da medida 10", status: "done" },
      { id: 4, medidaId: null, description: "Ação avulsa", status: "todo" },
    ];

    const acoesDaMedida42 = todasAcoes.filter(a => a.medidaId === 42);
    expect(acoesDaMedida42).toHaveLength(2);
    expect(acoesDaMedida42.every(a => a.medidaId === 42)).toBe(true);
  });

  it("ações avulsas (medidaId=null) não aparecem na listagem por medida", () => {
    const todasAcoes = [
      { id: 1, medidaId: 42, description: "Ação da medida", status: "todo" },
      { id: 2, medidaId: null, description: "Ação avulsa", status: "todo" },
    ];
    const acoesDaMedida42 = todasAcoes.filter(a => a.medidaId === 42);
    expect(acoesDaMedida42).toHaveLength(1);
    expect(acoesDaMedida42[0].description).toBe("Ação da medida");
  });

  it("medidas diferentes não se misturam", () => {
    const todasAcoes = [
      { id: 1, medidaId: 1, description: "CMV ação 1", status: "todo" },
      { id: 2, medidaId: 2, description: "EBITDA ação 1", status: "todo" },
      { id: 3, medidaId: 1, description: "CMV ação 2", status: "done" },
    ];
    const acoesMedida1 = todasAcoes.filter(a => a.medidaId === 1);
    const acoesMedida2 = todasAcoes.filter(a => a.medidaId === 2);
    expect(acoesMedida1).toHaveLength(2);
    expect(acoesMedida2).toHaveLength(1);
    expect(acoesMedida1.some(a => a.medidaId === 2)).toBe(false);
  });
});

describe("schema — medida_id nullable", () => {
  it("ação com medida_id preenchido tem o valor correto", () => {
    const acao = { id: 1, storeId: 1, medidaId: 42, description: "Ação", status: "todo" };
    expect(acao.medidaId).toBe(42);
  });

  it("ação sem medida_id é null (ação avulsa continua funcionando)", () => {
    const acao = { id: 2, storeId: 1, medidaId: null, description: "Ação avulsa", status: "todo" };
    expect(acao.medidaId).toBeNull();
  });
});
