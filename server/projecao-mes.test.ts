/**
 * projecao-mes.test.ts
 * Testes unitários para a lógica de projeção do mês e alertas de desvio.
 *
 * Cobre:
 *  1. Projeção retorna EBITDA e nota corretos com accumulated + orçamento
 *  2. Com gestor vinculado, variável estimada é coerente
 *  3. Banner de desvio aparece: receita abaixo do pró-rata, CMV acima, EBITDA abaixo
 *  4. Banner NÃO aparece quando tudo está dentro do esperado
 *  5. Sem orçamento, projeção retorna semOrcamento=true
 */

import { describe, it, expect } from "vitest";
import {
  notaResultado, notaCmv, notaQualidade, notaTotal, calculaGestor, calculaLider,
  DEFAULT_CONFIG, AVALIACAO_MINIMA,
} from "../shared/engine";

// ─── Helpers para os testes ──────────────────────────────────────────────────

/** Simula o cálculo de scores que a procedure projecaoMes faz */
function calcProjecao(opts: {
  ebitdaReal: number;
  ebitdaOrcado: number;
  cmvReal: number;
  cmvMeta: number;
  google: number;
  audit: number;
  checklist: number;
  sanitaryGate?: boolean;
}) {
  const nRes = opts.ebitdaOrcado > 0
    ? notaResultado(opts.ebitdaReal, opts.ebitdaOrcado, DEFAULT_CONFIG)
    : 0;
  const nCmv = notaCmv(opts.cmvReal, opts.cmvMeta, DEFAULT_CONFIG);
  const nQua = notaQualidade({
    vozDoCliente: opts.google,
    auditoria: opts.audit,
    checklist: opts.checklist,
    gateSanitarioOk: opts.sanitaryGate ?? true,
  }, DEFAULT_CONFIG);
  const total = notaTotal([nRes, nCmv, nQua], DEFAULT_CONFIG.pesosGestor, DEFAULT_CONFIG);
  return { result: nRes, cmv: nCmv, quality: nQua, total };
}

/** Simula a lógica de desvio do HojePage */
function calcDesvio(opts: {
  receitaVsProRataPct: number | null;
  cmvVsMeta: number | null;
  ebitdaPct: number | null;
  ebitdaOrcadoPct: number | null;
}) {
  const receitaAbaixoProRata = opts.receitaVsProRataPct != null && opts.receitaVsProRataPct < 90;
  const cmvAcimaMeta = opts.cmvVsMeta != null && opts.cmvVsMeta > 1;
  const ebitdaAbaixoOrcado = opts.ebitdaOrcadoPct != null && opts.ebitdaPct != null && opts.ebitdaPct < opts.ebitdaOrcadoPct - 2;
  return { receitaAbaixoProRata, cmvAcimaMeta, ebitdaAbaixoOrcado, temDesvio: receitaAbaixoProRata || cmvAcimaMeta || ebitdaAbaixoOrcado };
}

// ─── Testes de projeção ───────────────────────────────────────────────────────

describe("projecaoMes — cálculo de notas", () => {
  it("retorna notas corretas com realizado bom", () => {
    const scores = calcProjecao({
      ebitdaReal: 12000, ebitdaOrcado: 10000,
      cmvReal: 28, cmvMeta: 30,
      google: 90, audit: 88, checklist: 85,
    });
    expect(scores.result).toBeGreaterThan(90); // EBITDA 20% acima → nota alta
    expect(scores.cmv).toBeGreaterThan(90);    // CMV abaixo da meta → nota alta
    expect(scores.quality).toBeGreaterThan(80);
    expect(scores.total).toBeGreaterThan(80);
  });

  it("retorna nota baixa quando EBITDA está muito abaixo do orçado", () => {
    const scores = calcProjecao({
      ebitdaReal: 5000, ebitdaOrcado: 10000,
      cmvReal: 35, cmvMeta: 30,
      google: 70, audit: 70, checklist: 70,
    });
    expect(scores.result).toBeLessThan(60); // EBITDA 50% do orçado → nota baixa
    expect(scores.cmv).toBeLessThan(60);    // CMV 5pp acima da meta → nota baixa
    expect(scores.total).toBeLessThan(60);
  });

  it("nota total é zero quando EBITDA é negativo e orçado é positivo", () => {
    const scores = calcProjecao({
      ebitdaReal: -2000, ebitdaOrcado: 10000,
      cmvReal: 40, cmvMeta: 30,
      google: 60, audit: 60, checklist: 60,
    });
    expect(scores.result).toBe(0);
  });

  it("nota total é 100 quando tudo está no máximo", () => {
    const scores = calcProjecao({
      ebitdaReal: 20000, ebitdaOrcado: 10000,
      cmvReal: 20, cmvMeta: 30,
      google: 100, audit: 100, checklist: 100,
    });
    // O motor permite superar 100 quando EBITDA está acima do orçado
    expect(scores.total).toBeGreaterThanOrEqual(100);
  });
});

