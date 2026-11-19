/**
 * escala-catalogo-seed.test.ts — Testes do catálogo legal de escalas (EC 141/2026)
 * Dados puros, sem banco. Ver docs/superpowers/specs/2026-11-19-gestor-de-escala-design.md
 * (seções 1 e 2) para os valores normativos.
 */
import { describe, expect, it } from "vitest";
import { CATALOGO_INICIAL, REGRAS_LEGAIS_INICIAIS } from "./escala-catalogo-seed";

describe("CATALOGO_INICIAL", () => {
  it("6x1 encerra em 15/12/2026 por causa da EC 141", () => {
    const seis = CATALOGO_INICIAL.find((e) => e.codigo === "6x1")!;
    expect(seis.vigenciaFim).toBe("2026-12-15");
  });

  it("5x2 vale 42h a partir de 16/12/2026", () => {
    const cinco = CATALOGO_INICIAL.find((e) => e.codigo === "5x2")!;
    expect(cinco.horasSemanaMedia).toBe(42);
    expect(cinco.vigenciaInicio).toBe("2026-12-16");
  });
});

describe("REGRAS_LEGAIS_INICIAIS", () => {
  it("jornada semanal: 44h até 15/12/2026, 42h a partir de 16/12/2026, 40h a partir de 16/12/2027", () => {
    const r = REGRAS_LEGAIS_INICIAIS.filter((r) => r.chave === "jornada_max_semanal");
    expect(r.map((x) => [x.vigenciaInicio, x.valor])).toEqual([
      [null, 44],
      ["2026-12-16", 42],
      ["2027-12-16", 40],
    ]);
  });

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
