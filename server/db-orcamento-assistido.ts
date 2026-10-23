import { getDb } from "./db";

async function exec(rawSql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const client = (db as any).$client;
  const [rows] = await client.promise().execute(rawSql, params);
  return rows as Record<string, unknown>[];
}

export interface DreTemplateLinha {
  id: number;
  grupoCodigo: string;
  grupoLabel: string;
  linhaCodigo: string;
  linhaLabel: string;
  tipoValor: "rs" | "pct" | "calculado";
  editavelGerente: boolean;
  bloqueadaPadrao: boolean;
  ordem: number;
}

export interface OrcamentoPremissas {
  id?: number;
  lojaId: number;
  ano: number;
  mes: number;
  receitaBase?: number;
  crescimentoPct?: number;
  diasOperacao?: number;
  ticketMedio?: number;
  cmvMetaPct?: number;
  aluguelRs?: number;
  aluguelPct?: number;
  royaltiesPct?: number;
  fundoPromocaoPct?: number;
  headcount?: number;
  energiaRs?: number;
  aguaRs?: number;
  gasRs?: number;
  observacoes?: string;
  simuladoEm?: Date;
  // Distribuição diária e semanal
  curvaSemanalJson?: string; // JSON: {seg, ter, qua, qui, sex, sab, dom} como % da semana
  comprasSemanaisJson?: string; // JSON: {semana1, semana2, semana3, semana4} como % do mês
  ticketAlmocoRs?: number;
  ticketJantarRs?: number;
  ticketDeliveryRs?: number;
  pctAlmoco?: number;
  pctJantar?: number;
  pctDelivery?: number;
  atendimentosDia?: number;
  contabilidadeRs?: number;
  sistemasRs?: number;
  proLaboreRs?: number;
  encargosPct?: number;
  salarioMedioRs?: number;
}

export interface OrcamentoValorLinha {
  id?: number;
  lojaId: number;
  ano: number;
  mes: number;
  templateLinhaId?: number;
  linhaLabel: string;
  grupoCodigo: string;
  valorRs?: number;
  valorPct?: number;
  tipo: "rs" | "pct";
  bloqueada: boolean;
  origem: "manual" | "simulacao" | "manutencao" | "custom";
  ordem: number;
}

function mapLinha(row: Record<string, unknown>): DreTemplateLinha {
  return {
    id: row.id as number,
    grupoCodigo: row.grupo_codigo as string,
    grupoLabel: row.grupo_label as string,
    linhaCodigo: row.linha_codigo as string,
    linhaLabel: row.linha_label as string,
    tipoValor: row.tipo_valor as "rs" | "pct" | "calculado",
    editavelGerente: Boolean(row.editavel_gerente),
    bloqueadaPadrao: Boolean(row.bloqueada_padrao),
    ordem: row.ordem as number,
  };
}

