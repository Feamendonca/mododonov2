/**
 * CMV Module — Database helpers
 * Handles product categories, products, stock periods, movements and purchase entries.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, rawQuery } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductCategory = {
  id: number;
  storeId: number;
  name: string;
  cmvTargetPct: number;
  sortOrder: number;
};

export type Product = {
  id: number;
  storeId: number;
  categoryId: number | null;
  name: string;
  unit: string;
  unitCost: number;
  curveABC: "A" | "B" | "C";
  isActive: boolean;
  sortOrder: number;
};

export type StockPeriod = {
  id: number;
  storeId: number;
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  notes: string | null;
  createdAt: Date;
  closedAt: Date | null;
};

export type StockMovement = {
  id: number;
  periodId: number;
  productId: number;
  storeId: number;
  openingStock: number;
  purchases: number;
  closingStock: number;
  consumption: number;
  openingCost: number;
  purchasesCost: number;
  closingCost: number;
  cmvValue: number;
  alertFlags: string[] | null;
};

export type PurchaseEntry = {
  id: number;
  periodId: number;
  storeId: number;
  supplier: string | null;
  categoryId: number | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalValue: number;
  notes: string | null;
};

// ─── Alert Detection ──────────────────────────────────────────────────────────

export type AlertFlag =
  | "negative_stock"
  | "unnecessary_purchase"
  | "anomalous_consumption"
  | "zero_consumption"
  | "high_cmv";

export function detectAlerts(params: {
  openingStock: number;
  purchases: number;
  closingStock: number;
  unitCost: number;
  prevWeekConsumption?: number;
  cmvPct?: number;
  cmvTargetPct?: number;
}): AlertFlag[] {
  const { openingStock, purchases, closingStock, prevWeekConsumption, cmvPct, cmvTargetPct } = params;
  const consumption = openingStock + purchases - closingStock;
  const flags: AlertFlag[] = [];

  // Estoque negativo
  if (closingStock < 0) flags.push("negative_stock");

  // Compra desnecessária: tinha estoque suficiente + comprou + consumo < compra
  // Exemplo: tinha 5kg, comprou 5kg, consumiu 3kg → não precisava comprar
  if (purchases > 0 && openingStock > 0 && consumption < purchases && consumption > 0) {
    const stockCoverage = openingStock / Math.max(consumption, 0.001);
    if (stockCoverage > 0.7) {
      flags.push("unnecessary_purchase");
    }
  }

  // Consumo anômalo: muito diferente da semana anterior (>50% de desvio)
  if (prevWeekConsumption !== undefined && prevWeekConsumption > 0 && consumption > 0) {
    const deviation = Math.abs(consumption - prevWeekConsumption) / prevWeekConsumption;
    if (deviation > 0.5) flags.push("anomalous_consumption");
  }

  // Consumo zero quando havia estoque e compras
  if (consumption === 0 && (openingStock > 0 || purchases > 0) && closingStock > 0) {
    flags.push("zero_consumption");
  }

  // CMV alto
  if (cmvPct !== undefined && cmvTargetPct !== undefined && cmvPct > cmvTargetPct * 1.1) {
    flags.push("high_cmv");
  }

  return flags;
}

// ─── Product Categories ───────────────────────────────────────────────────────

export async function getProductCategories(storeId: number): Promise<ProductCategory[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(
    sql`SELECT id, storeId, name, CAST(cmvTargetPct AS DECIMAL(5,2)) as cmvTargetPct, sortOrder
        FROM product_categories WHERE storeId = ${storeId} ORDER BY sortOrder, name`
  );
  return ((rows as unknown as any[][])[0]).map((r: any) => ({
    id: r.id,
    storeId: r.storeId,
    name: r.name,
    cmvTargetPct: parseFloat(r.cmvTargetPct) || 30,
    sortOrder: r.sortOrder || 0,
  }));
}

export async function createProductCategory(data: {
  storeId: number;
  name: string;
  cmvTargetPct?: number;
  sortOrder?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.execute(
    sql`INSERT INTO product_categories (storeId, name, cmvTargetPct, sortOrder)
        VALUES (${data.storeId}, ${data.name}, ${data.cmvTargetPct ?? 30}, ${data.sortOrder ?? 0})`
  );
  return (result as unknown as any).insertId;
}

export async function updateProductCategory(id: number, data: {
  name?: string;
  cmvTargetPct?: number;
  sortOrder?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
  if (data.cmvTargetPct !== undefined) { sets.push("cmvTargetPct = ?"); vals.push(data.cmvTargetPct); }
  if (data.sortOrder !== undefined) { sets.push("sortOrder = ?"); vals.push(data.sortOrder); }
  if (sets.length === 0) return;
  vals.push(id);
  await (db as any).$client.promise().execute(`UPDATE product_categories SET ${sets.join(", ")} WHERE id = ?`, vals);
}

export async function deleteProductCategory(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`DELETE FROM product_categories WHERE id = ${id}`);
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(storeId: number, includeInactive = false): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  const activeFilter = includeInactive ? "" : "AND p.isActive = 1";
  const rows = await db.execute(
    sql.raw(`SELECT p.id, p.storeId, p.categoryId, p.name, p.unit,
             CAST(p.unitCost AS DECIMAL(10,4)) as unitCost,
             p.curveABC, p.isActive, p.sortOrder
             FROM products p
             WHERE p.storeId = ${storeId} ${activeFilter}
             ORDER BY p.sortOrder, p.name`)
  );
  return ((rows as unknown as any[][])[0]).map((r: any) => ({
    id: r.id,
    storeId: r.storeId,
    categoryId: r.categoryId,
    name: r.name,
    unit: r.unit,
    unitCost: parseFloat(r.unitCost) || 0,
    curveABC: r.curveABC || "B",
    isActive: !!r.isActive,
    sortOrder: r.sortOrder || 0,
  }));
}

export async function createProduct(data: {
  storeId: number;
  categoryId?: number | null;
  name: string;
  unit: string;
  unitCost?: number;
  curveABC?: "A" | "B" | "C";
  sortOrder?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.execute(
    sql`INSERT INTO products (storeId, categoryId, name, unit, unitCost, curveABC, sortOrder)
        VALUES (${data.storeId}, ${data.categoryId ?? null}, ${data.name}, ${data.unit},
                ${data.unitCost ?? 0}, ${data.curveABC ?? "B"}, ${data.sortOrder ?? 0})`
  );
  return (result as unknown as any).insertId;
}

export async function updateProduct(id: number, data: Partial<Omit<Product, "id" | "storeId">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
  if (data.unit !== undefined) { sets.push("unit = ?"); vals.push(data.unit); }
  if (data.unitCost !== undefined) { sets.push("unitCost = ?"); vals.push(data.unitCost); }
  if (data.curveABC !== undefined) { sets.push("curveABC = ?"); vals.push(data.curveABC); }
  if (data.categoryId !== undefined) { sets.push("categoryId = ?"); vals.push(data.categoryId); }
  if (data.isActive !== undefined) { sets.push("isActive = ?"); vals.push(data.isActive ? 1 : 0); }
  if (data.sortOrder !== undefined) { sets.push("sortOrder = ?"); vals.push(data.sortOrder); }
  if (sets.length === 0) return;
  vals.push(id);
  await (db as any).$client.promise().execute(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, vals);
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE products SET isActive = 0 WHERE id = ${id}`);
}

// ─── Stock Periods ────────────────────────────────────────────────────────────

export async function getStockPeriods(storeId: number, year?: number): Promise<StockPeriod[]> {
  const db = await getDb();
  if (!db) return [];
  const yearFilter = year ? `AND year = ${year}` : "";
  const rows = await db.execute(
    sql.raw(`SELECT id, storeId, weekNumber, year,
             DATE_FORMAT(startDate, '%Y-%m-%d') as startDate,
             DATE_FORMAT(endDate, '%Y-%m-%d') as endDate,
             status, notes, createdAt, closedAt
             FROM stock_periods
             WHERE storeId = ${storeId} ${yearFilter}
             ORDER BY year DESC, weekNumber DESC`)
  );
  return ((rows as unknown as any[][])[0]).map((r: any) => ({
    id: r.id,
    storeId: r.storeId,
    weekNumber: r.weekNumber,
    year: r.year,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt,
    closedAt: r.closedAt,
  }));
}

export async function getOpenStockPeriod(storeId: number): Promise<StockPeriod | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.execute(
    sql`SELECT id, storeId, weekNumber, year,
        DATE_FORMAT(startDate, '%Y-%m-%d') as startDate,
        DATE_FORMAT(endDate, '%Y-%m-%d') as endDate,
        status, notes, createdAt, closedAt
        FROM stock_periods
        WHERE storeId = ${storeId} AND status = 'open'
        ORDER BY year DESC, weekNumber DESC LIMIT 1`
  );
  const r = ((rows as unknown as any[][])[0])[0];
  if (!r) return null;
  return {
    id: r.id, storeId: r.storeId, weekNumber: r.weekNumber, year: r.year,
    startDate: r.startDate, endDate: r.endDate, status: r.status,
    notes: r.notes, createdAt: r.createdAt, closedAt: r.closedAt,
  };
}

export async function createStockPeriod(data: {
  storeId: number;
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  notes?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.execute(
    sql`INSERT INTO stock_periods (storeId, weekNumber, year, startDate, endDate, notes)
        VALUES (${data.storeId}, ${data.weekNumber}, ${data.year}, ${data.startDate}, ${data.endDate}, ${data.notes ?? null})`
  );
  return (result as unknown as any).insertId;
}

export async function closeStockPeriod(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`UPDATE stock_periods SET status = 'closed', closedAt = NOW() WHERE id = ${id}`
  );
}

// ─── Stock Movements ──────────────────────────────────────────────────────────

export async function getStockMovements(periodId: number): Promise<StockMovement[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(
    sql`SELECT sm.id, sm.periodId, sm.productId, sm.storeId,
        CAST(sm.openingStock AS DECIMAL(10,3)) as openingStock,
        CAST(sm.purchases AS DECIMAL(10,3)) as purchases,
        CAST(sm.closingStock AS DECIMAL(10,3)) as closingStock,
        CAST(sm.consumption AS DECIMAL(10,3)) as consumption,
        CAST(sm.openingCost AS DECIMAL(10,2)) as openingCost,
        CAST(sm.purchasesCost AS DECIMAL(10,2)) as purchasesCost,
        CAST(sm.closingCost AS DECIMAL(10,2)) as closingCost,
        CAST(sm.cmvValue AS DECIMAL(10,2)) as cmvValue,
        sm.alertFlags
        FROM stock_movements sm
        WHERE sm.periodId = ${periodId}
        ORDER BY sm.productId`
  );
  return ((rows as unknown as any[][])[0]).map((r: any) => ({
    id: r.id, periodId: r.periodId, productId: r.productId, storeId: r.storeId,
    openingStock: parseFloat(r.openingStock) || 0,
    purchases: parseFloat(r.purchases) || 0,
    closingStock: parseFloat(r.closingStock) || 0,
    consumption: parseFloat(r.consumption) || 0,
    openingCost: parseFloat(r.openingCost) || 0,
    purchasesCost: parseFloat(r.purchasesCost) || 0,
    closingCost: parseFloat(r.closingCost) || 0,
    cmvValue: parseFloat(r.cmvValue) || 0,
    alertFlags: r.alertFlags ? (typeof r.alertFlags === "string" ? JSON.parse(r.alertFlags) : r.alertFlags) : null,
  }));
}

export async function upsertStockMovement(data: {
  periodId: number;
  productId: number;
  storeId: number;
  openingStock?: number;
  purchases?: number;
  closingStock?: number;
  openingCost?: number;
  purchasesCost?: number;
  closingCost?: number;
  alertFlags?: string[];
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const flags = data.alertFlags ? JSON.stringify(data.alertFlags) : null;
  // Port Postgres: via rawQuery (shim traduz ? → $n, camelCase → "camelCase",
  // ON CONFLICT + VALUES() → EXCLUDED.).
  await rawQuery(
    `INSERT INTO stock_movements
        (periodId, productId, storeId, openingStock, purchases, closingStock, openingCost, purchasesCost, closingCost, alertFlags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (periodId, productId) DO UPDATE SET
          openingStock  = COALESCE(VALUES(openingStock),  openingStock),
          purchases     = COALESCE(VALUES(purchases),     purchases),
          closingStock  = COALESCE(VALUES(closingStock),  closingStock),
          openingCost   = COALESCE(VALUES(openingCost),   openingCost),
          purchasesCost = COALESCE(VALUES(purchasesCost), purchasesCost),
          closingCost   = COALESCE(VALUES(closingCost),   closingCost),
          alertFlags    = COALESCE(VALUES(alertFlags),    alertFlags),
          updatedAt     = NOW()`,
    [data.periodId, data.productId, data.storeId,
     data.openingStock ?? null, data.purchases ?? null, data.closingStock ?? null,
     data.openingCost ?? null, data.purchasesCost ?? null, data.closingCost ?? null, flags]
  );
}

export async function getPrevPeriodMovements(storeId: number, productId: number, beforePeriodId: number): Promise<StockMovement | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.execute(
    sql`SELECT sm.id, sm.periodId, sm.productId, sm.storeId,
        CAST(sm.openingStock AS DECIMAL(10,3)) as openingStock,
        CAST(sm.purchases AS DECIMAL(10,3)) as purchases,
        CAST(sm.closingStock AS DECIMAL(10,3)) as closingStock,
        CAST(sm.consumption AS DECIMAL(10,3)) as consumption,
        CAST(sm.openingCost AS DECIMAL(10,2)) as openingCost,
        CAST(sm.purchasesCost AS DECIMAL(10,2)) as purchasesCost,
        CAST(sm.closingCost AS DECIMAL(10,2)) as closingCost,
        CAST(sm.cmvValue AS DECIMAL(10,2)) as cmvValue,
        sm.alertFlags
        FROM stock_movements sm
        JOIN stock_periods sp ON sm.periodId = sp.id
        WHERE sm.storeId = ${storeId} AND sm.productId = ${productId}
          AND sm.periodId < ${beforePeriodId}
        ORDER BY sp.year DESC, sp.weekNumber DESC LIMIT 1`
  );
  const r = ((rows as unknown as any[][])[0])[0];
  if (!r) return null;
  return {
    id: r.id, periodId: r.periodId, productId: r.productId, storeId: r.storeId,
    openingStock: parseFloat(r.openingStock) || 0,
    purchases: parseFloat(r.purchases) || 0,
    closingStock: parseFloat(r.closingStock) || 0,
    consumption: parseFloat(r.consumption) || 0,
    openingCost: parseFloat(r.openingCost) || 0,
    purchasesCost: parseFloat(r.purchasesCost) || 0,
    closingCost: parseFloat(r.closingCost) || 0,
    cmvValue: parseFloat(r.cmvValue) || 0,
    alertFlags: r.alertFlags ? (typeof r.alertFlags === "string" ? JSON.parse(r.alertFlags) : r.alertFlags) : null,
  };
}

// ─── Purchase Entries ─────────────────────────────────────────────────────────
// ─── Compras por Produto ──────────────────────────────────────────────────────

/**
 * Adiciona (soma) uma compra de produto ao stock_movements do período.
 * Múltiplas notas do mesmo produto no mesmo período se acumulam.
 */
