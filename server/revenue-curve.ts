/**
 * revenue-curve.ts — Helpers para reduzir atrito no lançamento de receita por hora.
 *
 * Funcionalidades:
 *  1. CURVA_PADRAO: pesos por hora (restaurante food-court/aeroporto, picos almoço+jantar)
 *  2. distribuirPorCurva: distribui receita total do dia pelos pesos da curva
 *  3. parsePdvPaste: parseia texto colado do PDV ("hora;valor" ou "hora valor")
 */

// ─── Curva-padrão ─────────────────────────────────────────────────────────────

/**
 * Pesos relativos por hora (0–23).
 * Baseado em padrão de restaurante em aeroporto/mall com picos de almoço (11–14h) e jantar (18–21h).
 * Horas fora da operação têm peso 0 (não recebem receita estimada).
 * Configurável via store_people_config.revenueCurveWeights (JSON array de 24 números).
 */
export const CURVA_PADRAO: number[] = [
  0,    // 00h
  0,    // 01h
  0,    // 02h
  0,    // 03h
  0,    // 04h
  0,    // 05h
  0,    // 06h
  0.5,  // 07h — abertura suave
  1.0,  // 08h — café da manhã
  1.2,  // 09h
  1.5,  // 10h — pré-almoço
  2.5,  // 11h — início pico almoço
  3.5,  // 12h — pico almoço
  3.0,  // 13h — pico almoço
  2.0,  // 14h — pós-almoço
  1.2,  // 15h
  1.0,  // 16h
  1.5,  // 17h — pré-jantar
  2.5,  // 18h — início pico jantar
  3.0,  // 19h — pico jantar
  2.5,  // 20h — pico jantar
  1.5,  // 21h — pós-jantar
  0.8,  // 22h — fechamento
  0,    // 23h
];

export type HourRevenue = { hour: number; revenue: number; isEstimate?: boolean };

/**
 * Distribui a receita total do dia pelos pesos da curva.
 * Apenas as horas dentro do intervalo [startHour, endHour) recebem receita.
 * Retorna array de { hour, revenue, isEstimate: true }.
 */
export function distribuirPorCurva(
  totalRevenue: number,
  startHour: number,
  endHour: number,
  weights: number[] = CURVA_PADRAO
): HourRevenue[] {
  if (totalRevenue <= 0) return [];
  const result: HourRevenue[] = [];
  // Calcular soma dos pesos no intervalo de operação
  let somaAtiva = 0;
  for (let h = startHour; h < endHour; h++) {
    somaAtiva += weights[h] ?? 0;
  }
  if (somaAtiva === 0) {
    // Todos os pesos são 0 no intervalo — distribuir igualmente
    const perHour = totalRevenue / (endHour - startHour);
    for (let h = startHour; h < endHour; h++) {
      result.push({ hour: h, revenue: Math.round(perHour * 100) / 100, isEstimate: true });
    }
    return result;
  }
  // Distribuir proporcionalmente
  let acumulado = 0;
  for (let h = startHour; h < endHour; h++) {
    const peso = weights[h] ?? 0;
    if (peso === 0) {
      result.push({ hour: h, revenue: 0, isEstimate: true });
      continue;
    }
    const valor = Math.round((peso / somaAtiva) * totalRevenue * 100) / 100;
    acumulado += valor;
    result.push({ hour: h, revenue: valor, isEstimate: true });
  }
  // Ajustar arredondamento na última hora com peso > 0
  const diff = Math.round((totalRevenue - acumulado) * 100) / 100;
  if (diff !== 0) {
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].revenue > 0) {
        result[i].revenue = Math.round((result[i].revenue + diff) * 100) / 100;
        break;
      }
    }
  }
  return result;
}

/**
 * Parseia texto colado do PDV/ERP.
 * Formatos aceitos (um por linha):
 *   "12:00;350"   "12:00 350"   "12h;350"   "12;350"
 *   "12:00;R$ 1.250,50"   "12:00;1250.50"
 * Retorna array de { hour, revenue } para as horas reconhecidas.
 * Linhas não reconhecidas são silenciosamente ignoradas.
 */
export function parsePdvPaste(text: string): HourRevenue[] {
  const result: HourRevenue[] = [];
  const seen = new Set<number>();
  for (const rawLine of text.split(/[\n\r]+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Separar hora e valor (separadores: ; | tab | 2+ espaços)
    const parts = line.split(/[;|\t]|(?<=\d)\s{2,}|(?<=h)\s+/);
    if (parts.length < 2) {
      // Tentar separar por espaço simples: "12:00 350"
      const m = line.match(/^(\d{1,2}(?::\d{2})?h?)\s+(.+)$/);
      if (!m) continue;
      parts[0] = m[1];
      parts[1] = m[2];
    }
    const horaStr = parts[0].trim();
    const valorStr = parts[1].trim();
    // Parsear hora
    const horaMatch = horaStr.match(/^(\d{1,2})(?::(\d{2}))?h?$/);
    if (!horaMatch) continue;
    const hour = parseInt(horaMatch[1], 10);
    if (hour < 0 || hour > 23) continue;
    if (seen.has(hour)) continue;
    // Parsear valor (suporta pt-BR: "1.250,50", "R$ 1.250,50", "1250.50")
    const valorClean = valorStr
      .replace(/R\$\s*/gi, "")
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(?:[,.]|$))/g, "") // remove ponto de milhar
      .replace(",", ".");                       // vírgula decimal → ponto
    const revenue = parseFloat(valorClean);
    if (isNaN(revenue) || revenue < 0) continue;
    seen.add(hour);
    result.push({ hour, revenue });
  }
  return result;
}
