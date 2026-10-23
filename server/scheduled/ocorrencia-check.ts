/**
 * Heartbeat handler: /api/scheduled/ocorrencia-check
 *
 * Runs daily at 12:00 UTC (09:00 BRT).
 * Checks every active store for unresolved customer occurrences (complaints)
 * that have been open for more than OCORRENCIA_LIMIAR_DIAS days.
 * Sends a consolidated notification to the owner.
 *
 * Idempotent: if the handler already ran for today's date, returns skipped.
 */

import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { notifyOwner, notifyManager } from "../_core/notification";
import { getAllStores } from "../db";
import { getDb } from "../db";
import { OCORRENCIA_LIMIAR_DIAS } from "./cadencia-config";

/** Returns today's date in BRT (UTC-3) as YYYY-MM-DD */
function getTodayBRT(): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  return brtNow.toISOString().split("T")[0];
}

export async function ocorrenciaCheckHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const todayBRT = getTodayBRT();

    // Idempotency: check if we already ran for today
    const db = await getDb();
    if (db) {
      const [rows] = await (db as any).$client.promise().execute(
        `SELECT id FROM cron_executions WHERE handler = 'ocorrencia-check' AND run_date = ? LIMIT 1`,
        [todayBRT]
      );
      if ((rows as any[]).length > 0) {
        return res.json({ ok: true, skipped: "already-ran", date: todayBRT });
      }
      await (db as any).$client.promise().execute(
        `INSERT INTO cron_executions (handler, run_date) VALUES (?, ?)`,
        ["ocorrencia-check", todayBRT]
      );
    }

    const allStores = await getAllStores();
    const limiarMs = OCORRENCIA_LIMIAR_DIAS * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    type StoreAlert = {
      name: string;
      count: number;
      oldestDate: string;
    };
    type StoreAlertWithId = StoreAlert & { id: number };

    const alertStores: StoreAlertWithId[] = [];

    for (const store of allStores) {
      // Reclamações paradas: reviews com stars<=3 e status aberto há mais de OCORRENCIA_LIMIAR_DIAS dias
      // Fonte: tabela reviews (fonte única da voz-do-cliente — migration 0014)
      const db = await (await import("../db")).getDb();
      const stale: { occurrenceDate: string }[] = [];
      if (db) {
        const [rows] = await (db as any).$client.promise().execute(
          `SELECT reviewDate AS occurrenceDate FROM reviews WHERE storeId = ? AND stars <= 3 AND status NOT IN ('fechada','ignorada')`,
          [store.id]
        );
        const allRows = rows as { occurrenceDate: string }[];
        stale.push(...allRows.filter((r) => {
          const occDate = new Date(r.occurrenceDate + "T00:00:00-03:00");
          const dias = (nowMs - occDate.getTime()) / (24 * 60 * 60 * 1000);
          return dias > OCORRENCIA_LIMIAR_DIAS;
        }));
      }

      if (stale.length > 0) {
        // Find oldest
        const oldest = stale.reduce((a, b) =>
          a.occurrenceDate < b.occurrenceDate ? a : b
        );
        alertStores.push({
          id: store.id,
          name: store.name,
          count: stale.length,
          oldestDate: oldest.occurrenceDate,
        });
      }
    }

    if (alertStores.length === 0) {
      return res.json({
        ok: true,
        date: todayBRT,
        message: "Nenhuma reclamação parada além do limiar.",
        alertCount: 0,
      });
    }

    // Notificar gerente de cada loja individualmente
    for (const store of alertStores) {
      await notifyManager(store.id, {
        title: `🔴 Reclamação parada há mais de ${OCORRENCIA_LIMIAR_DIAS} dias — ${store.name}`,
        content: `A loja ${store.name} tem ${store.count} reclamação(ões) sem resolução há mais de ${OCORRENCIA_LIMIAR_DIAS} dias.\n\nIsso penaliza a nota de Voz do Cliente e pode impactar a remuneração. Resolva ou registre o encaminhamento agora.`,
      }).catch(() => {});
    }

    const lines = alertStores.map((s) => {
      const countLabel = s.count === 1 ? "1 ocorrência aberta" : `${s.count} ocorrências abertas`;
      // Format date as DD/MM
      const [y, m, d] = s.oldestDate.split("-");
      return `• ${s.name} — ${countLabel}, a mais antiga: ${d}/${m}`;
    });

    const content = [
      `Ocorrências sem resolução (mais de ${OCORRENCIA_LIMIAR_DIAS} dias):`,
      "",
      ...lines,
      "",
      `Reclamação parada além de ${OCORRENCIA_LIMIAR_DIAS} dias já penaliza a nota de Voz do Cliente. Resolva ou registre o encaminhamento.`,
    ].join("\n");

    await notifyOwner({
      title: `🔴 ${alertStores.length} loja(s) com reclamação parada há mais de ${OCORRENCIA_LIMIAR_DIAS} dias`,
      content,
    });

    return res.json({
      ok: true,
      date: todayBRT,
      alertCount: alertStores.length,
      alertStores: alertStores.map((s) => s.name),
    });
  } catch (err: any) {
    console.error("[ocorrencia-check] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
