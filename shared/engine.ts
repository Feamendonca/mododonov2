// ─── Modo Dono — MOTOR ÚNICO de nota e remuneração ────────────────────────────
// Fonte única da verdade para PLACAR e PAGAMENTO. Substitui:
//   • shared/calculations.ts → scoreResult/scoreCMV/scoreQuality/scoreTotal
//   • server/routers/remuneracao.ts → lógica do "calcular" (Sistema B)
// Origem: engine.py (motor de referência auditado, 30 testes) portado em 04/07/2026.
// Decisões de negócio pendentes ficam EXPLÍCITAS na Config (D1, D5) — mudar a
// decisão = mudar 1 campo, nunca reescrever lógica.
//
// REGRAS DE OURO DESTE MÓDULO:
// 1. Resultado compara EBITDA em R$ (realizado ÷ orçado) — nunca razão de margens %.
// 2. Orçado ≤ 0 NUNCA entra em notaResultado: loja em recuperação usa notaRampa.
// 3. Qualidade exige inputs explícitos — não existe default 85 aqui.
// 4. Gatilhos são da PESSOA no MÊS, não da loja.

export interface EngineConfig {
  // Resultado (EBITDA R$ realizado ÷ orçado)
  resultadoPiso: number;                 // abaixo disso → nota 0 (fração, ex 0.60)
  resultadoTeto: number;                 // 130
  /** D1 ✅ DECIDIDO 11/07/2026: "degrau" = ratio×100 (60%→60) — comportamento atual do app;
   *  "linear" = interpola 60%→0 … 100%→100. */
  resultadoRegua: "degrau" | "linear";
  // CMV / MIG (entradas em PONTOS PERCENTUAIS: 36 = 36%)
  cmvPtsPorPp: number;                   // ±20 pts por pp
  cmvPisoPp: number;                     // 3
  /** D5 ✅ DECIDIDO 11/07/2026: false = zera só ACIMA de 3pp (3,0pp exato ainda paga nota 40). */
  cmvPisoInclusivo: boolean;
  cmvTeto: number;                       // 130
  // Qualidade (sem acelerador)
  qualidadePesos: [number, number, number]; // voz do cliente, auditoria, checklist
  // Regra de corte (spec: componente abaixo de 50 não paga)
  corteComponente: number;               // 50
  // Pesos por papel
  pesosGestor: [number, number, number]; // resultado, cmv, qualidade = 0.40/0.35/0.25
  pesosLider: [number, number, number];  // migTurno, checklistTurno, resultadoLoja
  // Variável-alvo (% do salário fixo mensal)
  alvoGestorPctFixo: number;             // 0.40  (D9 ✅ DECIDIDO 11/07/2026)
  alvoLiderPctFixo: number;              // 0.22  (D9 ✅ DECIDIDO 11/07/2026)
}

