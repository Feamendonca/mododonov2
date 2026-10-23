import { getDb } from "./db";

async function exec(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Monta texto compacto com benchmarks internos da rede para injetar no prompt da IA.
 * Fontes:
 *   - Histórico da loja: dre_historico_mensal (últimos 6 meses)
 *   - Benchmarks: benchmarks_agregados (cascata: segmento → rede)
 * REGRA DE PRIVACIDADE: nunca toca linhas de outra loja diretamente.
 */
export async function getContextoBenchmarks(
  storeId: number,
  mesAlvo: string // "YYYY-MM"
): Promise<string> {
  try {
    // ── 1. Histórico da loja (dre_historico_mensal) ───────────────────────────
    const historicoRows = await exec(`
      SELECT ano_mes, faturamento, cmv, folha, custos_fixos, custos_variaveis, impostos, ebitda
      FROM dre_historico_mensal
      WHERE store_id = ? AND ano_mes < ?
      ORDER BY ano_mes DESC
      LIMIT 6
    `, [storeId, mesAlvo]) as {
      ano_mes: string; faturamento: number | null; cmv: number | null; folha: number | null;
      custos_fixos: number | null; custos_variaveis: number | null; impostos: number | null; ebitda: number | null;
    }[];

    // ── 2. Segmento da loja ───────────────────────────────────────────────────
    const storeRows = await exec(`SELECT segmento FROM stores WHERE id = ?`, [storeId]) as { segmento: string | null }[];
    const segmento = storeRows[0]?.segmento ?? null;

    // ── 3. Benchmarks: cascata segmento → rede ────────────────────────────────
    type BenchRow = { metrica: string; p25: number; mediana: number; p75: number; n_lojas: number; segmento: string };
    let benchRows: BenchRow[] = [];
    let grupoLabel = "";

    if (segmento) {
      const rows = await exec(`
        SELECT metrica, p25, mediana, p75, n_lojas, segmento
        FROM benchmarks_agregados
        WHERE segmento = ?
          AND ano_mes = (SELECT MAX(ano_mes) FROM benchmarks_agregados WHERE segmento = ? AND ano_mes < ?)
      `, [segmento, segmento, mesAlvo]) as BenchRow[];
      if (rows.length > 0) {
        benchRows = rows;
        grupoLabel = `${rows[0].n_lojas} lojas de ${segmento} da rede`;
      }
    }
    if (benchRows.length === 0) {
      const rows = await exec(`
        SELECT metrica, p25, mediana, p75, n_lojas, segmento
        FROM benchmarks_agregados
        WHERE segmento = 'rede'
          AND ano_mes = (SELECT MAX(ano_mes) FROM benchmarks_agregados WHERE segmento = 'rede' AND ano_mes < ?)
      `, [mesAlvo]) as BenchRow[];
      if (rows.length > 0) {
        benchRows = rows;
        grupoLabel = `${rows[0].n_lojas} lojas da rede (sem segmento específico suficiente)`;
      }
    }

    // ── 4. Montar texto ───────────────────────────────────────────────────────
    const lines: string[] = ["=== BENCHMARKS INTERNOS DA REDE ==="];

    // Histórico da loja
    if (historicoRows.length === 0) {
      lines.push("\n[HISTÓRICO DA LOJA]");
      lines.push("Primeira análise desta loja — sem histórico importado em dre_historico_mensal.");
      lines.push("Dica: importe a DRE histórica em /admin/carga-historica para enriquecer a análise.");
    } else {
      lines.push("\n[HISTÓRICO DA LOJA — últimos meses importados]");
      lines.push("Período    | Faturamento   | CMV%  | Folha% | EBITDA%");
      lines.push("-----------|---------------|-------|--------|--------");
      for (const row of historicoRows) {
        const fat = Number(row.faturamento ?? 0);
        const cmvPct = fat > 0 && row.cmv != null ? ((Number(row.cmv) / fat) * 100).toFixed(1) + "%" : "—";
        const folhaPct = fat > 0 && row.folha != null ? ((Number(row.folha) / fat) * 100).toFixed(1) + "%" : "—";
        const ebitdaPct = fat > 0 && row.ebitda != null ? ((Number(row.ebitda) / fat) * 100).toFixed(1) + "%" : "—";
        const fatFmt = fmtBRL(fat).padStart(13);
        lines.push(`${row.ano_mes}     | ${fatFmt} | ${cmvPct.padStart(5)} | ${folhaPct.padStart(6)} | ${ebitdaPct.padStart(7)}`);
      }
    }

    // Benchmarks
    if (benchRows.length === 0) {
      lines.push("\n[BENCHMARKS DA REDE]");
      lines.push("Sem benchmarks calculados. Execute o job em /admin/carga-historica após importar dados de ≥5 lojas.");
    } else {
      lines.push(`\n[BENCHMARKS DA REDE — comparado a ${grupoLabel}]`);
      const byMetrica: Record<string, BenchRow> = {};
      for (const r of benchRows) byMetrica[r.metrica] = r;

      const fmt = (r: BenchRow | undefined) =>
        r ? `P25=${(r.p25 * 100).toFixed(1)}% | mediana=${(r.mediana * 100).toFixed(1)}% | P75=${(r.p75 * 100).toFixed(1)}%` : "—";

      lines.push(`CMV%:        ${fmt(byMetrica["cmv_pct"])}`);
      lines.push(`Folha%:      ${fmt(byMetrica["folha_pct"])}`);
      lines.push(`EBITDA%:     ${fmt(byMetrica["ebitda_pct"])}`);
      lines.push(`CustosFixos%:${fmt(byMetrica["custos_fixos_pct"])}`);

      // Posição da loja vs benchmark
      const lojaAtual = historicoRows[0];
      if (lojaAtual) {
        const fat = Number(lojaAtual.faturamento ?? 0);
        if (fat > 0) {
          lines.push("\n[POSIÇÃO DA LOJA vs GRUPO DE COMPARAÇÃO]");
          const check = (val: number | null, bench: BenchRow | undefined, label: string) => {
            if (val == null || !bench || fat === 0) return;
            const pct = val / fat;
            const pos = pct > bench.p75 ? "quartil pior (acima do P75)" :
                        pct < bench.p25 ? "quartil melhor (abaixo do P25)" : "quartil médio";
            lines.push(`${label}: ${(pct * 100).toFixed(1)}% | mediana: ${(bench.mediana * 100).toFixed(1)}% | ${pos}`);
          };
          check(lojaAtual.cmv, byMetrica["cmv_pct"], "CMV");
          check(lojaAtual.folha, byMetrica["folha_pct"], "Folha");
          check(lojaAtual.ebitda, byMetrica["ebitda_pct"], "EBITDA");
        }
      }
    }

    lines.push("=== FIM DOS BENCHMARKS ===");
    const texto = lines.join("\n");
    console.log("[benchmarks] Contexto gerado:\n" + texto);
    return texto;
  } catch (err) {
    console.error("[benchmarks] Erro ao gerar contexto:", err);
    return "=== BENCHMARKS INTERNOS DA REDE ===\nErro ao carregar benchmarks — usando apenas dados da planilha.\n=== FIM DOS BENCHMARKS ===";
  }
}
