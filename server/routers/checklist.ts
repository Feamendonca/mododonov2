import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { assertPodeAcessarLoja } from "../auth-helpers";
import {
  listarItens, criarItem, editarItem, deletarItem,
  iniciarOuBuscarExecucao, responderItem, finalizarExecucao,
  historicoConformidade, resumoHoje, seedItensPadrao,
  type TurnoChecklist,
  getItemById, getExecucaoById,
} from "../db-checklist";

export const checklistRouter = router({
  // ─── Itens ─────────────────────────────────────────────────────────────────

  listarItens: protectedProcedure
    .input(z.object({ lojaId: z.number(), turno: z.string().optional() }))
    .query(async ({ input }) => {
      return listarItens(input.lojaId, input.turno);
    }),

  criarItem: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      categoria: z.string().default("geral"),
      titulo: z.string().min(1),
      descricao: z.string().nullable().optional(),
      turno: z.enum(["abertura", "operacao", "fechamento", "todos"]),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      const id = await criarItem(input);
      return { id };
    }),

  editarItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      categoria: z.string().optional(),
      titulo: z.string().optional(),
      descricao: z.string().nullable().optional(),
      turno: z.enum(["abertura", "operacao", "fechamento", "todos"]).optional(),
      ordem: z.number().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await getItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPodeAcessarLoja(ctx, item.lojaId);
      const { id, ...data } = input;
      await editarItem(id, data);
      return { ok: true };
    }),

  deletarItem: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await getItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPodeAcessarLoja(ctx, item.lojaId);
      await deletarItem(input.id);
      return { ok: true };
    }),

  seedItensPadrao: protectedProcedure
    .input(z.object({ lojaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      await seedItensPadrao(input.lojaId);
      return { ok: true };
    }),

  // ─── Execução ──────────────────────────────────────────────────────────────

  iniciarExecucao: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      data: z.string(), // YYYY-MM-DD
      turno: z.enum(["abertura", "operacao", "fechamento"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      const execucao = await iniciarOuBuscarExecucao(
        input.lojaId, input.data, input.turno, ctx.user.id
      );
      // Carregar itens junto
      const itens = await listarItens(input.lojaId, input.turno);
      return { execucao, itens };
    }),

  responderItem: protectedProcedure
    .input(z.object({
      execucaoId: z.number(),
      itemId: z.number(),
      ok: z.boolean(),
      observacao: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const exec = await getExecucaoById(input.execucaoId);
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPodeAcessarLoja(ctx, exec.lojaId);
      await responderItem(input.execucaoId, input.itemId, input.ok, input.observacao);
      return { ok: true };
    }),

  finalizarExecucao: protectedProcedure
    .input(z.object({ execucaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const exec = await getExecucaoById(input.execucaoId);
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPodeAcessarLoja(ctx, exec.lojaId);
      await finalizarExecucao(input.execucaoId);
      return { ok: true };
    }),

  // ─── Histórico e resumo ────────────────────────────────────────────────────

  historico: protectedProcedure
    .input(z.object({ lojaId: z.number(), dias: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      return historicoConformidade(input.lojaId, input.dias ?? 30);
    }),

  resumoHoje: protectedProcedure
    .input(z.object({ lojaId: z.number(), hoje: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      return resumoHoje(input.lojaId, input.hoje);
    }),

  // ─── Importação de planilha de checklist ──────────────────────────────────

  // Parseia planilha Excel em base64 e retorna pré-visualização
  parseChecklistSheet: protectedProcedure
    .input(z.object({ base64: z.string() }))
    .mutation(async ({ input }) => {
      const { parseChecklistSheet } = await import("../sheet-parser");
      return parseChecklistSheet(input.base64);
    }),

  // Importa itens de checklist a partir de dados já parseados
  importChecklist: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      rows: z.array(z.object({
        titulo: z.string(),
        categoria: z.string(),
        turno: z.enum(["abertura", "operacao", "fechamento", "todos"]),
        descricao: z.string().nullable(),
        ordem: z.number(),
      })),
      replaceExisting: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      if (input.replaceExisting) {
        // Desativar todos os itens existentes antes de importar
        const existing = await listarItens(input.lojaId);
        for (const item of existing) {
          await deletarItem(item.id);
        }
      }
      let created = 0;
      for (const row of input.rows) {
        await criarItem({
          lojaId: input.lojaId,
          categoria: row.categoria,
          titulo: row.titulo,
          descricao: row.descricao,
          turno: row.turno,
          ordem: row.ordem,
        });
        created++;
      }
      return { created };
    }),

  // Download do template Excel de checklist
  downloadChecklistTemplate: protectedProcedure
    .query(async () => {
      const { generateChecklistTemplate } = await import("../sheet-parser");
      const buf = generateChecklistTemplate();
      return { base64: buf.toString("base64"), filename: "template-checklist.xlsx" };
    }),
});
