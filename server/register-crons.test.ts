/**
 * register-crons.test.ts
 * Testes unitários para registerScheduledCrons (server/_core/register-crons.ts).
 *
 * Cobre:
 *  1. Todos os 6 crons são criados quando não há jobs existentes
 *  2. Jobs já existentes são pulados (idempotência)
 *  3. Mistura: alguns criados, alguns pulados
 *  4. Erro em createHeartbeatJob retorna status "error" sem quebrar os demais
 *  5. Falha em listHeartbeatJobs não impede o registro (prossegue com lista vazia)
 *  6. Sessão vazia (boot) é aceita (usa owner)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// IMPORTANTE: as funções mock devem ser definidas DENTRO do factory do vi.mock
// para evitar o erro de hoisting "Cannot access before initialization".
vi.mock("./_core/heartbeat", () => {
  return {
    listHeartbeatJobs: vi.fn(),
    createHeartbeatJob: vi.fn(),
  };
});

import { listHeartbeatJobs, createHeartbeatJob } from "./_core/heartbeat";
import { registerScheduledCrons, SCHEDULED_CRONS } from "./_core/register-crons";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeJobList(names: string[]) {
  return {
    total: names.length,
    actorUserId: "owner",
    jobs: names.map(name => ({ name, taskUid: `uid-${name}` } as any)),
  };
}

const mockList = listHeartbeatJobs as ReturnType<typeof vi.fn>;
const mockCreate = createHeartbeatJob as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ taskUid: "new-uid" });
});

// ─── Testes ───────────────────────────────────────────────────────────────────
describe("registerScheduledCrons", () => {
  it("cria todos os 7 crons quando não há jobs existentes", async () => {
    mockList.mockResolvedValue(makeJobList([]));

    const results = await registerScheduledCrons("");

    expect(results).toHaveLength(7);
    expect(results.every(r => r.status === "created")).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(7);
    const names = results.map(r => r.name);
    expect(names).toEqual(SCHEDULED_CRONS.map(c => c.name));
  });

  it("pula todos os crons quando já existem (idempotência total)", async () => {
    const allNames = SCHEDULED_CRONS.map(c => c.name);
    mockList.mockResolvedValue(makeJobList(allNames));

    const results = await registerScheduledCrons("");

    expect(results).toHaveLength(7);
    expect(results.every(r => r.status === "skipped")).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("cria apenas os crons ausentes quando alguns já existem", async () => {
    const existingNames = SCHEDULED_CRONS.slice(0, 3).map(c => c.name);
    mockList.mockResolvedValue(makeJobList(existingNames));

    const results = await registerScheduledCrons("");

    const created = results.filter(r => r.status === "created");
    const skipped = results.filter(r => r.status === "skipped");
    expect(created).toHaveLength(4); // 7 crons - 3 existentes = 4 criados
    expect(skipped).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("registra status 'error' para cron que falha, sem quebrar os demais", async () => {
    mockList.mockResolvedValue(makeJobList([]));
    mockCreate
      .mockRejectedValueOnce(new Error("API indisponível"))
      .mockResolvedValue({ taskUid: "ok-uid" });

    const results = await registerScheduledCrons("");

    expect(results[0].status).toBe("error");
    expect(results[0].detail).toContain("API indisponível");
    const created = results.filter(r => r.status === "created");
    expect(created).toHaveLength(6); // 7 crons - 1 que falhou = 6 criados
  });

  it("prossegue com lista vazia quando listHeartbeatJobs falha", async () => {
    mockList.mockRejectedValue(new Error("Heartbeat offline"));

    const results = await registerScheduledCrons("");

    // Sem lista de existentes → tenta criar todos os 6
    expect(mockCreate).toHaveBeenCalledTimes(7);
    expect(results.every(r => r.status === "created")).toBe(true);
  });

  it("aceita sessão vazia (boot via owner) e passa para as funções de heartbeat", async () => {
    mockList.mockResolvedValue(makeJobList([]));

    await registerScheduledCrons("");

    expect(mockList).toHaveBeenCalledWith("");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String) }),
      ""
    );
  });

  it("SCHEDULED_CRONS contém exatamente 7 entradas com paths corretos", () => {
    expect(SCHEDULED_CRONS).toHaveLength(7);
    for (const cron of SCHEDULED_CRONS) {
      expect(cron.path).toMatch(/^\/api\/scheduled\//);
      expect(cron.name).toBeTruthy();
      expect(cron.cron).toBeTruthy();
    }
  });
});