export async function addProductPurchase(params: {
  periodId: number;
  productId: number;
  storeId: number;
  qty: number;
  totalCost: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { periodId, productId, storeId, qty, totalCost } = params;
  await db.execute(
    sql`INSERT INTO stock_movements (periodId, productId, storeId, purchases, purchasesCost)
        VALUES (${periodId}, ${productId}, ${storeId}, ${qty}, ${totalCost})
        ON DUPLICATE KEY UPDATE
          purchases     = purchases     + VALUES(purchases),
          purchasesCost = purchasesCost + VALUES(purchasesCost)`
  );
}

/**
 * Substitui (não soma) as compras de um produto no período.
 * Usado para corrigir um lançamento já feito.
 */
export async function setProductPurchase(params: {
  periodId: number;
  productId: number;
  storeId: number;
  qty: number;
  totalCost: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { periodId, productId, storeId, qty, totalCost } = params;
  await db.execute(
    sql`INSERT INTO stock_movements (periodId, productId, storeId, purchases, purchasesCost)
        VALUES (${periodId}, ${productId}, ${storeId}, ${qty}, ${totalCost})
        ON DUPLICATE KEY UPDATE
          purchases     = VALUES(purchases),
          purchasesCost = VALUES(purchasesCost)`
  );
}

export async function getPurchaseEntries(periodId: number): Promise<PurchaseEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(
    sql`SELECT id, periodId, storeId, supplier, categoryId, invoiceNumber,
        DATE_FORMAT(invoiceDate, '%Y-%m-%d') as invoiceDate,
        CAST(totalValue AS DECIMAL(10,2)) as totalValue, notes
        FROM purchase_entries WHERE periodId = ${periodId}
        ORDER BY invoiceDate, supplier`
  );
  return ((rows as unknown as any[][])[0]).map((r: any) => ({
    id: r.id, periodId: r.periodId, storeId: r.storeId,
    supplier: r.supplier, categoryId: r.categoryId,
    invoiceNumber: r.invoiceNumber, invoiceDate: r.invoiceDate,
    totalValue: parseFloat(r.totalValue) || 0, notes: r.notes,
  }));
}

export async function createPurchaseEntry(data: {
  periodId: number;
  storeId: number;
  supplier?: string;
  categoryId?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  totalValue: number;
  notes?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.execute(
    sql`INSERT INTO purchase_entries (periodId, storeId, supplier, categoryId, invoiceNumber, invoiceDate, totalValue, notes)
        VALUES (${data.periodId}, ${data.storeId}, ${data.supplier ?? null}, ${data.categoryId ?? null},
                ${data.invoiceNumber ?? null}, ${data.invoiceDate ?? null}, ${data.totalValue}, ${data.notes ?? null})`
  );
  return (result as unknown as any).insertId;
}

export async function deletePurchaseEntry(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`DELETE FROM purchase_entries WHERE id = ${id}`);
}

// ─── CMV Summary ──────────────────────────────────────────────────────────────

export type CMVSummary = {
  categoryId: number | null;
  categoryName: string;
  totalCmv: number;
  totalRevenue: number;
  cmvPct: number;
  targetPct: number;
  productCount: number;
  alertCount: number;
};

export async function getCMVSummaryByPeriod(periodId: number, storeId: number): Promise<CMVSummary[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(
    sql`SELECT
          pc.id as categoryId,
          COALESCE(pc.name, 'Sem Categoria') as categoryName,
          COALESCE(pc.cmvTargetPct, 30) as targetPct,
          SUM(sm.cmvValue) as totalCmv,
          COUNT(sm.id) as productCount,
          SUM(CASE WHEN sm.alertFlags IS NOT NULL AND sm.alertFlags != '[]' AND sm.alertFlags != 'null' THEN 1 ELSE 0 END) as alertCount
        FROM stock_movements sm
        LEFT JOIN products p ON sm.productId = p.id
        LEFT JOIN product_categories pc ON p.categoryId = pc.id
        WHERE sm.periodId = ${periodId} AND sm.storeId = ${storeId}
        GROUP BY pc.id, pc.name, pc.cmvTargetPct
        ORDER BY totalCmv DESC`
  );
  return ((rows as unknown as any[][])[0]).map((r: any) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    totalCmv: parseFloat(r.totalCmv) || 0,
    totalRevenue: 0, // filled in by router from daily entries
    cmvPct: 0, // filled in by router
    targetPct: parseFloat(r.targetPct) || 30,
    productCount: parseInt(r.productCount) || 0,
    alertCount: parseInt(r.alertCount) || 0,
  }));
}

