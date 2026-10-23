/**
 * CMV Router — Product management, stock periods, movements, purchase entries, Excel import
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  closeStockPeriod, createProductCategory, createPurchaseEntry, createStockPeriod,
  deleteProduct, deleteProductCategory, deletePurchaseEntry, detectAlerts,
  getCMVSummaryByPeriod, getOpenStockPeriod, getProductCategories, getProducts,
  getPurchaseEntries, getStockMovements, getStockPeriods, updateProduct,
  updateProductCategory, upsertStockMovement, createProduct,
  getPrevPeriodMovements, saveCmvTeorico, getCmvHistorico, getUsaCmvTeorico, setUsaCmvTeorico,
  addProductPurchase, setProductPurchase,
} from "../db-cmv";
import { getDailyEntries, recomputeInvoicesForDate } from "../db";
import { assertPodeAcessarLoja } from "../auth-helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function getWeekBounds(week: number, year: number): { startDate: string; endDate: string } {
  // ISO week: Monday to Sunday
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000 + (week - 1) * 7 * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(weekStart), endDate: fmt(weekEnd) };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const cmvRouter = router({

  // ── Product Categories ──────────────────────────────────────────────────────
  categories: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => { await assertPodeAcessarLoja(ctx, input.storeId); return getProductCategories(input.storeId); }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        name: z.string().min(1),
        cmvTargetPct: z.number().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const id = await createProductCategory(input);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        storeId: z.number(),
        name: z.string().min(1).optional(),
        cmvTargetPct: z.number().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const { id, storeId: _s, ...data } = input;
        await updateProductCategory(id, data);
        return { ok: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number(), storeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        await deleteProductCategory(input.id);
        return { ok: true };
      }),
  }),

  // ── Products ────────────────────────────────────────────────────────────────
  products: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number(), includeInactive: z.boolean().optional() }))
      .query(async ({ ctx, input }) => { await assertPodeAcessarLoja(ctx, input.storeId); return getProducts(input.storeId, input.includeInactive ?? false); }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        categoryId: z.number().nullable().optional(),
        name: z.string().min(1),
        unit: z.string().min(1),
        unitCost: z.number().min(0).optional(),
        curveABC: z.enum(["A", "B", "C"]).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const id = await createProduct(input);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        storeId: z.number(),
        name: z.string().min(1).optional(),
        unit: z.string().min(1).optional(),
        unitCost: z.number().min(0).optional(),
        curveABC: z.enum(["A", "B", "C"]).optional(),
        categoryId: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const { id, storeId: _s, ...data } = input;
        await updateProduct(id, data);
        return { ok: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number(), storeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        await deleteProduct(input.id);
        return { ok: true };
      }),

    // Bulk import from parsed Excel data
    bulkImport: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        categories: z.array(z.object({
          name: z.string(),
          cmvTargetPct: z.number().optional(),
          products: z.array(z.object({
            name: z.string(),
            unit: z.string(),
            unitCost: z.number().optional(),
            curveABC: z.enum(["A", "B", "C"]).optional(),
          })),
        })),
        replaceExisting: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        let categoriesCreated = 0;
        let productsCreated = 0;

        for (let i = 0; i < input.categories.length; i++) {
          const cat = input.categories[i];
          const catId = await createProductCategory({
            storeId: input.storeId,
            name: cat.name,
            cmvTargetPct: cat.cmvTargetPct ?? 30,
            sortOrder: i,
          });
          categoriesCreated++;

          for (let j = 0; j < cat.products.length; j++) {
            const prod = cat.products[j];
            await createProduct({
              storeId: input.storeId,
              categoryId: catId,
              name: prod.name,
              unit: prod.unit || "KG",
              unitCost: prod.unitCost ?? 0,
              curveABC: prod.curveABC ?? "B",
              sortOrder: j,
            });
            productsCreated++;
          }
        }

        return { categoriesCreated, productsCreated };
      }),
  }),

  // ── Stock Periods ───────────────────────────────────────────────────────────
  periods: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number(), year: z.number().optional() }))
      .query(async ({ ctx, input }) => { await assertPodeAcessarLoja(ctx, input.storeId); return getStockPeriods(input.storeId, input.year); }),

    current: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => { await assertPodeAcessarLoja(ctx, input.storeId); return getOpenStockPeriod(input.storeId); }),

    open: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        startDate: z.string(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        // Check if there's already an open period
        const existing = await getOpenStockPeriod(input.storeId);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe um período aberto para esta loja. Feche-o antes de abrir um novo." });
        }

        const start = new Date(input.startDate);
        const { week, year } = getISOWeek(start);
        const { endDate: autoEnd } = getWeekBounds(week, year);
        const endDate = input.endDate ?? autoEnd;

        const id = await createStockPeriod({
          storeId: input.storeId,
          weekNumber: week,
          year,
          startDate: input.startDate,
          endDate,
          notes: input.notes,
        });

        // Auto-carry closing stock from previous period as opening stock
        const products = await getProducts(input.storeId);
        const prevPeriods = await getStockPeriods(input.storeId);
        const prevPeriod = prevPeriods.find(p => p.id !== id && p.status === "closed");

        if (prevPeriod) {
          const prevMovements = await getStockMovements(prevPeriod.id);
          for (const pm of prevMovements) {
            await upsertStockMovement({
              periodId: id,
              productId: pm.productId,
              storeId: input.storeId,
              openingStock: pm.closingStock,
              openingCost: pm.closingCost,
            });
          }
        }

        return { id, weekNumber: week, year, endDate };
      }),

    close: protectedProcedure
      .input(z.object({ periodId: z.number(), storeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        await closeStockPeriod(input.periodId);
        return { ok: true };
      }),
  }),

  // ── Stock Movements ─────────────────────────────────────────────────────────
  movements: router({
    list: protectedProcedure
      .input(z.object({ periodId: z.number(), storeId: z.number() }))
      .query(async ({ ctx, input }) => { await assertPodeAcessarLoja(ctx, input.storeId); return getStockMovements(input.periodId); }),

    // Save opening stock for a product
    setOpening: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        productId: z.number(),
        storeId: z.number(),
        quantity: z.number().min(0),
        unitCost: z.number().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const cost = (input.unitCost ?? 0) * input.quantity;
        await upsertStockMovement({
          periodId: input.periodId,
          productId: input.productId,
          storeId: input.storeId,
          openingStock: input.quantity,
          openingCost: cost,
        });
        return { ok: true };
      }),

    // Save closing stock for a product (triggers alert detection)
    setClosing: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        productId: z.number(),
        storeId: z.number(),
        quantity: z.number(),
        unitCost: z.number().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        // Get current movement to know opening + purchases
        const movements = await getStockMovements(input.periodId);
        const current = movements.find(m => m.productId === input.productId);
        const opening = current?.openingStock ?? 0;
        const purchases = current?.purchases ?? 0;
        const cost = (input.unitCost ?? 0) * input.quantity;

        // Get previous week consumption for anomaly detection
        const prev = await getPrevPeriodMovements(input.storeId, input.productId, input.periodId);

        const alerts = detectAlerts({
          openingStock: opening,
          purchases,
          closingStock: input.quantity,
          unitCost: input.unitCost ?? 0,
          prevWeekConsumption: prev?.consumption,
        });

        await upsertStockMovement({
          periodId: input.periodId,
          productId: input.productId,
          storeId: input.storeId,
          closingStock: input.quantity,
          closingCost: cost,
          alertFlags: alerts,
        });
        return { ok: true, alerts };
      }),

    // Save purchases for a product
    addPurchase: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        productId: z.number(),
        storeId: z.number(),
        quantity: z.number().min(0),
        totalCost: z.number().min(0),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const movements = await getStockMovements(input.periodId);
        const current = movements.find(m => m.productId === input.productId);
        const newPurchases = (current?.purchases ?? 0) + input.quantity;
        const newPurchasesCost = (current?.purchasesCost ?? 0) + input.totalCost;
        await upsertStockMovement({
          periodId: input.periodId,
          productId: input.productId,
          storeId: input.storeId,
          purchases: newPurchases,
          purchasesCost: newPurchasesCost,
        });
        return { ok: true };
      }),

    // Bulk save all movements for a period (used by the wizard)
    bulkSave: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        storeId: z.number(),
        movements: z.array(z.object({
          productId: z.number(),
          openingStock: z.number().optional(),
          purchases: z.number().optional(),
          closingStock: z.number().optional(),
          openingCost: z.number().optional(),
          purchasesCost: z.number().optional(),
          closingCost: z.number().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const products = await getProducts(input.storeId);
        const prevPeriods = await getStockPeriods(input.storeId);
        const prevPeriod = prevPeriods.find(p => p.id !== input.periodId && p.status === "closed");

        let alertsTotal = 0;
        for (const m of input.movements) {
          const product = products.find(p => p.id === m.productId);
          const prev = prevPeriod ? await getPrevPeriodMovements(input.storeId, m.productId, input.periodId) : null;
          const opening = m.openingStock ?? 0;
          const purchases = m.purchases ?? 0;
          const closing = m.closingStock ?? 0;

          const alerts = detectAlerts({
            openingStock: opening,
            purchases,
            closingStock: closing,
            unitCost: product?.unitCost ?? 0,
            prevWeekConsumption: prev?.consumption,
          });
          if (alerts.length > 0) alertsTotal++;

          await upsertStockMovement({
            periodId: input.periodId,
            productId: m.productId,
            storeId: input.storeId,
            openingStock: opening,
            purchases,
            closingStock: closing,
            openingCost: m.openingCost ?? opening * (product?.unitCost ?? 0),
            purchasesCost: m.purchasesCost ?? 0,
            closingCost: m.closingCost ?? closing * (product?.unitCost ?? 0),
            alertFlags: alerts,
          });
        }
        return { ok: true, alertsTotal };
      }),
  }),

  // ── Purchase Entries ────────────────────────────────────────────────────────
  purchases: router({
    list: protectedProcedure
      .input(z.object({ periodId: z.number() }))
      .query(({ input }) => getPurchaseEntries(input.periodId)),

    create: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        storeId: z.number(),
        supplier: z.string().optional(),
        categoryId: z.number().optional(),
        invoiceNumber: z.string().optional(),
        invoiceDate: z.string().optional(),
        totalValue: z.number().min(0),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const id = await createPurchaseEntry(input);
        return { id };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), storeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Buscar compra para obter data
        const rows = await rawQuery(
          `SELECT id, invoiceDate, storeId FROM purchase_entries WHERE id = ? AND storeId = ? LIMIT 1`,
          [input.id, input.storeId]
        );
        if ((rows as any[]).length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada" });
        }
        const compra = (rows as any[])[0];
        const dataCompra = compra.invoiceDate || new Date().toISOString().slice(0, 10);
        await assertPodeExcluirLancamento(ctx, input.storeId, dataCompra);
        await deletePurchaseEntry(input.id);
        // Recomputar invoices do dia
        const dateStr = typeof dataCompra === "object" ? (dataCompra as Date).toISOString().slice(0, 10) : String(dataCompra).slice(0, 10);
        await recomputeInvoicesForDate(input.storeId, dateStr);
        return { ok: true };
      }),
  }),

  // ── CMV Summary ─────────────────────────────────────────────────────────────
  summary: protectedProcedure
    .input(z.object({ periodId: z.number(), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const [movements, period, summaryByCategory] = await Promise.all([
        getStockMovements(input.periodId),
        getStockPeriods(input.storeId),
        getCMVSummaryByPeriod(input.periodId, input.storeId),
      ]);

      const p = period.find(p => p.id === input.periodId);
      let totalRevenue = 0;
      if (p) {
        const entries = await getDailyEntries(input.storeId, p.startDate, p.endDate);
        totalRevenue = entries.reduce((s, e) => s + parseFloat(e.revenue ?? "0"), 0);
      }

      const totalCmv = movements.reduce((s, m) => s + m.cmvValue, 0);
      const cmvPct = totalRevenue > 0 ? (totalCmv / totalRevenue) * 100 : 0;
      const totalAlerts = movements.filter(m => m.alertFlags && m.alertFlags.length > 0).length;

      // Enrich summary with revenue-based CMV%
      const enriched = summaryByCategory.map(cat => ({
        ...cat,
        totalRevenue,
        cmvPct: totalRevenue > 0 ? (cat.totalCmv / totalRevenue) * 100 : 0,
      }));

      return {
        totalCmv,
        totalRevenue,
        cmvPct,
        totalAlerts,
        byCategory: enriched,
        movements,
      };
    }),

  // ── Full Period View (products + movements + alerts) ─────────────────────────
  periodDetail: protectedProcedure
    .input(z.object({ periodId: z.number(), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const [products, categories, movements, purchases] = await Promise.all([
        getProducts(input.storeId),
        getProductCategories(input.storeId),
        getStockMovements(input.periodId),
        getPurchaseEntries(input.periodId),
      ]);

      // Merge products with their movements
      const productRows = products.map(p => {
        const m = movements.find(mv => mv.productId === p.id);
        const cat = categories.find(c => c.id === p.categoryId);
        return {
          ...p,
          categoryName: cat?.name ?? "Sem Categoria",
          cmvTarget: cat?.cmvTargetPct ?? 30,
          openingStock: m?.openingStock ?? 0,
          purchases: m?.purchases ?? 0,
          closingStock: m?.closingStock ?? 0,
          consumption: m?.consumption ?? 0,
          cmvValue: m?.cmvValue ?? 0,
          alertFlags: m?.alertFlags ?? [],
          hasMovement: !!m,
        };
      });

      return { products: productRows, categories, purchases };
    }),

  // ── CMV Teórico vs. Real ─────────────────────────────────────────────────────

  // Retorna se a loja usa CMV teórico
  getModoCmv: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const usa = await getUsaCmvTeorico(input.storeId);
      return { usaCmvTeorico: usa };
    }),

  // Admin/gerente ativa ou desativa o modo CMV teórico para a loja
  setModoCmv: protectedProcedure
    .input(z.object({ storeId: z.number(), ativo: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await setUsaCmvTeorico(input.storeId, input.ativo);
      return { ok: true };
    }),

  // Salva o CMV teórico de um período (chamado ao fechar o wizard de contagem)
  salvarCmvTeorico: protectedProcedure
    .input(z.object({
      periodId: z.number(),
      storeId: z.number(),
      cmvTeoricoRs: z.number().min(0),
      cmvTeoricoReceita: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await saveCmvTeorico(input.periodId, {
        cmvTeoricoRs: input.cmvTeoricoRs,
        cmvTeoricoReceita: input.cmvTeoricoReceita,
      });
      return { ok: true };
    }),

  // Histórico de CMV real vs. teórico (últimas N semanas)
  historicoCmv: protectedProcedure
    .input(z.object({ storeId: z.number(), limit: z.number().min(1).max(52).optional() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getCmvHistorico(input.storeId, input.limit ?? 12);
    }),

  // ─── Importação de planilha de produtos ──────────────────────────────────

  // Parseia planilha Excel em base64 e retorna pré-visualização
  parseProductSheet: protectedProcedure
    .input(z.object({ base64: z.string() }))
    .mutation(async ({ input }) => {
      const { parseProductSheet } = await import("../sheet-parser");
      return parseProductSheet(input.base64);
    }),

  // Importa produtos a partir de dados já parseados e validados pelo usuário
  importProducts: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      rows: z.array(z.object({
        nome: z.string(),
        categoria: z.string(),
        unidade: z.string(),
        curvaABC: z.enum(["A", "B", "C"]),
        custoUnitario: z.number(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      // Agrupar por categoria
      const catMap = new Map<string, typeof input.rows>();
      for (const row of input.rows) {
        if (!catMap.has(row.categoria)) catMap.set(row.categoria, []);
        catMap.get(row.categoria)!.push(row);
      }
      let categoriesCreated = 0;
      let productsCreated = 0;
      let sortIdx = 0;
      for (const [catName, products] of Array.from(catMap.entries())) {
        const catId = await createProductCategory({
          storeId: input.storeId,
          name: catName,
          cmvTargetPct: 30,
          sortOrder: sortIdx++,
        });
        categoriesCreated++;
        for (let j = 0; j < products.length; j++) {
          const p = products[j];
          await createProduct({
            storeId: input.storeId,
            categoryId: catId,
            name: p.nome,
            unit: p.unidade || "KG",
            unitCost: p.custoUnitario,
            curveABC: p.curvaABC,
            sortOrder: j,
          });
          productsCreated++;
        }
      }
      return { categoriesCreated, productsCreated };
    }),


  // ── Compras por Produto ─────────────────────────────────────────────────────
  // Lança uma compra de produto no período (SOMA ao já existente)
  addProductPurchase: protectedProcedure
    .input(z.object({
      periodId: z.number(),
      productId: z.number(),
      storeId: z.number(),
      qty: z.number().min(0),
      totalCost: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await addProductPurchase({
        periodId: input.periodId,
        productId: input.productId,
        storeId: input.storeId,
        qty: input.qty,
        totalCost: input.totalCost,
      });
      return { ok: true };
    }),

  // Corrige a compra de um produto no período (SUBSTITUI)
  setProductPurchase: protectedProcedure
    .input(z.object({
      periodId: z.number(),
      productId: z.number(),
      storeId: z.number(),
      qty: z.number().min(0),
      totalCost: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await setProductPurchase({
        periodId: input.periodId,
        productId: input.productId,
        storeId: input.storeId,
        qty: input.qty,
        totalCost: input.totalCost,
      });
      return { ok: true };
    }),

  // Importa planilha de compras: produto/nome, quantidade, custo total
  // Retorna prévia para confirmação antes de gravar
  parsePurchaseSheet: protectedProcedure
    .input(z.object({ base64: z.string(), fileName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { parseSpreadsheetToGrid, parseNumeroBR } = await import("../sheet-parser");
      const result = parseSpreadsheetToGrid(input.base64, input.fileName ?? "compras.xlsx");
      const firstSheet = result.sheets[0];
      if (!firstSheet || firstSheet.rows.length < 2) {
        return { rows: [], warnings: ["Planilha vazia ou sem dados"] };
      }
      const grid = firstSheet.rows;
      // Detectar colunas: nome, quantidade, custo/valor
      const header = grid[0].cells.map((h: unknown) => String(h ?? "").toLowerCase().trim());
      const colNome = header.findIndex((h: string) => h.includes("produto") || h.includes("nome") || h.includes("item") || h.includes("descri"));
      const colQty  = header.findIndex((h: string) => h.includes("qtd") || h.includes("quant") || h.includes("kg") || h.includes("unid"));
      const colCusto = header.findIndex((h: string) => h.includes("custo") || h.includes("valor") || h.includes("total") || h.includes("r$") || h.includes("preco") || h.includes("preço"));
      const warnings: string[] = [];
      if (colNome < 0) warnings.push("Coluna de produto/nome não encontrada");
      if (colQty < 0) warnings.push("Coluna de quantidade não encontrada");
      if (colCusto < 0) warnings.push("Coluna de custo/valor não encontrada");
      const rows: Array<{ nome: string; qty: number; totalCost: number; errors: string[] }> = [];
      for (let i = 1; i < grid.length; i++) {
        const cells = grid[i].cells;
        const nome = colNome >= 0 ? String(cells[colNome] ?? "").trim() : "";
        const qty  = colQty >= 0  ? parseNumeroBR(cells[colQty]) : 0;
        const custo = colCusto >= 0 ? parseNumeroBR(cells[colCusto]) : 0;
        if (!nome) continue;
        const rowErrors: string[] = [];
        if (isNaN(qty) || qty < 0) rowErrors.push("quantidade inválida");
        if (isNaN(custo) || custo < 0) rowErrors.push("custo inválido");
        rows.push({ nome, qty: isNaN(qty) ? 0 : qty, totalCost: isNaN(custo) ? 0 : custo, errors: rowErrors });
      }
      return { rows, warnings };
    }),

  // Confirma a importação de compras: casa por nome normalizado, cria produto se não existe
  importPurchaseSheet: protectedProcedure
    .input(z.object({
      periodId: z.number(),
      storeId: z.number(),
      rows: z.array(z.object({
        nome: z.string(),
        qty: z.number().min(0),
        totalCost: z.number().min(0),
      })),
      addMode: z.enum(["add", "set"]).default("add"), // add=soma, set=substitui
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const products = await getProducts(input.storeId);
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      let matched = 0, created = 0, skipped = 0;
      for (const row of input.rows) {
        if (!row.nome.trim()) { skipped++; continue; }
        const normRow = normalize(row.nome);
        let product = products.find(p => normalize(p.name) === normRow);
        if (!product) {
          // Criar produto automaticamente
          const newId = await createProduct({
            storeId: input.storeId,
            name: row.nome,
            unit: "KG",
            unitCost: row.qty > 0 ? row.totalCost / row.qty : 0,
            curveABC: "B",
          });
          product = { id: newId, storeId: input.storeId, name: row.nome, unit: "KG",
            unitCost: row.qty > 0 ? row.totalCost / row.qty : 0, curveABC: "B",
            active: true, categoryId: null, sortOrder: 0 } as any;
          created++;
        } else {
          matched++;
        }
        const fn = input.addMode === "set" ? setProductPurchase : addProductPurchase;
        await fn({ periodId: input.periodId, productId: product!.id, storeId: input.storeId,
          qty: row.qty, totalCost: row.totalCost });
      }
      return { matched, created, skipped };
    }),

  // Download do template Excel de produtos
  downloadProductTemplate: protectedProcedure
    .query(async () => {
      const { generateProductTemplate } = await import("../sheet-parser");
      const buf = generateProductTemplate();
      return { base64: buf.toString("base64"), filename: "template-produtos.xlsx" };
    }),

  // ─── Compras da Central de Lançamentos ──────────────────────────────────────
  extrairNotaCompra: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      imageBase64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { invokeLLM } = await import("../_core/llm");
      const { MODEL_FAST } = await import("../_core/llm-models");
      const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;
      const response = await invokeLLM({
        model: MODEL_FAST,
        messages: [
          {
            role: "system",
            content: "Você recebe a foto de uma nota/cupom fiscal de compra de um restaurante. Extraia emitente (fornecedor), data de emissão e valor total. Se não conseguir ler algum campo, retorne null. Não invente.",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: "Extraia os dados desta nota fiscal de compra e retorne em JSON." },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "nota_compra",
            strict: true,
            schema: {
              type: "object",
              properties: {
                fornecedor: { type: ["string", "null"], description: "Nome do emitente/fornecedor" },
                dataEmissao: { type: ["string", "null"], description: "Data de emissão YYYY-MM-DD" },
                valorTotal: { type: ["number", "null"], description: "Valor total da nota" },
                grupoSugerido: { type: ["string", "null"], description: "Grupo de insumo sugerido (ex: carnes, laticínios, bebidas, descartáveis, limpeza)" },
                confianca: { type: "number", description: "Confiança da extração de 0 a 1" },
              },
              required: ["fornecedor", "dataEmissao", "valorTotal", "grupoSugerido", "confianca"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        return { fornecedor: null, dataEmissao: null, valorTotal: null, grupoSugerido: null, confianca: 0, baixaConfianca: true };
      }
      try {
        const parsed = JSON.parse(content);
        return { ...parsed, baixaConfianca: (parsed.confianca ?? 0) < 0.6 };
      } catch {
        return { fornecedor: null, dataEmissao: null, valorTotal: null, grupoSugerido: null, confianca: 0, baixaConfianca: true };
      }
    }),

  lancarCompra: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fornecedor: z.string().optional(),
      categoriaId: z.number().optional(),
      invoiceNumber: z.string().optional(),
      valorTotal: z.number().min(0.01),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      // Trava de mês fechado
      const anoMes = input.data.slice(0, 7);
      const fechRows = await rawQuery(
        `SELECT id FROM dre_fechamentos WHERE store_id = ? AND ano_mes = ? AND status = 'fechado' LIMIT 1`,
        [input.storeId, anoMes]
      );
      if ((fechRows as any[]).length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Mês fechado. Reabra para lançar compras." });
      }
      // Encontrar ou criar período aberto para o mês
      let period = await getOpenStockPeriod(input.storeId);
      if (!period) {
        const dt = new Date(input.data + "T12:00:00");
        const y = dt.getFullYear();
        const m = dt.getMonth();
        const startDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const endDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const weekNum = Math.ceil(dt.getDate() / 7);
        const newId = await createStockPeriod({ storeId: input.storeId, weekNumber: weekNum, year: y, startDate, endDate });
        period = { id: newId, storeId: input.storeId, weekNumber: weekNum, year: y, startDate, endDate, status: "open", notes: null, createdAt: new Date(), closedAt: null } as any;
      }
      // Inserir em purchase_entries
      await rawQuery(
        `INSERT INTO purchase_entries (periodId, storeId, supplier, categoryId, invoiceNumber, invoiceDate, totalValue, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [period!.id, input.storeId, input.fornecedor ?? null, input.categoriaId ?? null, input.invoiceNumber ?? null, input.data, input.valorTotal, input.observacao ?? null]
      );
      // Recomputar invoices do dia no daily_entries
      await recomputeInvoicesForDate(input.storeId, input.data);
      return { ok: true, periodId: period!.id };
    }),

  listarComprasMes: protectedProcedure
    .input(z.object({ storeId: z.number(), anoMes: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const rows = await rawQuery(
        `SELECT pe.id, pe.supplier, pe.categoryId, pe.invoiceNumber,
                DATE_FORMAT(pe.invoiceDate, '%Y-%m-%d') AS invoiceDate,
                pe.totalValue, pe.notes, pe.createdAt,
                pc.name AS categoryName
         FROM purchase_entries pe
         LEFT JOIN product_categories pc ON pc.id = pe.categoryId
         WHERE pe.storeId = ? AND pe.invoiceDate LIKE ?
         ORDER BY pe.invoiceDate DESC, pe.id DESC`,
        [input.storeId, `${input.anoMes}%`]
      );
      return (rows as any[]).map(r => ({
        id: r.id as number,
        supplier: r.supplier as string | null,
        categoryId: r.categoryId as number | null,
        categoryName: r.categoryName as string | null,
        invoiceNumber: r.invoiceNumber as string | null,
        invoiceDate: r.invoiceDate as string,
        totalValue: Number(r.totalValue),
        notes: r.notes as string | null,
      }));
    }),
});
import { adminProcedure } from "../_core/trpc";
import { assertPodeExcluirLancamento } from "../auth-helpers";
import { rawQuery } from "../db";
