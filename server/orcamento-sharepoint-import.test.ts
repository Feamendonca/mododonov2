/**
 * orcamento-sharepoint-import.test.ts
 * Task S3 do conector SharePoint (ver .superpowers/sdd/2026-10-28-orcamento-sharepoint/):
 * procedure `importarDoSharePoint` — junta S1 (conector Graph) + S2 (config da loja)
 * + o parser/proposta determinístico já existente (`orcamento-proposta.ts`).
 *
 * Só muda a ORIGEM dos bytes (SharePoint em vez de upload); o resto do fluxo
 * (extrair → propor → calcular) é idêntico a `proporDaDre`. NÃO grava nada.
 *
 * Mocka `./db` (getStoreById/getStoresByUserId), `./sharepoint` e
 * `./orcamento-proposta` — sem Graph real, sem banco real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getStoreById: vi.fn(),
  getStoresByUserId: vi.fn(),
}));

vi.mock("./sharepoint", () => ({
  listFolderFiles: vi.fn(),
  pickLatestDre: vi.fn(),
  downloadSpFile: vi.fn(),
}));

vi.mock("./orcamento-proposta", () => ({
  extrairGruposPorMes: vi.fn(),
  proporOrcamento: vi.fn(),
  calcularDre: vi.fn(),
}));

import { getStoreById, getStoresByUserId } from "./db";
import { listFolderFiles, pickLatestDre, downloadSpFile } from "./sharepoint";
import { extrairGruposPorMes, proporOrcamento, calcularDre } from "./orcamento-proposta";
import { orcamentoRouter } from "./routers/orcamento";

// ─── Fixtures de contexto tRPC ──────────────────────────────────────────────

function makeCtx(role: "admin" | "user", id: number): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: {
      id,
      openId: `open-${id}`,
      email: `user${id}@example.com`,
      name: `User ${id}`,
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as TrpcContext["user"],
  };
}

const ctxAdmin = makeCtx("admin", 1);
const ctxGerenteLoja5 = makeCtx("user", 2);
const ctxGerenteSemLoja = makeCtx("user", 3);

beforeEach(() => {
  vi.clearAllMocks();
  (getStoresByUserId as any).mockImplementation(async (userId: number) => {
    if (userId === 2) return [{ id: 5, name: "Loja 5" }];
    return [];
  });
});

describe("orcamento.importarDoSharePoint", () => {
  const spFile = {
    name: "08 - Loja (Praça).xlsx",
    lastModifiedDateTime: "2026-10-20T12:00:00Z",
    downloadUrl: "http://d/1",
  };
  const rascunhoFake = { receitaBruta: 700000, cmvPct: 0.31, emAtencao: false } as any;
  const dreFake = {
    receitaLiquida: 700000,
    cmvRs: 217000,
    ebitda: 100000,
    ebitdaPct: 0.14,
    pontoEquilibrio: 500000,
    metaDiaria: 23333,
    parcial: false,
  };

  beforeEach(() => {
    (getStoreById as any).mockResolvedValue({
      id: 5,
      dreSharepointUrl: "https://contoso.sharepoint.com/sites/x/Shared/Pasta",
      dreFileFilter: "Praça",
    });
    (listFolderFiles as any).mockResolvedValue([spFile]);
    (pickLatestDre as any).mockReturnValue(spFile);
    (downloadSpFile as any).mockResolvedValue(Buffer.from("fake-xlsx"));
    (extrairGruposPorMes as any).mockReturnValue([{ anoMes: "2026-09", grupos: { "1": 700000 } }]);
    (proporOrcamento as any).mockReturnValue(rascunhoFake);
    (calcularDre as any).mockReturnValue(dreFake);
  });

  it("não-admin sem vínculo com a loja → FORBIDDEN, e NÃO toca SharePoint/propõe nada", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteSemLoja);
    await expect(
      caller.importarDoSharePoint({ storeId: 5 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listFolderFiles).not.toHaveBeenCalled();
    expect(downloadSpFile).not.toHaveBeenCalled();
  });

  it("loja sem dreSharepointUrl configurado → FAILED_PRECONDITION", async () => {
    (getStoreById as any).mockResolvedValue({ id: 5, dreSharepointUrl: null, dreFileFilter: null });
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    await expect(
      caller.importarDoSharePoint({ storeId: 5 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(listFolderFiles).not.toHaveBeenCalled();
  });

  it("pickLatestDre não encontra nenhum arquivo → NOT_FOUND", async () => {
    (pickLatestDre as any).mockReturnValue(null);
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    await expect(
      caller.importarDoSharePoint({ storeId: 5 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(downloadSpFile).not.toHaveBeenCalled();
  });

  it("loja com url+filtro → busca na pasta, baixa a DRE mais recente, propõe e calcula; devolve {rascunho, dre, fonte} e NÃO grava nada", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    const result = await caller.importarDoSharePoint({ storeId: 5, meses: 3 });

    expect(listFolderFiles).toHaveBeenCalledWith("https://contoso.sharepoint.com/sites/x/Shared/Pasta");
    expect(pickLatestDre).toHaveBeenCalledWith([spFile], "Praça");
    expect(downloadSpFile).toHaveBeenCalledWith(spFile);
    expect(extrairGruposPorMes).toHaveBeenCalledWith(
      expect.any(Buffer),
      spFile.name,
      undefined,
      3
    );
    expect(proporOrcamento).toHaveBeenCalledWith([{ anoMes: "2026-09", grupos: { "1": 700000 } }]);
    expect(calcularDre).toHaveBeenCalledWith(rascunhoFake, 30);

    expect(result).toEqual({
      rascunho: rascunhoFake,
      dre: dreFake,
      fonte: { nome: spFile.name, data: spFile.lastModifiedDateTime },
    });
  });

  it("sem `meses` informado → usa default 3 ao extrair grupos", async () => {
    const caller = orcamentoRouter.createCaller(ctxGerenteLoja5);

    await caller.importarDoSharePoint({ storeId: 5 });

    expect(extrairGruposPorMes).toHaveBeenCalledWith(
      expect.any(Buffer),
      spFile.name,
      undefined,
      3
    );
  });

  it("admin passa para qualquer loja sem checar vínculo", async () => {
    (getStoreById as any).mockResolvedValue({
      id: 999,
      dreSharepointUrl: "https://contoso.sharepoint.com/sites/y/Shared/Pasta",
      dreFileFilter: null,
    });
    const caller = orcamentoRouter.createCaller(ctxAdmin);

    const result = await caller.importarDoSharePoint({ storeId: 999 });

    expect(result).toEqual({
      rascunho: rascunhoFake,
      dre: dreFake,
      fonte: { nome: spFile.name, data: spFile.lastModifiedDateTime },
    });
    expect(getStoresByUserId).not.toHaveBeenCalled();
    expect(pickLatestDre).toHaveBeenCalledWith([spFile], undefined);
  });
});
