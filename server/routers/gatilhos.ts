/**
 * routers/gatilhos.ts — Gatilhos mensais de elegibilidade por pessoa
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getGatilhoMensal,
  getGatilhosForStore,
  upsertGatilhoMensal,
} from "../db-gatilhos";
import { getEmployees } from "../db-pessoas";

export const gatilhosRouter = router({
  /** Lista gatilhos de todos os remuneráveis de uma loja/mês */
  listForStore: protectedProcedure
    .input(z.object({ storeId: z.number(), period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ input }) => {
      const employees = await getEmployees(input.storeId, false);
      const remuneraveis = employees.filter(e => e.papelRemuneravel !== "nenhum");
      const gatilhos = await getGatilhosForStore(input.storeId, input.period);

      return remuneraveis.map(emp => {
        const g = gatilhos.find(g => g.employeeId === emp.id) ?? null;
        const pendentes: string[] = [];
        if (!g || g.semFaltasInjustificadas === null) pendentes.push("Faltas");
        if (!g || g.avaliacaoDesempenho === null) pendentes.push("Avaliação");
        if (!g || g.semSancoes === null) pendentes.push("Sanções");

        return {
          employee: { id: emp.id, name: emp.name, role: emp.role, papelRemuneravel: emp.papelRemuneravel },
          gatilho: g,
          status: pendentes.length === 0 ? "completo" : "pendente",
          pendentes,
        };
      });
    }),

  /** Busca gatilho de uma pessoa/mês específico */
  getForEmployee: protectedProcedure
    .input(z.object({ employeeId: z.number(), period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(({ input }) => getGatilhoMensal(input.employeeId, input.period)),

  /** Aponta/atualiza gatilhos de uma pessoa no mês */
  upsert: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      storeId: z.number(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      semFaltasInjustificadas: z.boolean().nullable().optional(),
      avaliacaoDesempenho: z.number().min(0).max(10).nullable().optional(),
      semSancoes: z.boolean().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { employeeId, storeId, period, ...data } = input;
      const updatedBy = ctx.user.name ?? ctx.user.openId;
      await upsertGatilhoMensal(employeeId, storeId, period, data, updatedBy);
      return { success: true };
    }),
});
