/**
 * Scheduled handler: /api/scheduled/reuniao-mig
 *
 * Runs every Monday at 09:00 UTC (06:00 BRT) — antes da reunião MIG da semana.
 * Para cada loja ativa, envia ao GERENTE e ao DONO uma pauta guiada com:
 *  - Placar do mês (atingimento das medidas de direção)
 *  - Medidas furadas (vermelhas) + suas ações vinculadas
 *  - Compromissos pendentes
 *
 * Idempotente: não notifica 2x na mesma semana (chave = segunda-feira BRT).
 *
 * Disparado internamente por node-cron (ver server/_core/register-crons.ts) —
 * agendamento: "0 9 * * 1" = toda segunda às 09:00 UTC (06:00 BRT).
 */

import type { Request, Response } from "express";
import { notifyOwner, notifyManager } from "../_core/notification";
import { getAllStores, getActionPlans, getCommitment } from "../db";
import { getDb } from "../db";
import { listMetas, listMedidas } from "../db-metas";
import { actionPlans } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/** Returns the most recent Monday in BRT as YYYY-MM-DD */
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

/** Returns current period as YYYY-MM */
function getCurrentPeriod(): string {
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
  return `${brtNow.getFullYear()}-${String(brtNow.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export async function reuniaoMigHandler(req: Request, res: Response) {
  try {
    const weekKey = getThisWeekMondayBRT();
    const period = getCurrentPeriod();
    const [year, month] = period.split("-").map(Number);

    // Idempotência: não rodar 2x na mesma semana
    const db = await getDb();
    if (db) {
      const [rows] = await (db as any).$client.promise().execute(
        `SELECT id FROM cron_executions WHERE handler = 'reuniao-mig' AND run_date = ? LIMIT 1`,
        [weekKey]
      );
      if ((rows as any[]).length > 0) {
        return res.json({ ok: true, skipped: "already-ran", weekKey });
      }
      await (db as any).$client.promise().execute(
        `INSERT INTO cron_executions (handler, run_date) VALUES (?, ?)`,
        ["reuniao-mig", weekKey]
      );
    }

    const allStores = await getAllStores();
    const storeResults: { storeId: number; storeName: string; notified: boolean }[] = [];

    for (const store of allStores) {
      try {
        // 1. Metas e medidas do mês corrente
        const metas = await listMetas(store.id, month, year);
        const todasMedidas: Array<{
          titulo: string;
          indicador: string;
          metaValor: number | null;
          metaOperador: string;
          unidade: string;
          atingida: boolean | null;
          valorAtual: number | null;
          acoesPendentes: number;
        }> = [];

        for (const meta of metas) {
          const medidas = await listMedidas(meta.id, month, year);
          for (const medida of medidas) {
            // Contar ações pendentes vinculadas a esta medida
            let acoesPendentes = 0;
            if (db) {
              const [acoesRows] = await (db as any).$client.promise().execute(
                `SELECT COUNT(*) as cnt FROM action_plans WHERE medida_id = ? AND status IN ('todo', 'doing')`,
                [medida.id]
              );
              acoesPendentes = Number((acoesRows as any[])[0]?.cnt ?? 0);
            }
            todasMedidas.push({
              titulo: medida.titulo,
              indicador: medida.indicador,
              metaValor: medida.metaValor,
              metaOperador: medida.metaOperador,
              unidade: medida.unidade,
              atingida: medida.progresso?.atingida ?? null,
              valorAtual: medida.progresso?.valorAtual ?? null,
              acoesPendentes,
            });
          }
        }

        // 2. Compromissos pendentes
        const quarter = `${year}-Q${Math.ceil(month / 3)}`;
        const commitment = await getCommitment(store.id, quarter).catch(() => undefined);
        const commitmentPendente = commitment && !commitment.signed;

        // 3. Ações vencidas do plano de ação
        const todasAcoes = await getActionPlans(store.id);
        const hoje = new Date().toISOString().slice(0, 10);
        const acoesVencidas = todasAcoes.filter(a =>
          a.status !== "done" && a.status !== "cancelled" && a.status !== "failed" &&
          a.dueDate && a.dueDate < hoje
        );

        // Montar pauta
        const medidasAtingidas = todasMedidas.filter(m => m.atingida === true).length;
        const medidasFuradas = todasMedidas.filter(m => m.atingida === false);
        const totalMedidas = todasMedidas.length;

        const lines: string[] = [];

        // Cabeçalho
        const mesLabel = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        lines.push(`📅 PAUTA MIG — ${store.name} — ${mesLabel}`);
        lines.push("─".repeat(50));

        // Placar
        lines.push("");
        lines.push(`📊 PLACAR DO MÊS`);
        if (totalMedidas === 0) {
          lines.push("  Nenhuma medida de direção cadastrada para este mês.");
          lines.push("  → Acesse Metas e configure as medidas do orçamento aprovado.");
        } else {
          lines.push(`  ${medidasAtingidas}/${totalMedidas} medidas atingidas`);
          for (const m of todasMedidas) {
            const emoji = m.atingida === true ? "✅" : m.atingida === false ? "🔴" : "⚪";
            const valorStr = m.valorAtual != null ? ` (atual: ${fmt(m.valorAtual)}${m.unidade})` : "";
            const metaStr = m.metaValor != null ? ` | meta: ${m.metaOperador === "gte" ? "≥" : "≤"} ${fmt(m.metaValor)}${m.unidade}` : "";
            lines.push(`  ${emoji} ${m.titulo}${valorStr}${metaStr}`);
          }
        }

        // Medidas furadas + ações
        if (medidasFuradas.length > 0) {
          lines.push("");
          lines.push(`🔴 MEDIDAS FURADAS (${medidasFuradas.length})`);
          for (const m of medidasFuradas) {
            lines.push(`  • ${m.titulo}`);
            if (m.acoesPendentes > 0) {
              lines.push(`    → ${m.acoesPendentes} ação(ões) em andamento`);
            } else {
              lines.push(`    → Nenhuma ação criada — crie ações no sistema`);
            }
          }
        }

        // Ações vencidas
        if (acoesVencidas.length > 0) {
          lines.push("");
          lines.push(`⚠️ AÇÕES VENCIDAS (${acoesVencidas.length})`);
          for (const a of acoesVencidas.slice(0, 5)) {
            lines.push(`  • ${a.description} (venceu ${a.dueDate})`);
          }
          if (acoesVencidas.length > 5) {
            lines.push(`  ... e mais ${acoesVencidas.length - 5} ação(ões)`);
          }
        }

        // Compromisso
        if (commitmentPendente) {
          lines.push("");
          lines.push(`📝 COMPROMISSO DO TRIMESTRE`);
          lines.push(`  O compromisso ainda não foi assinado. Assine antes da reunião.`);
        }

        // Rodapé
        lines.push("");
        lines.push("─".repeat(50));
        lines.push("Acesse o sistema para ver detalhes e registrar o resultado da reunião.");

        const pauta = lines.join("\n");
        const title = `📋 Pauta MIG — ${store.name} — ${mesLabel}`;

        // Notificar gerente da loja
        await notifyManager(store.id, { title, content: pauta }).catch(() => {});

        storeResults.push({ storeId: store.id, storeName: store.name, notified: true });
      } catch (storeErr) {
        console.warn(`[reuniao-mig] Error processing store ${store.id}:`, storeErr);
        storeResults.push({ storeId: store.id, storeName: store.name, notified: false });
      }
    }

    // Notificar dono com resumo consolidado
    const notifiedCount = storeResults.filter(s => s.notified).length;
    await notifyOwner({
      title: `📋 Pautas MIG enviadas — ${weekKey}`,
      content: [
        `Pautas da reunião MIG desta semana enviadas aos gerentes.`,
        "",
        `${notifiedCount}/${allStores.length} lojas processadas.`,
        "",
        `Período: ${period}`,
        `Semana: ${weekKey}`,
      ].join("\n"),
    }).catch(() => {});

    return res.json({
      ok: true,
      weekKey,
      period,
      storeCount: allStores.length,
      notifiedCount,
      stores: storeResults,
    });
  } catch (err: any) {
    console.error("[reuniao-mig] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
