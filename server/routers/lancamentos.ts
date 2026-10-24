import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { rawQuery } from "../db";
import { assertPodeAcessarLoja, assertPodeExcluirLancamento } from "../auth-helpers";
import { upsertDailyEntryFields } from "../db";

export const lancamentosRouter = router({
  /** Salvar fechamento de caixa (receita do dia por forma de pagamento) */
  salvarCaixa: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dinheiro: z.number().min(0).default(0),
      debito: z.number().min(0).default(0),
      credito: z.number().min(0).default(0),
      vale: z.number().min(0).default(0),
      pix: z.number().min(0).default(0),
      apps: z.number().min(0).default(0),
      atendimentos: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);

      // Verificar mês fechado
      const anoMes = input.data.slice(0, 7);
      const fechRows = await rawQuery(
        `SELECT id FROM dre_fechamentos WHERE store_id = ? AND ano_mes = ? AND status = 'fechado' LIMIT 1`,
        [input.storeId, anoMes]
      );
      if (fechRows.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Mês fechado — não é possível lançar receita." });
      }

      const total = input.dinheiro + input.debito + input.credito + input.vale + input.pix + input.apps;
      const now = Date.now();

      // Upsert caixa_diario
      await rawQuery(
        `INSERT INTO caixa_diario (storeId, data, dinheiro, debito, credito, vale, pix, apps, atendimentos, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (storeId, data) DO UPDATE SET dinheiro=VALUES(dinheiro), debito=VALUES(debito), credito=VALUES(credito),
           vale=VALUES(vale), pix=VALUES(pix), apps=VALUES(apps), atendimentos=VALUES(atendimentos), updatedAt=?`,
        [input.storeId, input.data, input.dinheiro, input.debito, input.credito,
         input.vale, input.pix, input.apps, input.atendimentos, ctx.user.id, now, now]
      );

      // Upsert daily_entries.revenue (fonte que DRE Viva e placar já leem)
      // Gravar SOMENTE revenue + atendimentos (nunca tocar invoices/extraLabor)
      await upsertDailyEntryFields(input.storeId, input.data, {
        revenue: total.toFixed(2),
        atendimentos: input.atendimentos,
      });

      return { ok: true, total };
    }),

  /** Listar caixas do mês */
  listarCaixas: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const rows = await rawQuery(
        `SELECT * FROM caixa_diario WHERE storeId = ? AND data LIKE ? ORDER BY data DESC`,
        [input.storeId, `${input.period}%`]
      );
      return (rows as any[]).map(r => ({
        id: Number(r.id),
        data: String(r.data),
        dinheiro: Number(r.dinheiro ?? 0),
        debito: Number(r.debito ?? 0),
        credito: Number(r.credito ?? 0),
        vale: Number(r.vale ?? 0),
        pix: Number(r.pix ?? 0),
        apps: Number(r.apps ?? 0),
        atendimentos: Number(r.atendimentos ?? 0),
        total: Number(r.dinheiro ?? 0) + Number(r.debito ?? 0) + Number(r.credito ?? 0) + Number(r.vale ?? 0) + Number(r.pix ?? 0) + Number(r.apps ?? 0),
      }));
    }),

  /** Excluir caixa de um dia */
  excluirCaixa: protectedProcedure
    .input(z.object({ storeId: z.number().int(), data: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeExcluirLancamento(ctx, input.storeId, input.data);
      await rawQuery(`DELETE FROM caixa_diario WHERE storeId = ? AND data = ?`, [input.storeId, input.data]);
      // Zerar SOMENTE revenue + atendimentos (preserva invoices/extraLabor)
      await upsertDailyEntryFields(input.storeId, input.data, { revenue: "0", atendimentos: 0 });
      return { ok: true };
    }),
});
