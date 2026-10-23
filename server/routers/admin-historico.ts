import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { extractDreHistorico } from "../sheet-parser";

async function exec(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

/** Upsert de um mês no histórico */
async function upsertHistorico(
  storeId: number,
  anoMes: string,
  data: {
    faturamento: number | null; cmv: number | null; folha: number | null;
    custosFixos: number | null; custosVariaveis: number | null;
    impostos: number | null; ebitda: number | null;
  },
  fonte: "importado" | "dre_viva" = "importado"
): Promise<void> {
  const now = Date.now();
  await exec(`
    INSERT INTO dre_historico_mensal
      (store_id, ano_mes, faturamento, cmv, folha, custos_fixos, custos_variaveis, impostos, ebitda, fonte, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      faturamento = VALUES(faturamento), cmv = VALUES(cmv), folha = VALUES(folha),
      custos_fixos = VALUES(custos_fixos), custos_variaveis = VALUES(custos_variaveis),
      impostos = VALUES(impostos), ebitda = VALUES(ebitda),
      fonte = VALUES(fonte), updatedAt = VALUES(updatedAt)
  `, [storeId, anoMes, data.faturamento, data.cmv, data.folha, data.custosFixos,
      data.custosVariaveis, data.impostos, data.ebitda, fonte, now, now]);
}

/** Calcula percentil de um array de números */
function percentil(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export const adminHistoricoRouter = router({
  /** Extrai prévia do histórico sem gravar (para confirmação na UI) */
  previa: adminProcedure
    .input(z.object({
      storeId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buf = Buffer.from(input.fileBase64, "base64");
      const result = extractDreHistorico(buf, input.fileName);
      return {
        meses: result.meses,
        abaSelecionada: result.abaSelecionada,
        ignorados: result.ignorados,
        aviso: result.aviso,
      };
    }),

  /** Importa histórico completo de uma planilha para dre_historico_mensal */
  importar: adminProcedure
    .input(z.object({
      storeId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buf = Buffer.from(input.fileBase64, "base64");
      const result = extractDreHistorico(buf, input.fileName);

      if (result.aviso && result.meses.length === 0) {
        throw new Error(result.aviso ?? "Não foi possível extrair dados da planilha.");
      }

      let importados = 0;
      const mesesImportados: string[] = [];

      for (const mes of result.meses) {
        await upsertHistorico(input.storeId, mes.anoMes, {
          faturamento: mes.faturamento, cmv: mes.cmv, folha: mes.folha,
          custosFixos: mes.custosFixos, custosVariaveis: mes.custosVariaveis,
          impostos: mes.impostos, ebitda: mes.ebitda,
        });
        importados++;
        mesesImportados.push(mes.anoMes);
      }

      const resumo = importados > 0
        ? `Importados ${importados} meses: ${mesesImportados.join(", ")}; ignorados ${result.ignorados} meses zerados.`
        : `Nenhum mês importado. ${result.aviso ?? ""}`;

      console.log(`[adminImportarHistorico] storeId=${input.storeId}: ${resumo}`);
      return { importados, ignorados: result.ignorados, mesesImportados, resumo, abaSelecionada: result.abaSelecionada };
    }),

  /** Gera benchmarks agregados por segmento/rede para um mês */
  gerarBenchmarks: adminProcedure
    .input(z.object({ anoMes: z.string() }))
    .mutation(async ({ input }) => {
      const { anoMes } = input;
      const MIN_LOJAS = 3; // Piloto pequeno: mínimo 3 lojas (rótulo honesto "amostra preliminar")

      // Buscar dados do histórico + segmento da loja
      const rows = await exec(`
        SELECT h.store_id, s.segmento,
          h.faturamento, h.cmv, h.folha, h.custos_fixos, h.custos_variaveis, h.ebitda
        FROM dre_historico_mensal h
        JOIN stores s ON s.id = h.store_id
        WHERE h.ano_mes = ? AND h.faturamento > 0
      `, [anoMes]) as {
        store_id: number; segmento: string | null;
        faturamento: number; cmv: number | null; folha: number | null;
        custos_fixos: number | null; custos_variaveis: number | null; ebitda: number | null;
      }[];

      if (rows.length === 0) {
        return { gravados: 0, ignorados: 0, relatorio: [`Nenhum dado em dre_historico_mensal para ${anoMes}.`] };
      }

      // Agrupar por segmento e rede
      type Grupo = { cmv: number[]; folha: number[]; ebitda: number[]; custosFixos: number[] };
      const bySegmento: Record<string, Grupo> = {};
      const rede: Grupo = { cmv: [], folha: [], ebitda: [], custosFixos: [] };

      for (const r of rows) {
        const fat = Number(r.faturamento);
        if (fat <= 0) continue;
        const cmvPct = r.cmv != null ? Number(r.cmv) / fat : null;
        const folhaPct = r.folha != null ? Number(r.folha) / fat : null;
        const ebitdaPct = r.ebitda != null ? Number(r.ebitda) / fat : null;
        const fixosPct = r.custos_fixos != null ? Number(r.custos_fixos) / fat : null;

        if (cmvPct != null) rede.cmv.push(cmvPct);
        if (folhaPct != null) rede.folha.push(folhaPct);
        if (ebitdaPct != null) rede.ebitda.push(ebitdaPct);
        if (fixosPct != null) rede.custosFixos.push(fixosPct);

        if (r.segmento) {
          if (!bySegmento[r.segmento]) bySegmento[r.segmento] = { cmv: [], folha: [], ebitda: [], custosFixos: [] };
          if (cmvPct != null) bySegmento[r.segmento].cmv.push(cmvPct);
          if (folhaPct != null) bySegmento[r.segmento].folha.push(folhaPct);
          if (ebitdaPct != null) bySegmento[r.segmento].ebitda.push(ebitdaPct);
          if (fixosPct != null) bySegmento[r.segmento].custosFixos.push(fixosPct);
        }
      }

      const now = Date.now();
      let gravados = 0;
      let ignorados = 0;
      const relatorio: string[] = [];

      const upsertBench = async (segmento: string, metrica: string, values: number[]) => {
        const n = values.length;
        if (n < MIN_LOJAS) {
          relatorio.push(`  [IGNORADO] ${segmento}/${metrica}: n=${n} < ${MIN_LOJAS}`);
          ignorados++;
          return;
        }
        const sorted = [...values].sort((a, b) => a - b);
        const p25 = percentil(sorted, 0.25);
        const mediana = percentil(sorted, 0.5);
        const p75 = percentil(sorted, 0.75);
        await exec(`
          -- n_lojas < 5 = amostra preliminar (rótulo honesto para piloto)
          INSERT INTO benchmarks_agregados (segmento, ano_mes, metrica, p25, mediana, p75, n_lojas, gerado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE p25=VALUES(p25), mediana=VALUES(mediana), p75=VALUES(p75), n_lojas=VALUES(n_lojas), gerado_em=VALUES(gerado_em)
        `, [segmento, anoMes, metrica, p25, mediana, p75, n, now]);
        relatorio.push(`  [GRAVADO] ${segmento}/${metrica}: n=${n}, mediana=${(mediana * 100).toFixed(1)}%`);
        gravados++;
      };

      // Rede
      await upsertBench("rede", "cmv_pct", rede.cmv);
      await upsertBench("rede", "folha_pct", rede.folha);
      await upsertBench("rede", "ebitda_pct", rede.ebitda);
      await upsertBench("rede", "custos_fixos_pct", rede.custosFixos);

      // Segmentos
      for (const [seg, grupo] of Object.entries(bySegmento)) {
        await upsertBench(seg, "cmv_pct", grupo.cmv);
        await upsertBench(seg, "folha_pct", grupo.folha);
        await upsertBench(seg, "ebitda_pct", grupo.ebitda);
        await upsertBench(seg, "custos_fixos_pct", grupo.custosFixos);
      }

      console.log(`[adminGerarBenchmarks] ${anoMes}:\n` + relatorio.join("\n"));
      return { gravados, ignorados, relatorio };
    }),

  /** Lista histórico de uma loja */
  listarHistorico: adminProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const rows = await exec(`
        SELECT ano_mes, faturamento, cmv, folha, custos_fixos, custos_variaveis, impostos, ebitda, fonte
        FROM dre_historico_mensal
        WHERE store_id = ?
        ORDER BY ano_mes DESC
        LIMIT 24
      `, [input.storeId]);
      return rows.map(r => ({
        anoMes: String(r.ano_mes),
        faturamento: r.faturamento != null ? Number(r.faturamento) : null,
        cmv: r.cmv != null ? Number(r.cmv) : null,
        folha: r.folha != null ? Number(r.folha) : null,
        custosFixos: r.custos_fixos != null ? Number(r.custos_fixos) : null,
        custosVariaveis: r.custos_variaveis != null ? Number(r.custos_variaveis) : null,
        impostos: r.impostos != null ? Number(r.impostos) : null,
        ebitda: r.ebitda != null ? Number(r.ebitda) : null,
        fonte: String(r.fonte),
      }));
    }),
});
