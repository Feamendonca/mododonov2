import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { assertPodeAcessarLoja } from "../auth-helpers";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";

/**
 * Setup do Mês — verifica o estado dos 7 passos de configuração do mês para uma loja.
 * Cada item lê dados reais do banco (sem hardcode).
 */
export const setupRouter = router({
  statusDoMes: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2020).max(2100),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const { storeId, mes, ano } = input;
      const periodoInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      // Último dia do mês
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const periodoFim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

      // 1. Orçamento aprovado
      const [orcRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM orcamentos WHERE store_id = ? AND status = 'aprovado'
         AND periodo_inicio <= ? AND periodo_fim >= ? LIMIT 1`,
        [storeId, periodoFim, periodoInicio]
      );
      const orcamentoAprovado = (orcRows as any[]).length > 0;

      // 2. Meta do Mês criada
      const [metaRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM metas WHERE loja_id = ? AND mes = ? AND ano = ? LIMIT 1`,
        [storeId, mes, ano]
      );
      const metaCriada = (metaRows as any[]).length > 0;

      // 3. Metas diárias geradas (pelo menos 1 no mês)
      const [metaDiariaRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM orcamento_metas_diarias WHERE store_id = ? AND data >= ? AND data <= ? LIMIT 1`,
        [storeId, periodoInicio, periodoFim]
      );
      const metasDiariasGeradas = (metaDiariaRows as any[]).length > 0;

      // 4. Checklist operacional (ao menos 1 item cadastrado)
      const [checklistRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM checklist_itens WHERE loja_id = ? LIMIT 1`,
        [storeId]
      );
      const checklistConfigurado = (checklistRows as any[]).length > 0;

      // 5. Pré-turno configurado (ao menos 1 config ativa)
      const [preturnoRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM preturno_configs WHERE storeId = ? AND ativa = 1 LIMIT 1`,
        [storeId]
      );
      const preturnoConfigurado = (preturnoRows as any[]).length > 0;

      // 6. Produtos de estoque cadastrados (ao menos 1 produto ativo)
      const [produtosRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM products WHERE storeId = ? AND isActive = 1 LIMIT 1`,
        [storeId]
      );
      const produtosCadastrados = (produtosRows as any[]).length > 0;

      // 7. Equipe cadastrada (ao menos 1 funcionário ativo)
      const [equipeRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM employees WHERE storeId = ? AND status != 'inactive' LIMIT 1`,
        [storeId]
      );
      const equipeCadastrada = (equipeRows as any[]).length > 0;

      return {
        mes,
        ano,
        storeId,
        itens: [
          {
            id: "orcamento",
            titulo: "Orçamento aprovado",
            feito: orcamentoAprovado,
            adminOnly: true,
            link: "/orcamento",
            acaoLabel: "Aprovar orçamento",
          },
          {
            id: "meta",
            titulo: "Meta do Mês + medidas criadas",
            feito: metaCriada,
            adminOnly: true,
            link: `/meta?mes=${ano}-${String(mes).padStart(2, "0")}`,
            acaoLabel: "Ver Meta do Mês",
          },
          {
            id: "metas_diarias",
            titulo: "Metas diárias geradas",
            feito: metasDiariasGeradas,
            adminOnly: true,
            link: "/orcamento",
            acaoLabel: "Gerar metas diárias",
          },
          {
            id: "checklist",
            titulo: "Checklist operacional configurado",
            feito: checklistConfigurado,
            adminOnly: false,
            link: "/checklist",
            acaoLabel: "Carregar padrão",
            acaoId: "seed_checklist",
          },
          {
            id: "preturno",
            titulo: "Pré-turno configurado",
            feito: preturnoConfigurado,
            adminOnly: false,
            link: "/preturno",
            acaoLabel: "Configurar pré-turno",
          },
          {
            id: "produtos",
            titulo: "Produtos de estoque cadastrados",
            feito: produtosCadastrados,
            adminOnly: false,
            link: "/estoque",
            acaoLabel: "Importar produtos",
          },
          {
            id: "equipe",
            titulo: "Equipe cadastrada",
            feito: equipeCadastrada,
            adminOnly: false,
            link: "/pessoas",
            acaoLabel: "Cadastrar equipe",
          },
        ],
      };
    }),
});
