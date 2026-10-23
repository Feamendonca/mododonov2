import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { rawQuery } from "../db";
import { assertPodeAcessarLoja } from "../auth-helpers";

export const reuniaoRouter = router({
  listar: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const rows = await rawQuery(
        `SELECT r.id, r.storeId, r.data, r.participantes, r.observacao, r.createdBy, r.createdAt,
                (SELECT COUNT(*) FROM reuniao_combinados WHERE reuniaoId = r.id) as totalCombinados,
                (SELECT COUNT(*) FROM reuniao_combinados WHERE reuniaoId = r.id AND status = 'aberto') as abertos
         FROM reunioes r
         WHERE r.storeId = ?
         ORDER BY r.data DESC, r.id DESC
         LIMIT 50`,
        [input.storeId]
      );
      return (rows as any[]).map(r => ({
        id: r.id as number,
        storeId: r.storeId as number,
        data: r.data as string,
        participantes: r.participantes as string | null,
        observacao: r.observacao as string | null,
        createdBy: r.createdBy as number | null,
        totalCombinados: Number(r.totalCombinados),
        abertos: Number(r.abertos),
      }));
    }),

  criar: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      participantes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const result = await rawQuery(
        `INSERT INTO reunioes (storeId, data, participantes, createdBy) VALUES (?, ?, ?, ?)`,
        [input.storeId, input.data, input.participantes ?? null, ctx.user.id]
      );
      return { id: (result as any).insertId as number };
    }),

  detalhe: protectedProcedure
    .input(z.object({ storeId: z.number(), reuniaoId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      // Buscar a reunião
      const rRows = await rawQuery(
        `SELECT id, storeId, data, participantes, observacao, createdBy, createdAt
         FROM reunioes WHERE id = ? AND storeId = ? LIMIT 1`,
        [input.reuniaoId, input.storeId]
      );
      const reuniao = (rRows as any[])[0];
      if (!reuniao) throw new TRPCError({ code: "NOT_FOUND", message: "Reunião não encontrada." });

      // Combinados desta reunião
      const combinados = await rawQuery(
        `SELECT c.id, c.descricao, c.responsavel, c.prazo, c.status, c.medidaId, c.concluidoAt,
                m.titulo as medidaTitulo
         FROM reuniao_combinados c
         LEFT JOIN medidas_direcao m ON m.id = c.medidaId
         WHERE c.reuniaoId = ? AND c.storeId = ?
         ORDER BY c.id ASC`,
        [input.reuniaoId, input.storeId]
      );

      // Pendências anteriores: combinados abertos de reuniões ANTERIORES
      const pendencias = await rawQuery(
        `SELECT c.id, c.descricao, c.responsavel, c.prazo, c.status, c.medidaId, c.reuniaoId,
                r.data as reuniaoData, m.titulo as medidaTitulo
         FROM reuniao_combinados c
         JOIN reunioes r ON r.id = c.reuniaoId
         LEFT JOIN medidas_direcao m ON m.id = c.medidaId
         WHERE c.storeId = ? AND c.status = 'aberto' AND c.reuniaoId != ?
           AND r.data < (SELECT data FROM reunioes WHERE id = ?)
         ORDER BY r.data DESC, c.id ASC`,
        [input.storeId, input.reuniaoId, input.reuniaoId]
      );

      return {
        reuniao: {
          id: reuniao.id,
          storeId: reuniao.storeId,
          data: reuniao.data,
          participantes: reuniao.participantes,
          observacao: reuniao.observacao,
          createdBy: reuniao.createdBy,
        },
        combinados: (combinados as any[]).map(c => ({
          id: c.id as number,
          descricao: c.descricao as string,
          responsavel: c.responsavel as string | null,
          prazo: c.prazo as string | null,
          status: c.status as string,
          medidaId: c.medidaId as number | null,
          medidaTitulo: c.medidaTitulo as string | null,
          concluidoAt: c.concluidoAt,
        })),
        pendenciasAnteriores: (pendencias as any[]).map(p => ({
          id: p.id as number,
          descricao: p.descricao as string,
          responsavel: p.responsavel as string | null,
          prazo: p.prazo as string | null,
          status: p.status as string,
          medidaId: p.medidaId as number | null,
          medidaTitulo: p.medidaTitulo as string | null,
          reuniaoData: p.reuniaoData as string,
        })),
      };
    }),

  addCombinado: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      reuniaoId: z.number(),
      descricao: z.string().min(1),
      responsavel: z.string().optional(),
      prazo: z.string().optional(),
      medidaId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const result = await rawQuery(
        `INSERT INTO reuniao_combinados (reuniaoId, storeId, descricao, responsavel, prazo, medidaId)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.reuniaoId, input.storeId, input.descricao, input.responsavel ?? null, input.prazo ?? null, input.medidaId ?? null]
      );
      return { id: (result as any).insertId as number };
    }),

  toggleCombinado: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      id: z.number(),
      status: z.enum(["aberto", "feito"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      if (input.status === "feito") {
        await rawQuery(
          `UPDATE reuniao_combinados SET status = 'feito', concluidoAt = NOW() WHERE id = ? AND storeId = ?`,
          [input.id, input.storeId]
        );
      } else {
        await rawQuery(
          `UPDATE reuniao_combinados SET status = 'aberto', concluidoAt = NULL WHERE id = ? AND storeId = ?`,
          [input.id, input.storeId]
        );
      }
      return { ok: true };
    }),

  medidasDaLoja: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const rows = await rawQuery(
        `SELECT id, titulo FROM medidas_direcao WHERE loja_id = ? AND ativa = 1 ORDER BY ordem ASC`,
        [input.storeId]
      );
      return (rows as any[]).map(r => ({ id: r.id as number, titulo: r.titulo as string }));
    }),

  excluirCombinado: adminProcedure
    .input(z.object({ storeId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await rawQuery(`DELETE FROM reuniao_combinados WHERE id = ? AND storeId = ?`, [input.id, input.storeId]);
      return { ok: true };
    }),

  excluirReuniao: adminProcedure
    .input(z.object({ storeId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await rawQuery(`DELETE FROM reuniao_combinados WHERE reuniaoId = ? AND storeId = ?`, [input.id, input.storeId]);
      await rawQuery(`DELETE FROM reunioes WHERE id = ? AND storeId = ?`, [input.id, input.storeId]);
      return { ok: true };
    }),

  // Query para o alerta do Hoje
  pendentesCount: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const rows = await rawQuery(
        `SELECT COUNT(*) as cnt FROM reuniao_combinados WHERE storeId = ? AND status = 'aberto'`,
        [input.storeId]
      );
      return { count: Number((rows as any[])[0]?.cnt ?? 0) };
    }),
  // Salvar resumo (ata livre) da reunião
  salvarResumo: protectedProcedure
    .input(z.object({ storeId: z.number(), reuniaoId: z.number(), observacao: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await rawQuery(
        `UPDATE reunioes SET observacao = ? WHERE id = ? AND storeId = ?`,
        [input.observacao, input.reuniaoId, input.storeId]
      );
      return { ok: true };
    }),
  // Lista de combinados abertos (para Hoje e Plano de Ação)
  combinadosAbertos: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const rows = await rawQuery(
        `SELECT rc.id, rc.descricao, rc.responsavel, DATE_FORMAT(rc.prazo, '%Y-%m-%d') AS prazo,
                rc.status, rc.medidaId, rc.storeId, DATE_FORMAT(r.data, '%Y-%m-%d') AS reuniaoData,
                md.titulo AS medidaTitulo
         FROM reuniao_combinados rc
         JOIN reunioes r ON r.id = rc.reuniaoId
         LEFT JOIN medidas_direcao md ON md.id = rc.medidaId
         WHERE rc.storeId = ? AND rc.status = 'aberto'
         ORDER BY rc.prazo IS NULL, rc.prazo ASC, rc.createdAt ASC`,
        [input.storeId]
      );
      return (rows as any[]).map(r => ({
        id: r.id as number,
        descricao: r.descricao as string,
        responsavel: r.responsavel as string | null,
        prazo: r.prazo as string | null,
        status: r.status as string,
        medidaId: r.medidaId as number | null,
        medidaTitulo: r.medidaTitulo as string | null,
        reuniaoData: r.reuniaoData as string,
      }));
    }),
});
