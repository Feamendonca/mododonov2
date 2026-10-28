/**
 * sharepoint.ts
 * Conector Microsoft Graph (app-only, client_credentials) pra listar e baixar
 * arquivos de uma pasta do SharePoint dada por URL compartilhada.
 *
 * Porta pra TS o fluxo validado em scripts/sp-pull-test.mjs — a diferença é que
 * aqui as credenciais SÓ vêm de process.env.MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID
 * (nunca de ~/.secrets, nunca hardcoded). NUNCA logar o valor de client_secret ou do token.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface SpFile {
  name: string;
  lastModifiedDateTime: string;
  downloadUrl: string;
}

// ─── Token (client_credentials) ────────────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[sharepoint] variável de ambiente ${name} não configurada. ` +
        `Configure MS_CLIENT_ID, MS_CLIENT_SECRET e MS_TENANT_ID.`
    );
  }
  return value;
}

/**
 * Obtém (e cacheia em memória) o access_token do Microsoft Graph via
 * client_credentials. O cache expira ~60s antes do expires_in reportado
 * pela Microsoft, pra evitar usar um token na borda da validade.
 */
export async function getGraphToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.accessToken;
  }

  const clientId = readRequiredEnv("MS_CLIENT_ID");
  const clientSecret = readRequiredEnv("MS_CLIENT_SECRET");
  const tenantId = readRequiredEnv("MS_TENANT_ID");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    body,
  });
  const json = (await resp.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };

  if (!json.access_token) {
    // Nunca logar client_secret; a resposta de erro da Microsoft não contém segredo nosso.
    throw new Error(`[sharepoint] falha ao obter token: ${json.error ?? "erro desconhecido"} — ${json.error_description ?? ""}`.trim());
  }

  const expiresInMs = (json.expires_in ?? 3600) * 1000;
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + expiresInMs - 60_000, // renova 60s antes de expirar
  };

  return cachedToken.accessToken;
}

// ─── Encode de URL compartilhada pro formato /shares do Graph ─────────────────

/**
 * Codifica uma URL de compartilhamento do SharePoint no formato "sharing token"
 * exigido pelo endpoint /shares/{id} do Graph: "u!" + base64url(url), sem padding.
 */
export function encodeShareUrl(url: string): string {
  const base64 = Buffer.from(url, "utf8").toString("base64");
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "u!" + base64url;
}

// ─── Listagem de arquivos (com paginação) ──────────────────────────────────────

interface GraphDriveItem {
  name: string;
  file?: Record<string, unknown>;
  folder?: Record<string, unknown>;
  lastModifiedDateTime?: string;
  "@microsoft.graph.downloadUrl"?: string;
}

interface GraphChildrenResponse {
  value: GraphDriveItem[];
  "@odata.nextLink"?: string;
}

/**
 * Lista os arquivos (não-pastas) de uma pasta do SharePoint identificada por
 * uma URL de compartilhamento. Segue paginação via @odata.nextLink.
 */
export async function listFolderFiles(folderUrl: string): Promise<SpFile[]> {
  const token = await getGraphToken();
  const shareId = encodeShareUrl(folderUrl);

  let nextUrl: string | undefined =
    `${GRAPH_BASE}/shares/${shareId}/driveItem/children?$select=name,lastModifiedDateTime&$top=200`;

  const files: SpFile[] = [];

  while (nextUrl) {
    const resp = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await resp.json()) as GraphChildrenResponse;

    for (const item of json.value ?? []) {
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      if (item.file && downloadUrl) {
        files.push({
          name: item.name,
          lastModifiedDateTime: item.lastModifiedDateTime ?? "",
          downloadUrl,
        });
      }
    }

    nextUrl = json["@odata.nextLink"];
  }

  return files;
}

// ─── Seleção do arquivo mais recente ───────────────────────────────────────────

/**
 * Escolhe o DRE mais recente entre os arquivos listados:
 * - mantém só .xlsx (ignora temporários "~$...")
 * - se `filter` for passado, mantém só os arquivos cujo nome CONTÉM `filter` (case-insensitive)
 * - ordena por lastModifiedDateTime desc e devolve o primeiro, ou null se nenhum sobrar
 */
export function pickLatestDre(files: SpFile[], filter?: string): SpFile | null {
  const filterLower = filter?.toLowerCase();

  const candidates = files.filter((f) => {
    if (f.name.startsWith("~$")) return false;
    if (!f.name.toLowerCase().endsWith(".xlsx")) return false;
    if (filterLower && !f.name.toLowerCase().includes(filterLower)) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (a.lastModifiedDateTime < b.lastModifiedDateTime ? 1 : -1));

  return candidates[0];
}

// ─── Download ──────────────────────────────────────────────────────────────────

/**
 * Baixa o conteúdo de um SpFile a partir do seu downloadUrl pré-assinado
 * (não precisa de Authorization — a URL já contém o token de acesso temporário).
 */
export async function downloadSpFile(file: SpFile): Promise<Buffer> {
  const resp = await fetch(file.downloadUrl);
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
