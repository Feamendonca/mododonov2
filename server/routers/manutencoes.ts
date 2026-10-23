import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  listManutencoes, getManutencaoById, createManutencao,
  updateManutencao, deleteManutencao, getResumoManutencoes,
} from "../db-manutencoes";
import {
  createLinhaCustom, deleteLinhaCustomByOrigem,
} from "../db-orcamento";
import { TRPCError } from "@trpc/server";
import { assertPodeAcessarLoja } from "../auth-helpers";

const tipoSchema = z.enum(["preventiva", "corretiva"]);
const statusSchema = z.enum(["aberta", "em_andamento", "concluida", "cancelada"]);
const prioridadeSchema = z.enum(["baixa", "media", "alta", "urgente"]);

/** Converte timestamp em string YYYY-MM */
function tsToMes(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const manutencoesRouter = router({
  list: protectedProcedure
    .input(z.object({
      lojaId: z.number().int(),
      tipo: tipoSchema.optional(),
      status: statusSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      return listManutencoes(input.lojaId, { tipo: input.tipo, status: input.status });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const m = await getManutencaoById(input.id);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      return m;
    }),

  resumo: protectedProcedure
    .input(z.object({ lojaId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      return getResumoManutencoes(input.lojaId);
    }),

  create: protectedProcedure
    .input(z.object({
      lojaId: z.number().int(),
      tipo: tipoSchema,
      titulo: z.string().min(1).max(300),
      descricao: z.string().nullable().optional(),
      localEquipamento: z.string().nullable().optional(),
      prioridade: prioridadeSchema,
      custo: z.number().min(0).optional(),
      fornecedor: z.string().nullable().optional(),
      dataAbertura: z.number().int(),
      dataPrevista: z.number().int().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      const id = await createManutencao({
        ...input,
        criadoPor: ctx.user.name ?? ctx.user.openId,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      tipo: tipoSchema.optional(),
      status: statusSchema.optional(),
      titulo: z.string().min(1).max(300).optional(),
      descricao: z.string().nullable().optional(),
      localEquipamento: z.string().nullable().optional(),
      prioridade: prioridadeSchema.optional(),
      custo: z.number().min(0).optional(),
      fornecedor: z.string().nullable().optional(),
      dataPrevista: z.number().int().nullable().optional(),
      dataConclusao: z.number().int().nullable().optional(),
      executadoPor: z.string().nullable().optional(),
      descritivoExecucao: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Buscar a manutenção para validar a loja dela (não confiar no input)
      const mCheck = await getManutencaoById(input.id);
      if (!mCheck) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPodeAcessarLoja(ctx, mCheck.lojaId);
      await updateManutencao(input);
      return { ok: true };
    }),

  concluir: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      lojaId: z.number().int(),
      executadoPor: z.string().min(1),
      descritivoExecucao: z.string().min(1),
      custo: z.number().min(0),
      dataConclusao: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 0. Buscar a manutenção e validar que o lojaId do input bate com a loja DELA
      const manutencaoPreCheck = await getManutencaoById(input.id);
      if (!manutencaoPreCheck) throw new TRPCError({ code: "NOT_FOUND" });
      if (manutencaoPreCheck.lojaId !== input.lojaId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "lojaId do input não corresponde à loja da manutenção." });
      }
      await assertPodeAcessarLoja(ctx, manutencaoPreCheck.lojaId);
      // 1. Atualizar status da manutenção
      await updateManutencao({
        id: input.id,
        status: "concluida",
        executadoPor: input.executadoPor,
        descritivoExecucao: input.descritivoExecucao,
        custo: input.custo,
        dataConclusao: input.dataConclusao,
      });

      // 2. Se tiver custo, lançar automaticamente na DRE do mês
      if (input.custo > 0) {
        // Usar a lojaId da manutenção (validada acima) — nunca do input
        const mes = tsToMes(input.dataConclusao);
        const origem = `manutencao:${input.id}`;
        const label = `Manutenção: ${manutencaoPreCheck.titulo}`;
        // Remove lançamento anterior se já existia (re-conclusão)
        await deleteLinhaCustomByOrigem(origem);
        // Cria nova linha no grupo "outros_custos" da DRE
        await createLinhaCustom(
          manutencaoPreCheck.lojaId,
          mes,
          "outros_custos",
          label,
          input.custo,
          "fixo",
          origem
        );
      }

      return { ok: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Buscar a manutenção para validar a loja dela
      const mDel = await getManutencaoById(input.id);
      if (!mDel) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPodeAcessarLoja(ctx, mDel.lojaId);
      // Remove linha da DRE vinculada (se existir)
      await deleteLinhaCustomByOrigem(`manutencao:${input.id}`);
      // Remove a manutenção
      await deleteManutencao(input.id);
      return { ok: true };
    }),
});
