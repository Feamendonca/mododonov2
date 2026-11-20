/**
 * escala-catalogo-seed.test.ts — Testes do catálogo legal de escalas (EC 141/2026)
 * Dados puros, sem banco. Ver docs/superpowers/specs/2026-11-19-gestor-de-escala-design.md
 * (seções 1 e 2) para os valores normativos.
 */
import { describe, expect, it } from "vitest";
import {
  CATALOGO_INICIAL,
  REGRAS_LEGAIS_INICIAIS,
  toInsertCatalogo,
  toInsertRegra,
} from "./escala-catalogo-seed";
import type { RegraSeed } from "./escala-catalogo-seed";

describe("CATALOGO_INICIAL", () => {
  it("6x1 encerra em 15/12/2026 por causa da EC 141", () => {
    const seis = CATALOGO_INICIAL.find((e) => e.codigo === "6x1")!;
    expect(seis.vigenciaFim).toBe("2026-12-15");
  });

  it("5x2 vale 42h a partir de 16/12/2026", () => {
    // codigo não é mais único: 5x2 tem uma versão por regime de jornada
    // (44h legado · 42h EC 141 · 40h a partir de 16/12/2027). Pinamos a
    // versão certa pela vigenciaInicio.
    const cinco = CATALOGO_INICIAL.find(
      (e) => e.codigo === "5x2" && e.vigenciaInicio === "2026-12-16",
    )!;
    expect(cinco.horasSemanaMedia).toBe(42);
  });

  it("5x2 a 44h é a opção legal hoje (vigente até 15/12/2026)", () => {
    const cinco44 = CATALOGO_INICIAL.find(
      (e) => e.codigo === "5x2" && e.vigenciaFim === "2026-12-15",
    )!;
    expect(cinco44.vigenciaInicio).toBeNull();
    expect(cinco44.horasSemanaMedia).toBe(44);
  });
});

describe("REGRAS_LEGAIS_INICIAIS", () => {
  it("domingos de folga entram como DEPENDE_CCT, nunca DURA", () => {
    const d = REGRAS_LEGAIS_INICIAIS.filter((r) => r.chave.startsWith("domingos_folga"));
    expect(d).toHaveLength(2);
    expect(d.every((r) => r.tipo === "DEPENDE_CCT")).toBe(true);
  });

  it("todas as 10 chaves da seção 2.3 estão presentes, cada uma com fonte preenchida", () => {
    const chaves = new Set(REGRAS_LEGAIS_INICIAIS.map((r) => r.chave));
    expect(chaves).toEqual(
      new Set([
        "jornada_max_semanal",
        "repousos_por_semana",
        "interjornada_min_horas",
        "intervalo_intrajornada",
        "jornada_max_diaria",
        "domingos_folga_mulher_mes",
        "domingos_folga_homem_mes",
        "adicional_noturno_inicio",
        "max_dias_consecutivos",
        "folga_preferencial",
      ]),
    );
    for (const r of REGRAS_LEGAIS_INICIAIS) {
      expect(r.fonte, `regra ${r.chave} sem fonte`).toBeTruthy();
    }
  });

  it("todo tipo de regra é DURA, MOLE ou DEPENDE_CCT", () => {
    for (const r of REGRAS_LEGAIS_INICIAIS) {
      expect(["DURA", "MOLE", "DEPENDE_CCT"]).toContain(r.tipo);
    }
  });
});

// ─── Continuidade da linha do tempo ───────────────────────────────────────────
// Um teste de tupla literal só prova a chave que alguém lembrou de escrever.
// Foi assim que passou o bug original: 5x2 e 6x2 nasciam do nada em
// 16/12/2026 (sem cobrir "hoje") e morriam no limbo em 16/12/2027 (sem
// sucessora onde fazia sentido ter uma). Este teste percorre TODAS as
// chaves/códigos — presentes e futuros — e prova estruturalmente que a
// linha do tempo de cada grupo não tem buraco nem sobreposição.

