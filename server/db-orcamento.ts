import { getDb } from "./db";
import { createMeta, createMedida, listMetas } from "./db-metas";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TipoValor = "fixo" | "percentual";

export interface OrcamentoColaborador {
  id: number;
  orcamentoId: number;
  funcao: string;
  quantidade: number;
  salarioBase: number;
  ordem: number;
}

export interface Orcamento {
  id: number;
  storeId: number;
  periodoInicio: string;
  periodoFim: string;
  tipo: "mensal" | "trimestral" | "anual";
  status: "rascunho" | "proposto" | "aprovado";
  // Receita
  receitaBruta: number;
  ticketMedio: number | null;
  diasOperacao: number;
  // Deduções — valor + tipo (fixo|percentual)
  taxaCartaoPct: number; taxaCartaoTipo: TipoValor;
  taxaDeliveryPct: number; taxaDeliveryTipo: TipoValor;
  impostosPct: number; impostosTipo: TipoValor;
  // CMV — valor + tipo
  cmvPct: number; cmvTipo: TipoValor;
  // Franquia — valor + tipo
  royaltiesPct: number; royaltiesTipo: TipoValor;
  fundoMarketingPct: number; fundoMarketingTipo: TipoValor;
  // Ocupação — valor + tipo (fixo|percentual)
  aluguel: number; aluguelTipo: TipoValor;
  condominio: number; condominioTipo: TipoValor;
  energia: number; energiaTipo: TipoValor;
  gas: number; gasTipo: TipoValor;
  agua: number; aguaTipo: TipoValor;
  outrosOcupacao: number; outrosOcupacaoTipo: TipoValor;
  // Serviços de Terceiros
  contabilidade: number; contabilidadeTipo: TipoValor;
  sistemas: number; sistemasTipo: TipoValor;
  sanitarismo: number; sanitarismoTipo: TipoValor;
  outrosServicos: number; outrosServicosTipo: TipoValor;
  // Financeiras
  juros: number; jurosTipo: TipoValor;
  tarifasBancarias: number; tarifasBancariasTipo: TipoValor;
  // Outras
  marketing: number; marketingTipo: TipoValor;
  outrasDespesas: number; outrasDespesasTipo: TipoValor;
  proLabore: number; proLaboreTipo: TipoValor;
  encargosPct: number; encargosTipo: TipoValor;
  // Meta
  notas: string | null;
  /** Decisões de revisão da análise IA (A3) — JSON serializado */
  iaRevisaoJson?: string | null;
  aprovadoPor: string | null;
  aprovadoEm: number | null;
  createdAt: number;
  updatedAt: number;
  // Joined
  colaboradores?: OrcamentoColaborador[];
}

export interface OrcamentoMetaDiaria {
  id: number;
  orcamentoId: number;
  storeId: number;
  data: string;
  metaReceita: number;
  metaAtendimentos: number | null;
  pesoDia: number;
}

export interface LinhaCustom {
  id: number;
  lojaId: number;
  grupoId: string;
  label: string;
  valor: number;
  tipo: TipoValor;
  origem: string | null; // ex: "manutencao:42"
  ordem: number;
  mes: string; // YYYY-MM
}

// ─── Helpers de resolução de valor ──────────────────────────────────────────

/** Resolve um valor que pode ser fixo (R$) ou percentual (% da receita bruta) */
export function resolveValor(valor: number, tipo: TipoValor, receitaBruta: number): number {
  if (tipo === "percentual") return receitaBruta * valor;
  return valor;
}

// ─── Cálculos ────────────────────────────────────────────────────────────────

export interface OrcamentoCalculo {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  cmv: number;
  impostos: number;
  royalties: number;
  fundoMarketing: number;
  colaboradores: number;
  ocupacao: number;
  servicosTerceiros: number;
  despesasFinanceiras: number;
  marketing: number;
  outrasDespesas: number;
  totalCustos: number;
  ebitda: number;
  ebitdaPct: number;
  pontoEquilibrio: number;
  metaDiaria: number;
  metaAtendimentosDia: number | null;
  // Detalhamento por linha (R$ resolvido)
  linhasResolvidas: Record<string, number>;
}

