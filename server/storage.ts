// Preconfigured storage helpers — migrado do storage do Manus (Forge presign + S3)
// para o Supabase Storage. Bucket PRIVADO; leitura sempre via URL assinada
// temporária (nunca URL pública permanente).
//
// Contrato preservado para os chamadores (server/routers.ts,
// server/routers/orcamento-assistido.ts, server/_core/imageGeneration.ts):
//   storagePut, storageGetPresignedPutUrl, storageDownload, storageGet,
//   storageGetSignedUrl — mesmos nomes e assinaturas de antes.
//
// Links "estáveis" (ex.: anexo.url salvo no banco e usado como <img src>)
// continuam sendo servidos por `/manus-storage/{key}`, que agora redireciona
// (307) para uma URL assinada do Supabase gerada na hora — ver
// server/_core/storageProxy.ts.

import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

const BUCKET = "modo-dono-files";
const SIGNED_URL_TTL_SECONDS = 15 * 60; // 15 minutos

function getSupabaseConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error(
      "Storage config missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return { supabaseUrl: ENV.supabaseUrl, supabaseServiceRoleKey: ENV.supabaseServiceRoleKey };
}

let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (_client) return _client;
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseConfig();
  _client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

// Garante que o bucket privado existe. Idempotente: ignora erro "já existe".
// Memoiza a promise para não tentar criar em toda chamada (hot path).
let _bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  if (_bucketReady) return _bucketReady;
  _bucketReady = (async () => {
    const client = getClient();
    const { error } = await client.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      // Não deixa a promise memoizada "travada" num erro transitório.
      _bucketReady = null;
      throw new Error(`Storage createBucket failed: ${error.message}`);
    }
  })();
  return _bucketReady;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  await ensureBucket();
  const client = getClient();
  const key = appendHashSuffix(normalizeKey(relKey));

  const body =
    typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);

  const { error } = await client.storage.from(BUCKET).upload(key, body, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return { key, url: `/manus-storage/${key}` };
}

/**
 * Retorna uma URL assinada de upload para o cliente fazer upload direto ao
 * Supabase Storage (bypass do backend). Usado pelo Bloco B do
 * PATCH_IMPORTACAO: arquivo > 1,5 MB sobe direto do browser.
 */
export async function storageGetPresignedPutUrl(
  relKey: string,
  contentType = "application/octet-stream",
): Promise<{ uploadUrl: string; key: string; storageUrl: string }> {
  await ensureBucket();
  const client = getClient();
  const key = appendHashSuffix(normalizeKey(relKey));

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUploadUrl(key);

  if (error || !data?.signedUrl) {
    throw new Error(`Storage signed upload URL failed: ${error?.message ?? "empty response"}`);
  }

  return { uploadUrl: data.signedUrl, key, storageUrl: `/manus-storage/${key}` };
}

/** Baixa um arquivo do storage por key e retorna o Buffer. Usado pelo backend para ler arquivos enviados por referência. */
export async function storageDownload(relKey: string): Promise<Buffer> {
  await ensureBucket();
  const client = getClient();
  const key = normalizeKey(relKey);

  const { data, error } = await client.storage.from(BUCKET).download(key);
  if (error || !data) {
    throw new Error(`Storage download failed (${relKey}): ${error?.message ?? "empty response"}`);
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  await ensureBucket();
  const client = getClient();
  const key = normalizeKey(relKey);

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(`Storage signed URL failed (${relKey}): ${error?.message ?? "empty response"}`);
  }

  return data.signedUrl;
}
