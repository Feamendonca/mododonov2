import { getDb } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PreturnoConfig = {
  id: number;
  storeId: number;
  nome: string;
  diasDaSemana: number[]; // 0=dom, 1=seg ... 6=sab
  horarioEsperado: string; // HH:MM
  condutorPadraoId: number | null;
  condutorPadraoNome: string | null;
  toleranciaMinutos: number;
  ativa: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PreturnoTema = {
  id: number;
  storeId: number;
  label: string;
  ordem: number;
  ativa: boolean;
  createdAt: Date;
};

export type PreturnoCondutor = {
  id: number;
  storeId: number;
  employeeId: number | null;
  nome: string;
  podeConduzir: boolean;
  createdAt: Date;
};

export type PreturnoAta = {
  id: number;
  storeId: number;
  configId: number | null;
  nomeReuniao: string;
  data: string; // YYYY-MM-DD
  horarioEsperado: string;
  horarioInicio: string | null;
  status: "realizada" | "nao-realizada" | "atrasada";
  motivoNaoRealizada: string | null;
  condutorId: number | null;
  condutorNome: string | null;
  participantes: number[] | null;
  participantesNomes: string[] | null;
  escaladosNoTurno: number[] | null;
  motivoAusencia: string | null;
  assunto: string | null;
  assuntoTemaId: number | null;
  reivindicacao: string | null;
  reivindicacaoStatus: "nota-pra-depois" | "tratada-na-hora" | "virou-acao" | null;
  reivindicacaoAcaoId: number | null;
  comentarios: string | null;
  criadoPor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PreturnoAtaEstado = {
  configId: number | null;
  nomeReuniao: string;
  horarioEsperado: string;
  toleranciaMinutos: number;
  estado: "pendente" | "realizado" | "atrasado" | "nao-realizado";
  ata: PreturnoAta | null;
  minutosAtraso: number;
};

export type PreturnoStats = {
  disciplinaPct: number;
  esperadasMes: number;
  realizadasMes: number;
  reivindicacoesAbertas: number;
  quemMaisConduziu: { nome: string; count: number } | null;
  calendarData: { date: string; estado: "verde" | "amarelo" | "vermelho" | "cinza" }[];
};

export type PreturnoSugestao = {
  id: string;
  tipo: "tema" | "alerta";
  prioridade: "alta" | "media" | "baixa";
  categoria: "experiencia" | "financeiro" | "pessoas" | "operacoes" | "reconhecimento";
  titulo: string;
  descricao: string;
  motivo: string; // short contextual reason shown as badge
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}

function mapAta(r: any): PreturnoAta {
  return {
    ...r,
    ativa: !!r.ativa,
    participantes: r.participantes ? parseJson<number[]>(r.participantes, []) : null,
    participantesNomes: r.participantesNomes ? parseJson<string[]>(r.participantesNomes, []) : null,
    escaladosNoTurno: r.escaladosNoTurno ? parseJson<number[]>(r.escaladosNoTurno, []) : null,
  };
}

function mapConfig(r: any): PreturnoConfig {
  return {
    ...r,
    ativa: !!r.ativa,
    diasDaSemana: parseJson<number[]>(r.diasDaSemana, [1, 2, 3, 4, 5, 6]),
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getPreturnoConfigs(storeId: number): Promise<PreturnoConfig[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM preturno_configs WHERE storeId = ? AND ativa = 1 ORDER BY id ASC`,
    [storeId]
  );
  return (rows as any[]).map(mapConfig);
}

export async function upsertPreturnoConfig(data: {
  id?: number;
  storeId: number;
  nome: string;
  diasDaSemana: number[];
  horarioEsperado: string;
  condutorPadraoId?: number | null;
  condutorPadraoNome?: string | null;
  toleranciaMinutos?: number;
  ativa?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const dias = JSON.stringify(data.diasDaSemana);
  if (data.id) {
    await (db as any).$client.promise().execute(
      `UPDATE preturno_configs SET nome=?, diasDaSemana=?, horarioEsperado=?,
       condutorPadraoId=?, condutorPadraoNome=?, toleranciaMinutos=?, ativa=?
       WHERE id=? AND storeId=?`,
      [data.nome, dias, data.horarioEsperado,
       data.condutorPadraoId ?? null, data.condutorPadraoNome ?? null,
       data.toleranciaMinutos ?? 60, data.ativa !== false ? 1 : 0,
       data.id, data.storeId]
    );
    return data.id;
  }
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO preturno_configs (storeId, nome, diasDaSemana, horarioEsperado,
     condutorPadraoId, condutorPadraoNome, toleranciaMinutos, ativa)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [data.storeId, data.nome, dias, data.horarioEsperado,
     data.condutorPadraoId ?? null, data.condutorPadraoNome ?? null,
     data.toleranciaMinutos ?? 60]
  );
  return (result as any).insertId;
}

export async function deletePreturnoConfig(id: number, storeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await (db as any).$client.promise().execute(
    `UPDATE preturno_configs SET ativa = 0 WHERE id = ? AND storeId = ?`,
    [id, storeId]
  );
}

// ─── Temas ────────────────────────────────────────────────────────────────────

export async function getPreturnoTemas(storeId: number): Promise<PreturnoTema[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM preturno_temas WHERE storeId = ? AND ativa = 1 ORDER BY ordem ASC, id ASC`,
    [storeId]
  );
  return (rows as any[]).map(r => ({ ...r, ativa: !!r.ativa }));
}

export async function createPreturnoTema(data: {
  storeId: number;
  label: string;
  ordem?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO preturno_temas (storeId, label, ordem) VALUES (?, ?, ?)`,
    [data.storeId, data.label, data.ordem ?? 0]
  );
  return (result as any).insertId;
}

export async function deletePreturnoTema(id: number, storeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await (db as any).$client.promise().execute(
    `UPDATE preturno_temas SET ativa = 0 WHERE id = ? AND storeId = ?`,
    [id, storeId]
  );
}

// ─── Condutores ───────────────────────────────────────────────────────────────

export async function getPreturnoCondutores(storeId: number): Promise<PreturnoCondutor[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM preturno_condutores WHERE storeId = ? ORDER BY id ASC`,
    [storeId]
  );
  return (rows as any[]).map(r => ({ ...r, podeConduzir: !!r.podeConduzir }));
}

export async function upsertPreturnoCondutor(data: {
  id?: number;
  storeId: number;
  employeeId?: number | null;
  nome: string;
  podeConduzir: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.id) {
    await (db as any).$client.promise().execute(
      `UPDATE preturno_condutores SET nome=?, podeConduzir=? WHERE id=? AND storeId=?`,
      [data.nome, data.podeConduzir ? 1 : 0, data.id, data.storeId]
    );
    return data.id;
  }
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO preturno_condutores (storeId, employeeId, nome, podeConduzir) VALUES (?, ?, ?, ?)`,
    [data.storeId, data.employeeId ?? null, data.nome, data.podeConduzir ? 1 : 0]
  );
  return (result as any).insertId;
}

// ─── Atas ─────────────────────────────────────────────────────────────────────

export async function getAtasToday(storeId: number): Promise<PreturnoAtaEstado[]> {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const todayDow = new Date().getDay(); // 0=sun
  const nowHHMM = new Date().toTimeString().slice(0, 5);

  const configs = await getPreturnoConfigs(storeId);
  const todayConfigs = configs.filter(c => c.diasDaSemana.includes(todayDow));

  // Get atas for today
  let atasHoje: PreturnoAta[] = [];
  if (db) {
    const [rows] = await (db as any).$client.promise().execute(
      `SELECT * FROM preturno_atas WHERE storeId = ? AND data = ?`,
      [storeId, today]
    );
    atasHoje = (rows as any[]).map(mapAta);
  }

  // If no configs, return empty
  if (todayConfigs.length === 0) {
    // Return atas that exist today even without config
    return atasHoje.map(ata => ({
      configId: ata.configId,
      nomeReuniao: ata.nomeReuniao,
      horarioEsperado: ata.horarioEsperado,
      toleranciaMinutos: 60,
      estado: ata.status === "realizada" ? "realizado" : ata.status === "nao-realizada" ? "nao-realizado" : "atrasado",
      ata,
      minutosAtraso: 0,
    }));
  }

  return todayConfigs.map(config => {
    const ata = atasHoje.find(a => a.configId === config.id) ?? null;

    let estado: PreturnoAtaEstado["estado"];
    let minutosAtraso = 0;

    if (ata) {
      estado = ata.status === "realizada" ? "realizado" : ata.status === "nao-realizada" ? "nao-realizado" : "atrasado";
    } else {
      // Calculate delay
      const [eh, em] = config.horarioEsperado.split(":").map(Number);
      const [nh, nm] = nowHHMM.split(":").map(Number);
      minutosAtraso = (nh * 60 + nm) - (eh * 60 + em);
      if (minutosAtraso > config.toleranciaMinutos) {
        estado = "atrasado";
      } else {
        estado = "pendente";
      }
    }

    return { configId: config.id, nomeReuniao: config.nome, horarioEsperado: config.horarioEsperado, toleranciaMinutos: config.toleranciaMinutos, estado, ata, minutosAtraso: Math.max(0, minutosAtraso) };
  });
}

export async function createAta(data: {
  storeId: number;
  configId?: number | null;
  nomeReuniao: string;
  data: string;
  horarioEsperado: string;
  horarioInicio?: string | null;
  status: "realizada" | "nao-realizada" | "atrasada";
  motivoNaoRealizada?: string | null;
  condutorId?: number | null;
  condutorNome?: string | null;
  participantes?: number[] | null;
  participantesNomes?: string[] | null;
  escaladosNoTurno?: number[] | null;
  motivoAusencia?: string | null;
  assunto?: string | null;
  assuntoTemaId?: number | null;
  reivindicacao?: string | null;
  reivindicacaoStatus?: "nota-pra-depois" | "tratada-na-hora" | "virou-acao" | null;
  comentarios?: string | null;
  criadoPor?: string | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO preturno_atas (storeId, configId, nomeReuniao, data, horarioEsperado,
     horarioInicio, status, motivoNaoRealizada, condutorId, condutorNome,
     participantes, participantesNomes, escaladosNoTurno, motivoAusencia,
     assunto, assuntoTemaId, reivindicacao, reivindicacaoStatus, comentarios, criadoPor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.storeId, data.configId ?? null, data.nomeReuniao, data.data, data.horarioEsperado,
      data.horarioInicio ?? null, data.status, data.motivoNaoRealizada ?? null,
      data.condutorId ?? null, data.condutorNome ?? null,
      data.participantes ? JSON.stringify(data.participantes) : null,
      data.participantesNomes ? JSON.stringify(data.participantesNomes) : null,
      data.escaladosNoTurno ? JSON.stringify(data.escaladosNoTurno) : null,
      data.motivoAusencia ?? null,
      data.assunto ?? null, data.assuntoTemaId ?? null,
      data.reivindicacao ?? null, data.reivindicacaoStatus ?? null,
      data.comentarios ?? null, data.criadoPor ?? null,
    ]
  );
  return (result as any).insertId;
}

export async function updateAta(id: number, data: Partial<{
  status: string;
  motivoNaoRealizada: string | null;
  condutorId: number | null;
  condutorNome: string | null;
  participantes: number[] | null;
  participantesNomes: string[] | null;
  motivoAusencia: string | null;
  assunto: string | null;
  assuntoTemaId: number | null;
  reivindicacao: string | null;
  reivindicacaoStatus: string | null;
  reivindicacaoAcaoId: number | null;
  comentarios: string | null;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === "participantes" || k === "participantesNomes") {
      sets.push(`${k} = ?`);
      params.push(v ? JSON.stringify(v) : null);
    } else {
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (sets.length === 0) return;
  params.push(id);
  await (db as any).$client.promise().execute(`UPDATE preturno_atas SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function getAtaHistory(storeId: number, filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  condutorId?: number;
  comReivindicacao?: boolean;
}): Promise<PreturnoAta[]> {
  const db = await getDb();
  if (!db) return [];
  let query = `SELECT * FROM preturno_atas WHERE storeId = ?`;
  const params: unknown[] = [storeId];
  if (filters?.startDate) { query += ` AND data >= ?`; params.push(filters.startDate); }
  if (filters?.endDate) { query += ` AND data <= ?`; params.push(filters.endDate); }
  if (filters?.status) { query += ` AND status = ?`; params.push(filters.status); }
  if (filters?.condutorId) { query += ` AND condutorId = ?`; params.push(filters.condutorId); }
  if (filters?.comReivindicacao) { query += ` AND reivindicacao IS NOT NULL AND reivindicacao != ''`; }
  query += ` ORDER BY data DESC, id DESC`;
  const [rows] = await (db as any).$client.promise().execute(query, params);
  return (rows as any[]).map(mapAta);
}

export async function getAtaById(id: number): Promise<PreturnoAta | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(`SELECT * FROM preturno_atas WHERE id = ?`, [id]);
  const r = (rows as any[])[0];
  if (!r) return null;
  return mapAta(r);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getPreturnoStats(storeId: number, year: number, month: number): Promise<PreturnoStats> {
  const db = await getDb();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  if (!db) return {
    disciplinaPct: 0, esperadasMes: 0, realizadasMes: 0,
    reivindicacoesAbertas: 0, quemMaisConduziu: null, calendarData: []
  };

  // Get all atas in month
  const [ataRows] = await (db as any).$client.promise().execute(
    `SELECT * FROM preturno_atas WHERE storeId = ? AND data BETWEEN ? AND ?`,
    [storeId, startDate, endDate]
  );
  const atas = (ataRows as any[]).map(mapAta);

  // Get configs to calculate expected
  const configs = await getPreturnoConfigs(storeId);
  let esperadasMes = 0;
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    esperadasMes += configs.filter(c => c.diasDaSemana.includes(dow)).length;
  }

  const realizadasMes = atas.filter(a => a.status === "realizada").length;
  const disciplinaPct = esperadasMes > 0 ? Math.round((realizadasMes / esperadasMes) * 100) : 100;

  const reivindicacoesAbertas = atas.filter(
    a => a.reivindicacao && a.reivindicacaoStatus === "nota-pra-depois"
  ).length;

  // Who conducted most
  const condutorCount: Record<string, number> = {};
  for (const a of atas) {
    if (a.condutorNome) {
      condutorCount[a.condutorNome] = (condutorCount[a.condutorNome] ?? 0) + 1;
    }
  }
  const topCondutor = Object.entries(condutorCount).sort((a, b) => b[1] - a[1])[0];
  const quemMaisConduziu = topCondutor ? { nome: topCondutor[0], count: topCondutor[1] } : null;

  // Calendar data
  const calendarData: PreturnoStats["calendarData"] = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const expectedCount = configs.filter(c => c.diasDaSemana.includes(dow)).length;
    if (expectedCount === 0) {
      calendarData.push({ date: dateStr, estado: "cinza" });
      continue;
    }
    const dayAtas = atas.filter(a => a.data === dateStr);
    const realizadas = dayAtas.filter(a => a.status === "realizada").length;
    let estado: "verde" | "amarelo" | "vermelho" | "cinza";
    if (realizadas === 0) estado = "vermelho";
    else if (realizadas < expectedCount) estado = "amarelo";
    else estado = "verde";
    calendarData.push({ date: dateStr, estado });
  }

  return { disciplinaPct, esperadasMes, realizadasMes, reivindicacoesAbertas, quemMaisConduziu, calendarData };
}

// ─── Sugestões automáticas de tema ───────────────────────────────────────────

export async function getPreturnoSugestoes(storeId: number): Promise<PreturnoSugestao[]> {
  const db = await getDb();
  const sugestoes: PreturnoSugestao[] = [];
  if (!db) return sugestoes;

  const today = new Date();
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
  const since7 = sevenDaysAgo.toISOString().split("T")[0];
  const since30 = thirtyDaysAgo.toISOString().split("T")[0];

  // ── 1. Avaliação negativa recente (1-3★ nos últimos 7 dias) ─────────────────
  try {
    const [revRows] = await (db as any).$client.promise().execute(
      `SELECT stars, platform, text FROM reviews
       WHERE storeId = ? AND stars <= 3 AND reviewDate >= ?
       ORDER BY reviewDate DESC LIMIT 3`,
      [storeId, since7]
    );
    const rows = revRows as any[];
    if (rows.length > 0) {
      const worst = rows.reduce((a: any, b: any) => a.stars <= b.stars ? a : b);
      sugestoes.push({
        id: "neg-review",
        tipo: "alerta",
        prioridade: worst.stars <= 2 ? "alta" : "media",
        categoria: "experiencia",
        titulo: "Avaliação negativa recente",
        descricao: `${rows.length} avaliação(ões) de ${worst.stars}★ nos últimos 7 dias. Identificar o ponto de falha e alinhar com a equipe como evitar a repetição.`,
        motivo: `${rows.length} avaliação(ões) ≤ 3★ esta semana`,
      });
    }
  } catch { /* ignore */ }

  // ── 2. Reclamação aberta sem tratamento ──────────────────────────────────────
  try {
    const [complRows] = await (db as any).$client.promise().execute(
      `SELECT COUNT(*) as cnt FROM reviews
       WHERE storeId = ? AND status = 'registrada' AND stars <= 3
       AND reviewDate >= ?`,
      [storeId, since30]
    );
    const cnt = (complRows as any[])[0]?.cnt ?? 0;
    if (cnt > 0) {
      sugestoes.push({
        id: "open-complaints",
        tipo: "alerta",
        prioridade: cnt >= 3 ? "alta" : "media",
        categoria: "experiencia",
        titulo: "Reclamações sem tratamento",
        descricao: `${cnt} reclamação(ões) registrada(s) ainda sem resposta. Revisar cada caso e definir ação corretiva.`,
        motivo: `${cnt} reclamação(ões) em aberto`,
      });
    }
  } catch { /* ignore */ }

  // ── 3. CMV acima da meta (acumulado do mês) ──────────────────────────────────
  try {
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const [cmvRows] = await (db as any).$client.promise().execute(
      `SELECT SUM(CAST(de.revenue AS DECIMAL(15,2))) as totalRev,
              SUM(CAST(de.laborCost AS DECIMAL(15,2))) as totalLabor,
              s.budgetCmvPct
       FROM daily_entries de
       JOIN stores s ON s.id = de.storeId
       WHERE de.storeId = ? AND de.entryDate >= ?
       GROUP BY s.budgetCmvPct`,
      [storeId, monthStart]
    );
    if ((cmvRows as any[]).length > 0) {
      const e = (cmvRows as any[])[0];
      const rev = parseFloat(e.totalRev ?? "0");
      const labor = parseFloat(e.totalLabor ?? "0");
      const budget = parseFloat(e.budgetCmvPct ?? "30");
      const actual = rev > 0 ? (labor / rev) * 100 : 0;
      if (actual > budget + 1) {
        const diff = (actual - budget).toFixed(1);
        sugestoes.push({
          id: "cmv-high",
          tipo: "alerta",
          prioridade: actual > budget + 3 ? "alta" : "media",
          categoria: "financeiro",
          titulo: "CMV acima da meta no mês",
          descricao: `CMV acumulado em ${actual.toFixed(1)}% (meta ${budget}%). Falar sobre controle de desperdício, porcionamento e compras desnecessárias.`,
          motivo: `+${diff}pp acima da meta`,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 4. Folha de pagamento estourada ─────────────────────────────────────────
  try {
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const [payRows] = await (db as any).$client.promise().execute(
      `SELECT SUM(CAST(de.revenue AS DECIMAL(15,2))) as totalRev,
              SUM(CAST(de.extraLabor AS DECIMAL(15,2))) as totalExtra,
              s.budgetLaborPct
       FROM daily_entries de
       JOIN stores s ON s.id = de.storeId
       WHERE de.storeId = ? AND de.entryDate >= ?
       GROUP BY s.budgetLaborPct`,
      [storeId, monthStart]
    );
    if ((payRows as any[]).length > 0) {
      const e = (payRows as any[])[0];
      const rev = parseFloat(e.totalRev ?? "0");
      const extra = parseFloat(e.totalExtra ?? "0");
      const budget = parseFloat(e.budgetLaborPct ?? "20");
      const actual = rev > 0 ? (extra / rev) * 100 : 0;
      if (actual > budget + 1) {
        sugestoes.push({
          id: "labor-high",
          tipo: "alerta",
          prioridade: actual > budget + 3 ? "alta" : "media",
          categoria: "financeiro",
          titulo: "Folha de pagamento acima da meta",
          descricao: `Custo de mão de obra em ${actual.toFixed(1)}% da receita (meta ${budget}%). Revisar horas extras e escala da semana.`,
          motivo: `Folha em ${actual.toFixed(1)}% da receita`,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 5. Ações vencidas no Plano de Ação ──────────────────────────────────────
  try {
    const todayStr = today.toISOString().split("T")[0];
    const [actRows] = await (db as any).$client.promise().execute(
      `SELECT COUNT(*) as cnt FROM action_plans
       WHERE storeId = ? AND status != 'done' AND dueDate < ?`,
      [storeId, todayStr]
    );
    const cnt = (actRows as any[])[0]?.cnt ?? 0;
    if (cnt > 0) {
      sugestoes.push({
        id: "overdue-actions",
        tipo: "alerta",
        prioridade: cnt >= 2 ? "alta" : "media",
        categoria: "operacoes",
        titulo: `${cnt} ação(ões) vencida(s) no Plano`,
        descricao: `Revisar as ações em atraso, redistribuir responsabilidades ou ajustar prazos. Não deixar acumular.`,
        motivo: `${cnt} ação(ões) com prazo vencido`,
      });
    }
  } catch { /* ignore */ }

  // ── 6. Treinamento atrasado (>14 dias sem sessão) ────────────────────────────
  try {
    const [trainRows] = await (db as any).$client.promise().execute(
      `SELECT MAX(sessionDate) as lastSession FROM training_sessions
       WHERE storeId = ? AND status = 'realizado'`,
      [storeId]
    );
    const last = (trainRows as any[])[0]?.lastSession;
    if (!last) {
      sugestoes.push({
        id: "no-training",
        tipo: "tema",
        prioridade: "media",
        categoria: "operacoes",
        titulo: "Nenhum treinamento registrado",
        descricao: "Nenhuma sessão de treinamento foi realizada ainda. Aproveitar o pré-turno para um microtreinamento rápido (5 min).",
        motivo: "Sem treinamento registrado",
      });
    } else {
      const daysSince = Math.floor((today.getTime() - new Date(last).getTime()) / 86400000);
      if (daysSince > 14) {
        sugestoes.push({
          id: "training-overdue",
          tipo: "tema",
          prioridade: daysSince > 21 ? "alta" : "media",
          categoria: "operacoes",
          titulo: "Treinamento em atraso",
          descricao: `Último treinamento há ${daysSince} dias. Planejar uma sessão rápida de reciclagem ou novo tema para a equipe.`,
          motivo: `${daysSince} dias sem treinamento`,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 7. Caso publicado no Conselho nas últimas 48h ────────────────────────────
  try {
    const twoDaysAgo = new Date(today); twoDaysAgo.setDate(today.getDate() - 2);
    const since2 = twoDaysAgo.toISOString().split("T")[0];
    const [caseRows] = await (db as any).$client.promise().execute(
      `SELECT title FROM council_cases WHERE caseDate >= ? ORDER BY createdAt DESC LIMIT 1`,
      [since2]
    );
    if ((caseRows as any[]).length > 0) {
      sugestoes.push({
        id: "council-case",
        tipo: "tema",
        prioridade: "baixa",
        categoria: "experiencia",
        titulo: "Caso publicado no Conselho",
        descricao: `Compartilhar com a equipe o caso: "${(caseRows as any[])[0].title}" — reforça a cultura de aprendizado com situações reais.`,
        motivo: "Caso novo no Conselho",
      });
    }
  } catch { /* ignore */ }

  // ── 8. Reivindicação aberta há 7+ dias ───────────────────────────────────────
  try {
    const [reivRows] = await (db as any).$client.promise().execute(
      `SELECT reivindicacao, createdAt FROM preturno_atas
       WHERE storeId = ? AND reivindicacaoStatus = 'nota-pra-depois'
       AND createdAt < DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY createdAt ASC LIMIT 1`,
      [storeId]
    );
    if ((reivRows as any[]).length > 0) {
      const r = (reivRows as any[])[0];
      const days = Math.floor((today.getTime() - new Date(r.createdAt).getTime()) / 86400000);
      sugestoes.push({
        id: "reiv-aberta",
        tipo: "alerta",
        prioridade: days > 14 ? "alta" : "media",
        categoria: "pessoas",
        titulo: "Reivindicação da equipe sem resposta",
        descricao: `"${r.reivindicacao}" — aberta há ${days} dias sem retorno. Dar uma resposta à equipe, mesmo que seja um prazo.`,
        motivo: `Aberta há ${days} dias`,
      });
    }
  } catch { /* ignore */ }

  // ── 9. Aniversariante de admissão na semana ───────────────────────────────────
  try {
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const ddStart = String(today.getDate()).padStart(2, "0");
    const ddEnd = String(Math.min(today.getDate() + 6, 31)).padStart(2, "0");
    const [empRows] = await (db as any).$client.promise().execute(
      `SELECT nome FROM employees
       WHERE storeId = ? AND status = 'ativo'
       AND DATE_FORMAT(admissionDate, '%m-%d') BETWEEN ? AND ?
       LIMIT 3`,
      [storeId, `${mm}-${ddStart}`, `${mm}-${ddEnd}`]
    );
    if ((empRows as any[]).length > 0) {
      const nomes = (empRows as any[]).map((e: any) => e.nome).join(", ");
      sugestoes.push({
        id: "anniversary",
        tipo: "tema",
        prioridade: "baixa",
        categoria: "reconhecimento",
        titulo: "Aniversário de empresa esta semana",
        descricao: `${nomes} ${(empRows as any[]).length === 1 ? "completa" : "completam"} aniversário de empresa esta semana. Reconhecer publicamente no pré-turno.`,
        motivo: `${(empRows as any[]).length} aniversariante(s) de empresa`,
      });
    }
  } catch { /* ignore */ }

  // ── 10. Disciplina baixa no mês atual (<80%) ─────────────────────────────────
  try {
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const stats = await getPreturnoStats(storeId, year, month);
    if (stats.esperadasMes >= 5 && stats.disciplinaPct < 80) {
      sugestoes.push({
        id: "low-discipline",
        tipo: "alerta",
        prioridade: stats.disciplinaPct < 60 ? "alta" : "media",
        categoria: "operacoes",
        titulo: "Disciplina de pré-turno abaixo de 80%",
        descricao: `Apenas ${stats.disciplinaPct}% das reuniões foram realizadas este mês (${stats.realizadasMes}/${stats.esperadasMes}). Reforçar o hábito com a equipe.`,
        motivo: `Disciplina em ${stats.disciplinaPct}% este mês`,
      });
    }
  } catch { /* ignore */ }

  // ── Gatilho 11: Compromisso pendente da Trilha de Aprendizado ────────────────
  try {
    const [pendingRows] = await (db as any).$client.promise().execute(
      `SELECT tc.aula_id, ta.titulo, ta.compromisso_texto
       FROM trilha_compromissos tc
       JOIN trilha_aulas ta ON ta.id = tc.aula_id
       JOIN trilha_progresso tp ON tp.aula_id = tc.aula_id AND tp.user_id = tc.user_id
       WHERE tc.store_id = ? AND tc.feito = 0 AND tp.status = 'concluida'
       ORDER BY tc.created_at DESC
       LIMIT 1`,
      [storeId]
    );
    const pending = Array.isArray(pendingRows) ? pendingRows as any[] : [];
    if (pending.length > 0) {
      const item = pending[0];
      sugestoes.push({
        id: `trilha-compromisso-${item.aula_id}`,
        tipo: "tema",
        prioridade: "media",
        categoria: "pessoas",
        titulo: `Compromisso da Trilha: ${item.titulo}`,
        descricao: item.compromisso_texto ?? "Revisar o compromisso da última aula concluída na trilha de aprendizado.",
        motivo: "Compromisso da trilha ainda não registrado como feito",
      });
    }
  } catch { /* ignore */ }

  // Sort: alta → media → baixa, then alertas before temas
  const prioOrder = { alta: 0, media: 1, baixa: 2 };
  const tipoOrder = { alerta: 0, tema: 1 };
  sugestoes.sort((a, b) => {
    const p = prioOrder[a.prioridade] - prioOrder[b.prioridade];
    if (p !== 0) return p;
    return tipoOrder[a.tipo] - tipoOrder[b.tipo];
  });

  return sugestoes.slice(0, 5); // return top 5
}
