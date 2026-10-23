/**
 * holidays.ts — tRPC router para calendário de feriados e multiplicadores de meta
 *
 * Fluxo:
 * 1. Admin semeia feriados nacionais (seedHolidays)
 * 2. Admin/gerente solicita sugestão da IA para a loja (suggestRules)
 * 3. IA retorna multiplicadores base por tipo de operação
 * 4. Admin/gerente salva (aceita ou ajusta) as regras (saveRule / bulkSaveRules)
 * 5. Ao aprovar orçamento, as metas diárias usam os multiplicadores
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  listHolidaysByYear,
  listHolidaysByRange,
  listStoreHolidayRules,
  upsertStoreHolidayRule,
  bulkUpsertStoreHolidayRules,
  seedBrazilianHolidays,
} from "../db-holidays";
import { getDb } from "../db";

// ─── Admin guard ──────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

// ─── Multiplicadores base por tipo de operação (conhecimento embutido) ────────
// Esses valores são usados como fallback e como ponto de partida para a IA
const BASE_MULTIPLIERS: Record<string, Record<string, { feriado: number; vespera: number; ponto_facultativo: number }>> = {
  aeroporto: {
    carnaval:       { feriado: 0.55, vespera: 1.35, ponto_facultativo: 1.10 },
    pascoa:         { feriado: 0.60, vespera: 1.20, ponto_facultativo: 1.05 },
    tiradentes:     { feriado: 0.65, vespera: 1.25, ponto_facultativo: 1.05 },
    trabalho:       { feriado: 0.60, vespera: 1.30, ponto_facultativo: 1.05 },
    independencia:  { feriado: 0.65, vespera: 1.25, ponto_facultativo: 1.05 },
    aparecida:      { feriado: 0.65, vespera: 1.20, ponto_facultativo: 1.05 },
    finados:        { feriado: 0.60, vespera: 1.25, ponto_facultativo: 1.05 },
    republica:      { feriado: 0.65, vespera: 1.20, ponto_facultativo: 1.05 },
    consciencia:    { feriado: 0.65, vespera: 1.20, ponto_facultativo: 1.05 },
    natal:          { feriado: 0.40, vespera: 1.40, ponto_facultativo: 1.10 },
    reveillon:      { feriado: 0.50, vespera: 1.35, ponto_facultativo: 1.10 },
    default:        { feriado: 0.65, vespera: 1.20, ponto_facultativo: 1.05 },
  },
  mall: {
    carnaval:       { feriado: 1.30, vespera: 1.20, ponto_facultativo: 1.10 },
    pascoa:         { feriado: 0.70, vespera: 1.15, ponto_facultativo: 1.05 },
    tiradentes:     { feriado: 1.20, vespera: 1.10, ponto_facultativo: 1.05 },
    trabalho:       { feriado: 1.25, vespera: 1.10, ponto_facultativo: 1.05 },
    independencia:  { feriado: 1.20, vespera: 1.10, ponto_facultativo: 1.05 },
    aparecida:      { feriado: 1.15, vespera: 1.10, ponto_facultativo: 1.05 },
    finados:        { feriado: 0.80, vespera: 1.10, ponto_facultativo: 1.05 },
    republica:      { feriado: 1.15, vespera: 1.10, ponto_facultativo: 1.05 },
    consciencia:    { feriado: 1.15, vespera: 1.10, ponto_facultativo: 1.05 },
    natal:          { feriado: 0.60, vespera: 1.30, ponto_facultativo: 1.10 },
    reveillon:      { feriado: 0.50, vespera: 1.25, ponto_facultativo: 1.10 },
    default:        { feriado: 1.10, vespera: 1.10, ponto_facultativo: 1.05 },
  },
  rua: {
    carnaval:       { feriado: 0.50, vespera: 0.90, ponto_facultativo: 0.95 },
    pascoa:         { feriado: 0.40, vespera: 0.85, ponto_facultativo: 0.95 },
    tiradentes:     { feriado: 0.70, vespera: 0.95, ponto_facultativo: 0.95 },
    trabalho:       { feriado: 0.60, vespera: 0.90, ponto_facultativo: 0.95 },
    independencia:  { feriado: 0.70, vespera: 0.95, ponto_facultativo: 0.95 },
    aparecida:      { feriado: 0.65, vespera: 0.95, ponto_facultativo: 0.95 },
    finados:        { feriado: 0.55, vespera: 0.90, ponto_facultativo: 0.95 },
    republica:      { feriado: 0.70, vespera: 0.95, ponto_facultativo: 0.95 },
    consciencia:    { feriado: 0.70, vespera: 0.95, ponto_facultativo: 0.95 },
    natal:          { feriado: 0.30, vespera: 0.80, ponto_facultativo: 0.90 },
    reveillon:      { feriado: 0.40, vespera: 0.85, ponto_facultativo: 0.90 },
    default:        { feriado: 0.65, vespera: 0.90, ponto_facultativo: 0.95 },
  },
  corporativo: {
    carnaval:       { feriado: 0.20, vespera: 0.60, ponto_facultativo: 0.70 },
    pascoa:         { feriado: 0.15, vespera: 0.55, ponto_facultativo: 0.65 },
    tiradentes:     { feriado: 0.20, vespera: 0.65, ponto_facultativo: 0.70 },
    trabalho:       { feriado: 0.10, vespera: 0.60, ponto_facultativo: 0.70 },
    independencia:  { feriado: 0.20, vespera: 0.65, ponto_facultativo: 0.70 },
    aparecida:      { feriado: 0.20, vespera: 0.65, ponto_facultativo: 0.70 },
    finados:        { feriado: 0.15, vespera: 0.60, ponto_facultativo: 0.70 },
    republica:      { feriado: 0.20, vespera: 0.65, ponto_facultativo: 0.70 },
    consciencia:    { feriado: 0.20, vespera: 0.65, ponto_facultativo: 0.70 },
    natal:          { feriado: 0.10, vespera: 0.40, ponto_facultativo: 0.60 },
    reveillon:      { feriado: 0.10, vespera: 0.40, ponto_facultativo: 0.60 },
    default:        { feriado: 0.20, vespera: 0.60, ponto_facultativo: 0.70 },
  },
  universitario: {
    carnaval:       { feriado: 0.30, vespera: 0.70, ponto_facultativo: 0.80 },
    pascoa:         { feriado: 0.25, vespera: 0.65, ponto_facultativo: 0.75 },
    tiradentes:     { feriado: 0.40, vespera: 0.75, ponto_facultativo: 0.80 },
    trabalho:       { feriado: 0.30, vespera: 0.70, ponto_facultativo: 0.80 },
    independencia:  { feriado: 0.40, vespera: 0.75, ponto_facultativo: 0.80 },
    aparecida:      { feriado: 0.40, vespera: 0.75, ponto_facultativo: 0.80 },
    finados:        { feriado: 0.30, vespera: 0.70, ponto_facultativo: 0.80 },
    republica:      { feriado: 0.40, vespera: 0.75, ponto_facultativo: 0.80 },
    consciencia:    { feriado: 0.40, vespera: 0.75, ponto_facultativo: 0.80 },
    natal:          { feriado: 0.15, vespera: 0.50, ponto_facultativo: 0.70 },
    reveillon:      { feriado: 0.15, vespera: 0.50, ponto_facultativo: 0.70 },
    default:        { feriado: 0.35, vespera: 0.70, ponto_facultativo: 0.80 },
  },
};

function getHolidayCategory(holidayName: string): string {
  const name = holidayName.toLowerCase();
  if (name.includes("carnaval") || name.includes("cinzas")) return "carnaval";
  if (name.includes("páscoa") || name.includes("pascoa") || name.includes("sexta-feira santa")) return "pascoa";
  if (name.includes("tiradentes")) return "tiradentes";
  if (name.includes("trabalho")) return "trabalho";
  if (name.includes("independência") || name.includes("independencia")) return "independencia";
  if (name.includes("aparecida")) return "aparecida";
  if (name.includes("finados")) return "finados";
  if (name.includes("república") || name.includes("republica")) return "republica";
  if (name.includes("consciência") || name.includes("consciencia")) return "consciencia";
  if (name.includes("natal") || name.includes("véspera de natal")) return "natal";
  if (name.includes("ano novo") || name.includes("reveillon") || name.includes("réveillon")) return "reveillon";
  return "default";
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const holidaysRouter = router({

  // ── Listar feriados de um ano ──────────────────────────────────────────────
  listByYear: protectedProcedure
    .input(z.object({ year: z.number().int().min(2024).max(2030) }))
    .query(async ({ input }) => {
      return await listHolidaysByYear(input.year);
    }),

  // ── Listar feriados de um período com regras da loja ──────────────────────
  listWithRules: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),   // YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const [holidays, rules] = await Promise.all([
        listHolidaysByRange(input.startDate, input.endDate),
        listStoreHolidayRules(input.storeId, input.startDate, input.endDate),
      ]);

      // Mapeia regras por data para lookup rápido
      const rulesByDate = new Map(rules.map(r => [r.ruleDate, r]));

      return holidays.map(h => ({
        ...h,
        rule: rulesByDate.get(h.holidayDate) ?? null,
      }));
    }),

  // ── Sugerir multiplicadores com IA ────────────────────────────────────────
  suggestRules: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      year: z.number().int().min(2024).max(2030),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Busca tipo de operação da loja
      const storeRows = await (db as any).$client.promise().execute(
        `SELECT name, operationType FROM stores WHERE id = ?`,
        [input.storeId]
      );
      const store = storeRows.rows?.[0] as { name: string; operationType: string } | undefined;
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Loja não encontrada." });

      const operationType = (store.operationType ?? "rua") as keyof typeof BASE_MULTIPLIERS;
      const baseMultipliers = BASE_MULTIPLIERS[operationType] ?? BASE_MULTIPLIERS.rua;

      // Busca feriados do ano
      const holidays = await listHolidaysByYear(input.year);
      if (holidays.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhum feriado cadastrado para este ano. Clique em 'Carregar feriados nacionais' primeiro." });
      }

      // Prepara contexto para a IA
      const holidayList = holidays.map(h =>
        `${h.holidayDate} | ${h.name} | tipo: ${h.eventType}`
      ).join("\n");

      const prompt = `Você é um especialista em gestão de restaurantes no Brasil.

A loja "${store.name}" é do tipo "${operationType}" (${OPERATION_TYPE_LABELS[operationType] ?? operationType}).

Abaixo estão os feriados e vésperas do ano ${input.year}:
${holidayList}

Multiplicadores base para o tipo "${operationType}":
${JSON.stringify(baseMultipliers, null, 2)}

Para cada data listada, sugira um multiplicador de meta de faturamento (entre 0.0 e 2.0) considerando:
- 1.0 = dia normal
- < 1.0 = dia com faturamento abaixo do normal
- > 1.0 = dia com faturamento acima do normal
- 0.0 = loja fechada

Leve em conta o comportamento típico de uma operação "${operationType}" para cada feriado específico.
Adicione uma justificativa curta (máx 80 caracteres) para cada sugestão.

Responda APENAS com JSON válido no formato:
{
  "suggestions": [
    {
      "date": "YYYY-MM-DD",
      "eventType": "feriado|vespera|ponto_facultativo",
      "multiplier": 0.65,
      "notes": "justificativa curta"
    }
  ]
}`;

      let suggestions: Array<{
        date: string;
        eventType: "feriado" | "vespera" | "ponto_facultativo";
        multiplier: number;
        notes: string;
      }> = [];

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em gestão de restaurantes. Responda apenas com JSON válido." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "holiday_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string" },
                        eventType: { type: "string", enum: ["feriado", "vespera", "ponto_facultativo"] },
                        multiplier: { type: "number" },
                        notes: { type: "string" },
                      },
                      required: ["date", "eventType", "multiplier", "notes"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          } as any,
        });

        const rawContent = response.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (content) {
          const parsed = JSON.parse(content);
          suggestions = parsed.suggestions ?? [];
        }
      } catch {
        // Fallback: usa multiplicadores base sem IA
        suggestions = holidays.map(h => {
          const category = getHolidayCategory(h.name);
          const mults = baseMultipliers[category] ?? baseMultipliers.default;
          return {
            date: h.holidayDate,
            eventType: h.eventType,
            multiplier: mults[h.eventType as keyof typeof mults] ?? 1.0,
            notes: `Base para operação ${operationType}`,
          };
        });
      }

      return {
        storeName: store.name,
        operationType,
        suggestions,
      };
    }),

  // ── Salvar regra individual ────────────────────────────────────────────────
  saveRule: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      ruleDate: z.string(),
      eventType: z.enum(["feriado", "vespera", "ponto_facultativo"]),
      multiplier: z.number().min(0).max(2),
      source: z.enum(["ia", "manual"]).default("manual"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await upsertStoreHolidayRule(
        input.storeId,
        input.ruleDate,
        input.eventType,
        input.multiplier,
        input.source,
        input.notes
      );
      return { success: true };
    }),

  // ── Salvar sugestões da IA em lote ────────────────────────────────────────
  bulkSaveRules: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      rules: z.array(z.object({
        ruleDate: z.string(),
        eventType: z.enum(["feriado", "vespera", "ponto_facultativo"]),
        multiplier: z.number().min(0).max(2),
        source: z.enum(["ia", "manual"]).default("ia"),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      await bulkUpsertStoreHolidayRules(input.storeId, input.rules);
      return { success: true, count: input.rules.length };
    }),

  // ── Seed feriados nacionais (admin) ───────────────────────────────────────
  seedNationalHolidays: adminProcedure
    .input(z.object({ year: z.number().int().min(2024).max(2030) }))
    .mutation(async ({ input }) => {
      const count = await seedBrazilianHolidays(input.year);
      return { success: true, count, message: `${count} feriados carregados para ${input.year}.` };
    }),
});

const OPERATION_TYPE_LABELS: Record<string, string> = {
  aeroporto: "Aeroporto",
  mall: "Shopping/Mall",
  rua: "Rua/Bairro",
  corporativo: "Centro Corporativo",
  universitario: "Campus Universitário",
};
