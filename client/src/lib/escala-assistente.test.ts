/**
 * escala-assistente.test.ts — lógica pura do "Assistente de configuração"
 *
 * Testa `client/src/lib/escala-assistente.ts`: `avaliarPassos`,
 * `podeGerarEscala`, `escalasDisponiveis` e
 * `regrasPendentesDeConfirmacao`. Roda em `environment: "node"`
 * (vitest.config.ts — sem jsdom/RTL, ver ruling R19 em task-6-brief.md):
 * zero React aqui, só lógica.
 *
 * R23 e R24 (revisão da Task 6) — dois blocos de teste novos/reescritos:
 *  - R23: o passo de horário só é completo com `configurado: true` — os
 *    defaults do servidor (valores numericamente válidos) não bastam.
 *  - R24: confirmar uma `DEPENDE_CCT` é uma entrada SEPARADA
 *    (`chavesConfirmadas`), nunca inferida do `escopo` da regra resolvida
 *    — e o cenário central do achado: confirmar não trava o valor; quando
 *    a regra de rede muda, o passo continua completo (a chave continua
 *    confirmada) mas o VALOR mostrado é o novo, não o antigo.
 */
import { describe, expect, it } from "vitest";
import {
  avaliarPassos,
  escalasDisponiveis,
  FormatoDataInvalidoError,
  podeGerarEscala,
  regrasPendentesDeConfirmacao,
  validarHorarioFuncionamento,
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
    horario: {
      isLoading: false,
      // R30: completo exige configurado=true E o carimbo de confirmação.
      data: {
        operationStartHour: 8,
        operationEndHour: 23,
        configurado: true,
        horarioConfirmadoEm: "2026-11-19T12:00:00.000Z",
      },
    },
    blocos: { isLoading: false, data: [{ id: 1 }, { id: 2 }] },
    funcoes: { isLoading: false, data: [{ id: 1 }] },
    regras: {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DURA", escopo: "rede" })],
        chavesConfirmadas: [],
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

// ─── validarHorarioFuncionamento ───────────────────────────────────────────
//
// I1 (revisão da Task 6): esta regra — inclusive a checagem cruzada
// "fechamento depois da abertura" — vivia só em
// AssistenteConfiguracao.tsx, sem teste (ruling R19) e sem equivalente no
// servidor. Movida para aqui e espelhada em `pessoas.saveConfig`
// (server/routers/pessoas.ts, via `.refine()` — ver
// server/pessoas-saveconfig-horario.test.ts para o lado do servidor).

describe("validarHorarioFuncionamento", () => {
  it("não gera erro para um horário válido", () => {
    expect(validarHorarioFuncionamento({ operationStartHour: 8, operationEndHour: 23 })).toEqual([]);
  });

  it("rejeita fechamento igual à abertura", () => {
    const erros = validarHorarioFuncionamento({ operationStartHour: 10, operationEndHour: 10 });
    expect(erros.some((e) => /fechamento.*depois.*abertura/i.test(e))).toBe(true);
  });

  it("rejeita fechamento antes da abertura", () => {
    const erros = validarHorarioFuncionamento({ operationStartHour: 23, operationEndHour: 8 });
    expect(erros.some((e) => /fechamento.*depois.*abertura/i.test(e))).toBe(true);
  });

  it("rejeita abertura fora da faixa (negativa)", () => {
    const erros = validarHorarioFuncionamento({ operationStartHour: -1, operationEndHour: 23 });
    expect(erros.some((e) => /abertura/i.test(e))).toBe(true);
  });

  it("rejeita abertura fora da faixa (>23)", () => {
    const erros = validarHorarioFuncionamento({ operationStartHour: 24, operationEndHour: 24 });
    expect(erros.some((e) => /abertura/i.test(e))).toBe(true);
  });

  it("rejeita fechamento fora da faixa (0)", () => {
    const erros = validarHorarioFuncionamento({ operationStartHour: 0, operationEndHour: 0 });
    expect(erros.some((e) => /fechamento/i.test(e))).toBe(true);
  });

  it("rejeita fechamento fora da faixa (>24)", () => {
    const erros = validarHorarioFuncionamento({ operationStartHour: 8, operationEndHour: 25 });
    expect(erros.some((e) => /fechamento/i.test(e))).toBe(true);
  });

  it("rejeita valores não-inteiros", () => {
    const erros = validarHorarioFuncionamento({ operationStartHour: 8.5, operationEndHour: 23 });
    expect(erros.length).toBeGreaterThan(0);
  });

  it("não duplica o erro de 'fechamento depois da abertura' quando um dos dois já está fora de faixa", () => {
    // abertura invalida (30) — o problema real é a faixa, não a comparação
    // cruzada; não deveria aparecer a mensagem de "fechamento precisa ser
    // depois" junto, que seria redundante e confusa.
    const erros = validarHorarioFuncionamento({ operationStartHour: 30, operationEndHour: 5 });
    expect(erros.some((e) => /fechamento.*depois.*abertura/i.test(e))).toBe(false);
  });

  it("aceita o limite máximo (abertura 0, fechamento 24 — loja 24h)", () => {
    expect(validarHorarioFuncionamento({ operationStartHour: 0, operationEndHour: 24 })).toEqual([]);
  });
});

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
    estado.horario = {
      isLoading: false,
      data: { operationStartHour: 10, operationEndHour: 10, configurado: true, horarioConfirmadoEm: "2026-11-19T12:00:00.000Z" },
    };
    const [horario] = avaliarPassos(estado);
    expect(horario.completo).toBe(false);
  });

  // 🔴 R23 — o achado mais direto da revisão: defaults válidos não são
  // configuração.
  it("R23: marca horário como INCOMPLETO quando configurado=false, mesmo com valores numéricos válidos (defaults do servidor)", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: { operationStartHour: 8, operationEndHour: 23, configurado: false, horarioConfirmadoEm: null },
    };
    const [horario] = avaliarPassos(estado);
    expect(horario.completo).toBe(false);
    expect(horario.razao).toMatch(/ainda não confirmou|padrão/i);
  });

  it("R23: marca horário como COMPLETO quando configurado=true e os valores são válidos", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: { operationStartHour: 7, operationEndHour: 22, configurado: true, horarioConfirmadoEm: "2026-11-19T12:00:00.000Z" },
    };
    const [horario] = avaliarPassos(estado);
    expect(horario.completo).toBe(true);
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
        chavesConfirmadas: [],
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

  it("marca o passo de regras como completo quando a DEPENDE_CCT já está em chavesConfirmadas", () => {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DEPENDE_CCT", escopo: "rede" })],
        chavesConfirmadas: ["domingos_folga_mulher_mes"],
        avisoUfAusente: false,
        aviso: null,
      },
    };
    const passos = avaliarPassos(estado);
    expect(passos[3].completo).toBe(true);
  });

  // 🔴 R24 — o cenário central do achado: confirmar não pode travar o
  // valor. A regra de rede muda (valor 2 → 3, ex.: a CCT nova exige mais
  // domingos de folga) mas a chave continua confirmada — o passo continua
  // completo, e quem lê `passos[3]` nunca vê o valor antigo em lugar
  // nenhum (esta função nem carrega valor — só decide completude; o valor
  // exibido pela tela vem direto de `regras`, que já é o novo).
  it("R24: a chave continua confirmada quando a regra de rede muda de valor — a confirmação não trava o valor antigo", () => {
    const estadoAntes = estadoCompleto();
    estadoAntes.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DEPENDE_CCT", escopo: "rede", valor: 2 })],
        chavesConfirmadas: ["domingos_folga_mulher_mes"],
        avisoUfAusente: false,
        aviso: null,
      },
    };
    const passosAntes = avaliarPassos(estadoAntes);
    expect(passosAntes[3].completo).toBe(true);

    // A regra de rede "mudou" (EC 141 em ação): mesma chave, valor novo,
    // ainda escopo rede — `chavesConfirmadas` não mudou (ninguém reconfirmou
    // nada), e mesmo assim o passo continua completo.
    const estadoDepois = estadoCompleto();
    estadoDepois.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DEPENDE_CCT", escopo: "rede", valor: 3 })],
        chavesConfirmadas: ["domingos_folga_mulher_mes"],
        avisoUfAusente: false,
        aviso: null,
      },
    };
    const passosDepois = avaliarPassos(estadoDepois);
    expect(passosDepois[3].completo).toBe(true);
    // E a regra que o resolvedor devolveu para este estado é a NOVA (valor
    // 3) — prova de que nada nesta função fixou o valor 2 em lugar algum.
    expect(estadoDepois.regras.data!.regras[0].valor).toBe(3);
  });

  it("nunca engole o aviso de UF ausente — aparece mesmo com o passo de regras completo", () => {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: {
        regras: [regraRede({ tipo: "DURA", escopo: "rede" })],
        chavesConfirmadas: [],
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
        chavesConfirmadas: [],
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
        chavesConfirmadas: [],
        avisoUfAusente: false,
        aviso: null,
      },
    };
    expect(podeGerarEscala(avaliarPassos(estado))).toBe(false);
  });

  it("R23: não libera com o horário usando defaults não confirmados (configurado=false)", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: { operationStartHour: 8, operationEndHour: 23, configurado: false, horarioConfirmadoEm: null },
    };
    expect(podeGerarEscala(avaliarPassos(estado))).toBe(false);
  });
});

