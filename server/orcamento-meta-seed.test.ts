/**
 * orcamento-meta-seed.test.ts
 * Testes unitários para a lógica de semear Meta do Mês + Medidas de Direção
 * a partir dos dados do orçamento aprovado.
 *
 * Cobre:
 *  1. Derivação correta de mes/ano a partir de periodoInicio
 *  2. Meta criada com valor_meta = receitaBruta e unidade "R$"
 *  3. 4 medidas criadas com indicadores/alvos corretos
 *  4. Idempotência: segunda chamada não cria duplicatas
 *  5. peso_remuneracao_pct = 0 em todas as medidas (D11 pendente)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./db-metas", () => ({
  createMeta: vi.fn(),
  createMedida: vi.fn(),
  listMetas: vi.fn(),
}));

import { createMeta, createMedida, listMetas } from "./db-metas";

// ─── Lógica pura extraída de gerarConteudoAposAprovacao (bloco 3) ─────────────
// Testamos a lógica isolada sem precisar do banco de dados.

interface OrcamentoMinimo {
  storeId: number;
  periodoInicio: string;
  receitaBruta: number;
}

interface CalcMinimo {
  cmv: number;
  ebitdaPct: number;
  colaboradores: number;
}

async function semeiarMetaEMedidas(
  orc: OrcamentoMinimo,
  calc: CalcMinimo
): Promise<{ metaId: number | null; medidasCriadas: number }> {
  const rb = orc.receitaBruta;
  const [anoStr, mesStr] = orc.periodoInicio.split("-");
  const anoNum = Number(anoStr);
  const mesNum = Number(mesStr);
  const mesAnoLabel = `${mesStr}/${anoStr}`;

  // Idempotência
  const metasExistentes = await listMetas(orc.storeId, mesNum, anoNum);
  if ((metasExistentes as any[]).length > 0) return { metaId: null, medidasCriadas: 0 };

  const metaId = await createMeta({
    lojaId: orc.storeId,
    mes: mesNum,
    ano: anoNum,
    titulo: `Meta do mês — ${mesAnoLabel}`,
    valorMeta: rb,
    unidade: "R$",
    descricao: `Meta de faturamento gerada automaticamente a partir do orçamento aprovado de ${mesAnoLabel}.`,
  }) as unknown as number;

  const cmvPctAlvo = rb > 0 ? (calc.cmv / rb) * 100 : 0;
  const ebitdaPctAlvo = calc.ebitdaPct * 100;
  const folhaPctAlvo = rb > 0 ? (calc.colaboradores / rb) * 100 : 0;

  const medidas = [
    { indicador: "cmv", metaValor: cmvPctAlvo, metaOperador: "lte" as const, unidade: "%", ordem: 1 },
    { indicador: "ebitda", metaValor: ebitdaPctAlvo, metaOperador: "gte" as const, unidade: "%", ordem: 2 },
    { indicador: "folha", metaValor: folhaPctAlvo, metaOperador: "lte" as const, unidade: "%", ordem: 3 },
    { indicador: "faturamento", metaValor: rb, metaOperador: "gte" as const, unidade: "R$", ordem: 4 },
  ];

  for (const m of medidas) {
    await createMedida({
      metaId,
      lojaId: orc.storeId,
      titulo: m.indicador,
      indicador: m.indicador,
      metaValor: m.metaValor,
      metaOperador: m.metaOperador,
      unidade: m.unidade,
      pesoRemuneracaoPct: 0, // peso definido quando a remuneração integrar medidas_direcao (ver D11)
      ordem: m.ordem,
    });
  }

  return { metaId, medidasCriadas: medidas.length };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORC: OrcamentoMinimo = {
  storeId: 1,
  periodoInicio: "2026-07-01",
  receitaBruta: 120000,
};

const CALC: CalcMinimo = {
  cmv: 36000,    // 30% de 120000
  ebitdaPct: 0.15, // 15%
  colaboradores: 30000, // 25%
};

beforeEach(() => {
  vi.clearAllMocks();
  (createMeta as any).mockResolvedValue(42);
  (createMedida as any).mockResolvedValue(1);
  (listMetas as any).mockResolvedValue([]); // padrão: sem metas existentes
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("semeiarMetaEMedidas — derivação de mes/ano", () => {
  it("extrai mes=7 e ano=2026 de periodoInicio '2026-07-01'", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMeta).toHaveBeenCalledWith(
      expect.objectContaining({ mes: 7, ano: 2026 })
    );
  });

  it("título da meta inclui mês/ano no formato MM/YYYY", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMeta).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: "Meta do mês — 07/2026" })
    );
  });
});

describe("semeiarMetaEMedidas — Meta do Mês (MIC)", () => {
  it("cria 1 meta com valor_meta = receitaBruta", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMeta).toHaveBeenCalledTimes(1);
    expect(createMeta).toHaveBeenCalledWith(
      expect.objectContaining({ valorMeta: 120000, unidade: "R$", lojaId: 1 })
    );
  });
});

describe("semeiarMetaEMedidas — 4 Medidas de Direção", () => {
  it("cria exatamente 4 medidas", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMedida).toHaveBeenCalledTimes(4);
  });

  it("medida CMV: indicador='cmv', operador='lte', unidade='%', alvo=30%", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMedida).toHaveBeenCalledWith(
      expect.objectContaining({
        indicador: "cmv",
        metaValor: 30,
        metaOperador: "lte",
        unidade: "%",
        ordem: 1,
      })
    );
  });

  it("medida EBITDA: indicador='ebitda', operador='gte', unidade='%', alvo=15%", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMedida).toHaveBeenCalledWith(
      expect.objectContaining({
        indicador: "ebitda",
        metaValor: 15,
        metaOperador: "gte",
        unidade: "%",
        ordem: 2,
      })
    );
  });

  it("medida Folha: indicador='folha', operador='lte', unidade='%', alvo=25%", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMedida).toHaveBeenCalledWith(
      expect.objectContaining({
        indicador: "folha",
        metaValor: 25,
        metaOperador: "lte",
        unidade: "%",
        ordem: 3,
      })
    );
  });

  it("medida Faturamento: indicador='faturamento', operador='gte', unidade='R$', alvo=120000", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMedida).toHaveBeenCalledWith(
      expect.objectContaining({
        indicador: "faturamento",
        metaValor: 120000,
        metaOperador: "gte",
        unidade: "R$",
        ordem: 4,
      })
    );
  });

  it("peso_remuneracao_pct = 0 em todas as medidas (D11 pendente)", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    const calls = (createMedida as any).mock.calls;
    for (const [data] of calls) {
      expect(data.pesoRemuneracaoPct).toBe(0);
    }
  });

  it("metaId passado para todas as medidas é o retornado por createMeta", async () => {
    await semeiarMetaEMedidas(ORC, CALC);
    const calls = (createMedida as any).mock.calls;
    for (const [data] of calls) {
      expect(data.metaId).toBe(42);
    }
  });
});

describe("semeiarMetaEMedidas — idempotência", () => {
  it("não cria meta nem medidas se já existe meta para storeId/mes/ano", async () => {
    (listMetas as any).mockResolvedValue([{ id: 10, titulo: "Meta existente" }]);
    const result = await semeiarMetaEMedidas(ORC, CALC);
    expect(createMeta).not.toHaveBeenCalled();
    expect(createMedida).not.toHaveBeenCalled();
    expect(result.metaId).toBeNull();
    expect(result.medidasCriadas).toBe(0);
  });

  it("segunda chamada com lista vazia cria normalmente", async () => {
    // Primeira chamada
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMeta).toHaveBeenCalledTimes(1);

    // Simula que agora já existe meta
    (listMetas as any).mockResolvedValue([{ id: 42 }]);
    vi.clearAllMocks();

    // Segunda chamada — não deve criar nada
    await semeiarMetaEMedidas(ORC, CALC);
    expect(createMeta).not.toHaveBeenCalled();
    expect(createMedida).not.toHaveBeenCalled();
  });
});
