/**
 * escala-assistente.test.ts — lógica pura do "Assistente de configuração"
 *
 * Testa `client/src/lib/escala-assistente.ts`: `avaliarPassos`,
 * `podeGerarEscala`, `escalasDisponiveis` e
 * `regrasPendentesDeConfirmacao`. Roda em `environment: "node"`
 * (vitest.config.ts — sem jsdom/RTL, ver ruling R19 em task-6-brief.md):
 * zero React aqui, só lógica.
 */
import { describe, expect, it } from "vitest";
import {
  avaliarPassos,
  escalasDisponiveis,
  FormatoDataInvalidoError,
  podeGerarEscala,
  regrasPendentesDeConfirmacao,
  type EscalaCatalogoItem,
  type EstadoAssistente,
  type RegraResolvidaLike,
} from "./escala-assistente";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function regraRede(overrides: Partial<RegraResolvidaLike> = {}): RegraResolvidaLike {
  return {
    chave: "domingos_folga_mulher_mes",
    valor: 2,
    tipo: "DEPENDE_CCT",
    fonte: "CLT art. 386",
    escopo: "rede",
    ...overrides,
  };
}

function estadoCompleto(): EstadoAssistente {
  return {
    horario: { isLoading: false, data: { operationStartHour: 8, operationEndHour: 23 } },
    blocos: { isLoading: false, data: [{ id: 1 }, { id: 2 }] },
    funcoes: { isLoading: false, data: [{ id: 1 }] },
    regras: {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DURA", escopo: "rede" })],
        avisoUfAusente: false,
        aviso: null,
      },
    },
  };
}

// 2 das entradas reais do catálogo (server/escala-catalogo-seed.ts) — forma
// mínima, só os campos que `escalasDisponiveis` usa.
const CATALOGO_FIXTURE: EscalaCatalogoItem[] = [
  {
    codigo: "6x1",
    nome: "6x1 — 6 dias de trabalho, 1 de descanso",
    vigenciaInicio: null,
    vigenciaFim: "2026-12-15",
    observacaoLegal:
      "Encerra em 15/12/2026: a EC 141/2026 torna obrigatório o 2º repouso semanal a partir de 16/12/2026, o que é incompatível com 1 dia de folga por semana.",
  },
  {
    codigo: "4x3",
    nome: "4x3 — 4 dias de trabalho, 3 de descanso",
    vigenciaInicio: null,
    vigenciaFim: null,
    observacaoLegal: "40h/semana — não depende da data da EC 141/2026.",
  },
];

// ─── avaliarPassos ──────────────────────────────────────────────────────────

describe("avaliarPassos", () => {
  it("mostra os 4 passos: horário de funcionamento, blocos, funções, regras", () => {
    const passos = avaliarPassos(estadoCompleto());
    expect(passos.map((p) => p.passo)).toEqual(["horario", "blocos", "funcoes", "regras"]);
    expect(passos.map((p) => p.titulo)).toEqual([
      "Horário de funcionamento",
      "Blocos de turno",
      "Funções",
      "Regras",
    ]);
  });

  it("todo passo tem razão preenchida, completo ou não", () => {
    for (const passo of avaliarPassos(estadoCompleto())) {
      expect(passo.razao.length).toBeGreaterThan(0);
    }
  });

  it("marca horário como incompleto enquanto a query carrega", () => {
    const estado = estadoCompleto();
    estado.horario = { isLoading: true, data: undefined };
    const [horario] = avaliarPassos(estado);
    expect(horario.completo).toBe(false);
    expect(horario.razao).toMatch(/carregando/i);
  });

  it("marca horário como incompleto quando fechamento não é depois da abertura", () => {
    const estado = estadoCompleto();
    estado.horario = { isLoading: false, data: { operationStartHour: 10, operationEndHour: 10 } };
    const [horario] = avaliarPassos(estado);
    expect(horario.completo).toBe(false);
  });

  it("marca blocos como incompleto quando não há nenhum bloco cadastrado", () => {
    const estado = estadoCompleto();
    estado.blocos = { isLoading: false, data: [] };
    const [, blocos] = avaliarPassos(estado);
    expect(blocos.completo).toBe(false);
    expect(blocos.razao).toMatch(/nenhum bloco/i);
  });

  it("marca funções como incompleto quando não há nenhuma função cadastrada", () => {
    const estado = estadoCompleto();
    estado.funcoes = { isLoading: false, data: [] };
    const [, , funcoes] = avaliarPassos(estado);
    expect(funcoes.completo).toBe(false);
    expect(funcoes.razao).toMatch(/nenhuma função/i);
  });

  it("marca o passo de regras como pendente quando há DEPENDE_CCT não confirmada", () => {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DEPENDE_CCT", escopo: "rede" })],
        avisoUfAusente: false,
        aviso: null,
      },
    };
    const passos = avaliarPassos(estado);
    const regras = passos[3];
    expect(regras.completo).toBe(false);
    expect(regras.razao).toMatch(/depende(m)? da convenção coletiva|CCT/i);
    expect(regras.razao).toContain("domingos_folga_mulher_mes");
  });

  it("marca o passo de regras como completo quando a DEPENDE_CCT já foi confirmada (escopo loja)", () => {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DEPENDE_CCT", escopo: "loja" })],
        avisoUfAusente: false,
        aviso: null,
      },
    };
    const passos = avaliarPassos(estado);
    expect(passos[3].completo).toBe(true);
  });

  it("nunca engole o aviso de UF ausente — aparece mesmo com o passo de regras completo", () => {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DURA", escopo: "rede" })],
        avisoUfAusente: true,
        aviso: "Esta loja não tem estado (UF) cadastrado; regras estaduais não estão sendo aplicadas — somente as regras de rede.",
      },
    };
    const passos = avaliarPassos(estado);
    const regras = passos[3];
    expect(regras.completo).toBe(true);
    expect(regras.avisoExtra).toMatch(/UF/);
  });

  it("aviso de UF aparece mesmo quando o passo de regras está incompleto por pendência de CCT", () => {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DEPENDE_CCT", escopo: "rede" })],
        avisoUfAusente: true,
        aviso: "Esta loja não tem estado (UF) cadastrado; regras estaduais não estão sendo aplicadas — somente as regras de rede.",
      },
    };
    const [, , , regras] = avaliarPassos(estado);
    expect(regras.completo).toBe(false);
    expect(regras.avisoExtra).toMatch(/UF/);
  });
});