interface JanelaVigencia {
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function paraEpoch(data: string): number {
  return Date.parse(`${data}T00:00:00Z`);
}

/**
 * Para um grupo de entradas (mesma chave+escopo, ou mesmo código), ordena
 * por vigenciaInicio e confirma:
 *   (a) a entrada mais antiga cobre "sempre" (vigenciaInicio null) — se não
 *       cobrisse, haveria um buraco no passado/presente sem ninguém notar;
 *   (b) cada entrada seguinte começa exatamente no dia depois do fim da
 *       anterior — nem buraco (começa depois) nem sobreposição (começa
 *       antes, ou a anterior nunca termina).
 * Um grupo pode terminar sem sucessora (6x1 morre em 15/12/2026, 12x36 em
 * 15/12/2027) — isso não é buraco, é o código deixando de valer; o teste só
 * reprova buraco/sobreposição ENTRE entradas que existem.
 */
function checarLinhaDoTempo(grupo: JanelaVigencia[]): string[] {
  const problemas: string[] = [];
  const ordenado = [...grupo].sort((a, b) => {
    const sa = a.vigenciaInicio === null ? -Infinity : paraEpoch(a.vigenciaInicio);
    const sb = b.vigenciaInicio === null ? -Infinity : paraEpoch(b.vigenciaInicio);
    return sa - sb;
  });

  if (ordenado[0].vigenciaInicio !== null) {
    problemas.push(
      `buraco no passado/presente: a entrada mais antiga só começa em ${ordenado[0].vigenciaInicio}, não cobre "sempre" (vigenciaInicio deveria ser null)`,
    );
  }

  for (let i = 0; i < ordenado.length - 1; i++) {
    const atual = ordenado[i];
    const proxima = ordenado[i + 1];
    if (atual.vigenciaFim === null) {
      problemas.push(
        `sobreposição: ${JSON.stringify(atual)} não tem vigenciaFim mas existe outra entrada depois (${JSON.stringify(proxima)})`,
      );
      continue;
    }
    const fimAtual = paraEpoch(atual.vigenciaFim);
    const inicioProxima =
      proxima.vigenciaInicio === null ? -Infinity : paraEpoch(proxima.vigenciaInicio);
    const esperado = fimAtual + UM_DIA_MS;
    if (inicioProxima < esperado) {
      problemas.push(`sobreposição entre ${JSON.stringify(atual)} e ${JSON.stringify(proxima)}`);
    } else if (inicioProxima > esperado) {
      problemas.push(`buraco entre ${JSON.stringify(atual)} e ${JSON.stringify(proxima)}`);
    }
  }
  return problemas;
}

function agrupar<T>(itens: T[], chaveDoGrupo: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDoGrupo(item);
    grupos.set(chave, [...(grupos.get(chave) ?? []), item]);
  }
  return grupos;
}

describe("continuidade da linha do tempo (sem buracos nem sobreposições)", () => {
  it("cada chave de REGRAS_LEGAIS_INICIAIS, por escopo, cobre a linha do tempo sem buraco nem sobreposição", () => {
    const grupos = agrupar(
      REGRAS_LEGAIS_INICIAIS,
      (r) => `${r.chave}|loja:${r.storeId ?? "rede"}|uf:${r.uf ?? "-"}|cct:${r.cct ?? "-"}`,
    );
    expect(grupos.size).toBeGreaterThan(0);
    for (const [escopo, entradas] of grupos) {
      const problemas = checarLinhaDoTempo(entradas);
      expect(problemas, `grupo "${escopo}": ${problemas.join("; ")}`).toEqual([]);
    }
  });

  it("cada código de CATALOGO_INICIAL cobre a linha do tempo sem buraco nem sobreposição", () => {
    const grupos = agrupar(CATALOGO_INICIAL, (e) => e.codigo);
    expect(grupos.size).toBeGreaterThan(0);
    for (const [codigo, entradas] of grupos) {
      const problemas = checarLinhaDoTempo(entradas);
      expect(problemas, `código "${codigo}": ${problemas.join("; ")}`).toEqual([]);
    }
  });
});

