import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  getConfig, upsertConfig, listRegras, createRegra, updateRegra, deleteRegra,
  getApuracao, listApuracoes, upsertApuracao, aprovarApuracao,
} from "../db-remuneracao";
import {
  getApuracaoById, reabrirApuracaoDb,
  assertPodeAprovar, assertPodeReabrir, assertNaoAprovada,
} from "../db-remuneracao";
import { calculaGestor, calculaLider, DEFAULT_CONFIG, type GatilhosPessoa } from "../../shared/engine";
import { getGatilhoMensal, avaliarGatilhos } from "../db-gatilhos";
import { getEmployees, getEmployeeByUserId } from "../db-pessoas";
import { assertPodeAcessarLoja } from "../auth-helpers";
import {
  getDailyEntries, getStockCounts, getMonthlyQuality, getStoreById,
} from "../db";
import { getOrcamentoVigente, calcularOrcamento } from "../db-orcamento";
import { calcMonthAccumulated } from "../../shared/calculations";

// ─── Helpers locais (espelham routers.ts para manter placar == pagamento) ─────
function toNum(v: string | null | undefined, fallback = 0): number {
  const n = parseFloat(v ?? "");
  return isNaN(n) ? fallback : n;
}
function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(y!, m!, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, "0")}` };
}

export const remuneracaoRouter = router({
  // ─── Configuração ─────────────────────────────────────────────────────────
  getConfig: protectedProcedure
    .input(z.object({ lojaId: z.number() }))
    .query(async ({ input }) => {
      return getConfig(input.lojaId);
    }),

  saveConfig: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      ativa: z.boolean().optional(),
      bonusBasePctFaturamento: z.number().min(0).max(1).optional(),
      gatilhoMinimoPct: z.number().min(0).max(100).optional(),
      tetoMaximoPct: z.number().min(100).max(200).optional(),
      descricao: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await upsertConfig(input);
      return { id };
    }),

  // ─── Regras ───────────────────────────────────────────────────────────────
  listRegras: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => {
      return listRegras(input.configId);
    }),

  addRegra: protectedProcedure
    .input(z.object({
      configId: z.number(),
      titulo: z.string().min(1),
      descricao: z.string().nullable().optional(),
      tipo: z.enum(["automatico", "manual"]).optional(),
      indicador: z.string().optional(),
      metaValor: z.number().nullable().optional(),
      metaOperador: z.enum(["gte", "lte", "eq"]).optional(),
      descontoPct: z.number().min(0).max(100),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createRegra(input);
      return { id };
    }),

  updateRegra: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().optional(),
      descricao: z.string().nullable().optional(),
      tipo: z.enum(["automatico", "manual"]).optional(),
      indicador: z.string().optional(),
      metaValor: z.number().nullable().optional(),
      metaOperador: z.enum(["gte", "lte", "eq"]).optional(),
      descontoPct: z.number().min(0).max(100).optional(),
      ordem: z.number().optional(),
      ativa: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateRegra(id, data);
      return { ok: true };
    }),

  deleteRegra: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteRegra(input.id);
      return { ok: true };
    }),

  // ─── Apuração ─────────────────────────────────────────────────────────────
  getApuracao: protectedProcedure
    .input(z.object({ lojaId: z.number(), mes: z.number(), ano: z.number() }))
    .query(async ({ input }) => {
      return getApuracao(input.lojaId, input.mes, input.ano);
    }),

  historico: protectedProcedure
    .input(z.object({ lojaId: z.number() }))
    .query(async ({ input }) => {
      return listApuracoes(input.lojaId);
    }),

  // ─── Apuração por pessoa (BLOCO C — motor único) ─────────────────────────
  // Inputs: employeeId, lojaId, period — TODOS os realizados derivados do banco.
  // Gatilho não apontado → BLOQUEADO com mensagem clara.
  // GATE: somente admin pode disparar apuração de remuneração.
  // O gestor remunerado NÃO pode calcular a própria apuração.
  calcularPorPessoa: adminProcedure
    .input(z.object({
      employeeId: z.number(),
      lojaId: z.number(),
      period: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
    }))
    .mutation(async ({ ctx, input }) => {
      // Validar vínculo do admin com a loja (admin passa sempre; gate acima bloqueia não-admin)
      await assertPodeAcessarLoja(ctx, input.lojaId);

      // 1. Buscar pessoa no banco
      const employees = await getEmployees(input.lojaId, true);
      const emp = employees.find(e => e.id === input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta loja." });
      if (emp.papelRemuneravel === "nenhum") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${emp.name} não tem papel remunerável definido. Configure em Pessoas antes de apurar.` });
      }

      // 2. Verificar gatilhos do mês
      const gatilhoRaw = await getGatilhoMensal(input.employeeId, input.period);
      const gatilhoStatus = avaliarGatilhos(gatilhoRaw);
      if (!gatilhoStatus.ok) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: gatilhoStatus.motivo });
      }
      const g = gatilhoStatus.gatilhos;
      const gatilhos: GatilhosPessoa = {
        semFaltasInjustificadas: g.semFaltasInjustificadas ?? false,
        avaliacaoDesempenho: g.avaliacaoDesempenho ?? 0,
        semSancoesDisciplinares: g.semSancoes ?? false,
      };

      const papel = emp.papelRemuneravel as "gestor" | "lider";

      // 3. Derivar realizados do banco — MESMA fonte que ranking.monthly
      const { from, to } = periodRange(input.period);

      // 3a. Orçamento vigente → ebitdaOrcadoRs e cmvMetaPct (FALHA ALTO se ausente)
      const orcVigente = await getOrcamentoVigente(input.lojaId, input.period);
      if (!orcVigente) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Sem orçamento vigente para ${input.period} — aprove o orçamento antes de apurar remuneração.`,
        });
      }
      const calc = calcularOrcamento(orcVigente, orcVigente.colaboradores ?? []);
      const ebitdaOrcadoRs = calc.ebitda;
      const cmvMetaPct = orcVigente.cmvTipo === "percentual"
        ? orcVigente.cmvPct * 100
        : (orcVigente.receitaBruta > 0 ? (orcVigente.cmvPct / orcVigente.receitaBruta) * 100 : 30);

      // 3b. Realizados: entradas diárias + contagens de estoque → calcMonthAccumulated
      const store = await getStoreById(input.lojaId);
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Loja não encontrada." });
      const storeConfig = {
        budgetRevenue: toNum(store.budgetRevenue),
        budgetCmvPct: toNum(store.budgetCmvPct, 30),
        budgetPackagingPct: toNum(store.budgetPackagingPct, 4),
        budgetTaxesPct: toNum(store.budgetTaxesPct, 3),
        budgetFixedCosts: toNum(store.budgetFixedCosts),
        dayWeights: store.dayWeights ?? [80, 100, 100, 100, 110, 130, 120],
      };
      const entries = await getDailyEntries(input.lojaId, from, to);
      const counts = await getStockCounts(input.lojaId, from, to);
      const entriesNum = entries.map(e => ({
        entryDate: e.entryDate, revenue: toNum(e.revenue), invoices: toNum(e.invoices), extraLabor: toNum(e.extraLabor),
      }));
      const countsNum = counts.map(c => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
      const acc = calcMonthAccumulated(entriesNum, countsNum, storeConfig, input.period);

      // 3c. Qualidade do mês (FALHA ALTO se não lançada para gestor)
      const quality = await getMonthlyQuality(input.lojaId, input.period);
      const qGoogle = quality?.qualityGoogle != null ? toNum(quality.qualityGoogle) : null;
      const qAudit = quality?.qualityAudit != null ? toNum(quality.qualityAudit) : null;
      const qChecklist = quality?.qualityChecklist != null ? toNum(quality.qualityChecklist) : null;
      const sanitaryGate = quality?.sanitaryGate ?? store.sanitaryGate ?? true;

      if (papel === "gestor") {
        if (qGoogle == null || qAudit == null || qChecklist == null) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Qualidade não lançada para ${input.period} — lance voz do cliente, auditoria e checklist antes de apurar. Nunca use default.`,
          });
        }
      }

      // 4. Calcular via motor único — mesma lógica do calcScores do ranking.monthly
      const fixoRs = Number(emp.salaryBase);
      let extrato;
      if (papel === "gestor") {
        // Resultado: ebitdaOrcadoRs > 0 → normal; < 0 → rampa (loja em recuperação)
        const resultadoInput = ebitdaOrcadoRs > 0
          ? { ebitdaRealRs: acc.ebitda, ebitdaOrcadoRs }
          : ebitdaOrcadoRs < 0
            ? { rampa: { realizado: acc.ebitda, base: ebitdaOrcadoRs, alvo: 0 } }
            : { ebitdaRealRs: 0, ebitdaOrcadoRs: 1 }; // orçado=0 → nota 0 (sem orçamento válido)
        extrato = calculaGestor({
          fixoRs, gatilhos,
          resultado: resultadoInput,
          cmv: { realPp: acc.cmvPct, metaPp: cmvMetaPct },
          qualidade: { vozDoCliente: qGoogle!, auditoria: qAudit!, checklist: qChecklist!, gateSanitarioOk: sanitaryGate },
          cfg: DEFAULT_CONFIG,
        });
      } else {
        // Líder: usa CMV do mês como MIG e checklist do mês como checklistTurno
        // (mesma régua do placar — D7)
        const resultadoLoja = ebitdaOrcadoRs > 0
          ? { ebitdaRealRs: acc.ebitda, ebitdaOrcadoRs }
          : ebitdaOrcadoRs < 0
            ? { rampa: { realizado: acc.ebitda, base: ebitdaOrcadoRs, alvo: 0 } }
            : { ebitdaRealRs: 0, ebitdaOrcadoRs: 1 };
        // Para líder: qualidade pode ser null (não bloqueia), usa 0 como fallback
        const checklistTurno = qChecklist ?? 0;
        extrato = calculaLider({
          fixoRs, gatilhos,
          migTurno: { realPp: acc.cmvPct, metaPp: cmvMetaPct },
          checklistTurno,
          resultadoLoja,
          cfg: DEFAULT_CONFIG,
        });
      }

      // 5. Salvar apuração com employee_id, papel e extrato_json
      // Trava de ciclo: se já aprovado, assertNaoAprovada lança Error puro →
      // capturar e relançar como TRPCError BAD_REQUEST para o cliente ver a mensagem.
      try {
      const [mes, ano] = input.period.split("-").map(Number);
      const apuracaoId = await upsertApuracao({
        lojaId: input.lojaId,
        mes: mes!,
        ano: ano!,
        // NOTA: faturamento_real armazena o EBITDA acumulado do período (não a receita bruta).
        // Renomear a coluna seria uma migration destrutiva — mantido por compatibilidade.
        faturamentoReal: acc.ebitda,
        bonusBaseRs: extrato.variavelAlvoRs,
        resultadoAtingimentoPct: extrato.notaTotal,
        bonusFinalRs: extrato.variavelMesRs,
        observacao: `Motor único v4 | ${emp.name} | Papel: ${papel} | Elegível: ${extrato.elegivel} | Fonte: banco`,
        regras: [],
        employeeId: input.employeeId,
        papel,
        extratoJson: JSON.stringify(extrato),
      });
      return { apuracaoId, extrato, papel, employeeName: emp.name };
      } catch (err: unknown) {
        if (err instanceof Error && !(err instanceof TRPCError)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
    }),

  /** Lista apurações de uma loja/mês com dados da pessoa */
  listPorPessoa: protectedProcedure
    .input(z.object({ lojaId: z.number(), mes: z.number(), ano: z.number() }))
    .query(async ({ input }) => {
      const apuracoes = await listApuracoes(input.lojaId);
      const doMes = apuracoes.filter(a => a.mes === input.mes && a.ano === input.ano);
      // Enriquecer com nome do funcionário quando employeeId está preenchido
      const employees = await getEmployees(input.lojaId, false);
      const empMap = new Map(employees.map(e => [e.id, e]));
      return doMes.map(a => ({
        ...a,
        employeeName: a.employeeId != null ? (empMap.get(a.employeeId)?.name ?? null) : null,
        extrato: a.extratoJson ? (() => { try { return JSON.parse(a.extratoJson!); } catch { return null; } })() : null,
      }));
    }),

  /** Extrato privado do próprio gestor/líder: apuração mais recente + dados da pessoa */
  meuExtrato: protectedProcedure
    .input(z.object({ lojaId: z.number(), period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const emp = await getEmployeeByUserId(ctx.user.id, input.lojaId);
      if (!emp) return null;
      const [anoStr, mesStr] = input.period.split("-");
      const mes = Number(mesStr);
      const ano = Number(anoStr);
      const apuracoes = await listApuracoes(input.lojaId);
      const apuracao = apuracoes.find(a => a.mes === mes && a.ano === ano && a.employeeId === emp.id) ?? null;
      const extrato = apuracao?.extratoJson
        ? (() => { try { return JSON.parse(apuracao.extratoJson!); } catch { return null; } })()
        : null;
      return {
        employee: { id: emp.id, name: emp.name, papelRemuneravel: emp.papelRemuneravel, salaryBase: emp.salaryBase },
        apuracao,
        extrato,
        period: input.period,
      };
    }),

  // ─── Aprovar apuração ────────────────────────────────────────────────────
  // Somente admin. Só aprova rascunho. Grava quem/quando para auditoria.
  aprovar: adminProcedure
    .input(z.object({ apuracaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Buscar a apuração para validar loja e status
      const apuracao = await getApuracaoById(input.apuracaoId);
      if (!apuracao) throw new TRPCError({ code: "NOT_FOUND", message: "Apuração não encontrada." });
      // Gate de loja: admin só aprova apurações da sua loja (ou qualquer loja se super-admin)
      await assertPodeAcessarLoja(ctx, apuracao.lojaId);
      // Só aprovar rascunho — delegar ao helper testado; capturar Error puro → TRPCError
      try {
        assertPodeAprovar(apuracao.status, apuracao.aprovadoPor, apuracao.aprovadoEm);
      } catch (err: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
      }
      // Identidade rastreável do aprovador
      const aprovadoPor = ctx.user.name ?? ctx.user.email ?? `user:${ctx.user.id}`;
      await aprovarApuracao(input.apuracaoId, aprovadoPor);
      return { ok: true, aprovadoPor, apuracaoId: input.apuracaoId };
    }),

  // ─── Reabrir apuração (admin) ────────────────────────────────────────────
  // Reverte status='aprovado' → 'rascunho'. Registra trilha no campo observacao.
  // Necessário para corrigir erros de aprovação sem travar o mês para sempre.
  reabrirApuracao: adminProcedure
    .input(z.object({ apuracaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const apuracao = await getApuracaoById(input.apuracaoId);
      if (!apuracao) throw new TRPCError({ code: "NOT_FOUND", message: "Apuração não encontrada." });
      await assertPodeAcessarLoja(ctx, apuracao.lojaId);
      // Só reabrir aprovadas — delegar ao helper testado; capturar Error puro → TRPCError
      try {
        assertPodeReabrir(apuracao.status);
      } catch (err: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
      }
      const reabertoPor = ctx.user.name ?? ctx.user.email ?? `user:${ctx.user.id}`;
      await reabrirApuracaoDb(input.apuracaoId, reabertoPor);
      return { ok: true, reabertoPor, apuracaoId: input.apuracaoId };
    }),
});
