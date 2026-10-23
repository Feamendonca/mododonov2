/**
 * google-places.ts
 * Integração com Google Places API para buscar a nota de qualidade automaticamente.
 *
 * PRECEDÊNCIA (não duplicar fontes):
 * - Loja com googlePlaceId → Places API é a fonte AUTOMÁTICA de qualityGoogle (rating × 20 puro)
 * - Sem googlePlaceId → mantém o caminho reviews/manual atual (recalcularQualidadeGoogle)
 *
 * A penalidade de reclamação (reviews ≤3★ >7d) NÃO se aplica no caminho Places.
 * A tabela reviews/experiencia segue para acompanhamento manual.
 *
 * ToS: guardar apenas o AGREGADO (rating + totalRatings) — NÃO persistir texto de reviews individuais.
 */

import { getDb } from "./db";

const PLACES_API_BASE = "https://maps.googleapis.com/maps/api/place/details/json";

export interface GooglePlaceRating {
  rating: number;       // ex: 4.3
  totalRatings: number; // ex: 128
}

/**
 * Busca o rating atual de um estabelecimento no Google Places.
 * Retorna null se a chave não estiver configurada, o place_id for inválido ou não houver rating.
 */
export async function fetchGooglePlaceRating(placeId: string): Promise<GooglePlaceRating | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[google-places] GOOGLE_MAPS_API_KEY não configurada — ignorando busca de rating.");
    return null;
  }
  const url = `${PLACES_API_BASE}?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total&key=${apiKey}`;
  let json: Record<string, unknown>;
  try {
    const resp = await fetch(url);
    json = await resp.json() as Record<string, unknown>;
  } catch (err) {
    console.error("[google-places] Erro de rede ao buscar Place Details:", err);
    return null;
  }
  const status = json.status as string | undefined;
  if (status !== "OK") {
    console.warn(`[google-places] Places API retornou status=${status} para place_id=${placeId}`);
    return null;
  }
  const result = json.result as Record<string, unknown> | undefined;
  if (!result) return null;
  const rating = typeof result.rating === "number" ? result.rating : null;
  const totalRatings = typeof result.user_ratings_total === "number" ? result.user_ratings_total : 0;
  if (rating === null) {
    console.warn(`[google-places] place_id=${placeId} não tem rating ainda (estabelecimento novo?)`);
    return null;
  }
  return { rating, totalRatings };
}

/**
 * Calcula a nota de qualidade Google a partir do rating do Places API.
 * Fórmula: nota = round(rating × 20, 2) — sem penalidade (Places é fonte agregada).
 */
export function calcNotaFromRating(rating: number): number {
  return Math.round(rating * 20 * 100) / 100; // 2 casas decimais
}

/**
 * Sincroniza o rating do Google Places para uma loja/período:
 * 1. Busca rating via Places API
 * 2. Faz upsert em google_ratings (snapshot idempotente por storeId+period)
 * 3. Grava a nota em monthly_quality.qualityGoogle (fonte='places_api')
 *
 * Só executa se a loja tiver googlePlaceId configurado.
 * Retorna null se não houver place_id ou se a API falhar.
 */
export async function syncGoogleRating(
  storeId: number,
  period: string // YYYY-MM
): Promise<{ rating: number; totalRatings: number; nota: number } | null> {
  const db = await getDb();
  if (!db) return null;
  // Buscar googlePlaceId da loja
  const [storeRows] = await (db as any).$client.promise().execute(
    "SELECT googlePlaceId FROM stores WHERE id = ?",
    [storeId]
  );
  const store = (storeRows as Array<{ googlePlaceId: string | null }>)[0];
  if (!store?.googlePlaceId) return null; // sem place_id → caminho manual
  // Buscar rating no Places API
  const placeData = await fetchGooglePlaceRating(store.googlePlaceId);
  if (!placeData) return null;
  const { rating, totalRatings } = placeData;
  const nota = calcNotaFromRating(rating);
  const now = Date.now();
  // Upsert em google_ratings (snapshot idempotente por storeId+period)
  await (db as any).$client.promise().execute(
    `INSERT INTO google_ratings (storeId, period, rating, totalRatings, nota, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rating = VALUES(rating),
       totalRatings = VALUES(totalRatings),
       nota = VALUES(nota),
       fetchedAt = VALUES(fetchedAt)`,
    [storeId, period, rating, totalRatings, nota, now]
  );
  // Gravar nota em monthly_quality.qualityGoogle
  // Usa upsert: cria o registro do período se não existir, atualiza se já existir
  await (db as any).$client.promise().execute(
    `INSERT INTO monthly_quality (storeId, period, qualityGoogle, createdAt)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE qualityGoogle = VALUES(qualityGoogle)`,
    [storeId, period, String(nota)]
  );
  console.log(`[google-places] storeId=${storeId} period=${period} rating=${rating} nota=${nota}`);
  return { rating, totalRatings, nota };
}

/**
 * Sincroniza o rating Google para TODAS as lojas ativas com googlePlaceId configurado.
 * Usado pelo cron google-rating-sync.
 */
/**
 * Retorna o snapshot mais recente de google_ratings para uma loja.
 * Usado pelo Admin para exibir "Nota Google: ★4,3 → 86 · atualizada em DD/MM".
 */
export async function getLastGoogleRating(
  storeId: number
): Promise<{ rating: number; totalRatings: number; nota: number; period: string; fetchedAt: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT rating, totalRatings, nota, period, fetchedAt
     FROM google_ratings WHERE storeId = ? ORDER BY fetchedAt DESC LIMIT 1`,
    [storeId]
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    rating: Number(r.rating),
    totalRatings: Number(r.totalRatings),
    nota: Number(r.nota),
    period: r.period as string,
    fetchedAt: Number(r.fetchedAt),
  };
}

export async function syncAllGoogleRatings(period: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT id FROM stores WHERE active = 1 AND googlePlaceId IS NOT NULL AND googlePlaceId != ''",
    []
  );
  const storeIds = (rows as Array<{ id: number }>).map((r) => r.id);
  console.log(`[google-places] Sincronizando ${storeIds.length} lojas para período ${period}`);
  for (const storeId of storeIds) {
    try {
      await syncGoogleRating(storeId, period);
    } catch (err) {
      console.error(`[google-places] Erro ao sincronizar storeId=${storeId}:`, err);
    }
  }
}
