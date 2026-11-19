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