function mapPremissas(row: Record<string, unknown>): OrcamentoPremissas {
  return {
    id: row.id as number,
    lojaId: row.lojaId as number,
    ano: row.ano as number,
    mes: row.mes as number,
    receitaBase: row.receita_base != null ? Number(row.receita_base) : undefined,
    crescimentoPct: row.crescimento_pct != null ? Number(row.crescimento_pct) : undefined,
    diasOperacao: row.dias_operacao != null ? Number(row.dias_operacao) : undefined,
    ticketMedio: row.ticket_medio != null ? Number(row.ticket_medio) : undefined,
    cmvMetaPct: row.cmv_meta_pct != null ? Number(row.cmv_meta_pct) : undefined,
    aluguelRs: row.aluguel_rs != null ? Number(row.aluguel_rs) : undefined,
    aluguelPct: row.aluguel_pct != null ? Number(row.aluguel_pct) : undefined,
    royaltiesPct: row.royalties_pct != null ? Number(row.royalties_pct) : undefined,
    fundoPromocaoPct: row.fundo_promocao_pct != null ? Number(row.fundo_promocao_pct) : undefined,
    headcount: row.headcount != null ? Number(row.headcount) : undefined,
    energiaRs: row.energia_rs != null ? Number(row.energia_rs) : undefined,
    aguaRs: row.agua_rs != null ? Number(row.agua_rs) : undefined,
    gasRs: row.gas_rs != null ? Number(row.gas_rs) : undefined,
    observacoes: row.observacoes as string | undefined,
    simuladoEm: row.simulado_em ? new Date(row.simulado_em as string) : undefined,
    curvaSemanalJson: row.curva_semanal_json as string | undefined,
    comprasSemanaisJson: row.compras_semanais_json as string | undefined,
    ticketAlmocoRs: row.ticket_almoco_rs != null ? Number(row.ticket_almoco_rs) : undefined,
    ticketJantarRs: row.ticket_jantar_rs != null ? Number(row.ticket_jantar_rs) : undefined,
    ticketDeliveryRs: row.ticket_delivery_rs != null ? Number(row.ticket_delivery_rs) : undefined,
    pctAlmoco: row.pct_almoco != null ? Number(row.pct_almoco) : undefined,
    pctJantar: row.pct_jantar != null ? Number(row.pct_jantar) : undefined,
    pctDelivery: row.pct_delivery != null ? Number(row.pct_delivery) : undefined,
    atendimentosDia: row.atendimentos_dia != null ? Number(row.atendimentos_dia) : undefined,
    contabilidadeRs: row.contabilidade_rs != null ? Number(row.contabilidade_rs) : undefined,
    sistemasRs: row.sistemas_rs != null ? Number(row.sistemas_rs) : undefined,
    proLaboreRs: row.pro_labore_rs != null ? Number(row.pro_labore_rs) : undefined,
    encargosPct: row.encargos_pct != null ? Number(row.encargos_pct) : undefined,
    salarioMedioRs: row.salario_medio_rs != null ? Number(row.salario_medio_rs) : undefined,
  };
}

function mapValor(row: Record<string, unknown>): OrcamentoValorLinha {
  return {
    id: row.id as number,
    lojaId: row.lojaId as number,
    ano: row.ano as number,
    mes: row.mes as number,
    templateLinhaId: row.templateLinhaId != null ? Number(row.templateLinhaId) : undefined,
    linhaLabel: row.linha_label as string,
    grupoCodigo: row.grupo_codigo as string,
    valorRs: row.valor_rs != null ? Number(row.valor_rs) : undefined,
    valorPct: row.valor_pct != null ? Number(row.valor_pct) : undefined,
    tipo: row.tipo as "rs" | "pct",
    bloqueada: Boolean(row.bloqueada),
    origem: row.origem as "manual" | "simulacao" | "manutencao" | "custom",
    ordem: row.ordem as number,
  };
}

// ─── Template de Linhas ───────────────────────────────────────────────────────

export async function getTemplateLinhas(): Promise<DreTemplateLinha[]> {
  const rows = await exec("SELECT * FROM dre_template_linhas WHERE ativa = 1 ORDER BY ordem ASC");
  return rows.map(mapLinha);
}

export async function getTemplateLinhaById(id: number): Promise<DreTemplateLinha | null> {
  const rows = await exec("SELECT * FROM dre_template_linhas WHERE id = ?", [id]);
  return rows.length > 0 ? mapLinha(rows[0]) : null;
}

// ─── Premissas ────────────────────────────────────────────────────────────────

export async function getPremissas(lojaId: number, ano: number, mes: number): Promise<OrcamentoPremissas | null> {
  const rows = await exec("SELECT * FROM orcamento_premissas WHERE lojaId = ? AND ano = ? AND mes = ?", [lojaId, ano, mes]);
  return rows.length > 0 ? mapPremissas(rows[0]) : null;
}

