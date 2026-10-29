/**
 * sharepoint.test.ts
 * Testes do conector Graph do SharePoint (token + encode share URL + listar + pickLatest).
 *
 * Todos os testes mockam global.fetch — NENHUMA chamada real ao Microsoft Graph.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const ENV_KEYS = ["MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT_ID"] as const;

function setEnv() {
  process.env.MS_CLIENT_ID = "test-client-id";
  process.env.MS_CLIENT_SECRET = "test-client-secret";
  process.env.MS_TENANT_ID = "test-tenant-id";
}

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

// ─── 1. getGraphToken ─────────────────────────────────────────────────────────

describe("getGraphToken", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    setEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearEnv();
  });

  it("chama o endpoint de token e devolve o access_token do JSON mockado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "tok-abc", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getGraphToken } = await import("./sharepoint");
    const token = await getGraphToken();

    expect(token).toBe("tok-abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token");
    expect(opts?.method).toBe("POST");
    const bodyStr = String(opts?.body);
    expect(bodyStr).toContain("client_id=test-client-id");
    expect(bodyStr).toContain("client_secret=test-client-secret");
    expect(bodyStr).toContain("grant_type=client_credentials");
    expect(bodyStr).toContain("graph.microsoft.com");
  });

  it("na 2ª chamada usa o cache em memória (fetch não é chamado de novo)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "tok-cached", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getGraphToken } = await import("./sharepoint");
    const t1 = await getGraphToken();
    const t2 = await getGraphToken();

    expect(t1).toBe("tok-cached");
    expect(t2).toBe("tok-cached");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lança erro claro se faltar env (MS_CLIENT_ID/MS_CLIENT_SECRET/MS_TENANT_ID)", async () => {
    clearEnv();
    const { getGraphToken } = await import("./sharepoint");
    await expect(getGraphToken()).rejects.toThrow();
  });
});

// ─── 2. encodeShareUrl ─────────────────────────────────────────────────────────

describe("encodeShareUrl", () => {
  it("começa com 'u!', sem '=', sem '+' ou '/'", async () => {
    const { encodeShareUrl } = await import("./sharepoint");
    const encoded = encodeShareUrl("https://x/y z");
    expect(encoded.startsWith("u!")).toBe(true);
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
  });
});

// ─── 3. listFolderFiles ────────────────────────────────────────────────────────

describe("listFolderFiles", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    setEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearEnv();
  });

  it("retorna só os itens que são arquivo (ignora pastas)", async () => {
    const tokenResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: "tok-xyz", expires_in: 3600 }),
    };
    const listResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          value: [
            {
              name: "a.xlsx",
              file: {},
              "@microsoft.graph.downloadUrl": "http://d/a",
              lastModifiedDateTime: "2026-08-01",
            },
            { name: "pasta", folder: {} },
          ],
        }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(listResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { listFolderFiles } = await import("./sharepoint");
    const files = await listFolderFiles("https://contoso.sharepoint.com/sites/x/Shared/Pasta");

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      name: "a.xlsx",
      lastModifiedDateTime: "2026-08-01",
      downloadUrl: "http://d/a",
    });
  });

  it("lida com paginação via @odata.nextLink", async () => {
    const tokenResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: "tok-page", expires_in: 3600 }),
    };
    const page1 = {
      ok: true,
      json: () =>
        Promise.resolve({
          value: [
            {
              name: "p1.xlsx",
              file: {},
              "@microsoft.graph.downloadUrl": "http://d/p1",
              lastModifiedDateTime: "2026-08-01",
            },
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
        }),
    };
    const page2 = {
      ok: true,
      json: () =>
        Promise.resolve({
          value: [
            {
              name: "p2.xlsx",
              file: {},
              "@microsoft.graph.downloadUrl": "http://d/p2",
              lastModifiedDateTime: "2026-08-02",
            },
          ],
        }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    vi.stubGlobal("fetch", fetchMock);

    const { listFolderFiles } = await import("./sharepoint");
    const files = await listFolderFiles("https://contoso.sharepoint.com/sites/x/Shared/Pasta");

    expect(files.map((f) => f.name)).toEqual(["p1.xlsx", "p2.xlsx"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ─── 4. pickLatestDre ──────────────────────────────────────────────────────────

describe("pickLatestDre", () => {
  it("filtra .xlsx, ignora ~$tmp, aplica filtro de nome (case-insensitive) e ordena por mais recente", async () => {
    const { pickLatestDre } = await import("./sharepoint");
    const files = [
      {
        name: "08 - X (Praça).xlsx",
        lastModifiedDateTime: "2026-09-01",
        downloadUrl: "http://d/1",
      },
      {
        name: "08 - X (Embarque).xlsx",
        lastModifiedDateTime: "2026-09-02",
        downloadUrl: "http://d/2",
      },
      {
        name: "07 - X (Praça).xlsx",
        lastModifiedDateTime: "2026-08-01",
        downloadUrl: "http://d/3",
      },
      {
        name: "~$tmp.xlsx",
        lastModifiedDateTime: "2026-09-05",
        downloadUrl: "http://d/tmp",
      },
    ];

    const result = pickLatestDre(files, "praça");
    expect(result?.name).toBe("08 - X (Praça).xlsx");
  });

  it("sem filtro, devolve o .xlsx mais recente ignorando ~$tmp", async () => {
    const { pickLatestDre } = await import("./sharepoint");
    const files = [
      { name: "a.xlsx", lastModifiedDateTime: "2026-08-01", downloadUrl: "http://d/a" },
      { name: "b.xlsx", lastModifiedDateTime: "2026-09-01", downloadUrl: "http://d/b" },
      { name: "~$b.xlsx", lastModifiedDateTime: "2026-10-01", downloadUrl: "http://d/tmp" },
      { name: "c.docx", lastModifiedDateTime: "2026-11-01", downloadUrl: "http://d/c" },
    ];

    const result = pickLatestDre(files);
    expect(result?.name).toBe("b.xlsx");
  });

  it("devolve null quando nenhum arquivo bate", () => {
    // Import síncrono não é necessário aqui pois pickLatestDre não depende de env/fetch
    return import("./sharepoint").then(({ pickLatestDre }) => {
      const result = pickLatestDre([
        { name: "~$tmp.xlsx", lastModifiedDateTime: "2026-09-01", downloadUrl: "http://d/tmp" },
      ]);
      expect(result).toBeNull();
    });
  });
});

// ─── 4b. resolveDriveItem ───────────────────────────────────────────────────────

describe("resolveDriveItem", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    setEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearEnv();
  });

  it("URL de ARQUIVO → devolve { isFile: true, downloadUrl, name, lastModifiedDateTime }", async () => {
    const tokenResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: "tok-file", expires_in: 3600 }),
    };
    const driveItemResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          name: "DRE Ano26 BGP (AZM).xlsb",
          file: {},
          lastModifiedDateTime: "2026-10-20T12:00:00Z",
          "@microsoft.graph.downloadUrl": "http://d/arquivo",
        }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(driveItemResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { resolveDriveItem } = await import("./sharepoint");
    const item = await resolveDriveItem("https://contoso.sharepoint.com/:x:/r/sites/x/Doc.aspx?sourcedoc=%7B1%7D");

    expect(item).toEqual({
      name: "DRE Ano26 BGP (AZM).xlsb",
      lastModifiedDateTime: "2026-10-20T12:00:00Z",
      downloadUrl: "http://d/arquivo",
      isFile: true,
    });
    const [calledUrl, calledOpts] = fetchMock.mock.calls[1];
    expect(String(calledUrl)).toContain("/driveItem");
    expect(calledOpts?.headers?.Authorization).toBe("Bearer tok-file");
  });

  it("URL de PASTA → devolve { isFile: false }, sem downloadUrl", async () => {
    const tokenResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: "tok-folder", expires_in: 3600 }),
    };
    const driveItemResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          name: "Pasta DREs",
          folder: {},
          lastModifiedDateTime: "2026-10-01T00:00:00Z",
        }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(driveItemResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { resolveDriveItem } = await import("./sharepoint");
    const item = await resolveDriveItem("https://contoso.sharepoint.com/sites/x/Shared/Pasta");

    expect(item?.isFile).toBe(false);
    expect(item?.downloadUrl).toBeFalsy();
  });

  it("item não resolve (nem file nem folder, sem downloadUrl) → null", async () => {
    const tokenResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: "tok-none", expires_in: 3600 }),
    };
    const driveItemResponse = {
      ok: true,
      json: () => Promise.resolve({ error: { message: "itemNotFound" } }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(driveItemResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { resolveDriveItem } = await import("./sharepoint");
    const item = await resolveDriveItem("https://contoso.sharepoint.com/sites/x/nope");

    expect(item).toBeNull();
  });
});

// ─── 5. downloadSpFile ─────────────────────────────────────────────────────────

describe("downloadSpFile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("baixa file.downloadUrl e devolve um Buffer", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { downloadSpFile } = await import("./sharepoint");
    const buf = await downloadSpFile({
      name: "a.xlsx",
      lastModifiedDateTime: "2026-09-01",
      downloadUrl: "http://d/a",
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(Array.from(buf)).toEqual([1, 2, 3, 4]);
    expect(fetchMock).toHaveBeenCalledWith("http://d/a");
  });
});
