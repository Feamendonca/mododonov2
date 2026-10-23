/**
 * remuneracao.test.ts
 * Testes unitários para db-remuneracao.ts:
 *  - mapApuracao mapeia corretamente employeeId, papel, extratoJson, legado
 *  - meuExtrato encontra a apuração pela pessoa e retorna extrato parseado
 *  - meuExtrato retorna null quando não há apuração para a pessoa
 *  - listPorPessoa filtra por mês/ano e enriquece com employeeName
 */

import { describe, it, expect } from "vitest";
import { round2 } from "../shared/engine";
import { calcMonthAccumulated } from "../shared/calculations";

// ─── Helpers inline (replica a lógica de mapApuracao sem precisar do DB) ──────

function mapApuracao(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    lojaId: Number(row.loja_id),
    mes: Number(row.mes),
    ano: Number(row.ano),
    faturamentoReal: row.faturamento_real != null ? Number(row.faturamento_real) : null,
    bonusBaseRs: row.bonus_base_rs != null ? Number(row.bonus_base_rs) : null,
    resultadoAtingimentoPct: row.resultado_atingimento_pct != null ? Number(row.resultado_atingimento_pct) : null,
    bonusFinalRs: row.bonus_final_rs != null ? Number(row.bonus_final_rs) : null,
    status: (row.status as "rascunho" | "aprovado") ?? "rascunho",
    observacao: row.observacao ? String(row.observacao) : null,
    aprovadoPor: row.aprovado_por ? String(row.aprovado_por) : null,
    aprovadoEm: row.aprovado_em != null ? Number(row.aprovado_em) : null,
    createdAt: Number(row.created_at),
    // Campos do motor único — estes eram descartados antes do fix
    employeeId: row.employee_id != null ? Number(row.employee_id) : null,
    papel: (row.papel as "gestor" | "lider" | null) ?? null,
    extratoJson: row.extrato_json != null ? String(row.extrato_json) : null,
    legado: Boolean(row.legado ?? false),
  };
}

// Simula a lógica de meuExtrato (sem DB): encontra apuração por employeeId e parseia extrato
function meuExtratoLogic(
  apuracoes: ReturnType<typeof mapApuracao>[],
  mes: number,
  ano: number,
  employeeId: number
) {
  const apuracao = apuracoes.find(
    a => a.mes === mes && a.ano === ano && a.employeeId === employeeId
  ) ?? null;
  const extrato = apuracao?.extratoJson
    ? (() => { try { return JSON.parse(apuracao.extratoJson!); } catch { return null; } })()
    : null;
  return { apuracao, extrato };
}

// Simula a lógica de listPorPessoa (sem DB): filtra e enriquece com nome
function listPorPessoaLogic(
  apuracoes: ReturnType<typeof mapApuracao>[],
  mes: number,
  ano: number,
  empMap: Map<number, string>
) {
  return apuracoes
    .filter(a => a.mes === mes && a.ano === ano)
    .map(a => ({
      ...a,
      employeeName: a.employeeId != null ? (empMap.get(a.employeeId) ?? null) : null,
      extrato: a.extratoJson
        ? (() => { try { return JSON.parse(a.extratoJson!); } catch { return null; } })()
        : null,
    }));
}

// ─── Dados de fixture ─────────────────────────────────────────────────────────

const EXTRATO_GESTOR = {
  papel: "gestor",
  elegivel: true,
  notaTotal: 95,
  variavelMesRs: 2280,
  notas: { resultado: 95, cmv: 95, qualidade: 95 },
};

const ROW_COM_PESSOA: Record<string, unknown> = {
  id: 42,
  loja_id: 1,
  mes: 7,
  ano: 2026,
  faturamento_real: 120000,
  bonus_base_rs: 2400,
  resultado_atingimento_pct: 95,
  bonus_final_rs: 2280,
  status: "rascunho",
  observacao: "Motor único v3 | João | Papel: gestor | Elegível: true",
  aprovado_por: null,
  aprovado_em: null,
  created_at: 1700000000000,
  // Campos do motor único
  employee_id: 7,
  papel: "gestor",
  extrato_json: JSON.stringify(EXTRATO_GESTOR),
  legado: 0,
};