export async function upsertPremissas(data: OrcamentoPremissas): Promise<void> {
  await exec(
    `INSERT INTO orcamento_premissas 
      (lojaId, ano, mes, receita_base, crescimento_pct, dias_operacao, ticket_medio, cmv_meta_pct,
       aluguel_rs, aluguel_pct, royalties_pct, fundo_promocao_pct, headcount, energia_rs, agua_rs, gas_rs, observacoes,
       curva_semanal_json, compras_semanais_json,
       ticket_almoco_rs, ticket_jantar_rs, ticket_delivery_rs,
       pct_almoco, pct_jantar, pct_delivery, atendimentos_dia,
       contabilidade_rs, sistemas_rs, pro_labore_rs, encargos_pct, salario_medio_rs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       receita_base = VALUES(receita_base),
       crescimento_pct = VALUES(crescimento_pct),
       dias_operacao = VALUES(dias_operacao),
       ticket_medio = VALUES(ticket_medio),
       cmv_meta_pct = VALUES(cmv_meta_pct),
       aluguel_rs = VALUES(aluguel_rs),
       aluguel_pct = VALUES(aluguel_pct),
       royalties_pct = VALUES(royalties_pct),
       fundo_promocao_pct = VALUES(fundo_promocao_pct),
       headcount = VALUES(headcount),
       energia_rs = VALUES(energia_rs),
       agua_rs = VALUES(agua_rs),
       gas_rs = VALUES(gas_rs),
       observacoes = VALUES(observacoes),
       curva_semanal_json = VALUES(curva_semanal_json),
       compras_semanais_json = VALUES(compras_semanais_json),
       ticket_almoco_rs = VALUES(ticket_almoco_rs),
       ticket_jantar_rs = VALUES(ticket_jantar_rs),
       ticket_delivery_rs = VALUES(ticket_delivery_rs),
       pct_almoco = VALUES(pct_almoco),
       pct_jantar = VALUES(pct_jantar),
       pct_delivery = VALUES(pct_delivery),
       atendimentos_dia = VALUES(atendimentos_dia),
       contabilidade_rs = VALUES(contabilidade_rs),
       sistemas_rs = VALUES(sistemas_rs),
       pro_labore_rs = VALUES(pro_labore_rs),
       encargos_pct = VALUES(encargos_pct),
       salario_medio_rs = VALUES(salario_medio_rs),
       updatedAt = CURRENT_TIMESTAMP`,
    [
      data.lojaId, data.ano, data.mes,
      data.receitaBase ?? null, data.crescimentoPct ?? null, data.diasOperacao ?? null,
      data.ticketMedio ?? null, data.cmvMetaPct ?? null,
      data.aluguelRs ?? null, data.aluguelPct ?? null,
      data.royaltiesPct ?? null, data.fundoPromocaoPct ?? null,
      data.headcount ?? null, data.energiaRs ?? null, data.aguaRs ?? null,
      data.gasRs ?? null, data.observacoes ?? null,
      data.curvaSemanalJson ?? null, data.comprasSemanaisJson ?? null,
      data.ticketAlmocoRs ?? null, data.ticketJantarRs ?? null, data.ticketDeliveryRs ?? null,
      data.pctAlmoco ?? null, data.pctJantar ?? null, data.pctDelivery ?? null, data.atendimentosDia ?? null,
      data.contabilidadeRs ?? null, data.sistemasRs ?? null, data.proLaboreRs ?? null,
      data.encargosPct ?? null, data.salarioMedioRs ?? null,
    ]
  );
}


export async function marcarSimulado(lojaId: number, ano: number, mes: number): Promise<void> {
  await exec("UPDATE orcamento_premissas SET simulado_em = CURRENT_TIMESTAMP WHERE lojaId = ? AND ano = ? AND mes = ?", [lojaId, ano, mes]);
}

// ─── Valores por Linha ────────────────────────────────────────────────────────

export async function getValoresOrcamento(lojaId: number, ano: number, mes: number): Promise<OrcamentoValorLinha[]> {
  const rows = await exec("SELECT * FROM orcamento_valores WHERE lojaId = ? AND ano = ? AND mes = ? ORDER BY grupo_codigo, ordem ASC", [lojaId, ano, mes]);
  return rows.map(mapValor);
}

