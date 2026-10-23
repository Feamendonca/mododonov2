/**
 * Heartbeat handler: /api/scheduled/cadencia-semanal
 *
 * Runs weekly on Monday at 11:00 UTC (08:00 BRT).
 * Calculates the Cadência Index for each store over the past 7 days and
 * sends a consolidated ranking notification to the owner.
 *
 * Idempotent: if the handler already ran for this week's Monday, returns skipped.
 *
 * The core calculation is exported as `calcularCadencia` (pure function)
 * so it can be unit-tested without hitting the database.
 */

import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { notifyOwner } from "../_core/notification";
import { getAllStores, getDailyEntries, getStockCounts } from "../db";
import { getDb } from "../db";
import { getPreturnoStats } from "../db-preturno";
import {
  CONTAGEM_LIMIAR_DIAS,
  OCORRENCIA_LIMIAR_DIAS,
  CADENCIA_PESOS,
  CADENCIA_LIMIAR_REUNIAO,
} from "./cadencia-config";

// ─── Pure calculation function (exported for tests) ───────────────────────────

export interface CadenciaInput {
  /** Number of days in the period (usually 7) */
  totalDias: number;
  /** Number of days with a daily entry registered */
  diasComLancamento: number;
  /** Number of pre-turnos expected in the period */
  preturnosEsperados: number;
  /** Number of pre-turnos actually realized */
  preturnosRealizados: number;
  /** Days since last stock count (null = never counted) */
  diasSemContagem: number | null;
  /** Number of unresolved complaints older than OCORRENCIA_LIMIAR_DIAS */
  reclamacoesParadas: number;
}

export interface CadenciaResult {
  /** Final cadência index 0–100 */
  nota: number;
  /** Breakdown by component (0–100 each) */
  componentes: {
    lancamento: number;
    preturno: number;
    contagem: number;
    ocorrencia: number;
  };
  /** Whether the store is below the meeting threshold */
  abaixoLimiar: boolean;
  /** Human-readable alerts for this store */
  alertas: string[];
}

export function calcularCadencia(input: CadenciaInput): CadenciaResult {
  const alertas: string[] = [];

  // Component 1: Lançamento (% of days with entry)
  const notaLancamento = input.totalDias > 0
    ? Math.round((input.diasComLancamento / input.totalDias) * 100)
    : 100;
  if (notaLancamento < 100) {
    const faltando = input.totalDias - input.diasComLancamento;
    alertas.push(`${faltando} dia(s) sem lançar`);
  }

  // Component 2: Pré-turno (% of expected pre-turnos realized)
  const notaPreturno = input.preturnosEsperados > 0
    ? Math.round((input.preturnosRealizados / input.preturnosEsperados) * 100)
    : 100; // no pre-turno configured → full score
  if (notaPreturno < 100 && input.preturnosEsperados > 0) {
    const faltando = input.preturnosEsperados - input.preturnosRealizados;
    alertas.push(`${faltando} pré-turno(s) não realizado(s)`);
  }

  // Component 3: Contagem (binary: in-day = 100, stale = 0)
  let notaContagem: number;
  if (input.diasSemContagem === null) {
    notaContagem = 0;
    alertas.push("contagem de estoque nunca realizada");
  } else if (input.diasSemContagem > CONTAGEM_LIMIAR_DIAS) {
    notaContagem = 0;
    alertas.push(`contagem de estoque há ${input.diasSemContagem} dias`);
  } else {
    notaContagem = 100;
  }

  // Component 4: Ocorrência (penalidade por reclamação parada)
  // Each stale complaint reduces the score by 20 points (max 0)
  const penalidade = Math.min(100, input.reclamacoesParadas * 20);
  const notaOcorrencia = Math.max(0, 100 - penalidade);
  if (input.reclamacoesParadas > 0) {
    alertas.push(
      `${input.reclamacoesParadas} reclamação(ões) parada(s) há mais de ${OCORRENCIA_LIMIAR_DIAS} dias`
    );
  }

  const nota = Math.round(
    notaLancamento * CADENCIA_PESOS.lancamento +
    notaPreturno * CADENCIA_PESOS.preturno +
    notaContagem * CADENCIA_PESOS.contagem +
    notaOcorrencia * CADENCIA_PESOS.ocorrencia
  );

  return {
    nota,
    componentes: {
      lancamento: notaLancamento,
      preturno: notaPreturno,
      contagem: notaContagem,
      ocorrencia: notaOcorrencia,
    },
    abaixoLimiar: nota < CADENCIA_LIMIAR_REUNIAO,
    alertas,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the most recent Monday in BRT as YYYY-MM-DD */
function getThisWeekMondayBRT(): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  const dow = brtNow.getDay();
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(brtNow);
  monday.setDate(brtNow.getDate() + daysToMonday);
  return monday.toISOString().split("T")[0];
}

/** Returns date N days ago in BRT as YYYY-MM-DD */
function daysAgoBRT(n: number): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  brtNow.setDate(brtNow.getDate() - n);
  return brtNow.toISOString().split("T")[0];
}

