import { getDb } from "./db";

export type TurnoChecklist = "abertura" | "operacao" | "fechamento" | "todos";
export type StatusExecucao = "pendente" | "concluido";

export interface ChecklistItem {
  id: number;
  lojaId: number;
  categoria: string;
  titulo: string;
  descricao: string | null;
  turno: TurnoChecklist;
  ordem: number;
  ativo: boolean;
  createdAt: number;
}

export interface ChecklistExecucao {
  id: number;
  lojaId: number;
  data: string;
  turno: "abertura" | "operacao" | "fechamento";
  userId: number | null;
  status: StatusExecucao;
  percentualConformidade: number | null;
  totalItens: number;
  itensOk: number;
  finalizadoAt: number | null;
  createdAt: number;
  respostas?: ChecklistResposta[];
}

export interface ChecklistResposta {
  id: number;
  execucaoId: number;
  itemId: number;
  ok: boolean | null;
  observacao: string | null;
  respondidoAt: number;
}

async function exec(sql: string, params: unknown[] = []) {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return [rows as Record<string, unknown>[]] as const;
}

// ─── Itens ────────────────────────────────────────────────────────────────────

export async function listarItens(lojaId: number, turno?: string): Promise<ChecklistItem[]> {
  let sql = `SELECT id, loja_id, categoria, titulo, descricao, turno, ordem, ativo, created_at
             FROM checklist_itens WHERE loja_id = ? AND ativo = TRUE`;
  const params: unknown[] = [lojaId];
  if (turno && turno !== "todos") {
    sql += ` AND (turno = ? OR turno = 'todos')`;
    params.push(turno);
  }
  sql += ` ORDER BY ordem ASC, id ASC`;
  const [rows] = await exec(sql, params) as any;
  return (rows as any[]).map(mapItem);
}

export async function criarItem(data: {
  lojaId: number; categoria: string; titulo: string; descricao?: string | null;
  turno: TurnoChecklist; ordem?: number;
}): Promise<number> {
  const [r] = await exec(
    `INSERT INTO checklist_itens (loja_id, categoria, titulo, descricao, turno, ordem, ativo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)`,
    [data.lojaId, data.categoria, data.titulo, data.descricao ?? null, data.turno, data.ordem ?? 0, Date.now()]
  ) as any;
  return (r as any).insertId as number;
}