// --- CMV Teorico & Dispersao ---

export type CmvTeoricoPayload = {
  cmvTeoricoRs: number;
  cmvTeoricoReceita: number;
};

export async function saveCmvTeorico(
  periodId: number,
  payload: CmvTeoricoPayload
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const realRows = await db.execute(
    sql`SELECT COALESCE(SUM(cmvValue), 0) as totalCmv FROM stock_movements WHERE periodId = ${periodId}`
  );
  const totalCmvReal: number = parseFloat(((realRows as unknown as any[][])[0])[0]?.totalCmv ?? "0");

  const cmvTeoricoPct = payload.cmvTeoricoReceita > 0
    ? (payload.cmvTeoricoRs / payload.cmvTeoricoReceita) * 100
    : 0;

  const dispersaoRs = totalCmvReal - payload.cmvTeoricoRs;
  const dispersaoPct = payload.cmvTeoricoReceita > 0
    ? (dispersaoRs / payload.cmvTeoricoReceita) * 100
    : 0;

  await db.execute(
    sql`UPDATE stock_periods
        SET cmvTeoricoRs = ${payload.cmvTeoricoRs},
            cmvTeoricoReceita = ${payload.cmvTeoricoReceita},
            cmvTeoricoPct = ${cmvTeoricoPct},
            dispersaoRs = ${dispersaoRs},
            dispersaoPct = ${dispersaoPct}
        WHERE id = ${periodId}`
  );
}