export const DEFAULT_CONFIG: EngineConfig = {
  resultadoPiso: 0.6,
  resultadoTeto: 130,
  resultadoRegua: "degrau",   // D1 ✅ DECIDIDO 11/07/2026
  cmvPtsPorPp: 20,
  cmvPisoPp: 3,
  cmvPisoInclusivo: false,    // D5 ✅ DECIDIDO 11/07/2026: zera só ACIMA de 3pp (3,0pp exato ainda paga nota 40)
  cmvTeto: 130,
  qualidadePesos: [0.4, 0.35, 0.25],
  corteComponente: 50,
  pesosGestor: [0.4, 0.35, 0.25],
  pesosLider: [0.4, 0.35, 0.25],
  alvoGestorPctFixo: 0.40,   // D9 ✅ DECIDIDO 11/07/2026: 40% do fixo
  alvoLiderPctFixo: 0.22,    // D9 ✅ DECIDIDO 11/07/2026: 22% do fixo
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Arredonda para 2 casas decimais usando round half-up (padrão bancário BR).
 * Evita dízimas de ponto flutuante na fronteira do dinheiro.
 * Ex.: round2(636.3) → 636.30; round2(3000 * 0.22 * 0.965) → 635.10.
 * Exportado para uso em db-remuneracao.ts (upsertApuracao).
 */
export const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

// ─── Gatilhos de elegibilidade — DA PESSOA, POR MÊS ──────────────────────────
/** Nota mínima de avaliação de desempenho para elegibilidade ao variável (escala 0–10). */
export const AVALIACAO_MINIMA = 6.0;

export interface GatilhosPessoa {
  semFaltasInjustificadas: boolean;  // apurável pela escala (pessoas/staff_movements)
  avaliacaoDesempenho: number;       // escala 0–10; elegível se ≥ AVALIACAO_MINIMA (6.0)
  semSancoesDisciplinares: boolean;
}
export const elegivel = (g: GatilhosPessoa): boolean =>
  g.semFaltasInjustificadas && g.avaliacaoDesempenho >= AVALIACAO_MINIMA && g.semSancoesDisciplinares;

// ─── Componente: Resultado (EBITDA em R$) ─────────────────────────────────────
export function notaResultado(ebitdaRealRs: number, ebitdaOrcadoRs: number,
  cfg: EngineConfig = DEFAULT_CONFIG): number {
  if (ebitdaOrcadoRs <= 0) {
    throw new Error(
      "Orçado ≤ 0: use notaRampa (loja em recuperação). notaResultado com orçado " +
      "zero/negativo pagaria nota por destruir valor (bug crítico da auditoria).");
  }
  const ratio = ebitdaRealRs / ebitdaOrcadoRs;
  if (ratio < cfg.resultadoPiso) return 0;
  if (ratio <= 1) {
    return cfg.resultadoRegua === "linear"
      ? ((ratio - cfg.resultadoPiso) / (1 - cfg.resultadoPiso)) * 100
      : ratio * 100; // degrau (comportamento atual)
  }
  return clamp(100 + (ratio - 1) * 100, 0, cfg.resultadoTeto);
}

// ─── Componente: Rampa de recuperação (ex.: Café Cultura) ────────────────────
/** Nota = (realizado − base) / (alvo − base), em nota 0..teto. Aceita EBITDA em R$ ou % — coerentes entre si. */
export function notaRampa(realizado: number, base: number, alvo: number,
  cfg: EngineConfig = DEFAULT_CONFIG): number {
  if (alvo === base) throw new Error("Rampa inválida: alvo igual à base.");
  return clamp(((realizado - base) / (alvo - base)) * 100, 0, cfg.resultadoTeto);
}

// ─── Componente: CMV / MIG (pontos percentuais) ───────────────────────────────
export function notaCmv(cmvRealPp: number, cmvMetaPp: number,
  cfg: EngineConfig = DEFAULT_CONFIG): number {
  const deltaPp = cmvRealPp - cmvMetaPp; // positivo = pior
  const estourou = cfg.cmvPisoInclusivo ? deltaPp >= cfg.cmvPisoPp : deltaPp > cfg.cmvPisoPp;
  if (estourou) return 0;
  return clamp(100 - cfg.cmvPtsPorPp * deltaPp, 0, cfg.cmvTeto);
}

// ─── Componente: Qualidade — inputs OBRIGATÓRIOS, sem default ────────────────
export interface QualidadeInput {
  vozDoCliente: number;   // 0–100 (derivar de reviews/ocorrências — não digitar em paralelo)
  auditoria: number;      // 0–100 (franqueadora/auditoria interna)
  checklist: number;      // 0–100 (derivar de checklist_execucoes do mês)
  gateSanitarioOk: boolean; // false = autuação grave → Qualidade 0
}
export function notaQualidade(q: QualidadeInput, cfg: EngineConfig = DEFAULT_CONFIG): number {
  for (const [k, v] of Object.entries({ vozDoCliente: q.vozDoCliente, auditoria: q.auditoria, checklist: q.checklist })) {
    if (v == null || Number.isNaN(v)) throw new Error(`Qualidade sem apontamento: ${k}. Bloqueie a apuração — nunca use default.`);
  }
  if (!q.gateSanitarioOk) return 0;
  const [wv, wa, wc] = cfg.qualidadePesos;
  return clamp(wv * q.vozDoCliente + wa * q.auditoria + wc * q.checklist, 0, 100);
}

// ─── Nota total com regra de corte ────────────────────────────────────────────
const aplicaCorte = (n: number, cfg: EngineConfig) => (n < cfg.corteComponente ? 0 : n);
export function notaTotal(componentes: number[], pesos: number[],
  cfg: EngineConfig = DEFAULT_CONFIG): number {
  return componentes.reduce((s, n, i) => s + aplicaCorte(n, cfg) * pesos[i], 0);
}

// ─── Extratos ─────────────────────────────────────────────────────────────────
export interface Extrato {
  papel: "gestor" | "lider";
  fixoRs: number;
  elegivel: boolean;
  notas: Record<string, number>;
  notaTotal: number;
  variavelAlvoRs: number;
  variavelMesRs: number; // 0 se inelegível — mas as notas seguem visíveis no placar
}

export interface ResultadoInput {
  ebitdaRealRs?: number; ebitdaOrcadoRs?: number;                  // caminho normal
  rampa?: { realizado: number; base: number; alvo: number };       // loja em recuperação
}
function resolveResultado(r: ResultadoInput, cfg: EngineConfig): number {
  if (r.rampa) return notaRampa(r.rampa.realizado, r.rampa.base, r.rampa.alvo, cfg);
  if (r.ebitdaRealRs == null || r.ebitdaOrcadoRs == null)
    throw new Error("Resultado requer ebitdaRealRs+ebitdaOrcadoRs (R$) ou rampa.");
  return notaResultado(r.ebitdaRealRs, r.ebitdaOrcadoRs, cfg);
}

export function calculaGestor(args: {
  fixoRs: number; gatilhos: GatilhosPessoa;
  resultado: ResultadoInput;
  cmv: { realPp: number; metaPp: number };
  qualidade: QualidadeInput;
  cfg?: EngineConfig;
}): Extrato {
  const cfg = args.cfg ?? DEFAULT_CONFIG;
  const nRes = resolveResultado(args.resultado, cfg);
  const nCmv = notaCmv(args.cmv.realPp, args.cmv.metaPp, cfg);
  const nQua = notaQualidade(args.qualidade, cfg);
  const total = notaTotal([nRes, nCmv, nQua], cfg.pesosGestor, cfg);
  const alvo = args.fixoRs * cfg.alvoGestorPctFixo;
  const ok = elegivel(args.gatilhos);
  return { papel: "gestor", fixoRs: args.fixoRs, elegivel: ok,
    notas: { resultado: nRes, cmv: nCmv, qualidade: nQua },
    notaTotal: total, variavelAlvoRs: alvo, variavelMesRs: ok ? round2((alvo * total) / 100) : 0 };
}

export function calculaLider(args: {
  fixoRs: number; gatilhos: GatilhosPessoa;
  migTurno: { realPp: number; metaPp: number };   // mesma régua do CMV (D7)
  checklistTurno: number;                          // 0–100
  resultadoLoja: ResultadoInput;                   // mesma régua do Resultado (D8)
  cfg?: EngineConfig;
}): Extrato {
  const cfg = args.cfg ?? DEFAULT_CONFIG;
  const nMig = notaCmv(args.migTurno.realPp, args.migTurno.metaPp, cfg);
  const nChk = clamp(args.checklistTurno, 0, 100);
  const nRes = resolveResultado(args.resultadoLoja, cfg);
  const total = notaTotal([nMig, nChk, nRes], cfg.pesosLider, cfg);
  const alvo = args.fixoRs * cfg.alvoLiderPctFixo;
  const ok = elegivel(args.gatilhos);
  return { papel: "lider", fixoRs: args.fixoRs, elegivel: ok,
    notas: { migTurno: nMig, checklistTurno: nChk, resultadoLoja: nRes },
    notaTotal: total, variavelAlvoRs: alvo, variavelMesRs: ok ? round2((alvo * total) / 100) : 0 };
}