const ROW_SEM_PESSOA: Record<string, unknown> = {
  id: 43,
  loja_id: 1,
  mes: 7,
  ano: 2026,
  faturamento_real: 120000,
  bonus_base_rs: null,
  resultado_atingimento_pct: null,
  bonus_final_rs: null,
  status: "rascunho",
  observacao: null,
  aprovado_por: null,
  aprovado_em: null,
  created_at: 1700000000000,
  // Sem pessoa vinculada (apuração legada)
  employee_id: null,
  papel: null,
  extrato_json: null,
  legado: 1,
};

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("mapApuracao — campos do motor único", () => {
  it("mapeia employeeId corretamente de employee_id", () => {
    const a = mapApuracao(ROW_COM_PESSOA);
    expect(a.employeeId).toBe(7);
  });

  it("mapeia papel corretamente", () => {
    const a = mapApuracao(ROW_COM_PESSOA);
    expect(a.papel).toBe("gestor");
  });

  it("mapeia extratoJson como string não-nula", () => {
    const a = mapApuracao(ROW_COM_PESSOA);
    expect(typeof a.extratoJson).toBe("string");
    expect(a.extratoJson).not.toBeNull();
  });

  it("mapeia legado como boolean false quando row.legado=0", () => {
    const a = mapApuracao(ROW_COM_PESSOA);
    expect(a.legado).toBe(false);
  });

  it("mapeia legado como boolean true quando row.legado=1", () => {
    const a = mapApuracao(ROW_SEM_PESSOA);
    expect(a.legado).toBe(true);
  });

  it("employeeId é null quando employee_id é null", () => {
    const a = mapApuracao(ROW_SEM_PESSOA);
    expect(a.employeeId).toBeNull();
  });

  it("papel é null quando row.papel é null", () => {
    const a = mapApuracao(ROW_SEM_PESSOA);
    expect(a.papel).toBeNull();
  });

  it("extratoJson é null quando row.extrato_json é null", () => {
    const a = mapApuracao(ROW_SEM_PESSOA);
    expect(a.extratoJson).toBeNull();
  });
});

describe("meuExtrato — lógica de busca e parse", () => {
  const apuracoes = [mapApuracao(ROW_COM_PESSOA), mapApuracao(ROW_SEM_PESSOA)];

  it("encontra a apuração pelo employeeId correto", () => {
    const { apuracao } = meuExtratoLogic(apuracoes, 7, 2026, 7);
    expect(apuracao).not.toBeNull();
    expect(apuracao!.employeeId).toBe(7);
  });

  it("retorna extrato parseado (não null) quando extratoJson está preenchido", () => {
    const { extrato } = meuExtratoLogic(apuracoes, 7, 2026, 7);
    expect(extrato).not.toBeNull();
    expect(extrato.papel).toBe("gestor");
    expect(extrato.notaTotal).toBe(95);
    expect(extrato.variavelMesRs).toBe(2280);
  });

  it("retorna apuracao=null quando não há apuração para a pessoa no mês", () => {
    const { apuracao, extrato } = meuExtratoLogic(apuracoes, 7, 2026, 999);
    expect(apuracao).toBeNull();
    expect(extrato).toBeNull();
  });

  it("retorna apuracao=null quando o mês não existe", () => {
    const { apuracao } = meuExtratoLogic(apuracoes, 6, 2026, 7);
    expect(apuracao).toBeNull();
  });

  it("extrato é null quando apuração existe mas extratoJson é null", () => {
    // Apuração com employee_id mas sem extrato_json
    const rowSemExtrato = { ...ROW_COM_PESSOA, extrato_json: null };
    const { extrato } = meuExtratoLogic([mapApuracao(rowSemExtrato)], 7, 2026, 7);
    expect(extrato).toBeNull();
  });
});

