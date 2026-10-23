// Testes do motor único — espelham test_engine.py (motor de referência auditado).
// Rodar: npm test  (vitest)
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG, notaResultado, notaRampa, notaCmv, notaQualidade,
  notaTotal, calculaGestor, calculaLider, elegivel, AVALIACAO_MINIMA,
} from "./engine";

// OK usa avaliação 7.0 — bem acima do limiar 6.0 (escala 0–10)
const OK = { semFaltasInjustificadas: true, avaliacaoDesempenho: 7.0, semSancoesDisciplinares: true };
const Q = { vozDoCliente: 100, auditoria: 100, checklist: 100, gateSanitarioOk: true };
const LINEAR = { ...DEFAULT_CONFIG, resultadoRegua: "linear" as const };
// D5 decidido: DEFAULT_CONFIG agora usa cmvPisoInclusivo: false (modo app)
// Para testar o comportamento spec (inclusivo), usar SPEC_CMV
const SPEC_CMV = { ...DEFAULT_CONFIG, cmvPisoInclusivo: true };

describe("Resultado (EBITDA R$)", () => {
  it("piso: abaixo de 60% → 0", () => expect(notaResultado(59, 100)).toBe(0));
  it("D1 degrau (default): 80% → 80; 60% → 60", () => {
    expect(notaResultado(80, 100)).toBe(80);
    expect(notaResultado(60, 100)).toBe(60);
  });
  it("D1 linear (opção): 80% → 50; 60% → 0", () => {
    expect(notaResultado(80, 100, LINEAR)).toBeCloseTo(50);
    expect(notaResultado(60, 100, LINEAR)).toBeCloseTo(0);
  });
  it("acelerador 1:1 e teto 130", () => {
    expect(notaResultado(115, 100)).toBeCloseTo(115);
    expect(notaResultado(180, 100)).toBe(130);
  });
  it("orçado ≤ 0 → ERRO explícito (bug crítico da auditoria)", () => {
    expect(() => notaResultado(0, 0)).toThrow();
    expect(() => notaResultado(-10, -16)).toThrow(); // NUNCA nota 62.5/125 por piorar
  });
});

describe("Rampa de recuperação (Café Cultura)", () => {
  it("meio do caminho: −16→−10, realizado −13 → 50", () => expect(notaRampa(-13, -16, -10)).toBeCloseTo(50));
  it("alvo batido → 100; superou → teto 130; PIOROU → 0", () => {
    expect(notaRampa(-10, -16, -10)).toBeCloseTo(100);
    expect(notaRampa(-2, -16, -10)).toBe(130);
    expect(notaRampa(-20, -16, -10)).toBe(0); // no app antigo isto dava 125!
  });
});

describe("CMV/MIG (pontos percentuais)", () => {
  it("na meta → 100; ±20pts/pp; teto 130", () => {
    expect(notaCmv(30, 30)).toBe(100);
    expect(notaCmv(31, 30)).toBeCloseTo(80);
    expect(notaCmv(29, 30)).toBeCloseTo(120);
    expect(notaCmv(25, 30)).toBe(130);
  });
  it("D5 ✅ DECIDIDO (default): 3pp exato → nota 40; só ACIMA de 3pp zera", () => {
    expect(notaCmv(38, 35)).toBeCloseTo(40);      // 3pp exato: paga
    expect(notaCmv(38.1, 35)).toBe(0);             // acima de 3pp: zera
  });
  it("D5 spec (inclusivo, para referência): exatamente 3pp pior → 0", () => {
    expect(notaCmv(38, 35, SPEC_CMV)).toBe(0);
  });
});

describe("Qualidade", () => {
  it("ponderação 40/35/25 sem acelerador", () =>
    expect(notaQualidade({ vozDoCliente: 90, auditoria: 80, checklist: 70, gateSanitarioOk: true })).toBeCloseTo(81.5));
  it("gate sanitário → 0", () => expect(notaQualidade({ ...Q, gateSanitarioOk: false })).toBe(0));
  it("sem apontamento → ERRO (fim do default 85)", () =>
    expect(() => notaQualidade({ vozDoCliente: NaN, auditoria: 80, checklist: 70, gateSanitarioOk: true })).toThrow());
});

describe("Corte e nota total", () => {
  it("componente <50 → 0 na média; 50 exato paga", () => {
    expect(notaTotal([49, 100, 80], DEFAULT_CONFIG.pesosGestor)).toBeCloseTo(0.35 * 100 + 0.25 * 80);
    expect(notaTotal([50, 100, 80], DEFAULT_CONFIG.pesosGestor)).toBeCloseTo(0.4 * 50 + 0.35 * 100 + 0.25 * 80);
  });
});