// ─── Mappers de inserção (Drizzle) ────────────────────────────────────────────
describe("toInsertCatalogo / toInsertRegra", () => {
  it("toInsertCatalogo converte horasDiaPadrao/horasSemanaMedia para string sem perder valor", () => {
    for (const seed of CATALOGO_INICIAL) {
      const insert = toInsertCatalogo(seed);
      expect(typeof insert.horasDiaPadrao).toBe("string");
      expect(typeof insert.horasSemanaMedia).toBe("string");
      expect(Number(insert.horasDiaPadrao)).toBe(seed.horasDiaPadrao);
      expect(Number(insert.horasSemanaMedia)).toBe(seed.horasSemanaMedia);
      expect(insert.codigo).toBe(seed.codigo);
      expect(insert.diasTrabalho).toBe(seed.diasTrabalho);
      expect(insert.diasFolga).toBe(seed.diasFolga);
      expect(insert.vigenciaInicio).toBe(seed.vigenciaInicio);
      expect(insert.vigenciaFim).toBe(seed.vigenciaFim);
    }
  });

  it("toInsertRegra preserva valor/tipo/fonte/escopo sem alteração", () => {
    for (const seed of REGRAS_LEGAIS_INICIAIS) {
      const insert = toInsertRegra(seed);
      expect(insert.valor).toEqual(seed.valor);
      expect(insert.tipo).toBe(seed.tipo);
      expect(insert.fonte).toBe(seed.fonte);
      expect(insert.chave).toBe(seed.chave);
      expect(insert.storeId).toBe(seed.storeId);
      expect(insert.vigenciaInicio).toBe(seed.vigenciaInicio);
      expect(insert.vigenciaFim).toBe(seed.vigenciaFim);
    }
  });
});

// ─── Unicidade de regras_escala cobre escopo uf/cct (R7) ──────────────────────
// A constraint uq_regras_escala_store_chave_vigencia (drizzle/schema.ts e
// drizzle/0032_escala_config.sql) é (storeId, uf, cct, chave, vigenciaInicio).
// Antes era só (storeId, chave, vigenciaInicio): duas regras da mesma chave e
// mesma vigência em UFs diferentes (ex.: domingos_folga_mulher_mes no RS e em
// SP, cadastradas pela Task 4 — upsertRegraLoja/getRegras(storeId, uf)) seriam
// rejeitadas indevidamente como duplicadas. Este teste prova, sem banco, que a
// chave de unicidade distingue uf/cct e só colide quando as 5 colunas batem.
function chaveUnicidadeRegra(r: Pick<RegraSeed, "storeId" | "uf" | "cct" | "chave" | "vigenciaInicio">): string {
  return [r.storeId, r.uf, r.cct, r.chave, r.vigenciaInicio].map((v) => v ?? "null").join("|");
}

