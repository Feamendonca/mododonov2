import { describe, it, expect } from "vitest";

// ─── Pure logic tests for Pré-turno module ────────────────────────────────────

describe("Pré-turno: Disciplina calculation", () => {
  function calcDisciplina(realizadas: number, esperadas: number) {
    return esperadas > 0 ? Math.round((realizadas / esperadas) * 100) : 100;
  }

  it("returns 100% when no meetings expected", () => {
    expect(calcDisciplina(0, 0)).toBe(100);
  });

  it("returns 100% when all meetings realized", () => {
    expect(calcDisciplina(22, 22)).toBe(100);
  });

  it("returns 92% for 22 of 24", () => {
    expect(calcDisciplina(22, 24)).toBe(92);
  });

  it("returns 0% when none realized", () => {
    expect(calcDisciplina(0, 10)).toBe(0);
  });

  it("returns 50% for half realized", () => {
    expect(calcDisciplina(5, 10)).toBe(50);
  });
});

describe("Pré-turno: Estado calculation", () => {
  function calcEstado(
    ataExists: boolean,
    ataStatus: string | null,
    horarioEsperado: string,
    nowHHMM: string,
    toleranciaMinutos: number
  ): "pendente" | "realizado" | "atrasado" | "nao-realizado" {
    if (ataExists && ataStatus) {
      if (ataStatus === "realizada") return "realizado";
      if (ataStatus === "nao-realizada") return "nao-realizado";
      return "atrasado";
    }
    const [eh, em] = horarioEsperado.split(":").map(Number);
    const [nh, nm] = nowHHMM.split(":").map(Number);
    const minutosAtraso = (nh * 60 + nm) - (eh * 60 + em);
    if (minutosAtraso > toleranciaMinutos) return "atrasado";
    return "pendente";
  }

  it("returns 'realizado' when ata exists with status realizada", () => {
    expect(calcEstado(true, "realizada", "08:00", "09:00", 60)).toBe("realizado");
  });

  it("returns 'nao-realizado' when ata exists with status nao-realizada", () => {
    expect(calcEstado(true, "nao-realizada", "08:00", "09:00", 60)).toBe("nao-realizado");
  });

  it("returns 'pendente' when no ata and within tolerance", () => {
    expect(calcEstado(false, null, "08:00", "08:30", 60)).toBe("pendente");
  });

  it("returns 'atrasado' when no ata and past tolerance", () => {
    expect(calcEstado(false, null, "08:00", "09:30", 60)).toBe("atrasado");
  });

  it("returns 'atrasado' exactly at tolerance boundary +1", () => {
    expect(calcEstado(false, null, "08:00", "09:01", 60)).toBe("atrasado");
  });

  it("returns 'pendente' exactly at tolerance boundary", () => {
    expect(calcEstado(false, null, "08:00", "09:00", 60)).toBe("pendente");
  });
});

describe("Pré-turno: Reivindicações abertas", () => {
  function countReivindicacoesAbertas(atas: { reivindicacao: string | null; reivindicacaoStatus: string | null }[]) {
    return atas.filter(a => a.reivindicacao && a.reivindicacaoStatus === "nota-pra-depois").length;
  }

  it("counts only nota-pra-depois reivindicacoes", () => {
    const atas = [
      { reivindicacao: "Uniforme rasgado", reivindicacaoStatus: "nota-pra-depois" },
      { reivindicacao: "Falta de material", reivindicacaoStatus: "tratada-na-hora" },
      { reivindicacao: "Escala ruim", reivindicacaoStatus: "nota-pra-depois" },
      { reivindicacao: null, reivindicacaoStatus: null },
    ];
    expect(countReivindicacoesAbertas(atas)).toBe(2);
  });

  it("returns 0 when no open reivindicacoes", () => {
    const atas = [
      { reivindicacao: "Algo", reivindicacaoStatus: "tratada-na-hora" },
      { reivindicacao: null, reivindicacaoStatus: null },
    ];
    expect(countReivindicacoesAbertas(atas)).toBe(0);
  });
});

describe("Pré-turno: Quem mais conduziu", () => {
  function quemMaisConduziu(atas: { condutorNome: string | null }[]) {
    const count: Record<string, number> = {};
    for (const a of atas) {
      if (a.condutorNome) count[a.condutorNome] = (count[a.condutorNome] ?? 0) + 1;
    }
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return top ? { nome: top[0], count: top[1] } : null;
  }

  it("returns the person who conducted the most", () => {
    const atas = [
      { condutorNome: "Maria" },
      { condutorNome: "Maria" },
      { condutorNome: "Carlos" },
      { condutorNome: "Maria" },
      { condutorNome: "Carlos" },
    ];
    const result = quemMaisConduziu(atas);
    expect(result?.nome).toBe("Maria");
    expect(result?.count).toBe(3);
  });

  it("returns null when no atas with conductor", () => {
    expect(quemMaisConduziu([{ condutorNome: null }])).toBeNull();
  });
});

