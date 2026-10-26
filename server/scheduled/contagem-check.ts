/**
 * Scheduled handler: /api/scheduled/contagem-check
 *
 * Runs weekly on Monday at 15:00 UTC (12:00 BRT).
 * Checks every active store to see if stock count is recent (within CONTAGEM_LIMIAR_DIAS).
 * Sends a consolidated notification to the owner listing all stores with stale counts.
 *
 * Idempotent: if the handler already ran for this week's Monday, returns skipped.
 */

import type { Request, Response } from "express";
import { notifyOwner, notifyManager } from "../_core/notification";
import { getAllStores, getStockCounts } from "../db";
import { getDb } from "../db";
import { CONTAGEM_LIMIAR_DIAS } from "./cadencia-config";

/** Returns today's date in BRT (UTC-3) as YYYY-MM-DD */
function getTodayBRT(): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  return brtNow.toISOString().split("T")[0];
}

/** Returns the most recent Monday in BRT as YYYY-MM-DD (for idempotency key) */
function getThisWeekMondayBRT(): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  const dow = brtNow.getDay(); // 0=sun, 1=mon...
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(brtNow);
  monday.setDate(brtNow.getDate() + daysToMonday);
  return monday.toISOString().split("T")[0];
}

export async function contagemCheckHandler(req: Request, res: Response) {
  try {
    const todayBRT = getTodayBRT();
    const weekKey = getThisWeekMondayBRT();

    // Idempotency: check if we already ran for this week
    const db = await getDb();
    if (db) {
      const [rows] = await (db as any).$client.promise().execute(
        `SELECT id FROM cron_executions WHERE handler = 'contagem-check' AND run_date = ? LIMIT 1`,
        [weekKey]
      );
      if ((rows as any[]).length > 0) {
        return res.json({ ok: true, skipped: "already-ran", weekKey });
      }
      await (db as any).$client.promise().execute(
        `INSERT INTO cron_executions (handler, run_date) VALUES (?, ?)`,
        ["contagem-check", weekKey]
      );
    }

    const allStores = await getAllStores();
    const staleStores: { id: number; name: string; diasAtraso: number }[] = [];
    const limiarMs = CONTAGEM_LIMIAR_DIAS * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    for (const store of allStores) {
      const counts = await getStockCounts(store.id);
      if (counts.length === 0) {
        // Never counted — treat as maximum delay
        staleStores.push({ id: store.id, name: store.name, diasAtraso: 999 });
        continue;
      }
      // Most recent count
      const lastCount = counts.reduce((a, b) =>
        a.countDate > b.countDate ? a : b
      );
      const lastDate = new Date(lastCount.countDate + "T00:00:00-03:00");
      const diasAtraso = Math.floor((nowMs - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      if (diasAtraso > CONTAGEM_LIMIAR_DIAS) {
        staleStores.push({ id: store.id, name: store.name, diasAtraso });
      }
    }

    if (staleStores.length === 0) {
      return res.json({
        ok: true,
        date: todayBRT,
        message: "Todas as lojas estão com contagem de estoque em dia.",
        staleCount: 0,
      });
    }

    // Sort by most delayed first
    staleStores.sort((a, b) => b.diasAtraso - a.diasAtraso);

    // Notificar gerente de cada loja individualmente
    for (const store of staleStores) {
      const label = store.diasAtraso >= 999 ? "nunca contada" : `há ${store.diasAtraso} dias sem contagem`;
      await notifyManager(store.id, {
        title: `⚠️ Contagem de estoque atrasada — ${store.name}`,
        content: `A loja ${store.name} está ${label}.\n\nSem contagem, o CMV não pode ser calculado com precisão e o placar pode estar errado. Realize a contagem hoje.`,
      }).catch(() => {});
    }

    const lines = staleStores.map((s) =>
      s.diasAtraso >= 999
        ? `• ${s.name} — nunca contada`
        : `• ${s.name} — última contagem há ${s.diasAtraso} dias`
    );

    const content = [
      `Contagem de estoque atrasada (limiar: ${CONTAGEM_LIMIAR_DIAS} dias):`,
      "",
      ...lines,
      "",
      "CMV sem contagem recente é estimativa, não dado. O placar pode estar errado.",
    ].join("\n");

    await notifyOwner({
      title: `📦 ${staleStores.length} loja(s) com contagem de estoque atrasada`,
      content,
    });

    return res.json({
      ok: true,
      date: todayBRT,
      staleCount: staleStores.length,
      staleStores: staleStores.map((s) => s.name),
    });
  } catch (err: any) {
    console.error("[contagem-check] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