export async function getCmvHistorico(
  storeId: number,
  limit = 12
): Promise<Array<{
  periodId: number;
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  status: string;
  cmvRealRs: number;
  cmvRealPct: number;
  cmvTeoricoRs: number | null;
  cmvTeoricoPct: number | null;
  dispersaoRs: number | null;
  dispersaoPct: number | null;
  receita: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(
    sql.raw(`
      SELECT
        sp.id as periodId,
        sp.weekNumber,
        sp.year,
        DATE_FORMAT(sp.startDate, '%Y-%m-%d') as startDate,
        DATE_FORMAT(sp.endDate, '%Y-%m-%d') as endDate,
        sp.status,
        sp.cmvTeoricoRs,
        sp.cmvTeoricoPct,
        sp.dispersaoRs,
        sp.dispersaoPct,
        COALESCE(SUM(sm.cmvValue), 0) as cmvRealRs,
        COALESCE(sp.cmvTeoricoReceita, 0) as receita
      FROM stock_periods sp
      LEFT JOIN stock_movements sm ON sm.periodId = sp.id
      WHERE sp.storeId = ${storeId}
      GROUP BY sp.id
      ORDER BY sp.year DESC, sp.weekNumber DESC
      LIMIT ${limit}
    `)
  );

  return ((rows as unknown as any[][])[0]).map((r: any) => {
    const cmvRealRs = parseFloat(r.cmvRealRs) || 0;
    const receita = parseFloat(r.receita) || 0;
    return {
      periodId: r.periodId,
      weekNumber: r.weekNumber,
      year: r.year,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      cmvRealRs,
      cmvRealPct: receita > 0 ? (cmvRealRs / receita) * 100 : 0,
      cmvTeoricoRs: r.cmvTeoricoRs != null ? parseFloat(r.cmvTeoricoRs) : null,
      cmvTeoricoPct: r.cmvTeoricoPct != null ? parseFloat(r.cmvTeoricoPct) : null,
      dispersaoRs: r.dispersaoRs != null ? parseFloat(r.dispersaoRs) : null,
      dispersaoPct: r.dispersaoPct != null ? parseFloat(r.dispersaoPct) : null,
      receita,
    };
  });
}

export async function getUsaCmvTeorico(storeId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.execute(
    sql`SELECT usaCmvTeorico FROM stores WHERE id = ${storeId}`
  );
  const r = ((rows as unknown as any[][])[0])[0];
  return r ? Boolean(r.usaCmvTeorico) : false;
}

export async function setUsaCmvTeorico(storeId: number, value: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.execute(
    sql`UPDATE stores SET usaCmvTeorico = ${value ? 1 : 0} WHERE id = ${storeId}`
  );
}