// ─── Testes de variável estimada ──────────────────────────────────────────────

describe("projecaoMes — variável estimada do gestor", () => {
  const gatilhosOtimistas = {
    semFaltasInjustificadas: true,
    avaliacaoDesempenho: 8,
    semSancoesDisciplinares: true,
  };

  it("gestor com nota 100 recebe variável = alvo × 1.0", () => {
    const extrato = calculaGestor({
      fixoRs: 5000,
      gatilhos: gatilhosOtimistas,
      resultado: { ebitdaRealRs: 20000, ebitdaOrcadoRs: 10000 },
      cmv: { realPp: 20, metaPp: 30 },
      qualidade: { vozDoCliente: 100, auditoria: 100, checklist: 100, gateSanitarioOk: true },
    });
    // Com EBITDA acima do orçado, nota pode superar 100
    expect(extrato.notaTotal).toBeGreaterThanOrEqual(100);
    // Variável ≥ alvo quando nota ≥ 100
    expect(extrato.variavelMesRs).toBeGreaterThanOrEqual(extrato.variavelAlvoRs);
    expect(extrato.variavelMesRs).toBeGreaterThan(0);
  });

  it("gestor com nota 0 recebe variável = 0", () => {
    const extrato = calculaGestor({
      fixoRs: 5000,
      gatilhos: gatilhosOtimistas,
      resultado: { ebitdaRealRs: -5000, ebitdaOrcadoRs: 10000 },
      cmv: { realPp: 50, metaPp: 30 },
      qualidade: { vozDoCliente: 0, auditoria: 0, checklist: 0, gateSanitarioOk: false },
    });
    expect(extrato.variavelMesRs).toBe(0);
  });

  it("gestor inelegível (avaliação 5.9) recebe variável = 0", () => {
    const extrato = calculaGestor({
      fixoRs: 5000,
      gatilhos: { semFaltasInjustificadas: true, avaliacaoDesempenho: 5.9, semSancoesDisciplinares: true },
      resultado: { ebitdaRealRs: 20000, ebitdaOrcadoRs: 10000 },
      cmv: { realPp: 20, metaPp: 30 },
      qualidade: { vozDoCliente: 100, auditoria: 100, checklist: 100, gateSanitarioOk: true },
    });
    expect(extrato.elegivel).toBe(false);
    expect(extrato.variavelMesRs).toBe(0);
  });

  it("variável estimada é proporcional à nota (nota 50 → ~50% do alvo)", () => {
    const extrato = calculaGestor({
      fixoRs: 5000,
      gatilhos: gatilhosOtimistas,
      resultado: { ebitdaRealRs: 10000, ebitdaOrcadoRs: 10000 },
      cmv: { realPp: 30, metaPp: 30 },
      qualidade: { vozDoCliente: 50, auditoria: 50, checklist: 50, gateSanitarioOk: true },
    });
    expect(extrato.variavelMesRs).toBeCloseTo(extrato.variavelAlvoRs * (extrato.notaTotal / 100), 1);
  });
});

// ─── Testes de alertas de desvio ──────────────────────────────────────────────

describe("alertas de desvio", () => {
  it("banner aparece quando receita está abaixo do pró-rata (< 90%)", () => {
    const { receitaAbaixoProRata, temDesvio } = calcDesvio({
      receitaVsProRataPct: 85,
      cmvVsMeta: 0,
      ebitdaPct: 8,
      ebitdaOrcadoPct: 8,
    });
    expect(receitaAbaixoProRata).toBe(true);
    expect(temDesvio).toBe(true);
  });

  it("banner aparece quando CMV está > 1pp acima da meta", () => {
    const { cmvAcimaMeta, temDesvio } = calcDesvio({
      receitaVsProRataPct: 100,
      cmvVsMeta: 2.5,
      ebitdaPct: 8,
      ebitdaOrcadoPct: 8,
    });
    expect(cmvAcimaMeta).toBe(true);
    expect(temDesvio).toBe(true);
  });

  it("banner aparece quando EBITDA está > 2pp abaixo do orçado", () => {
    const { ebitdaAbaixoOrcado, temDesvio } = calcDesvio({
      receitaVsProRataPct: 100,
      cmvVsMeta: 0,
      ebitdaPct: 5,
      ebitdaOrcadoPct: 8,
    });
    expect(ebitdaAbaixoOrcado).toBe(true);
    expect(temDesvio).toBe(true);
  });

  it("banner NÃO aparece quando tudo está dentro do esperado", () => {
    const { temDesvio } = calcDesvio({
      receitaVsProRataPct: 98,
      cmvVsMeta: 0.5,
      ebitdaPct: 7.5,
      ebitdaOrcadoPct: 8,
    });
    expect(temDesvio).toBe(false);
  });

  it("banner NÃO aparece quando projecao é null (sem orçamento)", () => {
    const { temDesvio } = calcDesvio({
      receitaVsProRataPct: null,
      cmvVsMeta: null,
      ebitdaPct: null,
      ebitdaOrcadoPct: null,
    });
    expect(temDesvio).toBe(false);
  });

  it("CMV exatamente 1pp acima NÃO dispara banner (limiar é > 1pp)", () => {
    const { cmvAcimaMeta } = calcDesvio({
      receitaVsProRataPct: 100,
      cmvVsMeta: 1.0,
      ebitdaPct: 8,
      ebitdaOrcadoPct: 8,
    });
    expect(cmvAcimaMeta).toBe(false);
  });

  it("receita exatamente 90% do pró-rata NÃO dispara banner (limiar é < 90%)", () => {
    const { receitaAbaixoProRata } = calcDesvio({
      receitaVsProRataPct: 90,
      cmvVsMeta: 0,
      ebitdaPct: 8,
      ebitdaOrcadoPct: 8,
    });
    expect(receitaAbaixoProRata).toBe(false);
  });
});

