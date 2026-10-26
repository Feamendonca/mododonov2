/**
 * register-crons.test.ts
 * Testes unitários para registerScheduledCrons (server/_core/register-crons.ts).
 *
 * Port off-Manus (Task 8): o mecanismo trocou de Forge/heartbeat (HTTP + sessão
 * assinada) para `node-cron` (agendamento in-process). Cobre:
 *  1. Gate CRONS_ENABLED: "false"/ausente → nenhum cron é agendado
 *  2. CRONS_ENABLED="true" → as 7 tarefas são agendadas via node-cron.schedule
 *  3. Cada tarefa usa o cron expression e timezone UTC esperados
 *  4. SCHEDULED_CRONS contém exatamente 7 entradas com paths e handlers corretos
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// IMPORTANTE: as funções mock devem ser definidas DENTRO do factory do vi.mock
// para evitar o erro de hoisting "Cannot access before initialization".
vi.mock("node-cron", () => {
  const schedule = vi.fn().mockReturnValue({
    id: "mock-task",
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  });
  return { default: { schedule }, schedule };
});

import cron from "node-cron";
import { registerScheduledCrons, SCHEDULED_CRONS } from "./_core/register-crons";

const mockSchedule = cron.schedule as unknown as ReturnType<typeof vi.fn>;

const ORIGINAL_CRONS_ENABLED = process.env.CRONS_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (ORIGINAL_CRONS_ENABLED === undefined) {
    delete process.env.CRONS_ENABLED;
  } else {
    process.env.CRONS_ENABLED = ORIGINAL_CRONS_ENABLED;
  }
});

// ─── Testes ───────────────────────────────────────────────────────────────────
describe("registerScheduledCrons — gate CRONS_ENABLED", () => {
  it("não agenda nada quando CRONS_ENABLED está ausente (default Fase A)", () => {
    delete process.env.CRONS_ENABLED;

    const tasks = registerScheduledCrons();

    expect(tasks).toHaveLength(0);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("não agenda nada quando CRONS_ENABLED='false'", () => {
    process.env.CRONS_ENABLED = "false";

    const tasks = registerScheduledCrons();

    expect(tasks).toHaveLength(0);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("não agenda nada para qualquer valor diferente de 'true' (ex.: '1')", () => {
    process.env.CRONS_ENABLED = "1";

    const tasks = registerScheduledCrons();

    expect(tasks).toHaveLength(0);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("agenda as 7 tarefas via node-cron quando CRONS_ENABLED='true'", () => {
    process.env.CRONS_ENABLED = "true";

    const tasks = registerScheduledCrons();

    expect(tasks).toHaveLength(7);
    expect(mockSchedule).toHaveBeenCalledTimes(7);
  });

  it("agenda cada job com o cron expression e timezone UTC corretos", () => {
    process.env.CRONS_ENABLED = "true";

    registerScheduledCrons();

    for (const job of SCHEDULED_CRONS) {
      expect(mockSchedule).toHaveBeenCalledWith(
        job.cron,
        expect.any(Function),
        expect.objectContaining({ timezone: "UTC" })
      );
    }
  });
});

describe("SCHEDULED_CRONS — definição canônica", () => {
  it("contém exatamente 7 entradas", () => {
    expect(SCHEDULED_CRONS).toHaveLength(7);
  });

  it("todos os paths seguem o padrão /api/scheduled/*", () => {
    for (const job of SCHEDULED_CRONS) {
      expect(job.path).toMatch(/^\/api\/scheduled\//);
    }
  });

  it("todos os jobs têm nome, cron expression e handler definidos", () => {
    for (const job of SCHEDULED_CRONS) {
      expect(job.name).toBeTruthy();
      expect(job.cron).toBeTruthy();
      expect(typeof job.handler).toBe("function");
    }
  });

  it("nomes são únicos", () => {
    const names = SCHEDULED_CRONS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("preserva os mesmos 7 horários (UTC) usados antes no Forge/heartbeat", () => {
    const byName = Object.fromEntries(SCHEDULED_CRONS.map((c) => [c.name, c.cron]));
    expect(byName["lancamento-check"]).toBe("0 14 * * *");
    expect(byName["contagem-check"]).toBe("0 15 * * 1");
    expect(byName["ocorrencia-check"]).toBe("0 12 * * *");
    expect(byName["preturno-check"]).toBe("30 13 * * *");
    expect(byName["cadencia-semanal"]).toBe("0 11 * * 1");
    expect(byName["google-rating-sync"]).toBe("0 8 * * 1");
    expect(byName["reuniao-mig"]).toBe("0 9 * * 1");
  });
});