// ─── regrasPendentesDeConfirmacao ───────────────────────────────────────────

describe("regrasPendentesDeConfirmacao", () => {
  it("inclui DEPENDE_CCT cuja chave NÃO está em chavesConfirmadas", () => {
    const regras = [
      regraRede({ chave: "a", tipo: "DEPENDE_CCT", escopo: "rede" }),
      regraRede({ chave: "b", tipo: "DEPENDE_CCT", escopo: "uf" }),
    ];
    expect(regrasPendentesDeConfirmacao(regras, []).map((r) => r.chave)).toEqual(["a", "b"]);
  });

  it("exclui DEPENDE_CCT cuja chave está em chavesConfirmadas", () => {
    const regras = [regraRede({ chave: "a", tipo: "DEPENDE_CCT", escopo: "rede" })];
    expect(regrasPendentesDeConfirmacao(regras, ["a"])).toEqual([]);
  });

  it("exclui regras DURA e MOLE, mesmo sem estarem em chavesConfirmadas", () => {
    const regras = [
      regraRede({ chave: "a", tipo: "DURA", escopo: "rede" }),
      regraRede({ chave: "b", tipo: "MOLE", escopo: "uf" }),
    ];
    expect(regrasPendentesDeConfirmacao(regras, [])).toEqual([]);
  });

  it("aceita um Set em vez de array para chavesConfirmadas", () => {
    const regras = [regraRede({ chave: "a", tipo: "DEPENDE_CCT", escopo: "rede" })];
    expect(regrasPendentesDeConfirmacao(regras, new Set(["a"]))).toEqual([]);
  });

  // 🔴 R24 — não existe mais caminho para "escopo loja" significar
  // confirmado: só `chavesConfirmadas` decide. Uma regra resolvida em
  // escopo loja (ex.: uma MOLE que a própria loja cadastrou por outro
  // motivo, nada a ver com confirmação) não é, por si só, uma confirmação.
  it("R24: escopo 'loja' sozinho NÃO confirma nada — só chavesConfirmadas decide", () => {
    const regras = [regraRede({ chave: "a", tipo: "DEPENDE_CCT", escopo: "loja" })];
    expect(regrasPendentesDeConfirmacao(regras, []).map((r) => r.chave)).toEqual(["a"]);
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

// ─── 🔴 R28 (C3 da review final): zero regras = INCOMPLETO ───────────────────
//
// Zero regras vigentes ⇒ zero pendentes ⇒ a versão anterior marcava o passo
// como COMPLETO, com a razão "Todas as regras legais vigentes foram
// revisadas", e `podeGerarEscala` virava true. Combinado com o seed que
// nunca rodava (C2/R27), esse era o estado do DIA 1: quatro passos verdes
// afirmando que a lei foi conferida, sem nenhuma lei carregada.

describe("avaliarPassos — R28: catálogo legal vazio nunca conta como revisado", () => {
  function estadoSemRegras(): EstadoAssistente {
    const estado = estadoCompleto();
    estado.regras = {
      isLoading: false,
      data: { regras: [], chavesConfirmadas: [], avisoUfAusente: false, aviso: null },
    };
    return estado;
  }

  it("lista de regras vazia → passo INCOMPLETO, com razão explícita de catálogo não semeado", () => {
    const [, , , regras] = avaliarPassos(estadoSemRegras());
    expect(regras.completo).toBe(false);
    expect(regras.razao).toMatch(/Nenhuma regra legal carregada/i);
    expect(regras.razao).toMatch(/escala:seed/);
    // E jamais a frase de conformidade do caminho feliz.
    expect(regras.razao).not.toMatch(/foram revisadas/i);
  });

  it("lista de regras vazia → 'Gerar escala' continua bloqueado", () => {
    expect(podeGerarEscala(avaliarPassos(estadoSemRegras()))).toBe(false);
  });

  it("o aviso de UF ausente continua aparecendo mesmo no estado de catálogo vazio", () => {
    const estado = estadoSemRegras();
    estado.regras.data!.avisoUfAusente = true;
    estado.regras.data!.aviso = "Esta loja não tem estado (UF) cadastrado; regras estaduais não estão sendo aplicadas — somente as regras de rede.";
    const [, , , regras] = avaliarPassos(estado);
    expect(regras.completo).toBe(false);
    expect(regras.avisoExtra).toMatch(/UF/);
  });

  it("com pelo menos uma regra vigente e nada pendente, o passo volta a ser completo (o caminho feliz segue intacto)", () => {
    const [, , , regras] = avaliarPassos(estadoCompleto());
    expect(regras.completo).toBe(true);
    expect(regras.razao).toMatch(/foram revisadas/i);
  });
});

// ─── 🔴 R30 (I9 da review final): `configurado` ≠ confirmação do gerente ─────
//
// `configurado` prova que existe uma LINHA em `store_people_config`. Toda
// loja que já salvou encargos/meta de folha no modal antigo de Pessoas tem
// linha — e entrava no assistente com o passo 1 verde e 8h-23h herdados do
// DEFAULT da coluna, que ninguém decidiu. Só o carimbo
// `horarioConfirmadoEm` (migration 0035) é prova de confirmação.

describe("avaliarPassos — R30: passo 1 exige o carimbo de confirmação, não só a linha", () => {
  it("configurado=true SEM carimbo → INCOMPLETO (loja que só mexeu em encargos pelo modal antigo)", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: { operationStartHour: 8, operationEndHour: 23, configurado: true, horarioConfirmadoEm: null },
    };
    const [horario] = avaliarPassos(estado);
    expect(horario.completo).toBe(false);
    expect(horario.razao).toMatch(/ninguém confirmou o horário/i);
  });

  it("configurado=true SEM carimbo → 'Gerar escala' continua bloqueado", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: { operationStartHour: 8, operationEndHour: 23, configurado: true, horarioConfirmadoEm: null },
    };
    expect(podeGerarEscala(avaliarPassos(estado))).toBe(false);
  });

  it("com carimbo (string ISO) e valores válidos → COMPLETO", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: {
        operationStartHour: 9,
        operationEndHour: 22,
        configurado: true,
        horarioConfirmadoEm: "2026-11-19T10:30:00.000Z",
      },
    };
    expect(avaliarPassos(estado)[0].completo).toBe(true);
  });

  it("com carimbo em objeto Date (o driver pode devolver Date, não string) → COMPLETO", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: {
        operationStartHour: 9,
        operationEndHour: 22,
        configurado: true,
        horarioConfirmadoEm: new Date("2026-11-19T10:30:00.000Z"),
      },
    };
    expect(avaliarPassos(estado)[0].completo).toBe(true);
  });

  it("carimbo presente NÃO salva horário numericamente inválido — a validação de valor vem primeiro", () => {
    const estado = estadoCompleto();
    estado.horario = {
      isLoading: false,
      data: {
        operationStartHour: 20,
        operationEndHour: 8,
        configurado: true,
        horarioConfirmadoEm: "2026-11-19T10:30:00.000Z",
      },
    };
    const [horario] = avaliarPassos(estado);
    expect(horario.completo).toBe(false);
    expect(horario.razao).toMatch(/depois da abertura/i);
  });
});
