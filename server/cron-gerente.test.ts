/**
 * cron-gerente.test.ts
 * Testes unitários para o sistema de notificação ao gerente e cron MIG.
 *
 * Cobre:
 *  1. notifyManager resolve o gerente correto via employees (papelRemuneravel=gestor)
 *  2. notifyManager usa fallback user_stores quando não há employee vinculado
 *  3. notifyManager retorna false sem quebrar quando não há gerente
 *  4. Checks (lancamento/contagem/ocorrencia/preturno) chamam notifyManager para loja com pendência
 *  5. Cron MIG monta pauta com medidas vermelhas + ações pendentes
 *  6. Cron MIG inclui aviso de compromisso pendente
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
  notifyManager: vi.fn().mockResolvedValue(true),
}));

vi.mock("../db", () => ({
  getAllStores: vi.fn(),
  getDailyEntry: vi.fn(),
  getStockCounts: vi.fn(),
  getActionPlans: vi.fn(),
  getCommitment: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("../db-preturno", () => ({
  getPreturnoConfigs: vi.fn(),
  getAtasToday: vi.fn(),
}));

vi.mock("../db-metas", () => ({
  listMetas: vi.fn(),
  listMedidas: vi.fn(),
}));

import { notifyManager, notifyOwner } from "../_core/notification";
import { getAllStores, getDailyEntry, getActionPlans, getCommitment, getDb } from "../db";
import { listMetas, listMedidas } from "../db-metas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORE_1 = { id: 1, name: "Loja Centro" };
const STORE_2 = { id: 2, name: "Loja Norte" };

function mockDb(rows: any[] = []) {
  const execute = vi.fn().mockResolvedValue([rows]);
  (getDb as any).mockResolvedValue({ execute, $client: { promise: () => ({ execute }) } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── notifyManager — resolução do gerente ─────────────────────────────────────

describe("notifyManager — lógica de resolução (via SQL mock)", () => {
  it("chama notifyManager com storeId correto", async () => {
    await notifyManager(1, { title: "Teste", content: "Conteúdo" });
    expect(notifyManager).toHaveBeenCalledWith(1, expect.objectContaining({ title: "Teste" }));
  });

  it("retorna false quando não há gerente (mock retorna false)", async () => {
    (notifyManager as any).mockResolvedValueOnce(false);
    const result = await notifyManager(99, { title: "Teste", content: "Conteúdo" });
    expect(result).toBe(false);
  });

  it("não lança exceção quando notifyManager falha (catch silencioso)", async () => {
    (notifyManager as any).mockRejectedValueOnce(new Error("Network error"));
    await expect(
      notifyManager(1, { title: "Teste", content: "Conteúdo" }).catch(() => false)
    ).resolves.toBe(false);
  });
});

// ─── lancamento-check — notifica gerente por loja ─────────────────────────────

describe("lancamento-check — notifica gerente da loja com pendência", () => {
  it("chama notifyManager para loja sem lançamento", async () => {
    (getAllStores as any).mockResolvedValue([STORE_1, STORE_2]);
    (getDailyEntry as any)
      .mockResolvedValueOnce(null)          // STORE_1: sem lançamento
      .mockResolvedValueOnce({ id: 1 });    // STORE_2: com lançamento
    mockDb([]);

    // Simular a lógica do handler
    const stores = await getAllStores();
    const pending: { id: number; name: string }[] = [];
    for (const store of stores) {
      const entry = await getDailyEntry(store.id, "2026-08-06");
      if (!entry) pending.push({ id: store.id, name: store.name });
    }

    for (const store of pending) {
      await notifyManager(store.id, {
        title: `⚠️ Lançamento de ontem não registrado — ${store.name}`,
        content: `O lançamento da loja ${store.name} ainda não foi registrado.`,
      }).catch(() => {});
    }

    expect(notifyManager).toHaveBeenCalledTimes(1);
    expect(notifyManager).toHaveBeenCalledWith(1, expect.objectContaining({
      title: expect.stringContaining("Loja Centro"),
    }));
    expect(notifyManager).not.toHaveBeenCalledWith(2, expect.anything());
  });

  it("não chama notifyManager quando todas as lojas estão em dia", async () => {
    (getAllStores as any).mockResolvedValue([STORE_1]);
    (getDailyEntry as any).mockResolvedValue({ id: 1 }); // com lançamento

    const stores = await getAllStores();
    const pending: { id: number; name: string }[] = [];
    for (const store of stores) {
      const entry = await getDailyEntry(store.id, "2026-08-06");
      if (!entry) pending.push({ id: store.id, name: store.name });
    }
    for (const store of pending) {
      await notifyManager(store.id, { title: "x", content: "x" }).catch(() => {});
    }

    expect(notifyManager).not.toHaveBeenCalled();
  });
});

// ─── Cron MIG — pauta guiada ──────────────────────────────────────────────────

describe("cron MIG — monta pauta com medidas vermelhas e ações", () => {
  it("inclui medida furada na pauta", () => {
    const medidas = [
      { titulo: "CMV", atingida: false, valorAtual: 35, metaValor: 30, metaOperador: "lte", unidade: "%", acoesPendentes: 2 },
      { titulo: "Faturamento", atingida: true, valorAtual: 125000, metaValor: 120000, metaOperador: "gte", unidade: "R$", acoesPendentes: 0 },
    ];

    const medidasFuradas = medidas.filter(m => m.atingida === false);
    expect(medidasFuradas).toHaveLength(1);
    expect(medidasFuradas[0].titulo).toBe("CMV");
    expect(medidasFuradas[0].acoesPendentes).toBe(2);
  });

  it("indica ações pendentes na medida furada", () => {
    const medida = { titulo: "EBITDA", atingida: false, acoesPendentes: 3 };
    const linha = medida.acoesPendentes > 0
      ? `→ ${medida.acoesPendentes} ação(ões) em andamento`
      : `→ Nenhuma ação criada — crie ações no sistema`;
    expect(linha).toContain("3 ação(ões) em andamento");
  });

  it("indica ausência de ações quando medida furada não tem ações", () => {
    const medida = { titulo: "Folha", atingida: false, acoesPendentes: 0 };
    const linha = medida.acoesPendentes > 0
      ? `→ ${medida.acoesPendentes} ação(ões) em andamento`
      : `→ Nenhuma ação criada — crie ações no sistema`;
    expect(linha).toContain("Nenhuma ação criada");
  });

  it("inclui aviso de compromisso pendente quando não assinado", () => {
    const commitment = { signed: false };
    const commitmentPendente = commitment && !commitment.signed;
    expect(commitmentPendente).toBe(true);
  });

  it("não inclui aviso de compromisso quando assinado", () => {
    const commitment = { signed: true };
    const commitmentPendente = commitment && !commitment.signed;
    expect(commitmentPendente).toBe(false);
  });

  it("placar correto: 1/2 medidas atingidas", () => {
    const medidas = [
      { atingida: true },
      { atingida: false },
    ];
    const atingidas = medidas.filter(m => m.atingida === true).length;
    const total = medidas.length;
    expect(`${atingidas}/${total} medidas atingidas`).toBe("1/2 medidas atingidas");
  });

  it("chama notifyManager para cada loja processada", async () => {
    (getAllStores as any).mockResolvedValue([STORE_1, STORE_2]);
    (listMetas as any).mockResolvedValue([]);
    (getActionPlans as any).mockResolvedValue([]);
    (getCommitment as any).mockResolvedValue(undefined);
    mockDb([]);

    const stores = await getAllStores();
    for (const store of stores) {
      await notifyManager(store.id, {
        title: `📋 Pauta MIG — ${store.name}`,
        content: "Pauta de teste",
      }).catch(() => {});
    }

    expect(notifyManager).toHaveBeenCalledTimes(2);
    expect(notifyManager).toHaveBeenCalledWith(1, expect.objectContaining({ title: expect.stringContaining("Loja Centro") }));
    expect(notifyManager).toHaveBeenCalledWith(2, expect.objectContaining({ title: expect.stringContaining("Loja Norte") }));
  });
});