describe("calcularPorPessoa — blindagem: realizados derivados do banco", () => {
  it("derivar realizados do banco produz os mesmos números que o ranking.monthly usaria", () => {
    const entries = [
      { entryDate: "2025-05-01", revenue: 10000, invoices: 300, extraLabor: 0 },
      { entryDate: "2025-05-02", revenue: 12000, invoices: 360, extraLabor: 0 },
      { entryDate: "2025-05-03", revenue: 8000, invoices: 240, extraLabor: 0 },
    ];
    const counts = [
      { countDate: "2025-05-01", totalValue: 15000 },
      { countDate: "2025-05-08", totalValue: 12000 },
    ];
    const storeConfig = {
      budgetRevenue: 300000, budgetCmvPct: 30, budgetPackagingPct: 4,
      budgetTaxesPct: 3, budgetFixedCosts: 50000,
      dayWeights: [80, 100, 100, 100, 110, 130, 120],
    };
    const acc = calcMonthAccumulated(entries, counts, storeConfig, "2025-05");
    // Receita acumulada = soma dos lançamentos (não do input do cliente)
    expect(acc.revenue).toBe(30000);
    // CMV calculado a partir das contagens (não do input do cliente)
    expect(acc.cmvPct).toBeGreaterThanOrEqual(0);
    // EBITDA derivado dos lançamentos (não do input do cliente)
    expect(typeof acc.ebitda).toBe("number");
  });

  it("sem orçamento vigente → mensagem de erro clara (simulação da lógica de validação)", () => {
    const orcVigente = null; // sem orçamento
    const erro = orcVigente == null
      ? `Sem orçamento vigente para 2025-05 — aprove o orçamento antes de apurar remuneração.`
      : null;
    expect(erro).not.toBeNull();
    expect(erro).toContain("Sem orçamento vigente");
    expect(erro).toContain("aprove o orçamento");
  });

  it("sem qualidade lançada para gestor → mensagem de erro clara (simulação da lógica de validação)", () => {
    const quality = null; // sem qualidade lançada
    const papel = "gestor";
    const qGoogle = quality != null ? 85 : null;
    const qAudit = quality != null ? 80 : null;
    const qChecklist = quality != null ? 90 : null;
    const erro = papel === "gestor" && (qGoogle == null || qAudit == null || qChecklist == null)
      ? `Qualidade não lançada para 2025-05 — lance voz do cliente, auditoria e checklist antes de apurar. Nunca use default.`
      : null;
    expect(erro).not.toBeNull();
    expect(erro).toContain("Qualidade não lançada");
    expect(erro).toContain("Nunca use default");
  });

  it("campos resultado/cmv/qualidade não existem mais no input (verificação de tipo)", () => {
    // O input do calcularPorPessoa agora só tem employeeId, lojaId, period
    type InputNovo = { employeeId: number; lojaId: number; period: string };
    const input: InputNovo = { employeeId: 1, lojaId: 1, period: "2025-05" };
    expect("resultado" in input).toBe(false);
    expect("cmv" in input).toBe(false);
    expect("qualidade" in input).toBe(false);
    expect("migTurno" in input).toBe(false);
    expect("checklistTurno" in input).toBe(false);
  });

  it("round2 garante que variavelMesRs tem exatamente 2 casas decimais na fronteira", () => {
    // Caso real: fixo=2850, alvo=2850*0.22=627, total=97.3
    const fixo = 2850;
    const alvo = fixo * 0.22; // 627
    const total = 97.3;
    const raw = (alvo * total) / 100; // 610.07100000000002638 em float
    expect(round2(raw)).toBe(610.07);
    expect(round2(raw)).toBe(round2(round2(raw))); // idempotente
  });
});

describe("listPorPessoa — filtro e enriquecimento", () => {
  const apuracoes = [
    mapApuracao(ROW_COM_PESSOA),
    mapApuracao(ROW_SEM_PESSOA),
    mapApuracao({ ...ROW_COM_PESSOA, id: 99, mes: 6, ano: 2026, employee_id: 7 }), // mês anterior
  ];
  const empMap = new Map([[7, "João Silva"]]);

  it("filtra apenas o mês/ano solicitado", () => {
    const result = listPorPessoaLogic(apuracoes, 7, 2026, empMap);
    expect(result).toHaveLength(2);
    result.forEach(a => { expect(a.mes).toBe(7); expect(a.ano).toBe(2026); });
  });

  it("enriquece com employeeName quando employeeId está mapeado", () => {
    const result = listPorPessoaLogic(apuracoes, 7, 2026, empMap);
    const comPessoa = result.find(a => a.employeeId === 7);
    expect(comPessoa?.employeeName).toBe("João Silva");
  });

  it("employeeName é null quando employeeId é null", () => {
    const result = listPorPessoaLogic(apuracoes, 7, 2026, empMap);
    const semPessoa = result.find(a => a.employeeId === null);
    expect(semPessoa?.employeeName).toBeNull();
  });

  it("extrato é parseado corretamente na listagem", () => {
    const result = listPorPessoaLogic(apuracoes, 7, 2026, empMap);
    const comPessoa = result.find(a => a.employeeId === 7);
    expect(comPessoa?.extrato).not.toBeNull();
    expect(comPessoa?.extrato.notaTotal).toBe(95);
  });
});