export async function editarItem(id: number, data: Partial<{
  categoria: string; titulo: string; descricao: string | null; turno: TurnoChecklist; ordem: number; ativo: boolean;
}>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.categoria !== undefined) { sets.push("categoria = ?"); params.push(data.categoria); }
  if (data.titulo !== undefined) { sets.push("titulo = ?"); params.push(data.titulo); }
  if (data.descricao !== undefined) { sets.push("descricao = ?"); params.push(data.descricao); }
  if (data.turno !== undefined) { sets.push("turno = ?"); params.push(data.turno); }
  if (data.ordem !== undefined) { sets.push("ordem = ?"); params.push(data.ordem); }
  if (data.ativo !== undefined) { sets.push("ativo = ?"); params.push(data.ativo); }
  if (sets.length === 0) return;
  params.push(id);
  await exec(`UPDATE checklist_itens SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function getItemById(id: number): Promise<ChecklistItem | null> {
  const [rows] = await exec("SELECT * FROM checklist_itens WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { id: r.id as number, lojaId: r.loja_id as number, categoria: r.categoria as string, titulo: r.titulo as string, descricao: r.descricao as string | null, turno: r.turno as TurnoChecklist, ordem: r.ordem as number, ativo: Boolean(r.ativo), createdAt: Number(r.created_at) };
}

export async function getExecucaoById(id: number): Promise<ChecklistExecucao | null> {
  const [rows] = await exec("SELECT * FROM checklist_execucoes WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { id: r.id as number, lojaId: r.loja_id as number, data: r.data as string, turno: r.turno as "abertura" | "operacao" | "fechamento", userId: r.user_id as number | null, status: r.status as StatusExecucao, percentualConformidade: r.percentual_conformidade as number | null, totalItens: r.total_itens as number, itensOk: r.itens_ok as number, finalizadoAt: r.finalizado_at as number | null, createdAt: r.created_at as number };
}

export async function deletarItem(id: number): Promise<void> {
  await exec(`UPDATE checklist_itens SET ativo = FALSE WHERE id = ?`, [id]);
}

// ─── Execuções ────────────────────────────────────────────────────────────────

export async function iniciarOuBuscarExecucao(
  lojaId: number, data: string, turno: "abertura" | "operacao" | "fechamento", userId?: number
): Promise<ChecklistExecucao> {
  // Buscar execução existente
  const [rows] = await exec(
    `SELECT id, loja_id, data, turno, user_id, status, percentual_conformidade, total_itens, itens_ok, finalizado_at, created_at
     FROM checklist_execucoes WHERE loja_id = ? AND data = ? AND turno = ?`,
    [lojaId, data, turno]
  ) as any;

  if ((rows as any[]).length > 0) {
    const ex = mapExecucao((rows as any[])[0]);
    ex.respostas = await listarRespostas(ex.id);
    return ex;
  }

  // Contar itens ativos para este turno
  const [itemRows] = await exec(
    `SELECT COUNT(*) as cnt FROM checklist_itens WHERE loja_id = ? AND ativo = TRUE AND (turno = ? OR turno = 'todos')`,
    [lojaId, turno]
  ) as any;
  const totalItens = (itemRows as any[])[0]?.cnt ?? 0;

  const [r] = await exec(
    `INSERT INTO checklist_execucoes (loja_id, data, turno, user_id, status, total_itens, itens_ok, created_at)
     VALUES (?, ?, ?, ?, 'pendente', ?, 0, ?)`,
    [lojaId, data, turno, userId ?? null, totalItens, Date.now()]
  ) as any;

  const newId = (r as any).insertId as number;
  return {
    id: newId, lojaId, data, turno, userId: userId ?? null,
    status: "pendente", percentualConformidade: null,
    totalItens, itensOk: 0, finalizadoAt: null, createdAt: Date.now(),
    respostas: [],
  };
}

export async function responderItem(
  execucaoId: number, itemId: number, ok: boolean, observacao?: string | null
): Promise<void> {
  // Upsert resposta
  await exec(
    `INSERT INTO checklist_respostas (execucao_id, item_id, ok, observacao, respondido_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE ok = VALUES(ok), observacao = VALUES(observacao), respondido_at = VALUES(respondido_at)`,
    [execucaoId, itemId, ok, observacao ?? null, Date.now()]
  );

  // Atualizar contadores na execução
  const [countRows] = await exec(
    `SELECT COUNT(*) as total, SUM(CASE WHEN ok = TRUE THEN 1 ELSE 0 END) as ok_count
     FROM checklist_respostas WHERE execucao_id = ?`,
    [execucaoId]
  ) as any;
  const total = (countRows as any[])[0]?.total ?? 0;
  const okCount = (countRows as any[])[0]?.ok_count ?? 0;

  const [execRows] = await exec(
    `SELECT total_itens FROM checklist_execucoes WHERE id = ?`, [execucaoId]
  ) as any;
  const totalItens = (execRows as any[])[0]?.total_itens ?? total;
  const pct = totalItens > 0 ? Math.round((okCount / totalItens) * 100 * 100) / 100 : 0;

  await exec(
    `UPDATE checklist_execucoes SET itens_ok = ?, percentual_conformidade = ? WHERE id = ?`,
    [okCount, pct, execucaoId]
  );
}

export async function finalizarExecucao(execucaoId: number): Promise<void> {
  await exec(
    `UPDATE checklist_execucoes SET status = 'concluido', finalizado_at = ? WHERE id = ?`,
    [Date.now(), execucaoId]
  );
}

export async function listarRespostas(execucaoId: number): Promise<ChecklistResposta[]> {
  const [rows] = await exec(
    `SELECT id, execucao_id, item_id, ok, observacao, respondido_at FROM checklist_respostas WHERE execucao_id = ?`,
    [execucaoId]
  ) as any;
  return (rows as any[]).map(mapResposta);
}

export async function historicoConformidade(lojaId: number, dias = 30): Promise<{
  data: string; turno: string; percentual: number | null; status: string;
}[]> {
  const [rows] = await exec(
    `SELECT data, turno, percentual_conformidade, status
     FROM checklist_execucoes
     WHERE loja_id = ? AND data >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY data DESC, turno ASC`,
    [lojaId, dias]
  ) as any;
  return (rows as any[]).map((r: any) => ({
    data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data),
    turno: r.turno,
    percentual: r.percentual_conformidade !== null ? Number(r.percentual_conformidade) : null,
    status: r.status,
  }));
}

export async function resumoHoje(lojaId: number, hoje: string): Promise<{
  turno: string; status: string; percentual: number | null; itensOk: number; totalItens: number;
}[]> {
  const [rows] = await exec(
    `SELECT turno, status, percentual_conformidade, itens_ok, total_itens
     FROM checklist_execucoes WHERE loja_id = ? AND data = ?`,
    [lojaId, hoje]
  ) as any;
  return (rows as any[]).map((r: any) => ({
    turno: r.turno,
    status: r.status,
    percentual: r.percentual_conformidade !== null ? Number(r.percentual_conformidade) : null,
    itensOk: r.itens_ok,
    totalItens: r.total_itens,
  }));
}

// ─── Seed de itens padrão ─────────────────────────────────────────────────────

export async function seedItensPadrao(lojaId: number): Promise<void> {
  const [existing] = await exec(
    `SELECT COUNT(*) as cnt FROM checklist_itens WHERE loja_id = ?`, [lojaId]
  ) as any;
  if ((existing as any[])[0]?.cnt > 0) return; // já tem itens

  const itens: { categoria: string; titulo: string; descricao: string; turno: TurnoChecklist; ordem: number }[] = [
    // Abertura
    { categoria: "Equipe", titulo: "Todos os funcionários com uniforme completo", descricao: "Verificar calçado, avental, touca/coque e crachá", turno: "abertura", ordem: 1 },
    { categoria: "Equipe", titulo: "Recepção com coque e apresentação correta", descricao: "Cabelo preso, maquiagem discreta, postura", turno: "abertura", ordem: 2 },
    { categoria: "Ambiente", titulo: "Som ambiente ligado com playlist correta do Spotify", descricao: "Verificar playlist da marca e volume adequado", turno: "abertura", ordem: 3 },
    { categoria: "Ambiente", titulo: "Volume do som está adequado para o horário", descricao: "Ajustar conforme movimento (baixo na abertura, médio no pico)", turno: "abertura", ordem: 4 },
    { categoria: "Salão", titulo: "Todas as mesas conferidas (nenhuma bamba)", descricao: "Verificar nivelamento e estabilidade de todas as mesas", turno: "abertura", ordem: 5 },
    { categoria: "Salão", titulo: "Cadeiras limpas e sem avarias", descricao: "Sem manchas, sem cadeiras quebradas ou com parafuso solto", turno: "abertura", ordem: 6 },
    { categoria: "Salão", titulo: "Iluminação correta em todos os pontos", descricao: "Sem lâmpadas queimadas, intensidade adequada", turno: "abertura", ordem: 7 },
    { categoria: "Cozinha", titulo: "Temperatura dos equipamentos de frio verificada", descricao: "Câmara fria, freezer e geladeiras dentro da faixa correta", turno: "abertura", ordem: 8 },
    { categoria: "Cozinha", titulo: "Mise en place completo antes da abertura", descricao: "Todos os insumos preparados e porcionados", turno: "abertura", ordem: 9 },
    { categoria: "Higiene", titulo: "Banheiros limpos e abastecidos", descricao: "Papel higiênico, sabonete, papel toalha e lixo vazio", turno: "abertura", ordem: 10 },
    // Operação
    { categoria: "Ambiente", titulo: "Volume do som ajustado para o pico de movimento", descricao: "Conferir novamente quando o salão encher", turno: "operacao", ordem: 1 },
    { categoria: "Salão", titulo: "Mesas limpas e prontas em até 3 min após saída do cliente", descricao: "Monitorar tempo de virada de mesa", turno: "operacao", ordem: 2 },
    { categoria: "Equipe", titulo: "Equipe nas posições corretas", descricao: "Caixa, recepção, garçons e cozinha com cobertura adequada", turno: "operacao", ordem: 3 },
    { categoria: "Qualidade", titulo: "Tempo de espera dentro do padrão", descricao: "Verificar fila e tempo de entrega dos pedidos", turno: "operacao", ordem: 4 },
    { categoria: "Higiene", titulo: "Banheiros verificados a cada hora", descricao: "Limpeza e abastecimento durante o pico", turno: "operacao", ordem: 5 },
    // Fechamento
    { categoria: "Caixa", titulo: "Conferência de caixa realizada", descricao: "Valores batendo com o sistema", turno: "fechamento", ordem: 1 },
    { categoria: "Cozinha", titulo: "Estoque conferido e registrado", descricao: "Sobras etiquetadas com data e armazenadas corretamente", turno: "fechamento", ordem: 2 },
    { categoria: "Higiene", titulo: "Cozinha limpa e sanitizada", descricao: "Equipamentos, bancadas e piso limpos", turno: "fechamento", ordem: 3 },
    { categoria: "Segurança", titulo: "Todos os equipamentos desligados", descricao: "Fritadeiras, chapas, fornos e luzes do estoque", turno: "fechamento", ordem: 4 },
    { categoria: "Segurança", titulo: "Portas e janelas travadas", descricao: "Verificar todos os acessos antes de sair", turno: "fechamento", ordem: 5 },
  ];

  for (const item of itens) {
    await criarItem({ lojaId, ...item });
  }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapItem(r: any): ChecklistItem {
  return {
    id: r.id, lojaId: r.loja_id, categoria: r.categoria, titulo: r.titulo,
    descricao: r.descricao, turno: r.turno, ordem: r.ordem,
    ativo: Boolean(r.ativo), createdAt: Number(r.created_at),
  };
}

function mapExecucao(r: any): ChecklistExecucao {
  return {
    id: r.id, lojaId: r.loja_id,
    data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data),
    turno: r.turno, userId: r.user_id,
    status: r.status,
    percentualConformidade: r.percentual_conformidade !== null ? Number(r.percentual_conformidade) : null,
    totalItens: r.total_itens, itensOk: r.itens_ok,
    finalizadoAt: r.finalizado_at ? Number(r.finalizado_at) : null,
    createdAt: Number(r.created_at),
  };
}

function mapResposta(r: any): ChecklistResposta {
  return {
    id: r.id, execucaoId: r.execucao_id, itemId: r.item_id,
    ok: r.ok === null ? null : Boolean(r.ok),
    observacao: r.observacao, respondidoAt: Number(r.respondido_at),
  };
}
