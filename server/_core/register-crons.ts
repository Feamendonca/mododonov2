/**
 * register-crons.ts
 * Fonte única da lista de crons do Modo Dono e da lógica de registro idempotente.
 *
 * Usado em dois lugares:
 *  1. Boot automático do servidor (startServer em index.ts) — sem sessão de usuário,
 *     cai no owner via string vazia.
 *  2. Endpoint manual /api/internal/setup-crons — passa a sessão do admin logado.
 */
import { createHeartbeatJob, listHeartbeatJobs } from "./heartbeat";

export interface CronResult {
  name: string;
  status: "created" | "skipped" | "error";
  detail?: string;
}

/** Definição canônica dos 6 crons do Modo Dono. */
export const SCHEDULED_CRONS = [
  {
    name: "lancamento-check",
    cron: "0 0 14 * * *",        // daily 14:00 UTC (11:00 BRT)
    path: "/api/scheduled/lancamento-check",
    description: "Verifica lojas sem lançamento do dia anterior",
  },
  {
    name: "contagem-check",
    cron: "0 0 15 * * 1",        // Monday 15:00 UTC (12:00 BRT)
    path: "/api/scheduled/contagem-check",
    description: "Verifica lojas com contagem de estoque atrasada",
  },
  {
    name: "ocorrencia-check",
    cron: "0 0 12 * * *",        // daily 12:00 UTC (09:00 BRT)
    path: "/api/scheduled/ocorrencia-check",
    description: "Verifica lojas com reclamações paradas > 7 dias",
  },
  {
    name: "preturno-check",
    cron: "0 30 13 * * *",       // daily 13:30 UTC (10:30 BRT)
    path: "/api/scheduled/preturno-check",
    description: "Verifica lojas sem pré-turno do dia",
  },
  {
    name: "cadencia-semanal",
    cron: "0 0 11 * * 1",        // Monday 11:00 UTC (08:00 BRT)
    path: "/api/scheduled/cadencia-semanal",
    description: "Calcula e notifica cadência operacional semanal",
  },
  {
    name: "google-rating-sync",
    cron: "0 8 * * 1", // toda segunda às 08:00 UTC (antes da reunião MIG)
    path: "/api/scheduled/google-rating-sync",
    description: "Sincroniza rating Google Places para todas as lojas com place_id configurado",
  },
  {
    name: "reuniao-mig",
    cron: "0 0 9 * * 1",         // Monday 09:00 UTC (06:00 BRT)
    path: "/api/scheduled/reuniao-mig",
    description: "Pauta guiada da reunião MIG semanal",
  },
] as const;

/**
 * Registra os 6 crons do Modo Dono de forma idempotente.
 *
 * @param userSession  Sessão do usuário (cookie `app_session_id` decodificado).
 *                     String vazia → usa a identidade do project owner (padrão no boot).
 * @returns            Array com o status de cada cron: "created" | "skipped" | "error".
 */
export async function registerScheduledCrons(userSession = ""): Promise<CronResult[]> {
  // Listar jobs existentes para evitar duplicatas
  let existingNames: Set<string> = new Set();
  try {
    const { jobs } = await listHeartbeatJobs(userSession);
    existingNames = new Set(jobs.map((j) => j.name));
  } catch (_) {
    // Se a listagem falhar, prosseguir mesmo assim.
    // createHeartbeatJob retornará erro em caso de duplicata — tratado abaixo.
  }

  const results: CronResult[] = [];

  for (const cron of SCHEDULED_CRONS) {
    if (existingNames.has(cron.name)) {
      results.push({ name: cron.name, status: "skipped" });
      continue;
    }
    try {
      await createHeartbeatJob(
        { name: cron.name, cron: cron.cron, path: cron.path, description: cron.description },
        userSession
      );
      results.push({ name: cron.name, status: "created" });
    } catch (err: any) {
      results.push({ name: cron.name, status: "error", detail: err?.message ?? String(err) });
    }
  }

  return results;
}