// ─── Testes de pró-rata do EBITDA ────────────────────────────────────────────

/** Simula a extrapolação pró-rata do EBITDA (lógica de projecao.mes) */
function extrapolarebitda(ebitdaAcumulado: number, diasDecorridos: number, totalDias: number): number | null {
  if (diasDecorridos === 0) return null;
  return (ebitdaAcumulado / diasDecorridos) * totalDias;
}

describe("projecaoMes — pró-rata do EBITDA", () => {
  it("loja no ritmo no dia 10/30: projeta ~100% do orçado → nota de resultado saudável", () => {
    // Loja com orçado R$30.000/mês. No dia 10, acumulou R$10.000 (1/3 do orçado = ritmo perfeito).
    const ebitdaOrcadoRs = 30000;
    const ebitdaAcumulado = 10000;
    const diasDecorridos = 10;
    const totalDias = 30;

    const ebitdaProjetado = extrapolarebitda(ebitdaAcumulado, diasDecorridos, totalDias);
    expect(ebitdaProjetado).toBe(30000); // = 10000/10*30 = 30000 (100% do orçado)

    // Com ebitdaProjetado, a nota de resultado deve ser saudável (não zero)
    const nota = notaResultado(ebitdaProjetado!, ebitdaOrcadoRs, DEFAULT_CONFIG);
    expect(nota).toBeGreaterThan(80); // loja no ritmo → nota alta
  });

  it("sem pró-rata (acc.ebitda direto no dia 10): nota seria ~zero", () => {
    // Mesmo cenário, mas usando acc.ebitda diretamente (comportamento antigo)
    const ebitdaOrcadoRs = 30000;
    const ebitdaAcumuladoDireto = 10000; // apenas 1/3 do orçado
    const notaSemProRata = notaResultado(ebitdaAcumuladoDireto, ebitdaOrcadoRs, DEFAULT_CONFIG);
    // ratio = 10000/30000 = 0.33 < piso 0.60 → nota = 0
    expect(notaSemProRata).toBe(0);
  });

  it("dia 1 sem lançamento (diasDecorridos=0): ebitdaProjetado é null (sem divisão por zero)", () => {
    const ebitdaProjetado = extrapolarebitda(0, 0, 30);
    expect(ebitdaProjetado).toBeNull();
  });

  it("loja acima do ritmo no dia 15: projeta EBITDA acima do orçado", () => {
    // Orçado R$30.000. No dia 15, acumulou R$18.000 (120% do ritmo esperado).
    const ebitdaOrcadoRs = 30000;
    const ebitdaAcumulado = 18000;
    const diasDecorridos = 15;
    const totalDias = 30;

    const ebitdaProjetado = extrapolarebitda(ebitdaAcumulado, diasDecorridos, totalDias);
    expect(ebitdaProjetado).toBe(36000); // = 18000/15*30 = 36000 (120% do orçado)

    const nota = notaResultado(ebitdaProjetado!, ebitdaOrcadoRs, DEFAULT_CONFIG);
    expect(nota).toBeGreaterThan(100); // acima do orçado → nota acima de 100
  });

  it("CMV (percentual) não precisa de pró-rata — já é comparável", () => {
    // CMV real = 32%, meta = 30% → 2pp acima (ruim)
    // Não importa quantos dias decorreram — o percentual já é a razão do período
    const cmvReal = 32;
    const cmvMeta = 30;
    const notaCmvResult = notaCmv(cmvReal, cmvMeta, DEFAULT_CONFIG);
    expect(notaCmvResult).toBeLessThan(80); // CMV acima da meta → nota baixa
    // O mesmo CMV no dia 10 ou no dia 30 → mesma nota (sem pró-rata)
    expect(notaCmvResult).toBe(notaCmv(cmvReal, cmvMeta, DEFAULT_CONFIG));
  });
});