describe("Pré-turno: Config diasDaSemana filter", () => {
  function reunioesEsperadasHoje(
    configs: { diasDaSemana: number[]; ativa: boolean }[],
    todayDow: number
  ) {
    return configs.filter(c => c.ativa && c.diasDaSemana.includes(todayDow));
  }

  it("returns configs active on given day", () => {
    const configs = [
      { diasDaSemana: [1, 2, 3, 4, 5], ativa: true },   // weekdays
      { diasDaSemana: [0, 6], ativa: true },              // weekend
      { diasDaSemana: [1, 2, 3, 4, 5], ativa: false },   // inactive
    ];
    // Monday = 1
    expect(reunioesEsperadasHoje(configs, 1)).toHaveLength(1);
    // Sunday = 0
    expect(reunioesEsperadasHoje(configs, 0)).toHaveLength(1);
    // Saturday = 6
    expect(reunioesEsperadasHoje(configs, 6)).toHaveLength(1);
  });

  it("returns empty when no configs match today", () => {
    const configs = [
      { diasDaSemana: [1, 2, 3, 4, 5], ativa: true },
    ];
    // Sunday = 0 — not in weekdays
    expect(reunioesEsperadasHoje(configs, 0)).toHaveLength(0);
  });
});

// ─── Suggestion engine pure logic tests ──────────────────────────────────────

describe("Pré-turno: Sugestões — prioridade por CMV", () => {
  function cmvSugestao(actualPct: number, budgetPct: number): { prioridade: "alta" | "media" | null } {
    if (actualPct <= budgetPct + 1) return { prioridade: null };
    return { prioridade: actualPct > budgetPct + 3 ? "alta" : "media" };
  }

  it("returns null when CMV within budget +1pp", () => {
    expect(cmvSugestao(30.5, 30)).toEqual({ prioridade: null });
  });

  it("returns media when CMV is budget +2pp", () => {
    expect(cmvSugestao(32, 30)).toEqual({ prioridade: "media" });
  });

  it("returns alta when CMV is budget +4pp", () => {
    expect(cmvSugestao(34, 30)).toEqual({ prioridade: "alta" });
  });
});

describe("Pré-turno: Sugestões — prioridade por treinamento atrasado", () => {
  function trainingSugestao(daysSinceLast: number | null): { prioridade: "alta" | "media" | "media-no-training" | null } {
    if (daysSinceLast === null) return { prioridade: "media-no-training" };
    if (daysSinceLast <= 14) return { prioridade: null };
    return { prioridade: daysSinceLast > 21 ? "alta" : "media" };
  }

  it("returns null when training was 10 days ago", () => {
    expect(trainingSugestao(10)).toEqual({ prioridade: null });
  });

  it("returns media when training was 15 days ago", () => {
    expect(trainingSugestao(15)).toEqual({ prioridade: "media" });
  });

  it("returns alta when training was 22 days ago", () => {
    expect(trainingSugestao(22)).toEqual({ prioridade: "alta" });
  });

  it("returns media-no-training when no training ever", () => {
    expect(trainingSugestao(null)).toEqual({ prioridade: "media-no-training" });
  });
});

describe("Pré-turno: Sugestões — prioridade por ações vencidas", () => {
  function actionsSugestao(overdueCount: number): { prioridade: "alta" | "media" | null } {
    if (overdueCount === 0) return { prioridade: null };
    return { prioridade: overdueCount >= 2 ? "alta" : "media" };
  }

  it("returns null when no overdue actions", () => {
    expect(actionsSugestao(0)).toEqual({ prioridade: null });
  });

  it("returns media for 1 overdue action", () => {
    expect(actionsSugestao(1)).toEqual({ prioridade: "media" });
  });

  it("returns alta for 2+ overdue actions", () => {
    expect(actionsSugestao(2)).toEqual({ prioridade: "alta" });
    expect(actionsSugestao(5)).toEqual({ prioridade: "alta" });
  });
});

describe("Pré-turno: Sugestões — ordenação por prioridade", () => {
  type Sug = { prioridade: "alta" | "media" | "baixa"; tipo: "alerta" | "tema" };

  function sortSugestoes(sugestoes: Sug[]): Sug[] {
    const prioOrder = { alta: 0, media: 1, baixa: 2 };
    const tipoOrder = { alerta: 0, tema: 1 };
    return [...sugestoes].sort((a, b) => {
      const p = prioOrder[a.prioridade] - prioOrder[b.prioridade];
      if (p !== 0) return p;
      return tipoOrder[a.tipo] - tipoOrder[b.tipo];
    });
  }

  it("sorts alta before media before baixa", () => {
    const input: Sug[] = [
      { prioridade: "baixa", tipo: "tema" },
      { prioridade: "alta", tipo: "alerta" },
      { prioridade: "media", tipo: "alerta" },
    ];
    const sorted = sortSugestoes(input);
    expect(sorted[0].prioridade).toBe("alta");
    expect(sorted[1].prioridade).toBe("media");
    expect(sorted[2].prioridade).toBe("baixa");
  });

  it("within same priority, alertas come before temas", () => {
    const input: Sug[] = [
      { prioridade: "media", tipo: "tema" },
      { prioridade: "media", tipo: "alerta" },
    ];
    const sorted = sortSugestoes(input);
    expect(sorted[0].tipo).toBe("alerta");
    expect(sorted[1].tipo).toBe("tema");
  });
});