export function calcularOrcamento(
  orc: Omit<Orcamento, "id" | "storeId" | "createdAt" | "updatedAt">,
  colaboradores: OrcamentoColaborador[],
  linhasCustom: LinhaCustom[] = []
): OrcamentoCalculo {
  const rb = orc.receitaBruta;
  const rv = (valor: number, tipo: TipoValor) => resolveValor(valor, tipo, rb);

  // Deduções — podem ser R$ ou %
  const taxaCartaoR = rv(orc.taxaCartaoPct, orc.taxaCartaoTipo ?? "percentual");
  const taxaDeliveryR = rv(orc.taxaDeliveryPct, orc.taxaDeliveryTipo ?? "percentual");
  const deducoes = taxaCartaoR + taxaDeliveryR;
  const receitaLiquida = rb - deducoes;

  // CMV, impostos, franquia — podem ser R$ ou %
  const cmv = rv(orc.cmvPct, orc.cmvTipo ?? "percentual");
  const impostos = rv(orc.impostosPct, orc.impostosTipo ?? "percentual");
  const royalties = rv(orc.royaltiesPct, orc.royaltiesTipo ?? "percentual");
  const fundoMarketing = rv(orc.fundoMarketingPct, orc.fundoMarketingTipo ?? "percentual");

  // Colaboradores: soma salários × quantidade × (1 + encargos)
  // encargos pode ser R$ por colaborador ou % do salário
  const totalFolha = colaboradores.reduce((sum, c) => {
    const encargosVal = (orc.encargosTipo ?? "percentual") === "fixo"
      ? c.quantidade * orc.encargosPct  // R$ fixo por cabeça
      : c.salarioBase * c.quantidade * orc.encargosPct; // % do salário
    return sum + c.salarioBase * c.quantidade + encargosVal;
  }, 0);

  // Ocupação — cada linha pode ser R$ ou %
  const aluguelR = rv(orc.aluguel, orc.aluguelTipo);
  const condominioR = rv(orc.condominio, orc.condominioTipo);
  const energiaR = rv(orc.energia, orc.energiaTipo);
  const gasR = rv(orc.gas, orc.gasTipo);
  const aguaR = rv(orc.agua, orc.aguaTipo);
  const outrosOcupacaoR = rv(orc.outrosOcupacao, orc.outrosOcupacaoTipo);
  // Linhas custom de ocupação
  const customOcupacao = linhasCustom
    .filter((l) => l.grupoId === "ocupacao")
    .reduce((s, l) => s + rv(l.valor, l.tipo), 0);
  const ocupacao = aluguelR + condominioR + energiaR + gasR + aguaR + outrosOcupacaoR + customOcupacao;

  // Serviços de Terceiros
  const contabilidadeR = rv(orc.contabilidade, orc.contabilidadeTipo);
  const sistemasR = rv(orc.sistemas, orc.sistemasTipo);
  const sanitarismoR = rv(orc.sanitarismo, orc.sanitarismoTipo);
  const outrosServicosR = rv(orc.outrosServicos, orc.outrosServicosTipo);
  const customServicos = linhasCustom
    .filter((l) => l.grupoId === "servicos_terceiros")
    .reduce((s, l) => s + rv(l.valor, l.tipo), 0);
  const servicosTerceiros = contabilidadeR + sistemasR + sanitarismoR + outrosServicosR + customServicos;

  // Financeiras
  const jurosR = rv(orc.juros, orc.jurosTipo);
  const tarifasR = rv(orc.tarifasBancarias, orc.tarifasBancariasTipo);
  const customFinanceiras = linhasCustom
    .filter((l) => l.grupoId === "financeiras")
    .reduce((s, l) => s + rv(l.valor, l.tipo), 0);
  const despesasFinanceiras = jurosR + tarifasR + customFinanceiras;

  // Outras
  const marketingR = rv(orc.marketing, orc.marketingTipo);
  const outrasDespesasR = rv(orc.outrasDespesas, orc.outrasDespesasTipo);
  const proLaboreR = rv(orc.proLabore, orc.proLaboreTipo);
  const customOutras = linhasCustom
    .filter((l) => l.grupoId === "outras_despesas")
    .reduce((s, l) => s + rv(l.valor, l.tipo), 0);
  const marketing = marketingR;
  const outrasDespesas = outrasDespesasR + proLaboreR + customOutras;

  const totalCustos =
    deducoes + cmv + impostos + royalties + fundoMarketing +
    totalFolha + ocupacao + servicosTerceiros + despesasFinanceiras +
    marketing + outrasDespesas;

  const ebitda = rb - totalCustos;
  const ebitdaPct = rb > 0 ? ebitda / rb : 0;

  // Ponto de equilíbrio: custos fixos / (1 - % variáveis)
  // Variáveis = tudo que é % da receita
  const pctVariaveis =
    ((orc.taxaCartaoTipo ?? "percentual") === "percentual" ? orc.taxaCartaoPct : 0) +
    ((orc.taxaDeliveryTipo ?? "percentual") === "percentual" ? orc.taxaDeliveryPct : 0) +
    ((orc.cmvTipo ?? "percentual") === "percentual" ? orc.cmvPct : 0) +
    ((orc.impostosTipo ?? "percentual") === "percentual" ? orc.impostosPct : 0) +
    ((orc.royaltiesTipo ?? "percentual") === "percentual" ? orc.royaltiesPct : 0) +
    ((orc.fundoMarketingTipo ?? "percentual") === "percentual" ? orc.fundoMarketingPct : 0) +
    (orc.aluguelTipo === "percentual" ? orc.aluguel : 0) +
    (orc.condominioTipo === "percentual" ? orc.condominio : 0) +
    (orc.energiaTipo === "percentual" ? orc.energia : 0) +
    (orc.gasTipo === "percentual" ? orc.gas : 0) +
    (orc.aguaTipo === "percentual" ? orc.agua : 0) +
    (orc.outrosOcupacaoTipo === "percentual" ? orc.outrosOcupacao : 0) +
    (orc.contabilidadeTipo === "percentual" ? orc.contabilidade : 0) +
    (orc.sistemasTipo === "percentual" ? orc.sistemas : 0) +
    (orc.sanitarismoTipo === "percentual" ? orc.sanitarismo : 0) +
    (orc.outrosServicosTipo === "percentual" ? orc.outrosServicos : 0) +
    (orc.jurosTipo === "percentual" ? orc.juros : 0) +
    (orc.tarifasBancariasTipo === "percentual" ? orc.tarifasBancarias : 0) +
    (orc.marketingTipo === "percentual" ? orc.marketing : 0) +
    (orc.outrasDespesasTipo === "percentual" ? orc.outrasDespesas : 0) +
    (orc.proLaboreTipo === "percentual" ? orc.proLabore : 0) +
    linhasCustom.filter((l) => l.tipo === "percentual").reduce((s, l) => s + l.valor, 0);

  const custosFixos = totalCustos - rb * Math.min(pctVariaveis, 0.9999);
  const pontoEquilibrio = pctVariaveis < 1 ? custosFixos / (1 - pctVariaveis) : 0;

  // Metas diárias
  const metaDiaria = orc.diasOperacao > 0 ? rb / orc.diasOperacao : 0;
  const metaAtendimentosDia =
    orc.ticketMedio && orc.ticketMedio > 0
      ? Math.ceil(metaDiaria / orc.ticketMedio)
      : null;

  return {
    receitaBruta: rb,
    deducoes,
    receitaLiquida,
    cmv,
    impostos,
    royalties,
    fundoMarketing,
    colaboradores: totalFolha,
    ocupacao,
    servicosTerceiros,
    despesasFinanceiras,
    marketing,
    outrasDespesas,
    totalCustos,
    ebitda,
    ebitdaPct,
    pontoEquilibrio,
    metaDiaria,
    metaAtendimentosDia,
    linhasResolvidas: {
      aluguel: aluguelR, condominio: condominioR, energia: energiaR,
      gas: gasR, agua: aguaR, outrosOcupacao: outrosOcupacaoR,
      contabilidade: contabilidadeR, sistemas: sistemasR, sanitarismo: sanitarismoR,
      outrosServicos: outrosServicosR, juros: jurosR, tarifasBancarias: tarifasR,
      marketing: marketingR, outrasDespesas: outrasDespesasR, proLabore: proLaboreR,
    },
  };
}

// ─── DB Helpers ──────────────────────────────────────────────────────────────

