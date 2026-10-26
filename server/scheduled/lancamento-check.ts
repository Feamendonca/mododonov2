/**
 * Scheduled handler: /api/scheduled/lancamento-check
 *
 * Runs daily at 14:00 UTC (11:00 BRT).
 * Checks every active store to see if YESTERDAY's daily entry was registered.
 * Sends a consolidated notification to the owner listing all stores that
 * did NOT register their lançamento by the time this job runs.
 *
 * Idempotent: if the handler already ran for today's date, returns skipped.
 */

import type { Request, Response } from "express";
import { notifyOwner, notifyManager } from "../_core/notification";
import { getAllStores, getDailyEntry } from "../db";
import { getDb } from "../db";

/** Returns yesterday's date in BRT (UTC-3) as YYYY-MM-DD */
function getYesterdayBRT(): string {
  const now = new Date();
  // BRT = UTC-3
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  brtNow.setDate(brtNow.getDate() - 1);
  return brtNow.toISOString().split("T")[0];
}

/** Returns today's date in BRT (UTC-3) as YYYY-MM-DD */
function getTodayBRT(): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  return brtNow.toISOString().split("T")[0];
}

export async function lancamentoCheckHandler(req: Request, res: Response) {
  try {
    const todayBRT = getTodayBRT();
    const yesterdayBRT = getYesterdayBRT();

    // Idempotency: check if we already ran for today
    const db = await getDb();
    if (db) {
      const [rows] = await (db as any).$client.promise().execute(
        `SELECT id FROM cron_executions WHERE handler = 'lancamento-check' AND run_date = ? LIMIT 1`,
        [todayBRT]
      );
      if ((rows as any[]).length > 0) {
        return res.json({ ok: true, skipped: "already-ran", date: todayBRT });
      }
      // Register this execution
      await (db as any).$client.promise().execute(
        `INSERT INTO cron_executions (handler, run_date) VALUES (?, ?)`,
        ["lancamento-check", todayBRT]
      );
    }

    const allStores = await getAllStores();
    const pendingStores: { id: number; name: string }[] = [];

    for (const store of allStores) {
      const entry = await getDailyEntry(store.id, yesterdayBRT);
      if (!entry) {
        pendingStores.push({ id: store.id, name: store.name });
      }
    }

    if (pendingStores.length === 0) {
      return res.json({
        ok: true,
        date: yesterdayBRT,
        message: "Todas as lojas registraram o lançamento de ontem.",
        pendingCount: 0,
      });
    }

    // Notificar gerente de cada loja pendente individualmente
    for (const store of pendingStores) {
      await notifyManager(store.id, {
        title: `⚠️ Lançamento de ontem não registrado — ${store.name}`,
        content: [
          `O lançamento de ontem (${yesterdayBRT}) da loja ${store.name} ainda não foi registrado.`,
          "",
          "Sem lançamento, o placar não avança e o cálculo de remuneração fica incompleto.",
          "Acesse o sistema agora e registre o dia.",
        ].join("\n"),
      }).catch(() => {}); // falha silenciosa — não bloquear o cron
    }
    const lines = pendingStores.map((s) => `• ${s.name}`);
    const content = [
      `Lançamento de ontem (${yesterdayBRT}) ainda não registrado:`,
      "",
      ...lines,
      "",
      "Sem lançamento, o placar não avança. Acesse o sistema para registrar ou cobrar o gerente.",
    ].join("\n");

    await notifyOwner({
      title: `⚠️ ${pendingStores.length} loja(s) sem lançamento de ontem`,
      content,
    });

    return res.json({
      ok: true,
      date: yesterdayBRT,
      pendingCount: pendingStores.length,
      pendingStores: pendingStores.map(s => s.name),
    });
  } catch (err: any) {
    console.error("[lancamento-check] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
