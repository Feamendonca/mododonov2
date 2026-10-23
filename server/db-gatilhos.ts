/**
 * db-gatilhos.ts — Gatilhos mensais de elegibilidade por pessoa
 * Regra: gatilho não apontado = apuração BLOQUEADA com aviso. Nunca assume OK.
 */
import { getDb } from "./db";
import { AVALIACAO_MINIMA } from "../shared/engine";

export type GatilhoMensal = {
  id: number;
  employeeId: number;
  storeId: number;
  period: string; // YYYY-MM
  semFaltasInjustificadas: boolean | null; // NULL = não apontado
  avaliacaoDesempenho: number | null; // NULL = não apontado (0.0–10.0)
  semSancoes: boolean | null; // NULL = não apontado
  fonte: "calculado" | "manual";
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
};

export type GatilhoStatus =
  | { ok: true; gatilhos: GatilhoMensal }
  | { ok: false; bloqueado: true; motivo: string };

/**
 * Verifica se todos os gatilhos foram apontados e se todos passaram.
 * Retorna { ok: true } apenas se todos os 3 foram apontados E passaram.
 * Qualquer gatilho não apontado → bloqueado com motivo claro.
 */
export function avaliarGatilhos(g: GatilhoMensal | null): GatilhoStatus {
  if (!g) {
    return {
      ok: false,
      bloqueado: true,
      motivo: "Gatilhos do mês não foram apontados. Acesse Remuneração → Gatilhos para registrar.",
    };
  }

  const pendentes: string[] = [];
  if (g.semFaltasInjustificadas === null) pendentes.push("Faltas injustificadas");
  if (g.avaliacaoDesempenho === null) pendentes.push("Avaliação de desempenho");
  if (g.semSancoes === null) pendentes.push("Sanções disciplinares");

  if (pendentes.length > 0) {
    return {
      ok: false,
      bloqueado: true,
      motivo: `Gatilhos pendentes de apontamento: ${pendentes.join(", ")}.`,
    };
  }

  // Todos apontados — verificar se passaram
  // A elegibilidade real é decidida pelo motor (shared/engine.ts → elegivel()).
  // Aqui apenas montamos uma lista de motivos para exibição na UI, sem duplicar a regra.
  const motivos: string[] = [];
  if (g.semFaltasInjustificadas === false) motivos.push("falta injustificada registrada");
  if (g.semSancoes === false) motivos.push("sanção disciplinar registrada");
  if (g.avaliacaoDesempenho !== null && g.avaliacaoDesempenho < AVALIACAO_MINIMA) {
    motivos.push(`avaliação de desempenho ${g.avaliacaoDesempenho.toFixed(1)} (mínimo ${AVALIACAO_MINIMA.toFixed(1)})`);
  }
  // Retorna ok:true com os gatilhos; o motor (elegivel()) decide se paga ou zera o variável.
  return { ok: true, gatilhos: g };
}

export async function getGatilhoMensal(
  employeeId: number,
  period: string
): Promise<GatilhoMensal | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM gatilhos_mensais WHERE employeeId = ? AND period = ? LIMIT 1",
    [employeeId, period]
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    ...r,
    semFaltasInjustificadas: r.semFaltasInjustificadas === null ? null : Boolean(r.semFaltasInjustificadas),
    semSancoes: r.semSancoes === null ? null : Boolean(r.semSancoes),
    avaliacaoDesempenho: r.avaliacaoDesempenho !== null ? Number(r.avaliacaoDesempenho) : null,
  };
}

export async function getGatilhosForStore(
  storeId: number,
  period: string
): Promise<GatilhoMensal[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM gatilhos_mensais WHERE storeId = ? AND period = ? ORDER BY employeeId",
    [storeId, period]
  );
  return (rows as any[]).map(r => ({
    ...r,
    semFaltasInjustificadas: r.semFaltasInjustificadas === null ? null : Boolean(r.semFaltasInjustificadas),
    semSancoes: r.semSancoes === null ? null : Boolean(r.semSancoes),
    avaliacaoDesempenho: r.avaliacaoDesempenho !== null ? Number(r.avaliacaoDesempenho) : null,
  }));
}

export async function upsertGatilhoMensal(
  employeeId: number,
  storeId: number,
  period: string,
  data: {
    semFaltasInjustificadas?: boolean | null;
    avaliacaoDesempenho?: number | null;
    semSancoes?: boolean | null;
  },
  updatedBy: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await getGatilhoMensal(employeeId, period);

  if (existing) {
    const fields: string[] = [];
    const values: any[] = [];

    if ("semFaltasInjustificadas" in data) {
      fields.push("semFaltasInjustificadas = ?");
      values.push(data.semFaltasInjustificadas === null ? null : data.semFaltasInjustificadas ? 1 : 0);
    }
    if ("avaliacaoDesempenho" in data) {
      fields.push("avaliacaoDesempenho = ?");
      values.push(data.avaliacaoDesempenho);
    }
    if ("semSancoes" in data) {
      fields.push("semSancoes = ?");
      values.push(data.semSancoes === null ? null : data.semSancoes ? 1 : 0);
    }
    fields.push("updatedBy = ?", "fonte = 'manual'");
    values.push(updatedBy, existing.id);

    await (db as any).$client.promise().execute(
      `UPDATE gatilhos_mensais SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
  } else {
    await (db as any).$client.promise().execute(
      `INSERT INTO gatilhos_mensais (employeeId, storeId, period, semFaltasInjustificadas, avaliacaoDesempenho, semSancoes, fonte, updatedBy)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`,
      [
        employeeId,
        storeId,
        period,
        data.semFaltasInjustificadas === undefined ? null : (data.semFaltasInjustificadas === null ? null : data.semFaltasInjustificadas ? 1 : 0),
        data.avaliacaoDesempenho ?? null,
        data.semSancoes === undefined ? null : (data.semSancoes === null ? null : data.semSancoes ? 1 : 0),
        updatedBy,
      ]
    );
  }
}