async function exec(sql: string, params: unknown[] = []) {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

function t(v: unknown): TipoValor {
  return (v as string) === "percentual" ? "percentual" : "fixo";
}

function mapRow(row: Record<string, unknown>): Orcamento {
  // Helper: converte Date ou string para "YYYY-MM-DD" (o driver MySQL retorna Date para colunas DATE)
  function toDateStr(v: unknown): string {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
    return String(v).slice(0, 10);
  }
  return {
    id: row.id as number,
    storeId: row.store_id as number,
    periodoInicio: toDateStr(row.periodo_inicio),
    periodoFim: toDateStr(row.periodo_fim),
    tipo: row.tipo as Orcamento["tipo"],
    status: row.status as Orcamento["status"],
    receitaBruta: Number(row.receita_bruta),
    ticketMedio: row.ticket_medio != null ? Number(row.ticket_medio) : null,
    diasOperacao: row.dias_operacao as number,
    taxaCartaoPct: Number(row.taxa_cartao_pct), taxaCartaoTipo: t(row.taxa_cartao_tipo ?? "percentual"),
    taxaDeliveryPct: Number(row.taxa_delivery_pct), taxaDeliveryTipo: t(row.taxa_delivery_tipo ?? "percentual"),
    impostosPct: Number(row.impostos_pct), impostosTipo: t(row.impostos_tipo ?? "percentual"),
    cmvPct: Number(row.cmv_pct), cmvTipo: t(row.cmv_tipo ?? "percentual"),
    royaltiesPct: Number(row.royalties_pct), royaltiesTipo: t(row.royalties_tipo ?? "percentual"),
    fundoMarketingPct: Number(row.fundo_marketing_pct), fundoMarketingTipo: t(row.fundo_marketing_tipo ?? "percentual"),
    aluguel: Number(row.aluguel), aluguelTipo: t(row.aluguel_tipo),
    condominio: Number(row.condominio), condominioTipo: t(row.condominio_tipo),
    energia: Number(row.energia), energiaTipo: t(row.energia_tipo),
    gas: Number(row.gas), gasTipo: t(row.gas_tipo),
    agua: Number(row.agua), aguaTipo: t(row.agua_tipo),
    outrosOcupacao: Number(row.outros_ocupacao), outrosOcupacaoTipo: t(row.outros_ocupacao_tipo),
    contabilidade: Number(row.contabilidade), contabilidadeTipo: t(row.contabilidade_tipo),
    sistemas: Number(row.sistemas), sistemasTipo: t(row.sistemas_tipo),
    sanitarismo: Number(row.sanitarismo), sanitarismoTipo: t(row.sanitarismo_tipo),
    outrosServicos: Number(row.outros_servicos), outrosServicosTipo: t(row.outros_servicos_tipo),
    juros: Number(row.juros), jurosTipo: t(row.juros_tipo),
    tarifasBancarias: Number(row.tarifas_bancarias), tarifasBancariasTipo: t(row.tarifas_bancarias_tipo),
    marketing: Number(row.marketing), marketingTipo: t(row.marketing_tipo),
    outrasDespesas: Number(row.outras_despesas), outrasDespesasTipo: t(row.outras_despesas_tipo),
    proLabore: Number(row.pro_labore), proLaboreTipo: t(row.pro_labore_tipo),
    encargosPct: Number(row.encargos_pct), encargosTipo: t(row.encargos_tipo ?? "percentual"),
    notas: row.notas as string | null,
    iaRevisaoJson: row.ia_revisao_json as string | null ?? null,
    aprovadoPor: row.aprovado_por as string | null,
    aprovadoEm: row.aprovado_em != null ? Number(row.aprovado_em) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapColabRow(row: Record<string, unknown>): OrcamentoColaborador {
  return {
    id: row.id as number,
    orcamentoId: row.orcamento_id as number,
    funcao: row.funcao as string,
    quantidade: row.quantidade as number,
    salarioBase: Number(row.salario_base),
    ordem: row.ordem as number,
  };
}

export async function getOrcamentoAtivo(storeId: number): Promise<Orcamento | null> {
  const rows = await exec(
    `SELECT * FROM orcamentos WHERE store_id = ? AND status = 'aprovado' ORDER BY periodo_inicio DESC LIMIT 1`,
    [storeId]
  );
  if (!rows.length) return null;
  const orc = mapRow(rows[0]);
  orc.colaboradores = await getColaboradores(orc.id);
  return orc;
}

/**
 * Retorna o orçamento APROVADO que cobre o período YYYY-MM.
 * Retorna null (sem defaults silenciosos) quando não há orçamento aprovado para o período.
 * Regra: periodo_inicio <= primeiro dia do mês E periodo_fim >= último dia do mês.
 */
export async function getOrcamentoVigente(
  storeId: number,
  period: string // YYYY-MM
): Promise<Orcamento | null> {
  const [y, m] = period.split("-").map(Number);
  const firstDay = `${period}-01`;
  const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
  const rows = await exec(
    `SELECT * FROM orcamentos
     WHERE store_id = ?
       AND status = 'aprovado'
       AND periodo_inicio <= ?
       AND periodo_fim >= ?
     ORDER BY periodo_inicio DESC
     LIMIT 1`,
    [storeId, firstDay, lastDay]
  );
  if (!rows.length) return null;
  const orc = mapRow(rows[0]);
  orc.colaboradores = await getColaboradores(orc.id);
  return orc;
}

export async function getOrcamentoById(id: number): Promise<Orcamento | null> {
  const rows = await exec(`SELECT * FROM orcamentos WHERE id = ?`, [id]);
  if (!rows.length) return null;
  const orc = mapRow(rows[0]);
  orc.colaboradores = await getColaboradores(orc.id);
  return orc;
}

export async function listOrcamentos(storeId: number): Promise<Orcamento[]> {
  const rows = await exec(
    `SELECT * FROM orcamentos WHERE store_id = ? ORDER BY periodo_inicio DESC`,
    [storeId]
  );
  return rows.map(mapRow);
}

export async function listAllOrcamentos(): Promise<(Orcamento & { storeName: string })[]> {
  const rows = await exec(
    `SELECT o.*, s.name as store_name
     FROM orcamentos o
     LEFT JOIN stores s ON s.id = o.store_id
     ORDER BY o.periodo_inicio DESC, o.store_id ASC`,
    []
  );
  return rows.map((row) => ({
    ...mapRow(row),
    storeName: (row.store_name as string) ?? "Loja desconhecida",
  }));
}

export async function listOrcamentosByStoreIds(storeIds: number[]): Promise<(Orcamento & { storeName: string })[]> {
  if (storeIds.length === 0) return [];
  const placeholders = storeIds.map(() => "?").join(",");
  const rows = await exec(
    `SELECT o.*, s.name as store_name
     FROM orcamentos o
     LEFT JOIN stores s ON s.id = o.store_id
     WHERE o.store_id IN (${placeholders})
     ORDER BY o.periodo_inicio DESC, o.store_id ASC`,
    storeIds
  );
  return rows.map((row) => ({
    ...mapRow(row),
    storeName: (row.store_name as string) ?? "Loja desconhecida",
  }));
}

export async function getColaboradores(orcamentoId: number): Promise<OrcamentoColaborador[]> {
  const rows = await exec(
    `SELECT * FROM orcamento_colaboradores WHERE orcamento_id = ? ORDER BY ordem`,
    [orcamentoId]
  );
  return rows.map(mapColabRow);
}

export interface SaveOrcamentoInput {
  storeId: number;
  periodoInicio: string;
  periodoFim: string;
  tipo: "mensal" | "trimestral" | "anual";
  receitaBruta: number;
  ticketMedio?: number | null;
  diasOperacao: number;
  taxaCartaoPct: number; taxaCartaoTipo: TipoValor;
  taxaDeliveryPct: number; taxaDeliveryTipo: TipoValor;
  impostosPct: number; impostosTipo: TipoValor;
  cmvPct: number; cmvTipo: TipoValor;
  royaltiesPct: number; royaltiesTipo: TipoValor;
  fundoMarketingPct: number; fundoMarketingTipo: TipoValor;
  aluguel: number; aluguelTipo: TipoValor;
  condominio: number; condominioTipo: TipoValor;
  energia: number; energiaTipo: TipoValor;
  gas: number; gasTipo: TipoValor;
  agua: number; aguaTipo: TipoValor;
  outrosOcupacao: number; outrosOcupacaoTipo: TipoValor;
  contabilidade: number; contabilidadeTipo: TipoValor;
  sistemas: number; sistemasTipo: TipoValor;
  sanitarismo: number; sanitarismoTipo: TipoValor;
  outrosServicos: number; outrosServicosTipo: TipoValor;
  juros: number; jurosTipo: TipoValor;
  tarifasBancarias: number; tarifasBancariasTipo: TipoValor;
  marketing: number; marketingTipo: TipoValor;
  outrasDespesas: number; outrasDespesasTipo: TipoValor;
  proLabore: number; proLaboreTipo: TipoValor;
  encargosPct: number; encargosTipo: TipoValor;
  notas?: string | null;
  iaRevisaoJson?: string | null;
  colaboradores: { funcao: string; quantidade: number; salarioBase: number; ordem: number }[];
}

export async function saveOrcamento(
  input: SaveOrcamentoInput,
  existingId?: number
): Promise<number> {
  const now = Date.now();
  // ── Idempotência: 1 orçamento por loja+mês ──────────────────────────────
  // Se não foi passado um existingId explícito, buscar orçamento existente
  // para a mesma loja+mês (pelo periodo_inicio).
  if (!existingId) {
    const existing = await exec(
      `SELECT id, status FROM orcamentos WHERE store_id = ? AND DATE_FORMAT(periodo_inicio, '%Y-%m') = ? LIMIT 1`,
      [input.storeId, input.periodoInicio.slice(0, 7)]
    );
    if (existing.length > 0) {
      const row = existing[0] as any;
      if (row.status === 'aprovado') {
        const mesAno = input.periodoInicio.slice(0, 7);
        throw new Error(`CONFLICT: Já existe orçamento APROVADO para esta loja em ${mesAno}. Exclua-o ou edite-o antes de gerar outro.`);
      }
      // rascunho ou proposto: sobrescrever com o mesmo id
      existingId = row.id as number;
    }
  }
  const fields = [
    "store_id", "periodo_inicio", "periodo_fim", "tipo",
    "receita_bruta", "ticket_medio", "dias_operacao",
    "taxa_cartao_pct", "taxa_cartao_tipo", "taxa_delivery_pct", "taxa_delivery_tipo",
    "impostos_pct", "impostos_tipo", "cmv_pct", "cmv_tipo",
    "royalties_pct", "royalties_tipo", "fundo_marketing_pct", "fundo_marketing_tipo",
    "aluguel", "aluguel_tipo", "condominio", "condominio_tipo",
    "energia", "energia_tipo", "gas", "gas_tipo", "agua", "agua_tipo",
    "outros_ocupacao", "outros_ocupacao_tipo",
    "contabilidade", "contabilidade_tipo", "sistemas", "sistemas_tipo",
    "sanitarismo", "sanitarismo_tipo", "outros_servicos", "outros_servicos_tipo",
    "juros", "juros_tipo", "tarifas_bancarias", "tarifas_bancarias_tipo",
    "marketing", "marketing_tipo", "outras_despesas", "outras_despesas_tipo",
    "pro_labore", "pro_labore_tipo",
    "encargos_pct", "encargos_tipo", "notas", "ia_revisao_json",
  ];
  const values = [
    input.storeId, input.periodoInicio, input.periodoFim, input.tipo,
    input.receitaBruta, input.ticketMedio ?? null, input.diasOperacao,
    input.taxaCartaoPct, input.taxaCartaoTipo, input.taxaDeliveryPct, input.taxaDeliveryTipo,
    input.impostosPct, input.impostosTipo, input.cmvPct, input.cmvTipo,
    input.royaltiesPct, input.royaltiesTipo, input.fundoMarketingPct, input.fundoMarketingTipo,
    input.aluguel, input.aluguelTipo, input.condominio, input.condominioTipo,
    input.energia, input.energiaTipo, input.gas, input.gasTipo, input.agua, input.aguaTipo,
    input.outrosOcupacao, input.outrosOcupacaoTipo,
    input.contabilidade, input.contabilidadeTipo, input.sistemas, input.sistemasTipo,
    input.sanitarismo, input.sanitarismoTipo, input.outrosServicos, input.outrosServicosTipo,
    input.juros, input.jurosTipo, input.tarifasBancarias, input.tarifasBancariasTipo,
    input.marketing, input.marketingTipo, input.outrasDespesas, input.outrasDespesasTipo,
    input.proLabore, input.proLaboreTipo,
    input.encargosPct, input.encargosTipo, input.notas ?? null, input.iaRevisaoJson ?? null,
  ];

  let orcId: number;

  if (existingId) {
    const setClause = fields.map((f) => `${f} = ?`).join(", ");
    await exec(
      `UPDATE orcamentos SET ${setClause}, updated_at = ? WHERE id = ?`,
      [...values, now, existingId]
    );
    orcId = existingId;
  } else {
    const placeholders = fields.map(() => "?").join(", ");
    const result = await exec(
      `INSERT INTO orcamentos (${fields.join(", ")}, status, created_at, updated_at) VALUES (${placeholders}, 'rascunho', ?, ?)`,
      [...values, now, now]
    ) as any;
    orcId = result.insertId;
  }

  // Rebuild colaboradores
  await exec(`DELETE FROM orcamento_colaboradores WHERE orcamento_id = ?`, [orcId]);
  for (const c of input.colaboradores) {
    await exec(
      `INSERT INTO orcamento_colaboradores (orcamento_id, funcao, quantidade, salario_base, ordem) VALUES (?, ?, ?, ?, ?)`,
      [orcId, c.funcao, c.quantidade, c.salarioBase, c.ordem]
    );
  }

  return orcId;
}

export interface AprovarOrcamentoResult {
  ok: true;
  metasCriadas: number;
  medidasCriadas: number;
  planosCriados: number;
  avisos: string[];
}

export async function aprovarOrcamento(id: number, aprovadoPor: string): Promise<AprovarOrcamentoResult> {
  const now = Date.now();
  const avisos: string[] = [];
  console.log(`[aprovarOrcamento] chamado para orcId=${id} por="${aprovadoPor}"`);
  // 1. Aprovar o orçamento (operação crítica — pode lançar)
  await exec(
    `UPDATE orcamentos SET status = 'aprovado', aprovado_por = ?, aprovado_em = ?, updated_at = ? WHERE id = ?`,
    [aprovadoPor, now, now, id]
  );
  // 2. Gerar metas diárias (não-bloqueante)
  let metasCriadas = 0;
  try {
    await gerarMetasDiarias(id);
    metasCriadas = 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aprovarOrcamento] Erro ao gerar metas diárias:", msg);
    avisos.push("Metas diárias não foram geradas: " + msg);
  }
  // 3. Gerar conteúdo integrado (Meta, Medidas, Planos de Ação) — não-bloqueante
  let medidasCriadas = 0;
  let planosCriados = 0;
  try {
    const resultado = await gerarConteudoAposAprovacao(id);
    medidasCriadas = resultado.medidasCriadas;
    planosCriados = resultado.planosCriados;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aprovarOrcamento] Erro ao gerar conteúdo integrado:", msg);
    avisos.push("Meta/Medidas/Planos não foram gerados: " + msg);
  }
  return { ok: true, metasCriadas, medidasCriadas, planosCriados, avisos };
}

/**
 * Gera automaticamente após a aprovação do orçamento:
 * 1. Planos de ação iniciais baseados nos gaps do orçamento
 * 2. Metas mensais de CMV, custos fixos e EBITDA
 * 3. Pré-configuração do compromisso do mês
 */
async function gerarConteudoAposAprovacao(orcamentoId: number): Promise<{ medidasCriadas: number; planosCriados: number }> {
  const orc = await getOrcamentoById(orcamentoId);
  if (!orc) {
    console.warn('[gerarConteudo] orcamento ' + orcamentoId + ' nao encontrado');
    return { medidasCriadas: 0, planosCriados: 0 };
  }
  const colaboradores = orc.colaboradores ?? [];
  const calc = calcularOrcamento(orc, colaboradores);
  const rb = orc.receitaBruta;
  const mes = orc.periodoInicio.slice(0, 7); // YYYY-MM
  const storeId = orc.storeId;
  console.log('[gerarConteudo] orcId=' + orcamentoId + ' storeId=' + storeId + ' periodoInicio=' + orc.periodoInicio + ' mes=' + mes + ' rb=' + rb);

  // ── 1. Planos de ação iniciais baseados nos gaps ─────────────────────────
  const acoes: Array<{ category: string; description: string; reason: string; dueDate: string }> = [];
  const dueDate30 = new Date(new Date(orc.periodoInicio).getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const dueDate7 = new Date(new Date(orc.periodoInicio).getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  // CMV acima de 35%: gerar ação de controle de estoque
  const cmvPct = rb > 0 ? calc.cmv / rb : 0;
  if (cmvPct > 0.35) {
    acoes.push({
      category: "cmv",
      description: `Reduzir CMV de ${(cmvPct * 100).toFixed(1)}% para abaixo de 35%`,
      reason: `CMV orçado em ${(cmvPct * 100).toFixed(1)}% da receita bruta (meta: <35%). Impacto: R$ ${((cmvPct - 0.35) * rb).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por mês.`,
      dueDate: dueDate7,
    });
  }

  // EBITDA abaixo de 10%: gerar ação de revisão de custos
  if (calc.ebitdaPct < 0.10 && rb > 0) {
    acoes.push({
      category: "other",
      description: `Revisar estrutura de custos para atingir EBITDA de ${(calc.ebitdaPct * 100).toFixed(1)}% → 10%+`,
      reason: `EBITDA projetado em ${(calc.ebitdaPct * 100).toFixed(1)}%. Identifique as 3 maiores despesas e negocie reduções.`,
      dueDate: dueDate30,
    });
  }

  // Folha acima de 35%: gerar ação de otimização de escala
  const folhaPct = rb > 0 ? calc.colaboradores / rb : 0;
  if (folhaPct > 0.35) {
    acoes.push({
      category: "people",
      description: `Otimizar escala de equipe — folha em ${(folhaPct * 100).toFixed(1)}% da receita`,
      reason: `Folha orçada em ${(folhaPct * 100).toFixed(1)}% da receita (benchmark: <35%). Revisar distribuição de turnos e horas extras.`,
      dueDate: dueDate30,
    });
  }

  // Sempre: ação de acompanhamento diário
  acoes.push({
    category: "discipline",
    description: `Lançar resultados diários no sistema para acompanhar orçamento de ${mes}`,
    reason: `Orçamento aprovado para ${mes}. Meta diária: R$ ${calc.metaDiaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Lançar receita, atendimentos e CMV todos os dias.`,
    dueDate: dueDate7,
  });

  // Inserir planos de ação (evitar duplicatas verificando se já existem para o mês)
  const existingActions = await exec(
    `SELECT COUNT(*) as cnt FROM action_plans WHERE storeId = ? AND dueDate >= ? AND dueDate <= ? AND isSuggestion = 1`,
    [storeId, orc.periodoInicio, orc.periodoFim]
  );
  const existingCount = Number((existingActions[0] as any).cnt);

  if (existingCount === 0) {
    for (const acao of acoes) {
      // Prefixo [orc:<id>] no reason para identificar planos gerados por este orçamento
      const reasonComOrigem = `[orc:${orcamentoId}] ${acao.reason}`;
      await exec(
        `INSERT INTO action_plans (storeId, category, description, reason, dueDate, status, isSuggestion, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'todo', 1, NOW(), NOW())`,
        [storeId, acao.category, acao.description, reasonComOrigem, acao.dueDate]
      );
    }
  }

  // ── 2. Pré-configurar compromisso do mês ──────────────────────────────────
  // Criar ou atualizar o compromisso do mês com as disciplinas básicas ativas
  const existingCommitment = await exec(
    `SELECT id FROM commitments WHERE storeId = ? AND period = ? LIMIT 1`,
    [storeId, mes]
  );

  if (existingCommitment.length === 0) {
    await exec(
      `INSERT INTO commitments (
        storeId, period, signed,
        doPreShift, doAppEntry, doWeeklyMeeting,
        doInitialCount, doWeeklyCount, doMonthlyCount,
        readTrails, joinCommunity, applyContent,
        reviewsTarget, tableResponseHours, googleResponseHours,
        trainTeam, actOnStandard,
        createdAt, updatedAt
      ) VALUES (?, ?, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 30, 24, 48, 1, 1, NOW(), NOW())`,
      [storeId, mes]
    );
  }

  // ── 3. Meta do Mês (MIC) + Medidas de Direção (4DX) ──────────────────────
  // Derivar mês e ano do periodoInicio (YYYY-MM-DD)
  const [anoStr, mesStr] = orc.periodoInicio.split("-");
  const anoNum = Number(anoStr);
  const mesNum = Number(mesStr);
  const mesAnoLabel = `${mesStr}/${anoStr}`;

  // Upsert: se já existe meta para esta loja/mês/ano, apagar e recriar com os dados do novo orçamento
  // Planos manuais (isSuggestion=0) são preservados; apenas os gerados automaticamente são removidos
  const metasExistentes = await listMetas(storeId, mesNum, anoNum);
  console.log(`[gerarConteudo] metasExistentes para storeId=${storeId} mes=${mesNum} ano=${anoNum}: ${metasExistentes.length}`);
  if (metasExistentes.length > 0) {
    const db2 = await getDb();
    if (db2) {
      for (const metaAntiga of metasExistentes) {
        // Apagar progresso e medidas
        const [medRowsAntigos] = await (db2 as any).$client.promise().execute(
          `SELECT id FROM medidas_direcao WHERE meta_id = ?`, [metaAntiga.id]
        );
        for (const med of medRowsAntigos as any[]) {
          await (db2 as any).$client.promise().execute(`DELETE FROM medidas_progresso WHERE medida_id = ?`, [med.id]);
          // Apagar planos automáticos ligados à medida (preservar manuais isSuggestion=0)
          await (db2 as any).$client.promise().execute(
            `DELETE FROM action_plans WHERE medida_id = ? AND isSuggestion = 1`, [med.id]
          );
        }
        await (db2 as any).$client.promise().execute(`DELETE FROM medidas_direcao WHERE meta_id = ?`, [metaAntiga.id]);
        await (db2 as any).$client.promise().execute(`DELETE FROM metas WHERE id = ?`, [metaAntiga.id]);
      }
      console.log(`[gerarConteudo] ${metasExistentes.length} meta(s) antiga(s) removida(s) para upsert`);
    }
  }
  {
    // Criar a Meta do Mês (MIC)
    const metaId = await createMeta({
      lojaId: storeId,
      mes: mesNum,
      ano: anoNum,
      titulo: `Meta do mês — ${mesAnoLabel}`,
      valorMeta: rb,
      unidade: "R$",
      descricao: `Meta de faturamento gerada automaticamente a partir do orçamento aprovado de ${mesAnoLabel}.`,
    });

        console.log('[gerarConteudo] meta criada id=' + metaId + ' para storeId=' + storeId + ' mes=' + mesNum + ' ano=' + anoNum + ' rb=' + rb);
    // Calcular alvos derivados do orçamento
    const cmvPctAlvo = rb > 0 ? (calc.cmv / rb) * 100 : 0;
    const ebitdaPctAlvo = calc.ebitdaPct * 100;
    const folhaPctAlvo = rb > 0 ? (calc.colaboradores / rb) * 100 : 0;

    // Criar as 4 Medidas de Direção ligadas à meta
    // MEDIDAS DE DIREÇÃO COMPORTAMENTAIS (geradas por IA)
    // As medidas de resultado (CMV%/EBITDA%/Folha%/Fat) NÃO são mais criadas como medidas_direcao.
    // Elas ficam como "resultado-alvo do mês" no cabeçalho da Meta (contexto/placar).
    // peso_remuneracao_pct = 0 em todas — intencional, não entram no bônus.
    // Identificar pontos fracos para a IA priorizar
    const pontosFrageis: string[] = [];
    if (cmvPctAlvo > 30) pontosFrageis.push(`CMV alto: ${cmvPctAlvo.toFixed(1)}% (acima de 30%)`);
    if (folhaPctAlvo > 30) pontosFrageis.push(`Folha alta: ${folhaPctAlvo.toFixed(1)}% (acima de 30%)`);
    if (ebitdaPctAlvo < 10) pontosFrageis.push(`EBITDA baixo: ${ebitdaPctAlvo.toFixed(1)}% (abaixo de 10%)`);

    try {
      const iaResult = await gerarMedidasDirecao({
        metaId,
        storeId,
        orcamentoId,
        dre: {
          receitaBruta: rb,
          cmvPct: cmvPctAlvo,
          folhaPct: folhaPctAlvo,
          ebitdaPct: ebitdaPctAlvo,
          pontosFrageis: pontosFrageis.join("; ") || "Nenhum ponto fraco específico.",
        },
      });
    } catch (err) {
      console.error("[gerarConteudo] Erro ao gerar medidas comportamentais:", err);
      // Fallback: não bloqueia a aprovação se a IA falhar
    }
  }

  // ── 4. Aplicar decisões aceitas do A3 ao DRE + gerar planos de ação ─────────
  // Ler ia_revisao_json do orçamento (gravado pelo A3 via salvarRevisaoIA)
  const rawRevisao = (orc as any).iaRevisaoJson ?? null;
  if (rawRevisao) {
    let revisao: {
      sugestoesCorte?: Record<string, "aceito" | "rejeitado">;
      linhasNovas?: Record<string, "adicionado" | "ignorado">;
      questionamentos?: Record<string, { decisao: "ciente"; resposta?: string }>;
      planoDeAcao?: Array<{
        acao: string;
        categoria?: string;
        impactoEstimadoRs?: number;
        prazo?: string;
        responsavel?: string;
        semanaInicio?: number | null;
        checkpointNumerico?: string | null;
        acaoSeEstourar?: string | null;
      }>;
    } = {};
    try { revisao = JSON.parse(rawRevisao); } catch { /* JSON inválido — ignorar */ }

    const mesOrc = orc.periodoInicio.slice(0, 7); // YYYY-MM

    // 4a. Gerar action_plans para sugestões de corte aceitas
    // NOTA: os valores já foram aplicados no DRE pelo cliente (A4b) antes de enviar ao servidor.
    // O servidor só precisa criar os action_plans rastreáveis ligados à Meta.
    // Buscar a Meta do mês para ligar os action_plans (loop 4DX rastreável)
    const mesOrcNum = Number(mesStr);
    const anoOrcNum = Number(anoStr);
    const metasDoMes = await listMetas(storeId, mesOrcNum, anoOrcNum);
    const metaId4dx = metasDoMes[0]?.id ?? null; // Meta criada no bloco 3 acima
    for (const [id, decisao] of Object.entries(revisao.sugestoesCorte ?? {})) {
      if (decisao !== "aceito") continue;
      const origemAcao = `ia_corte_${id}_orc_${orcamentoId}`;
      const existeAcao = await exec(
        `SELECT id FROM action_plans WHERE reason LIKE ? LIMIT 1`,
        [`%${origemAcao}%`]
      );
      if (existeAcao.length === 0) {
        // Ligar à Medida de faturamento da Meta (loop 4DX rastreável)
        const [medRows] = await exec(
          `SELECT id FROM medidas_direcao WHERE meta_id = ? AND indicador = 'faturamento' LIMIT 1`,
          [metaId4dx ?? 0]
        ) as any[];
        const medidaId = (medRows as any)?.[0]?.id ?? null;
        await exec(
          `INSERT INTO action_plans (storeId, category, description, reason, dueDate, status, isSuggestion, medida_id, createdAt, updatedAt)
           VALUES (?, 'other', ?, ?, ?, 'todo', 1, ?, NOW(), NOW())`,
          [
            storeId,
            `[Corte aceito] ${id.replace(/_/g, " ")}`,
            `Corte aceito na revisão do orçamento IA — valor já aplicado no DRE. Origem: ${origemAcao}.`,
            dueDate30,
            medidaId,
          ]
        );
      }
    }
    // 4b. Aplicar linhas novas adicionadas
    for (const [id, decisao] of Object.entries(revisao.linhasNovas ?? {})) {
      if (decisao !== "adicionado") continue;
      const origemLinha = `ia_linhanova_${id}_orc_${orcamentoId}`;
      // Idempotência: não duplicar linha custom
      const existeLinha = await exec(
        `SELECT id FROM orcamento_linhas_custom WHERE loja_id = ? AND mes = ? AND origem = ? LIMIT 1`,
        [storeId, mesOrc, origemLinha]
      );
      if (existeLinha.length === 0) {
        // Criar linha custom com valor 0 (o gerente preenche no DRE manual)
        // O nome da linha vem do id (ex: "provisao_13" → "Provisão 13º")
        const label = id.replace(/_/g, " ").replace(/\w/g, l => l.toUpperCase());
        await createLinhaCustom(storeId, mesOrc, "outras_despesas", `[IA] ${label}`, 0, "fixo", origemLinha);
      }
      // Criar action_plan para a linha nova adicionada
      const origemAcao = `ia_linhanova_${id}_orc_${orcamentoId}`;
      const existeAcao = await exec(
        `SELECT id FROM action_plans WHERE reason LIKE ? LIMIT 1`,
        [`%${origemAcao}%`]
      );
      if (existeAcao.length === 0) {
        await exec(
          `INSERT INTO action_plans (storeId, category, description, reason, dueDate, status, isSuggestion, createdAt, updatedAt)
           VALUES (?, 'other', ?, ?, ?, 'todo', 1, NOW(), NOW())`,
          [
            storeId,
            `[Provisão adicionada] ${id.replace(/_/g, " ")}`,
            `Linha nova adicionada na revisão do orçamento IA. Origem: ${origemAcao}. Preencher o valor no DRE editável.`,
            dueDate30,
          ]
        );
      }
    }

    // 4c. Registrar questionamentos respondidos como action_plans (se resposta indica ação)
    for (const [id, dec] of Object.entries(revisao.questionamentos ?? {})) {
      if (dec.decisao !== "ciente") continue;
      if (!dec.resposta || dec.resposta.trim().length < 10) continue; // só se há resposta substantiva
      const origemAcao = `ia_questionamento_${id}_orc_${orcamentoId}`;
      const existeAcao = await exec(
        `SELECT id FROM action_plans WHERE reason LIKE ? LIMIT 1`,
        [`%${origemAcao}%`]
      );
      if (existeAcao.length === 0) {
        await exec(
          `INSERT INTO action_plans (storeId, category, description, reason, dueDate, status, isSuggestion, createdAt, updatedAt)
           VALUES (?, 'other', ?, ?, ?, 'todo', 1, NOW(), NOW())`,
          [
            storeId,
            `[Questionamento respondido] ${id.replace(/_/g, " ")}`,
            `Justificativa: ${dec.resposta}. Origem: ${origemAcao}.`,
            dueDate30,
          ]
        );
      }
    }
  }
  // Contar e retornar contagens reais do banco
  const planosCount = await exec(
    `SELECT COUNT(*) as cnt FROM action_plans WHERE storeId = ? AND dueDate >= ? AND dueDate <= ? AND isSuggestion = 1`,
    [storeId, orc.periodoInicio, orc.periodoFim]
  );
  const medidasCount = await exec(
    `SELECT COUNT(*) as cnt FROM medidas_direcao WHERE loja_id = ?`,
    [storeId]
  );
  return {
    medidasCriadas: Number((medidasCount[0] as any).cnt),
    planosCriados: Number((planosCount[0] as any).cnt),
  };
}

export async function proporOrcamento(id: number): Promise<void> {
  const now = Date.now();
  await exec(
    `UPDATE orcamentos SET status = 'proposto', updated_at = ? WHERE id = ?`,
    [now, id]
  );
}

export async function gerarMetasDiarias(orcamentoId: number): Promise<void> {
  const orc = await getOrcamentoById(orcamentoId);
  if (!orc) return;

  const colaboradores = orc.colaboradores ?? [];
  const calc = calcularOrcamento(orc, colaboradores);
  void calc; // usado apenas para validação

  const inicio = new Date(orc.periodoInicio + "T00:00:00");
  const fim = new Date(orc.periodoFim + "T00:00:00");
  // Pesos base por dia da semana: [dom, seg, ter, qua, qui, sex, sab]
  const pesosDia = [0.8, 1.0, 1.0, 1.0, 1.1, 1.3, 1.2];

  const dias: Date[] = [];
  const cur = new Date(inicio);
  while (cur <= fim) {
    dias.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // Busca regras de feriado da loja para o período
  const startDate = orc.periodoInicio;
  const endDate = orc.periodoFim;
  let holidayMultipliers: Map<string, number> = new Map();
  try {
    const db = await getDb();
    if (db) {
      const rows = await (db as any).$client.promise().execute(
        `SELECT rule_date, CAST(multiplier AS DECIMAL(5,3)) as multiplier
         FROM store_holiday_rules
         WHERE store_id = ? AND rule_date >= ? AND rule_date <= ?`,
        [orc.storeId, startDate, endDate]
      );
      for (const row of (rows.rows ?? [])) {
        holidayMultipliers.set(row.rule_date as string, Number(row.multiplier));
      }
    }
  } catch {
    // Se falhar, continua sem multiplicadores de feriado
  }

  // Calcula pesos ajustados (inclui multiplicador de feriado quando houver)
  const pesosAjustados = dias.map(d => {
    const dataStr = d.toISOString().slice(0, 10);
    const pesoDia = pesosDia[d.getDay()];
    const holidayMult = holidayMultipliers.get(dataStr);
    // Multiplica o peso base pelo multiplicador de feriado
    return holidayMult !== undefined ? pesoDia * holidayMult : pesoDia;
  });

  const somaPesos = pesosAjustados.reduce((s, p) => s + p, 0);
  const receitaTotal = orc.receitaBruta;

  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i];
    const peso = pesosAjustados[i];
    const dataStr = dia.toISOString().slice(0, 10);
    const metaReceita = somaPesos > 0 ? (receitaTotal * peso) / somaPesos : 0;
    const metaAtendimentos =
      orc.ticketMedio && orc.ticketMedio > 0
        ? Math.ceil(metaReceita / orc.ticketMedio)
        : null;
    const holidayMult = holidayMultipliers.get(dataStr);
    const isFeriado = holidayMult !== undefined;

    await exec(
      `INSERT INTO orcamento_metas_diarias (orcamento_id, store_id, data, meta_receita, meta_atendimentos, peso_dia)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE orcamento_id = ?, meta_receita = ?, meta_atendimentos = ?, peso_dia = ?`,
      [
        orcamentoId, orc.storeId, dataStr, metaReceita, metaAtendimentos, peso,
        orcamentoId, metaReceita, metaAtendimentos, peso,
      ]
    );
    void isFeriado; // informação disponível para logs futuros
  }
}

export async function getMetaDiaria(
  storeId: number,
  data: string
): Promise<OrcamentoMetaDiaria | null> {
  const rows = await exec(
    `SELECT * FROM orcamento_metas_diarias WHERE store_id = ? AND data = ? LIMIT 1`,
    [storeId, data]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id as number,
    orcamentoId: r.orcamento_id as number,
    storeId: r.store_id as number,
    data: r.data as string,
    metaReceita: Number(r.meta_receita),
    metaAtendimentos: r.meta_atendimentos != null ? Number(r.meta_atendimentos) : null,
    pesoDia: Number(r.peso_dia),
  };
}

// ─── Linhas Customizáveis ─────────────────────────────────────────────────────

export async function listLinhasCustom(lojaId: number, mes: string): Promise<LinhaCustom[]> {
  const rows = await exec(
    `SELECT * FROM orcamento_linhas_custom WHERE loja_id = ? AND mes = ? ORDER BY grupo_id, ordem`,
    [lojaId, mes]
  );
  return rows.map((r) => ({
    id: r.id as number,
    lojaId: r.loja_id as number,
    grupoId: r.grupo_id as string,
    label: r.label as string,
    valor: Number(r.valor),
    tipo: t(r.tipo),
    origem: (r.origem as string) ?? null,
    ordem: r.ordem as number,
    mes: r.mes as string,
  }));
}

export async function createLinhaCustom(
  lojaId: number,
  mes: string,
  grupoId: string,
  label: string,
  valor: number,
  tipo: TipoValor,
  origem?: string | null
): Promise<number> {
  const rows = await exec(
    `SELECT COALESCE(MAX(ordem), -1) as max_ordem FROM orcamento_linhas_custom WHERE loja_id = ? AND mes = ? AND grupo_id = ?`,
    [lojaId, mes, grupoId]
  );
  const nextOrdem = Number((rows[0] as any).max_ordem) + 1;
  const result = await exec(
    `INSERT INTO orcamento_linhas_custom (loja_id, mes, grupo_id, label, valor, tipo, origem, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [lojaId, mes, grupoId, label, valor, tipo, origem ?? null, nextOrdem]
  ) as any;
  return result.insertId;
}

export async function deleteLinhaCustomByOrigem(origem: string): Promise<void> {
  await exec(`DELETE FROM orcamento_linhas_custom WHERE origem = ?`, [origem]);
}

export async function updateLinhaCustom(
  id: number,
  label: string,
  valor: number,
  tipo: TipoValor
): Promise<void> {
  await exec(
    `UPDATE orcamento_linhas_custom SET label = ?, valor = ?, tipo = ? WHERE id = ?`,
    [label, valor, tipo, id]
  );
}

export async function deleteLinhaCustom(id: number): Promise<void> {
  await exec(`DELETE FROM orcamento_linhas_custom WHERE id = ?`, [id]);
}
import { gerarMedidasDirecao } from "./gerar-medidas-direcao";