/** Returns today's date in BRT (UTC-3) as YYYY-MM-DD */
function getTodayBRT(): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  return brtNow.toISOString().split("T")[0];
}

/** Format date YYYY-MM-DD → DD/MM */
function fmtDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function cadenciaSemanalHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const weekKey = getThisWeekMondayBRT();
    const todayBRT = getTodayBRT();
    const sevenDaysAgo = daysAgoBRT(7);

    // Idempotency
    const db = await getDb();
    if (db) {
      const [rows] = await (db as any).$client.promise().execute(
        `SELECT id FROM cron_executions WHERE handler = 'cadencia-semanal' AND run_date = ? LIMIT 1`,
        [weekKey]
      );
      if ((rows as any[]).length > 0) {
        return res.json({ ok: true, skipped: "already-ran", weekKey });
      }
      await (db as any).$client.promise().execute(
        `INSERT INTO cron_executions (handler, run_date) VALUES (?, ?)`,
        ["cadencia-semanal", weekKey]
      );
    }

    const allStores = await getAllStores();
    const nowMs = Date.now();

    type StoreResult = {
      name: string;
      nota: number;
      abaixoLimiar: boolean;
      alertas: string[];
    };

    const results: StoreResult[] = [];

    for (const store of allStores) {
      // Lançamento: count days with entry in last 7 days
      const entries = await getDailyEntries(store.id, sevenDaysAgo, todayBRT);
      const diasComLancamento = entries.length;

      // Pré-turno: get stats for current month (approximation for the week)
      const now = new Date();
      const stats = await getPreturnoStats(store.id, now.getFullYear(), now.getMonth() + 1);
      // Use week-level stats if available, otherwise use monthly ratio
      const preturnosEsperados = stats.esperadasMes ?? 0;
      const preturnosRealizados = stats.realizadasMes ?? 0;

      // Contagem: days since last stock count
      const counts = await getStockCounts(store.id);
      let diasSemContagem: number | null = null;
      if (counts.length > 0) {
        const lastCount = counts.reduce((a, b) => a.countDate > b.countDate ? a : b);
        const lastDate = new Date(lastCount.countDate + "T00:00:00-03:00");
        diasSemContagem = Math.floor((nowMs - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      }

      // Reclamações paradas: reviews com stars<=3 e status aberto há mais de OCORRENCIA_LIMIAR_DIAS dias
      // Fonte: tabela reviews (fonte única da voz-do-cliente — não mais customer_occurrences)
      const db = await (await import("../db")).getDb();
      let reclamacoesParadas = 0;
      if (db) {
        const [rows] = await (db as any).$client.promise().execute(
          `SELECT reviewDate, status FROM reviews WHERE storeId = ? AND stars <= 3 AND status NOT IN ('fechada','ignorada')`,
          [store.id]
        );
        reclamacoesParadas = (rows as any[]).filter((r: any) => {
          const occDate = new Date(r.reviewDate + "T00:00:00-03:00");
          const dias = (nowMs - occDate.getTime()) / (24 * 60 * 60 * 1000);
          return dias > OCORRENCIA_LIMIAR_DIAS;
        }).length;
      }

      const cadencia = calcularCadencia({
        totalDias: 7,
        diasComLancamento,
        preturnosEsperados,
        preturnosRealizados,
        diasSemContagem,
        reclamacoesParadas,
      });

      results.push({
        name: store.name,
        nota: cadencia.nota,
        abaixoLimiar: cadencia.abaixoLimiar,
        alertas: cadencia.alertas,
      });
    }

    // Sort descending by nota
    results.sort((a, b) => b.nota - a.nota);

    // Build notification
    const periodLabel = `${fmtDate(sevenDaysAgo)} a ${fmtDate(todayBRT)}`;

    const lines = results.map((s) => {
      const emoji = s.nota >= 90 ? "🟢" : s.nota >= CADENCIA_LIMIAR_REUNIAO ? "🟡" : "🔴";
      const dots = ".".repeat(Math.max(1, 28 - s.name.length));
      const alertLabel = s.alertas.length > 0 ? ` ⚠️ (${s.alertas.join(", ")})` : "";
      return `${emoji} ${s.name}${dots} ${s.nota}${alertLabel}`;
    });

    const content = [
      `Ranking de cadência das lojas (0–100):`,
      "",
      ...lines,
      "",
      "─".repeat(45),
      `Regra do programa: loja com cadência abaixo de ${CADENCIA_LIMIAR_REUNIAO} — a reunião da semana discute cadência, não resultado.`,
    ].join("\n");

    await notifyOwner({
      title: `📊 Cadência da semana — ${periodLabel}`,
      content,
    });

    return res.json({
      ok: true,
      weekKey,
      storeCount: results.length,
      abaixoLimiar: results.filter((r) => r.abaixoLimiar).map((r) => r.name),
    });
  } catch (err: any) {
    console.error("[cadencia-semanal] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