describe("Pré-turno: Sugestões — reclamações abertas", () => {
  function complaintsSugestao(openCount: number): { prioridade: "alta" | "media" | null } {
    if (openCount === 0) return { prioridade: null };
    return { prioridade: openCount >= 3 ? "alta" : "media" };
  }

  it("returns null when no open complaints", () => {
    expect(complaintsSugestao(0)).toEqual({ prioridade: null });
  });

  it("returns media for 1-2 open complaints", () => {
    expect(complaintsSugestao(1)).toEqual({ prioridade: "media" });
    expect(complaintsSugestao(2)).toEqual({ prioridade: "media" });
  });

  it("returns alta for 3+ open complaints", () => {
    expect(complaintsSugestao(3)).toEqual({ prioridade: "alta" });
  });
});

// ─── Disciplina Ranking logic tests ──────────────────────────────────────────

describe("Pré-turno: Disciplina Ranking — sorting", () => {
  type RankRow = { storeId: number; storeName: string; disciplinaPct: number; hasConfig: boolean };

  function sortRanking(rows: RankRow[]): RankRow[] {
    return [...rows].sort((a, b) => b.disciplinaPct - a.disciplinaPct);
  }

  function avgDisciplina(rows: RankRow[]): number {
    const withConfig = rows.filter((r) => r.hasConfig);
    if (withConfig.length === 0) return 0;
    return Math.round(withConfig.reduce((s, r) => s + r.disciplinaPct, 0) / withConfig.length);
  }

  it("sorts stores by disciplinaPct descending", () => {
    const rows: RankRow[] = [
      { storeId: 1, storeName: "A", disciplinaPct: 60, hasConfig: true },
      { storeId: 2, storeName: "B", disciplinaPct: 95, hasConfig: true },
      { storeId: 3, storeName: "C", disciplinaPct: 75, hasConfig: true },
    ];
    const sorted = sortRanking(rows);
    expect(sorted[0].disciplinaPct).toBe(95);
    expect(sorted[1].disciplinaPct).toBe(75);
    expect(sorted[2].disciplinaPct).toBe(60);
  });

  it("calculates average only for stores with config", () => {
    const rows: RankRow[] = [
      { storeId: 1, storeName: "A", disciplinaPct: 80, hasConfig: true },
      { storeId: 2, storeName: "B", disciplinaPct: 60, hasConfig: true },
      { storeId: 3, storeName: "C", disciplinaPct: 0, hasConfig: false }, // no config, excluded
    ];
    expect(avgDisciplina(rows)).toBe(70); // (80+60)/2
  });

  it("returns 0 average when no stores have config", () => {
    const rows: RankRow[] = [
      { storeId: 1, storeName: "A", disciplinaPct: 0, hasConfig: false },
    ];
    expect(avgDisciplina(rows)).toBe(0);
  });
});

describe("Pré-turno: Today status logic", () => {
  type AtaEstado = { configId: number | null; estado: "realizado" | "pendente" | "atrasado" | "nao-realizado" };

  function calcTodayStatus(
    todayConfigIds: number[],
    atasHoje: AtaEstado[]
  ): "realizado" | "pendente" | "sem-config" {
    if (todayConfigIds.length === 0) return "sem-config";
    const allDone = todayConfigIds.every((cfgId) => {
      const estado = atasHoje.find((a) => a.configId === cfgId);
      return estado?.estado === "realizado";
    });
    return allDone ? "realizado" : "pendente";
  }

  it("returns sem-config when no configs for today", () => {
    expect(calcTodayStatus([], [])).toBe("sem-config");
  });

  it("returns realizado when all configs have realizado ata", () => {
    const atas: AtaEstado[] = [
      { configId: 1, estado: "realizado" },
      { configId: 2, estado: "realizado" },
    ];
    expect(calcTodayStatus([1, 2], atas)).toBe("realizado");
  });

  it("returns pendente when any config is missing ata", () => {
    const atas: AtaEstado[] = [
      { configId: 1, estado: "realizado" },
    ];
    expect(calcTodayStatus([1, 2], atas)).toBe("pendente"); // config 2 missing
  });

  it("returns pendente when ata exists but is not realizado", () => {
    const atas: AtaEstado[] = [
      { configId: 1, estado: "atrasado" },
    ];
    expect(calcTodayStatus([1], atas)).toBe("pendente");
  });
});
