/**
 * google-rating-sync.ts
 * Cron semanal: sincroniza o rating do Google Places para todas as lojas com googlePlaceId.
 * Horário: toda segunda-feira às 08:00 UTC (antes da reunião MIG das 09:00).
 */

import { Request, Response } from "express";
import { getDb } from "../db";
import { syncAllGoogleRatings } from "../google-places";

const HANDLER_NAME = "google-rating-sync";
const CRON_EXPRESSION = "0 8 * * 1"; // toda segunda às 08:00 UTC

export { HANDLER_NAME, CRON_EXPRESSION };

export async function googleRatingSyncHandler(req: Request, res: Response): Promise<void> {
  const db = await getDb();
  if (!db) {
    res.json({ ok: false, error: "DB unavailable" });
    return;
  }
  // Idempotência: verificar se já rodou hoje
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await (db as any).$client.promise().execute(
    "SELECT id FROM cron_executions WHERE handler = ? AND run_date = ?",
    [HANDLER_NAME, today]
  );
  if ((existing as unknown[]).length > 0) {
    res.json({ ok: true, skipped: true, reason: "Já executado hoje" });
    return;
  }
  // Registrar execução
  await (db as any).$client.promise().execute(
    "INSERT INTO cron_executions (handler, run_date) VALUES (?, ?)",
    [HANDLER_NAME, today]
  );
  // Período atual
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    await syncAllGoogleRatings(period);
    res.json({ ok: true, period });
  } catch (err) {
    console.error("[google-rating-sync] Erro:", err);
    res.json({ ok: false, error: String(err) });
  }
}