describe("unicidade de regras_escala cobre escopo uf/cct (R7)", () => {
  it("mesma chave e mesma vigência, UF diferente (RS x SP) → chaves de unicidade distintas", () => {
    const base = {
      storeId: null,
      cct: null,
      chave: "domingos_folga_mulher_mes",
      vigenciaInicio: null,
    } as const;
    const regraRS: RegraSeed = { ...base, uf: "RS", valor: 2, tipo: "DEPENDE_CCT", vigenciaFim: null, fonte: "x" };
    const regraSP: RegraSeed = { ...base, uf: "SP", valor: 2, tipo: "DEPENDE_CCT", vigenciaFim: null, fonte: "x" };

    expect(chaveUnicidadeRegra(regraRS)).not.toBe(chaveUnicidadeRegra(regraSP));
  });

  it("mesma chave e mesma vigência, CCT diferente → chaves de unicidade distintas", () => {
    const base = {
      storeId: 10,
      uf: "SP",
      chave: "jornada_max_diaria",
      vigenciaInicio: "2026-12-16",
    } as const;
    const regraA: RegraSeed = { ...base, cct: "SINDHA-SP", valor: 10, tipo: "DURA", vigenciaFim: null, fonte: "x" };
    const regraB: RegraSeed = { ...base, cct: "SINTHORESP", valor: 10, tipo: "DURA", vigenciaFim: null, fonte: "x" };

    expect(chaveUnicidadeRegra(regraA)).not.toBe(chaveUnicidadeRegra(regraB));
  });

  it("todas as 5 colunas iguais → mesma chave de unicidade (duplicata real)", () => {
    const regra: RegraSeed = {
      storeId: 10,
      uf: "SP",
      cct: "SINDHA-SP",
      chave: "jornada_max_diaria",
      valor: 10,
      tipo: "DURA",
      vigenciaInicio: "2026-12-16",
      vigenciaFim: null,
      fonte: "x",
    };
    const copia: RegraSeed = { ...regra };

    expect(chaveUnicidadeRegra(regra)).toBe(chaveUnicidadeRegra(copia));
  });

  it("o seed atual (REGRAS_LEGAIS_INICIAIS) não tem chaves de unicidade duplicadas", () => {
    const chaves = REGRAS_LEGAIS_INICIAIS.map(chaveUnicidadeRegra);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

// ─── 🔴 R29 (I6/I7 da review final): o catálogo não pode contradizer as
// regras que ele mesmo cadastra ──────────────────────────────────────────────
//
// Os dois achados: (a) a 6x2 pós-EC oferecia um ciclo de 8 dias que NÃO
// garante 2 repousos por semana civil, violando a DURA `repousos_por_semana:
// 2` deste mesmo arquivo; (b) a 12x36 tem 12h/dia contra a DURA
// `jornada_max_diaria: 10`, sem nada que dissesse ao motor que é exceção
// legal. Um catálogo que contradiz as próprias travas produz escala ilegal
// com aparência de aprovada.

import { resolverRegras, regraObrigatoria } from "./escala-regras";

describe("R29 — coerência entre CATALOGO_INICIAL e REGRAS_LEGAIS_INICIAIS", () => {
  const POS_EC = "2026-12-16";

  function regrasEm(data: string) {
    return resolverRegras(REGRAS_LEGAIS_INICIAIS, { storeId: 1, uf: "SP", data });
  }

  function vigentesEm(data: string) {
    return CATALOGO_INICIAL.filter(
      (e) =>
        (e.vigenciaInicio === null || e.vigenciaInicio <= data) &&
        (e.vigenciaFim === null || e.vigenciaFim >= data),
    );
  }

  it("I6: 6x2 não é oferecida a partir de 16/12/2026 (ciclo de 8 dias não garante 2 repousos na semana civil)", () => {
    expect(vigentesEm("2026-12-15").some((e) => e.codigo === "6x2")).toBe(true);
    expect(vigentesEm(POS_EC).some((e) => e.codigo === "6x2")).toBe(false);
    expect(vigentesEm("2027-12-16").some((e) => e.codigo === "6x2")).toBe(false);
  });

  it("I6: a 6x2 que resta declara horasSemanaMedia coerente com o ciclo de 8 dias (38,5h, não 44h)", () => {
    const seis = CATALOGO_INICIAL.filter((e) => e.codigo === "6x2");
    expect(seis).toHaveLength(1);
    const [entrada] = seis;
    // 6 dias × horasDiaPadrao por ciclo de 8 dias, convertido para semana.
    const esperado = (entrada.diasTrabalho * entrada.horasDiaPadrao * 7) / (entrada.diasTrabalho + entrada.diasFolga);
    expect(entrada.horasSemanaMedia).toBeCloseTo(esperado, 1);
  });

  it("nenhum regime vigente pós-EC declara horasSemanaMedia acima da DURA jornada_max_semanal da mesma data", () => {
    const teto = regraObrigatoria(regrasEm(POS_EC), "jornada_max_semanal").valor as number;
    for (const entrada of vigentesEm(POS_EC)) {
      expect(entrada.horasSemanaMedia, `${entrada.codigo} declara ${entrada.horasSemanaMedia}h contra teto de ${teto}h`).toBeLessThanOrEqual(teto);
    }
  });

  it("I7: todo regime vigente com jornada diária acima da DURA jornada_max_diaria declara a exceção legal, com fundamento", () => {
    const tetoDiario = regraObrigatoria(regrasEm(POS_EC), "jornada_max_diaria").valor as number;
    for (const entrada of vigentesEm(POS_EC)) {
      if (entrada.horasDiaPadrao <= tetoDiario) continue;
      const excecao = (entrada.excecoesLegais ?? []).find((e) => e.chaveRegra === "jornada_max_diaria");
      expect(excecao, `${entrada.codigo} tem ${entrada.horasDiaPadrao}h/dia contra teto de ${tetoDiario}h e NÃO declara exceção`).toBeDefined();
      expect(excecao!.fundamento.length).toBeGreaterThan(0);
    }
  });

  it("I7: a 12x36 é a que carrega a exceção, fundamentada no art. 59-A da CLT", () => {
    const doze = CATALOGO_INICIAL.find((e) => e.codigo === "12x36")!;
    expect(doze.excecoesLegais).toEqual([
      { chaveRegra: "jornada_max_diaria", fundamento: "CLT art. 59-A" },
    ]);
  });

  it("I7: regime que obedece todas as DURAs não declara exceção nenhuma (exceção é pontual, não enfeite)", () => {
    for (const entrada of CATALOGO_INICIAL.filter((e) => e.codigo !== "12x36")) {
      expect(entrada.excecoesLegais ?? null, `${entrada.codigo} não deveria declarar exceção`).toBeNull();
    }
  });

  it("toInsertCatalogo leva a exceção para o banco (e null quando não há)", () => {
    const doze = CATALOGO_INICIAL.find((e) => e.codigo === "12x36")!;
    expect(toInsertCatalogo(doze).excecoesLegais).toEqual(doze.excecoesLegais);
    const cinco = CATALOGO_INICIAL.find((e) => e.codigo === "5x2")!;
    expect(toInsertCatalogo(cinco).excecoesLegais).toBeNull();
  });
});

// ─── Menores da review final: 6x1 codificada em parâmetro, e citação legal ──

describe("max_dias_consecutivos — o parâmetro que codifica a 6x1 encerra com a EC 141", () => {
  function valorEm(data: string): number {
    const mapa = resolverRegras(REGRAS_LEGAIS_INICIAIS, { storeId: 1, uf: "SP", data });
    return regraObrigatoria(mapa, "max_dias_consecutivos").valor as number;
  }

  it("até 15/12/2026 continua 6 (a 6x1 ainda é legal)", () => {
    expect(valorEm("2026-11-19")).toBe(6);
    expect(valorEm("2026-12-15")).toBe(6);
  });

  it("a partir de 16/12/2026 cai para 5 — e NUNCA mais devolve 6", () => {
    expect(valorEm("2026-12-16")).toBe(5);
    expect(valorEm("2027-12-16")).toBe(5);
    expect(valorEm("2030-01-01")).toBe(5);
  });

  it("é coerente com repousos_por_semana na mesma data (7 dias − repousos)", () => {
    for (const data of ["2026-11-19", "2026-12-16", "2027-12-16"]) {
      const mapa = resolverRegras(REGRAS_LEGAIS_INICIAIS, { storeId: 1, uf: "SP", data });
      const repousos = regraObrigatoria(mapa, "repousos_por_semana").valor as number;
      const consecutivos = regraObrigatoria(mapa, "max_dias_consecutivos").valor as number;
      expect(consecutivos, `em ${data}: ${repousos} repousos ⇒ no máximo ${7 - repousos} dias`).toBe(7 - repousos);
    }
  });
});

describe("fonte das regras — citação que defende a escala numa reclamatória", () => {
  it("toda regra que invoca a EC 141/2026 cita o artigo, nunca só o número da emenda", () => {
    const daEc = REGRAS_LEGAIS_INICIAIS.filter((r) => r.fonte.includes("EC 141/2026"));
    expect(daEc.length).toBeGreaterThan(0);
    for (const regra of daEc) {
      expect(regra.fonte, `fonte de "${regra.chave}" sem artigo: "${regra.fonte}"`).toMatch(/art\.\s*\d/);
    }
  });

  it("nenhuma fonte é a string nua 'EC 141/2026'", () => {
    for (const regra of REGRAS_LEGAIS_INICIAIS) {
      expect(regra.fonte.trim()).not.toBe("EC 141/2026");
    }
  });
});