export async function upsertValorLinha(data: OrcamentoValorLinha): Promise<void> {
  if (data.id) {
    await exec(
      `UPDATE orcamento_valores SET linha_label = ?, valor_rs = ?, valor_pct = ?, tipo = ?, bloqueada = ?, origem = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND lojaId = ?`,
      [data.linhaLabel, data.valorRs ?? null, data.valorPct ?? null, data.tipo, data.bloqueada ? 1 : 0, data.origem, data.id, data.lojaId]
    );
  } else {
    await exec(
      `INSERT INTO orcamento_valores (lojaId, ano, mes, templateLinhaId, linha_label, grupo_codigo, valor_rs, valor_pct, tipo, bloqueada, origem, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.lojaId, data.ano, data.mes, data.templateLinhaId ?? null, data.linhaLabel, data.grupoCodigo, data.valorRs ?? null, data.valorPct ?? null, data.tipo, data.bloqueada ? 1 : 0, data.origem, data.ordem]
    );
  }
}

export async function bulkUpsertValores(lojaId: number, ano: number, mes: number, valores: OrcamentoValorLinha[]): Promise<void> {
  await exec("DELETE FROM orcamento_valores WHERE lojaId = ? AND ano = ? AND mes = ? AND origem = 'simulacao'", [lojaId, ano, mes]);
  for (const v of valores) {
    await exec(
      `INSERT INTO orcamento_valores (lojaId, ano, mes, templateLinhaId, linha_label, grupo_codigo, valor_rs, valor_pct, tipo, bloqueada, origem, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lojaId, ano, mes, v.templateLinhaId ?? null, v.linhaLabel, v.grupoCodigo, v.valorRs ?? null, v.valorPct ?? null, v.tipo, v.bloqueada ? 1 : 0, v.origem, v.ordem]
    );
  }
}

export async function deleteValorLinha(id: number, lojaId: number): Promise<void> {
  await exec("DELETE FROM orcamento_valores WHERE id = ? AND lojaId = ? AND origem = 'custom'", [id, lojaId]);
}

export async function updateValorLinha(id: number, lojaId: number, valorRs: number | null, valorPct: number | null, tipo: "rs" | "pct"): Promise<void> {
  await exec(`UPDATE orcamento_valores SET valor_rs = ?, valor_pct = ?, tipo = ?, origem = 'manual', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND lojaId = ?`, [valorRs, valorPct, tipo, id, lojaId]);
}

// ─── Histórico para IA ────────────────────────────────────────────────────────

export async function getHistoricoReceita(lojaId: number, meses: number = 3): Promise<Array<{ ano: number; mes: number; receita: number }>> {
  const rows = await exec(`SELECT ano, mes, receita_base as receita FROM orcamento_premissas WHERE lojaId = ? AND receita_base IS NOT NULL ORDER BY ano DESC, mes DESC LIMIT ?`, [lojaId, meses]);
  return rows.map(r => ({ ano: r.ano as number, mes: r.mes as number, receita: Number(r.receita) }));
}

export async function getHistoricoValores(lojaId: number, meses: number = 3): Promise<Array<{ ano: number; mes: number; grupoCodigo: string; linhaLabel: string; valorRs: number | null; valorPct: number | null }>> {
  const rows = await exec(
    `SELECT ov.ano, ov.mes, ov.grupo_codigo, ov.linha_label, ov.valor_rs, ov.valor_pct FROM orcamento_valores ov INNER JOIN (SELECT DISTINCT ano, mes FROM orcamento_premissas WHERE lojaId = ? ORDER BY ano DESC, mes DESC LIMIT ?) meses ON ov.ano = meses.ano AND ov.mes = meses.mes WHERE ov.lojaId = ? ORDER BY ov.ano DESC, ov.mes DESC, ov.grupo_codigo, ov.ordem`,
    [lojaId, meses, lojaId]
  );
  return rows.map(r => ({
    ano: r.ano as number, mes: r.mes as number,
    grupoCodigo: r.grupo_codigo as string, linhaLabel: r.linha_label as string,
    valorRs: r.valor_rs != null ? Number(r.valor_rs) : null,
    valorPct: r.valor_pct != null ? Number(r.valor_pct) : null,
  }));
}