describe("Gatilhos (da pessoa, por mês)", () => {
  it("avaliação 5.9 (abaixo do limiar 6.0) bloqueia variável mas mantém notas visíveis", () => {
    const e = calculaGestor({ fixoRs: 6000, gatilhos: { ...OK, avaliacaoDesempenho: 5.9 },
      resultado: { ebitdaRealRs: 100, ebitdaOrcadoRs: 100 }, cmv: { realPp: 30, metaPp: 30 }, qualidade: Q });
    expect(e.variavelMesRs).toBe(0);
    expect(e.notaTotal).toBeGreaterThan(0);
    expect(elegivel(OK)).toBe(true);
  });

  it("AVALIACAO_MINIMA exportada é 6.0 (escala 0–10)", () => {
    expect(AVALIACAO_MINIMA).toBe(6.0);
  });

  it("caso-limite: avaliação 5.9 → INELEGÍVEL (variável = 0)", () => {
    const g59 = { ...OK, avaliacaoDesempenho: 5.9 };
    expect(elegivel(g59)).toBe(false);
    const e = calculaGestor({ fixoRs: 6000, gatilhos: g59,
      resultado: { ebitdaRealRs: 100, ebitdaOrcadoRs: 100 }, cmv: { realPp: 30, metaPp: 30 }, qualidade: Q });
    expect(e.variavelMesRs).toBe(0);
  });

  it("caso-limite: avaliação 6.0 → elegível (paga variável)", () => {
    const g60 = { ...OK, avaliacaoDesempenho: 6.0 };
    expect(elegivel(g60)).toBe(true);
    const e = calculaGestor({ fixoRs: 6000, gatilhos: g60,
      resultado: { ebitdaRealRs: 100, ebitdaOrcadoRs: 100 }, cmv: { realPp: 30, metaPp: 30 }, qualidade: Q });
    expect(e.variavelMesRs).toBeGreaterThan(0);
  });

  it("caso-limite: avaliação 7.5 → elegível (paga variável)", () => {
    const g75 = { ...OK, avaliacaoDesempenho: 7.5 };
    expect(elegivel(g75)).toBe(true);
    const e = calculaGestor({ fixoRs: 6000, gatilhos: g75,
      resultado: { ebitdaRealRs: 100, ebitdaOrcadoRs: 100 }, cmv: { realPp: 30, metaPp: 30 }, qualidade: Q });
    expect(e.variavelMesRs).toBeGreaterThan(0);
  });
});

describe("Extratos ponta a ponta", () => {
  it("gestor tudo na meta: nota 100 → variável = 40% do fixo (D9 ✅)", () => {
    const e = calculaGestor({ fixoRs: 6000, gatilhos: OK,
      resultado: { ebitdaRealRs: 100, ebitdaOrcadoRs: 100 }, cmv: { realPp: 30, metaPp: 30 }, qualidade: Q });
    expect(e.notaTotal).toBeCloseTo(100);
    expect(e.variavelMesRs).toBeCloseTo(2400); // 6000 * 0.40 * 100/100
  });
  it("teto prático = nota 122.5 → 49% do fixo (D9 ✅ 40%)", () => {
    const e = calculaGestor({ fixoRs: 6000, gatilhos: OK,
      resultado: { ebitdaRealRs: 200, ebitdaOrcadoRs: 100 }, cmv: { realPp: 25, metaPp: 30 }, qualidade: Q });
    expect(e.notaTotal).toBeCloseTo(0.4 * 130 + 0.35 * 130 + 0.25 * 100);
    expect(e.variavelMesRs).toBeCloseTo(6000 * 0.40 * 1.225); // R$ 2.940
  });
  it("Café Cultura no extrato via rampa", () => {
    const e = calculaGestor({ fixoRs: 4500, gatilhos: OK,
      resultado: { rampa: { realizado: -10, base: -16, alvo: -10 } },
      cmv: { realPp: 39, metaPp: 39 }, qualidade: { vozDoCliente: 80, auditoria: 85, checklist: 90, gateSanitarioOk: true } });
    expect(e.notas.resultado).toBeCloseTo(100);
  });
  it("líder de turno: MIG 40 / checklist 35 / resultado 25 → alvo 22% do fixo (D9 ✅)", () => {
    const e = calculaLider({ fixoRs: 3000, gatilhos: OK,
      migTurno: { realPp: 30, metaPp: 30 }, checklistTurno: 90,
      resultadoLoja: { ebitdaRealRs: 100, ebitdaOrcadoRs: 100 } });
    expect(e.notaTotal).toBeCloseTo(0.4 * 100 + 0.35 * 90 + 0.25 * 100);
    expect(e.variavelMesRs).toBeCloseTo(3000 * 0.22 * (96.5 / 100)); // R$ 636.90
  });
});