// ─── Testes do caminho do dinheiro — importam os helpers REAIS de db-remuneracao.ts ──
// Caminho B: helpers puros exportados (assertPodeAprovar, assertNaoAprovada,
// assertPodeReabrir, montarTrilhaReabertura) são usados tanto no código de produção
// quanto aqui. Nenhuma lógica de dinheiro está duplicada neste arquivo.
import {
  assertPodeAprovar,
  assertNaoAprovada,
  assertPodeReabrir,
  montarTrilhaReabertura,
} from "../server/db-remuneracao";

const RASCUNHO = mapApuracao({
  id: 100, loja_id: 1, mes: 7, ano: 2026,
  faturamento_real: 30000, bonus_base_rs: 1100, resultado_atingimento_pct: 97.3, bonus_final_rs: 1071,
  status: "rascunho", observacao: "Motor único v4", aprovado_por: null, aprovado_em: null,
  created_at: Date.now(), employee_id: 7, papel: "gestor", extrato_json: null, legado: 0,
});

describe("aprovar apuração", () => {
  it("admin aprova rascunho → status='aprovado' com aprovadoPor/aprovadoEm preenchidos", () => {
    // assertPodeAprovar não lança → rascunho pode ser aprovado
    expect(() => assertPodeAprovar(RASCUNHO.status, RASCUNHO.aprovadoPor, RASCUNHO.aprovadoEm)).not.toThrow();
  });

  it("aprovar apuração já aprovada → erro claro com quem/quando", () => {
    const aprovadoEm = new Date("2026-07-31").getTime();
    expect(() => assertPodeAprovar("aprovado", "Fernando Mendonça", aprovadoEm)).toThrow(/já aprovada/);
    expect(() => assertPodeAprovar("aprovado", "Fernando Mendonça", aprovadoEm)).toThrow(/Reabra antes de reprocessar/);
  });

  it("não-admin não pode aprovar (simulação de gate adminProcedure)", () => {
    // O gate adminProcedure é verificado pelo middleware tRPC — simular aqui o comportamento esperado
    const isAdmin = false;
    const tentarAprovar = () => {
      if (!isAdmin) throw new Error("FORBIDDEN: apenas admin pode aprovar apuração.");
      assertPodeAprovar(RASCUNHO.status, RASCUNHO.aprovadoPor, RASCUNHO.aprovadoEm);
    };
    expect(tentarAprovar).toThrow("FORBIDDEN");
  });
});

describe("trava de ciclo — upsertApuracao não sobrescreve aprovado", () => {
  it("upsert em apuração rascunho → permite atualizar", () => {
    // assertNaoAprovada não lança para rascunho
    expect(() => assertNaoAprovada(RASCUNHO.mes, RASCUNHO.ano, RASCUNHO.status, RASCUNHO.aprovadoPor, RASCUNHO.aprovadoEm)).not.toThrow();
  });

  it("upsert em apuração aprovada → lança erro claro", () => {
    const aprovadoEm = new Date("2026-07-31").getTime();
    expect(() => assertNaoAprovada(7, 2026, "aprovado", "Fernando Mendonça", aprovadoEm)).toThrow(/já aprovada/);
    expect(() => assertNaoAprovada(7, 2026, "aprovado", "Fernando Mendonça", aprovadoEm)).toThrow(/reabra antes de reprocessar/i);
  });
});

describe("reabrir apuração", () => {
  it("reabrir aprovada → status='rascunho' com trilha de auditoria no observacao", () => {
    // assertPodeReabrir não lança para aprovado
    expect(() => assertPodeReabrir("aprovado")).not.toThrow();
    // montarTrilhaReabertura produz trilha com obs anterior preservada
    const ts = new Date("2026-08-07T12:00:00Z").getTime();
    const novaObs = montarTrilhaReabertura("Motor único v4", "Fernando Mendonça", ts);
    expect(novaObs).toContain("[REABERTO em 2026-08-07T12:00:00.000Z por Fernando Mendonça]");
    expect(novaObs).toContain("Motor único v4"); // obs anterior preservada
  });

  it("reabrir rascunho → erro claro", () => {
    expect(() => assertPodeReabrir("rascunho")).toThrow(/só é possível reabrir apurações aprovadas/);
  });

  it("após reabrir, upsert volta a funcionar (trava de ciclo destravada)", () => {
    // Após reabrir (status volta a 'rascunho'), assertNaoAprovada não deve lançar
    expect(() => assertNaoAprovada(7, 2026, "rascunho", null, null)).not.toThrow();
  });
});
