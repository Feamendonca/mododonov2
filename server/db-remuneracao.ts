import { getDb } from "./db";
import { round2 } from "../shared/engine";

export interface RemuneracaoConfig {
  id: number;
  lojaId: number;
  ativa: boolean;
  bonusBasePctFaturamento: number;
  gatilhoMinimoPct: number;
  tetoMaximoPct: number;
  descricao: string | null;
  updatedAt: number;
  regras?: RemuneracaoRegra[];
}

export interface RemuneracaoRegra {
  id: number;
  configId: number;
  titulo: string;
  descricao: string | null;
  tipo: "automatico" | "manual";
  indicador: string;
  metaValor: number | null;
  metaOperador: "gte" | "lte" | "eq";
  descontoPct: number;
  ordem: number;
  ativa: boolean;
  createdAt: number;
}

export interface RemuneracaoApuracao {
  id: number;
  lojaId: number;
  mes: number;
  ano: number;
  faturamentoReal: number | null;
  bonusBaseRs: number | null;
  resultadoAtingimentoPct: number | null;
  bonusFinalRs: number | null;
  status: "rascunho" | "aprovado";
  observacao: string | null;
  aprovadoPor: string | null;
  aprovadoEm: number | null;
  createdAt: number;
  regras?: ApuracaoRegra[];
  // Campos do motor único (pessoa remunerável)
  employeeId: number | null;
  papel: "gestor" | "lider" | null;
  extratoJson: string | null;
  legado: boolean;
}

export interface ApuracaoRegra {
  id: number;
  apuracaoId: number;
  regraId: number | null;
  titulo: string | null;
  valorApurado: number | null;
  metaAtingida: boolean;
  descontoAplicadoPct: number;
  observacao: string | null;
}

