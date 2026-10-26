/**
 * register-crons.ts
 * Fonte única da lista de tarefas agendadas do Modo Dono e do mecanismo de
 * agendamento via `node-cron`.
 *
 * Port off-Manus (Task 8): o serviço Forge (`WebDevService`/heartbeat, header
 * `x-manus-user-session`) foi removido. Os handlers em `server/scheduled/*`
 * (lógica de negócio intacta) agora são chamados INTERNAMENTE pelo processo
 * node-cron — sem HTTP, sem OAuth do Manus, sem `sdk.authenticateRequest`.
 *
 * FASE A (bootstrap fora do Manus): vários handlers dependem de tabelas que
 * ainda não existem no banco novo (ex.: `preturno_*`, `checklist_*`). Por isso
 * o agendamento fica DESLIGADO por padrão — controlado pela env `CRONS_ENABLED`.
 *
 *   CRONS_ENABLED=false (ou ausente) → `registerScheduledCrons()` não agenda
 *   nada; apenas loga que os crons estão desligados.
 *
 *   CRONS_ENABLED=true → agenda as 7 tarefas abaixo com `node-cron`, nos
 *   mesmos horários (UTC) usados anteriormente no Forge.
 *
 * FASE B: ao ligar `CRONS_ENABLED=true`, habilite também módulo a módulo —
 * só ligue (via comentário/remoção da entrada em `SCHEDULED_CRONS`, ou um
 * gate adicional) o cron cujas tabelas de banco já existirem em produção.
 */
import cron, { type ScheduledTask } from "node-cron";
import type { Request, Response } from "express";
import { preturnoCheckHandler } from "../scheduled/preturno-check";
import { lancamentoCheckHandler } from "../scheduled/lancamento-check";
import { contagemCheckHandler } from "../scheduled/contagem-check";
import { ocorrenciaCheckHandler } from "../scheduled/ocorrencia-check";
import { cadenciaSemanalHandler } from "../scheduled/cadencia-semanal";
import { reuniaoMigHandler } from "../scheduled/reuniao-mig";
import { googleRatingSyncHandler } from "../scheduled/google-rating-sync";

export type ScheduledHandler = (req: Request, res: Response) => Promise<unknown> | unknown;

export interface ScheduledCronDefinition {
  name: string;
  /**
   * 5-field cron (`min hour dom mon dow`), UTC — equivalente aos horários
   * usados antes no Forge/heartbeat (que usava 6 campos com segundos; os
   * segundos eram sempre `0`, então a conversão é direta).
   */
  cron: string;
  /** Path original do heartbeat — mantido só como referência/log. */
  path: string;
  handler: ScheduledHandler;
  description: string;
}

/** Definição canônica das 7 tarefas agendadas do Modo Dono. */
export const SCHEDULED_CRONS: ScheduledCronDefinition[] = [
  {
    name: "lancamento-check",
    cron: "0 14 * * *", // daily 14:00 UTC (11:00 BRT)
    path: "/api/scheduled/lancamento-check",
    handler: lancamentoCheckHandler,
    description: "Verifica lojas sem lançamento do dia anterior",
  },
  {
    name: "contagem-check",
    cron: "0 15 * * 1", // Monday 15:00 UTC (12:00 BRT)
    path: "/api/scheduled/contagem-check",
    handler: contagemCheckHandler,
    description: "Verifica lojas com contagem de estoque atrasada",
  },
  {
    name: "ocorrencia-check",
    cron: "0 12 * * *", // daily 12:00 UTC (09:00 BRT)
    path: "/api/scheduled/ocorrencia-check",
    handler: ocorrenciaCheckHandler,
    description: "Verifica lojas com reclamações paradas > 7 dias",
  },
  {
    name: "preturno-check",
    cron: "30 13 * * *", // daily 13:30 UTC (10:30 BRT)
    path: "/api/scheduled/preturno-check",
    handler: preturnoCheckHandler,
    description: "Verifica lojas sem pré-turno do dia",
  },
  {
    name: "cadencia-semanal",
    cron: "0 11 * * 1", // Monday 11:00 UTC (08:00 BRT)
    path: "/api/scheduled/cadencia-semanal",
    handler: cadenciaSemanalHandler,
    description: "Calcula e notifica cadência operacional semanal",
  },
  {
    name: "google-rating-sync",
    cron: "0 8 * * 1", // Monday 08:00 UTC (antes da reunião MIG)
    path: "/api/scheduled/google-rating-sync",
    handler: googleRatingSyncHandler,
    description: "Sincroniza rating Google Places para todas as lojas com place_id configurado",
  },
  {
    name: "reuniao-mig",
    cron: "0 9 * * 1", // Monday 09:00 UTC (06:00 BRT)
    path: "/api/scheduled/reuniao-mig",
    handler: reuniaoMigHandler,
    description: "Pauta guiada da reunião MIG semanal",
  },
];

/**
 * Monta um par (Request, Response) mínimo o suficiente para os handlers
 * Express existentes em `server/scheduled/*` rodarem sem alteração de lógica,
 * quando chamados internamente (sem um servidor HTTP real na frente).
 */
function createInternalReqRes(path: string): {
  req: Request;
  res: Response;
  result: Promise<{ statusCode: number; body: unknown }>;
} {
  const req = {
    url: path,
    method: "POST",
    headers: {},
    body: {},
  } as unknown as Request;

  let resolveResult!: (value: { statusCode: number; body: unknown }) => void;
  const result = new Promise<{ statusCode: number; body: unknown }>((resolve) => {
    resolveResult = resolve;
  });

  let statusCode = 200;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      resolveResult({ statusCode, body });
      return res;
    },
  } as unknown as Response;

  return { req, res, result };
}

/** Executa um handler agendado internamente (sem HTTP, sem auth do Manus). */
async function runScheduledJob(job: ScheduledCronDefinition): Promise<void> {
  const { req, res, result } = createInternalReqRes(job.path);
  try {
    await job.handler(req, res);
    const { statusCode, body } = await result;
    if (statusCode >= 400) {
      console.error(`[cron:${job.name}] falhou (status ${statusCode}):`, body);
    } else {
      console.log(`[cron:${job.name}] concluído:`, body);
    }
  } catch (err) {
    console.error(`[cron:${job.name}] erro não tratado:`, err);
  }
}

/**
 * Agenda as tarefas do Modo Dono via `node-cron`.
 *
 * Gate: só agenda algo se `CRONS_ENABLED === "true"`. Na Fase A (bootstrap
 * fora do Manus) isso fica desligado por padrão, porque vários handlers
 * dependem de tabelas que ainda não existem no banco novo — rodar os crons
 * agora quebraria o boot do app.
 *
 * @returns As tasks agendadas (vazio se `CRONS_ENABLED` não for `"true"`).
 */
export function registerScheduledCrons(): ScheduledTask[] {
  const enabled = process.env.CRONS_ENABLED === "true";

  if (!enabled) {
    console.log(
      "[crons] CRONS_ENABLED != \"true\" — nenhum cron agendado (Fase A). " +
        "Para ligar na Fase B, habilite CRONS_ENABLED=true no ambiente e " +
        "confirme que as tabelas do módulo de cada cron já existem no banco."
    );
    return [];
  }

  const tasks: ScheduledTask[] = [];
  for (const job of SCHEDULED_CRONS) {
    const task = cron.schedule(job.cron, () => void runScheduledJob(job), {
      timezone: "UTC",
    });
    tasks.push(task);
    console.log(`[crons] agendado: ${job.name} ("${job.cron}" UTC) — ${job.description}`);
  }

  return tasks;
}