// ─── podeGerarEscala ────────────────────────────────────────────────────────

describe("podeGerarEscala", () => {
  it("libera quando os 4 passos estão completos", () => {
    const passos = avaliarPassos(estadoCompleto());
    expect(podeGerarEscala(passos)).toBe(true);
  });

  it("não libera 'Gerar escala' enquanto houver passo incompleto", () => {
    const estado = estadoCompleto();
    estado.blocos = { isLoading: false, data: [] };
    const passos = avaliarPassos(estado);
    expect(podeGerarEscala(passos)).toBe(false);
  });

  it("não libera com lista vazia de passos (ausência de avaliação não é 'tudo ok')", () => {
    expect(podeGerarEscala([])).toBe(false);
  });

  it("não libera quando só falta confirmar uma regra DEPENDE_CCT", () => {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DEPENDE_CCT", escopo: "rede" })],
        avisoUfAusente: false,
        aviso: null,
      },
    };
    expect(podeGerarEscala(avaliarPassos(estado))).toBe(false);
  });
});

// ─── regrasPendentesDeConfirmacao ───────────────────────────────────────────

describe("regrasPendentesDeConfirmacao", () => {
  it("inclui DEPENDE_CCT com escopo rede ou uf", () => {
    const regras = [
      regraRede({ chave: "a", tipo: "DEPENDE_CCT", escopo: "rede" }),
      regraRede({ chave: "b", tipo: "DEPENDE_CCT", escopo: "uf" }),
    ];
    expect(regrasPendentesDeConfirmacao(regras).map((r) => r.chave)).toEqual(["a", "b"]);
  });

  it("exclui DEPENDE_CCT já confirmada (escopo loja)", () => {
    const regras = [regraRede({ chave: "a", tipo: "DEPENDE_CCT", escopo: "loja" })];
    expect(regrasPendentesDeConfirmacao(regras)).toEqual([]);
  });

  it("exclui regras DURA e MOLE, mesmo com escopo rede/uf", () => {
    const regras = [
      regraRede({ chave: "a", tipo: "DURA", escopo: "rede" }),
      regraRede({ chave: "b", tipo: "MOLE", escopo: "uf" }),
    ];
    expect(regrasPendentesDeConfirmacao(regras)).toEqual([]);
  });
});

// ─── escalasDisponiveis ─────────────────────────────────────────────────────

describe("escalasDisponiveis", () => {
  it("avisa que a 6x1 não está disponível a partir de 16/12/2026, citando a EC 141", () => {
    const resultado = escalasDisponiveis(CATALOGO_FIXTURE, "2026-12-16");
    const seisPorUm = resultado.find((r) => r.codigo === "6x1")!;
    expect(seisPorUm.disponivel).toBe(false);
    expect(seisPorUm.razao).toMatch(/EC 141/);
  });

  it("a 6x1 ainda está disponível um dia antes do corte (15/12/2026)", () => {
    const resultado = escalasDisponiveis(CATALOGO_FIXTURE, "2026-12-15");
    const seisPorUm = resultado.find((r) => r.codigo === "6x1")!;
    expect(seisPorUm.disponivel).toBe(true);
  });

  it("não exclui um regime sem limite de vigência (4x3)", () => {
    const resultado = escalasDisponiveis(CATALOGO_FIXTURE, "2030-01-01");
    const quatroPorTres = resultado.find((r) => r.codigo === "4x3")!;
    expect(quatroPorTres.disponivel).toBe(true);
  });

  it("toda entrada (disponível ou não) tem razão preenchida", () => {
    const resultado = escalasDisponiveis(CATALOGO_FIXTURE, "2026-12-16");
    for (const item of resultado) {
      expect(item.razao.length).toBeGreaterThan(0);
    }
  });

  it("rejeita data fora do formato ISO (não compara '20/01/2028' por acaso)", () => {
    expect(() => escalasDisponiveis(CATALOGO_FIXTURE, "16/12/2026")).toThrow(FormatoDataInvalidoError);
  });

  it("respeita o início de vigência — um regime não aparece disponível antes de começar", () => {
    const catalogo: EscalaCatalogoItem[] = [
      {
        codigo: "5x2",
        nome: "5x2 (42h, pós EC 141)",
        vigenciaInicio: "2026-12-16",
        vigenciaFim: "2027-12-15",
        observacaoLegal: "Padrão novo pós-EC 141/2026.",
      },
    ];
    const resultado = escalasDisponiveis(catalogo, "2026-11-19");
    expect(resultado[0].disponivel).toBe(false);
  });
});