async function exec(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

function mapConfig(row: Record<string, unknown>): RemuneracaoConfig {
  return {
    id: Number(row.id),
    lojaId: Number(row.loja_id),
    ativa: Boolean(row.ativa),
    bonusBasePctFaturamento: Number(row.bonus_base_pct_faturamento ?? 0.015),
    gatilhoMinimoPct: Number(row.gatilho_minimo_pct ?? 80),
    tetoMaximoPct: Number(row.teto_maximo_pct ?? 120),
    descricao: row.descricao ? String(row.descricao) : null,
    updatedAt: Number(row.updated_at),
  };
}

function mapRegra(row: Record<string, unknown>): RemuneracaoRegra {
  return {
    id: Number(row.id),
    configId: Number(row.config_id),
    titulo: String(row.titulo),
    descricao: row.descricao ? String(row.descricao) : null,
    tipo: (row.tipo as "automatico" | "manual") ?? "manual",
    indicador: String(row.indicador ?? "custom"),
    metaValor: row.meta_valor != null ? Number(row.meta_valor) : null,
    metaOperador: (row.meta_operador as "gte" | "lte" | "eq") ?? "gte",
    descontoPct: Number(row.desconto_pct ?? 25),
    ordem: Number(row.ordem ?? 0),
    ativa: Boolean(row.ativa),
    createdAt: Number(row.created_at),
  };
}

function mapApuracao(row: Record<string, unknown>): RemuneracaoApuracao {
  return {
    id: Number(row.id),
    lojaId: Number(row.loja_id),
    mes: Number(row.mes),
    ano: Number(row.ano),
    faturamentoReal: row.faturamento_real != null ? Number(row.faturamento_real) : null,
    bonusBaseRs: row.bonus_base_rs != null ? Number(row.bonus_base_rs) : null,
    resultadoAtingimentoPct: row.resultado_atingimento_pct != null ? Number(row.resultado_atingimento_pct) : null,
    bonusFinalRs: row.bonus_final_rs != null ? Number(row.bonus_final_rs) : null,
    status: (row.status as "rascunho" | "aprovado") ?? "rascunho",
    observacao: row.observacao ? String(row.observacao) : null,
    aprovadoPor: row.aprovado_por ? String(row.aprovado_por) : null,
    aprovadoEm: row.aprovado_em != null ? Number(row.aprovado_em) : null,
    createdAt: Number(row.created_at),
    // Campos do motor único
    employeeId: row.employee_id != null ? Number(row.employee_id) : null,
    papel: (row.papel as "gestor" | "lider" | null) ?? null,
    extratoJson: row.extrato_json != null ? String(row.extrato_json) : null,
    legado: Boolean(row.legado ?? false),
  };
}

function mapApuracaoRegra(row: Record<string, unknown>): ApuracaoRegra {
  return {
    id: Number(row.id),
    apuracaoId: Number(row.apuracao_id),
    regraId: row.regra_id != null ? Number(row.regra_id) : null,
    titulo: row.titulo ? String(row.titulo) : null,
    valorApurado: row.valor_apurado != null ? Number(row.valor_apurado) : null,
    metaAtingida: Boolean(row.meta_atingida),
    descontoAplicadoPct: Number(row.desconto_aplicado_pct ?? 0),
    observacao: row.observacao ? String(row.observacao) : null,
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConfig(lojaId: number): Promise<RemuneracaoConfig | null> {
  const rows = await exec("SELECT * FROM remuneracao_config WHERE loja_id = ?", [lojaId]);
  if (rows.length === 0) return null;
  const config = mapConfig(rows[0]);
  const regras = await listRegras(config.id);
  config.regras = regras;
  return config;
}

export async function upsertConfig(data: {
  lojaId: number;
  ativa?: boolean;
  bonusBasePctFaturamento?: number;
  gatilhoMinimoPct?: number;
  tetoMaximoPct?: number;
  descricao?: string | null;
}): Promise<number> {
  const now = Date.now();
  const existing = await exec("SELECT id FROM remuneracao_config WHERE loja_id = ?", [data.lojaId]);
  if (existing.length > 0) {
    const id = Number(existing[0].id);
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [now];
    if (data.ativa !== undefined) { sets.push("ativa = ?"); params.push(data.ativa ? 1 : 0); }
    if (data.bonusBasePctFaturamento !== undefined) { sets.push("bonus_base_pct_faturamento = ?"); params.push(data.bonusBasePctFaturamento); }
    if (data.gatilhoMinimoPct !== undefined) { sets.push("gatilho_minimo_pct = ?"); params.push(data.gatilhoMinimoPct); }
    if (data.tetoMaximoPct !== undefined) { sets.push("teto_maximo_pct = ?"); params.push(data.tetoMaximoPct); }
    if (data.descricao !== undefined) { sets.push("descricao = ?"); params.push(data.descricao); }
    params.push(id);
    await exec(`UPDATE remuneracao_config SET ${sets.join(", ")} WHERE id = ?`, params);
    return id;
  } else {
    const rows = await exec(
      "INSERT INTO remuneracao_config (loja_id, ativa, bonus_base_pct_faturamento, gatilho_minimo_pct, teto_maximo_pct, descricao, updated_at) VALUES (?,?,?,?,?,?,?)",
      [data.lojaId, data.ativa !== false ? 1 : 0, data.bonusBasePctFaturamento ?? 0.015, data.gatilhoMinimoPct ?? 80, data.tetoMaximoPct ?? 120, data.descricao ?? null, now]
    );
    return Number((rows as any).insertId);
  }
}

// ─── Regras ───────────────────────────────────────────────────────────────────

export async function listRegras(configId: number): Promise<RemuneracaoRegra[]> {
  const rows = await exec(
    "SELECT * FROM remuneracao_regras WHERE config_id = ? AND ativa = 1 ORDER BY ordem ASC",
    [configId]
  );
  return rows.map(mapRegra);
}

export async function createRegra(data: {
  configId: number;
  titulo: string;
  descricao?: string | null;
  tipo?: "automatico" | "manual";
  indicador?: string;
  metaValor?: number | null;
  metaOperador?: "gte" | "lte" | "eq";
  descontoPct: number;
  ordem?: number;
}): Promise<number> {
  const now = Date.now();
  const rows = await exec(
    "INSERT INTO remuneracao_regras (config_id, titulo, descricao, tipo, indicador, meta_valor, meta_operador, desconto_pct, ordem, ativa, created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)",
    [data.configId, data.titulo, data.descricao ?? null, data.tipo ?? "manual", data.indicador ?? "custom", data.metaValor ?? null, data.metaOperador ?? "gte", data.descontoPct, data.ordem ?? 0, now]
  );
  return Number((rows as any).insertId);
}

export async function updateRegra(id: number, data: {
  titulo?: string;
  descricao?: string | null;
  tipo?: "automatico" | "manual";
  indicador?: string;
  metaValor?: number | null;
  metaOperador?: "gte" | "lte" | "eq";
  descontoPct?: number;
  ordem?: number;
  ativa?: boolean;
}): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.titulo !== undefined) { sets.push("titulo = ?"); params.push(data.titulo); }
  if (data.descricao !== undefined) { sets.push("descricao = ?"); params.push(data.descricao); }
  if (data.tipo !== undefined) { sets.push("tipo = ?"); params.push(data.tipo); }
  if (data.indicador !== undefined) { sets.push("indicador = ?"); params.push(data.indicador); }
  if (data.metaValor !== undefined) { sets.push("meta_valor = ?"); params.push(data.metaValor); }
  if (data.metaOperador !== undefined) { sets.push("meta_operador = ?"); params.push(data.metaOperador); }
  if (data.descontoPct !== undefined) { sets.push("desconto_pct = ?"); params.push(data.descontoPct); }
  if (data.ordem !== undefined) { sets.push("ordem = ?"); params.push(data.ordem); }
  if (data.ativa !== undefined) { sets.push("ativa = ?"); params.push(data.ativa ? 1 : 0); }
  if (sets.length === 0) return;
  params.push(id);
  await exec(`UPDATE remuneracao_regras SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteRegra(id: number): Promise<void> {
  await exec("UPDATE remuneracao_regras SET ativa = 0 WHERE id = ?", [id]);
}

// ─── Helpers puros exportados — regras de negócio do caminho do dinheiro ────
// Extraídos para que os testes importem e chamem o MESMO código de produção,
// sem reimplementar a lógica em cópias inline no arquivo de teste.

/** Lança erro se a apuração não está em rascunho (gate de aprovação). */
export function assertPodeAprovar(
  status: "rascunho" | "aprovado",
  aprovadoPor: string | null,
  aprovadoEm: number | null
): void {
  if (status !== "rascunho") {
    const quem = aprovadoPor ?? "desconhecido";
    const quando = aprovadoEm
      ? new Date(aprovadoEm).toLocaleDateString("pt-BR")
      : "data desconhecida";
    throw new Error(`Apuração já aprovada em ${quando} por ${quem}. Reabra antes de reprocessar.`);
  }
}

/** Lança erro se a apuração está aprovada (trava de ciclo do upsert). */
export function assertNaoAprovada(
  mes: number,
  ano: number,
  status: "rascunho" | "aprovado",
  aprovadoPor: string | null,
  aprovadoEm: number | null
): void {
  if (status === "aprovado") {
    const quem = aprovadoPor ?? "desconhecido";
    const quando = aprovadoEm
      ? new Date(aprovadoEm).toLocaleDateString("pt-BR")
      : "data desconhecida";
    throw new Error(`Apuração de ${mes}/${ano} já aprovada em ${quando} por ${quem} — reabra antes de reprocessar.`);
  }
}

/** Lança erro se a apuração não está aprovada (gate de reabertura). */
export function assertPodeReabrir(status: "rascunho" | "aprovado"): void {
  if (status !== "aprovado") {
    throw new Error(`Apuração está com status '${status}' — só é possível reabrir apurações aprovadas.`);
  }
}

/** Monta a nova observacao com trilha de auditoria da reabertura (puro, sem I/O). */
export function montarTrilhaReabertura(
  obsAnterior: string | null,
  reabertoPor: string,
  ts: number = Date.now()
): string {
  const trilha = `[REABERTO em ${new Date(ts).toISOString()} por ${reabertoPor}]`;
  return obsAnterior ? `${obsAnterior} | ${trilha}` : trilha;
}

// ─── Apuração ─────────────────────────────────────────────────────────────────

export async function getApuracao(lojaId: number, mes: number, ano: number): Promise<RemuneracaoApuracao | null> {
  const rows = await exec(
    "SELECT * FROM remuneracao_apuracao WHERE loja_id = ? AND mes = ? AND ano = ?",
    [lojaId, mes, ano]
  );
  if (rows.length === 0) return null;
  const apuracao = mapApuracao(rows[0]);
  const regrasRows = await exec("SELECT * FROM remuneracao_apuracao_regras WHERE apuracao_id = ?", [apuracao.id]);
  apuracao.regras = regrasRows.map(mapApuracaoRegra);
  return apuracao;
}

export async function listApuracoes(lojaId: number): Promise<RemuneracaoApuracao[]> {
  const rows = await exec(
    "SELECT * FROM remuneracao_apuracao WHERE loja_id = ? ORDER BY ano DESC, mes DESC",
    [lojaId]
  );
  return rows.map(mapApuracao);
}

export async function upsertApuracao(data: {
  lojaId: number;
  mes: number;
  ano: number;
  faturamentoReal: number;
  bonusBaseRs: number;
  resultadoAtingimentoPct: number;
  bonusFinalRs: number;
  observacao?: string | null;
  regras: { regraId: number | null; titulo: string; valorApurado: number | null; metaAtingida: boolean; descontoAplicadoPct: number; observacao?: string | null }[];
  // BLOCO C: campos do motor único
  employeeId?: number | null;
  papel?: "gestor" | "lider" | null;
  extratoJson?: string | null;
}): Promise<number> {
  const now = Date.now();
  // Apuração por pessoa: chave é (loja_id, mes, ano, employee_id)
  const keyClause = data.employeeId
    ? "loja_id = ? AND mes = ? AND ano = ? AND employee_id = ?"
    : "loja_id = ? AND mes = ? AND ano = ? AND (employee_id IS NULL OR employee_id = 0)";
  const keyParams = data.employeeId
    ? [data.lojaId, data.mes, data.ano, data.employeeId]
    : [data.lojaId, data.mes, data.ano];
  const existing = await exec(
    `SELECT id FROM remuneracao_apuracao WHERE ${keyClause}`,
    keyParams
  );

  let apuracaoId: number;
  if (existing.length > 0) {
    apuracaoId = Number(existing[0].id);
    // ── TRAVA DE CICLO: não sobrescrever apuração já aprovada ──────────────
    const statusRow = await exec("SELECT status, aprovado_por, aprovado_em FROM remuneracao_apuracao WHERE id = ?", [apuracaoId]);
    if (statusRow.length > 0 && statusRow[0].status === "aprovado") {
      assertNaoAprovada(
        data.mes,
        data.ano,
        statusRow[0].status as "rascunho" | "aprovado",
        statusRow[0].aprovado_por ? String(statusRow[0].aprovado_por) : null,
        statusRow[0].aprovado_em != null ? Number(statusRow[0].aprovado_em) : null
      );
    }
    await exec(
      "UPDATE remuneracao_apuracao SET faturamento_real=?, bonus_base_rs=?, resultado_atingimento_pct=?, bonus_final_rs=?, observacao=?, employee_id=?, papel=?, extrato_json=? WHERE id=?",
      [data.faturamentoReal, data.bonusBaseRs, data.resultadoAtingimentoPct, round2(data.bonusFinalRs), data.observacao ?? null, data.employeeId ?? null, data.papel ?? null, data.extratoJson ?? null, apuracaoId]
    );
    await exec("DELETE FROM remuneracao_apuracao_regras WHERE apuracao_id = ?", [apuracaoId]);
  } else {
    const rows = await exec(
      "INSERT INTO remuneracao_apuracao (loja_id, mes, ano, faturamento_real, bonus_base_rs, resultado_atingimento_pct, bonus_final_rs, status, observacao, employee_id, papel, extrato_json, legado, created_at) VALUES (?,?,?,?,?,?,?,'rascunho',?,?,?,?,0,?)",
      [data.lojaId, data.mes, data.ano, data.faturamentoReal, data.bonusBaseRs, data.resultadoAtingimentoPct, round2(data.bonusFinalRs), data.observacao ?? null, data.employeeId ?? null, data.papel ?? null, data.extratoJson ?? null, now]
    );
    apuracaoId = Number((rows as any).insertId);
  }

  for (const r of data.regras) {
    await exec(
      "INSERT INTO remuneracao_apuracao_regras (apuracao_id, regra_id, titulo, valor_apurado, meta_atingida, desconto_aplicado_pct, observacao) VALUES (?,?,?,?,?,?,?)",
      [apuracaoId, r.regraId, r.titulo, r.valorApurado, r.metaAtingida ? 1 : 0, r.descontoAplicadoPct, r.observacao ?? null]
    );
  }

  return apuracaoId;
}

export async function getApuracaoById(id: number): Promise<RemuneracaoApuracao | null> {
  const rows = await exec("SELECT * FROM remuneracao_apuracao WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  return mapApuracao(rows[0]);
}

export async function aprovarApuracao(id: number, aprovadoPor: string): Promise<void> {
  const now = Date.now();
  await exec(
    "UPDATE remuneracao_apuracao SET status = 'aprovado', aprovado_por = ?, aprovado_em = ? WHERE id = ?",
    [aprovadoPor, now, id]
  );
}

/** Reabre uma apuração aprovada → status='rascunho', registrando trilha de auditoria no campo observacao.
 * Preserva o aprovador anterior na trilha para não perder o histórico de quem aprovou. */
export async function reabrirApuracaoDb(id: number, reabertoPor: string): Promise<void> {
  const now = Date.now();
  const rows = await exec("SELECT observacao, aprovado_por, aprovado_em FROM remuneracao_apuracao WHERE id = ?", [id]);
  const obsAnterior = rows[0]?.observacao ? String(rows[0].observacao) : "";
  const aprovadorAnterior = rows[0]?.aprovado_por ? String(rows[0].aprovado_por) : null;
  const aprovadoEmAnterior = rows[0]?.aprovado_em != null ? Number(rows[0].aprovado_em) : null;
  // Incluir aprovador anterior na trilha para não perder o histórico
  const aprovacaoAnteriorStr = aprovadorAnterior
    ? ` | aprovação anterior: ${aprovadorAnterior} em ${aprovadoEmAnterior ? new Date(aprovadoEmAnterior).toLocaleDateString("pt-BR") : "?"}`
    : "";
  const novaObs = montarTrilhaReabertura(obsAnterior || null, reabertoPor + aprovacaoAnteriorStr, now);
  await exec(
    "UPDATE remuneracao_apuracao SET status = 'rascunho', aprovado_por = NULL, aprovado_em = NULL, observacao = ? WHERE id = ?",
    [novaObs, id]
  );
}
