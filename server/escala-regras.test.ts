/**
 * escala-regras.test.ts — Resolvedor de regras por data e escopo
 *
 * Testa `resolverRegras`/`regraObrigatoria` (server/escala-regras.ts), a peça
 * central do módulo de Escala: "qual regra vale nesta data, nesta loja, nesta
 * CCT". Função pura, sem banco — recebe o array de regras (mesma forma de
 * `RegraSeed`, Task 1) e resolve.
 *
 * Ver .superpowers/sdd/2026-11-19-escala-configuracao/task-2-brief.md.
 */
import { describe, expect, it } from "vitest";
import { REGRAS_LEGAIS_INICIAIS } from "./escala-catalogo-seed";
import type { RegraSeed } from "./escala-catalogo-seed";
import { regraObrigatoria, RegraAusenteError, resolverRegras } from "./escala-regras";

const CTX_PADRAO = { storeId: 10, uf: "SP", data: "2026-11-19" };

function regra(parcial: Partial<RegraSeed> & { chave: string; valor: unknown }): RegraSeed {
  return {
    storeId: null,
    uf: null,
    cct: null,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "teste",
    ...parcial,
  };
}

describe("resolverRegras — precedência de escopo", () => {
  it("escopo de loja vence o de uf, que vence o de rede", () => {
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });
    const uf = regra({ storeId: null, uf: "SP", chave: "jornada_max_semanal", valor: 42 });
    const loja = regra({ storeId: 10, uf: null, chave: "jornada_max_semanal", valor: 40 });

    const mapa = resolverRegras([rede, uf, loja], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(40);
    expect(resolvida.escopo).toBe("loja");
  });

  it("escopo de uf vence o de rede quando não há regra de loja", () => {
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });
    const uf = regra({ storeId: null, uf: "SP", chave: "jornada_max_semanal", valor: 42 });

    const mapa = resolverRegras([rede, uf], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(42);
    expect(resolvida.escopo).toBe("uf");
  });

  it("regra de loja de OUTRA loja não se aplica — cai para a de rede", () => {
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });
    const lojaOutra = regra({ storeId: 999, uf: null, chave: "jornada_max_semanal", valor: 40 });

    const mapa = resolverRegras([rede, lojaOutra], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(44);
    expect(resolvida.escopo).toBe("rede");
  });

  it("regra de uf de outra UF não se aplica — cai para a de rede", () => {
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });
    const ufOutra = regra({ storeId: null, uf: "RJ", chave: "jornada_max_semanal", valor: 42 });

    const mapa = resolverRegras([rede, ufOutra], { storeId: 10, uf: "SP", data: "2026-11-19" });
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(44);
    expect(resolvida.escopo).toBe("rede");
  });
});

describe("resolverRegras — empate de escopo e vigência", () => {
  it("no empate de escopo, vence a vigenciaInicio mais recente", () => {
    const antiga = regra({
      chave: "jornada_max_semanal",
      valor: 44,
      vigenciaInicio: null,
      vigenciaFim: null,
    });
    const nova = regra({
      chave: "jornada_max_semanal",
      valor: 42,
      vigenciaInicio: "2026-01-01",
      vigenciaFim: null,
    });

    const mapa = resolverRegras([antiga, nova], { storeId: 10, uf: "SP", data: "2026-11-19" });
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(42);
  });

  it("ignora regra cuja vigenciaFim já passou", () => {
    const expirada = regra({
      storeId: 10,
      chave: "jornada_max_semanal",
      valor: 999,
      vigenciaInicio: null,
      vigenciaFim: "2020-01-01",
    });
    const vigente = regra({
      chave: "jornada_max_semanal",
      valor: 44,
      vigenciaInicio: null,
      vigenciaFim: null,
    });

    const mapa = resolverRegras([expirada, vigente], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    // a regra expirada é escopo loja (pesaria mais), mas está fora de
    // vigência — tem que ser descartada ANTES da comparação de escopo.
    expect(resolvida.valor).toBe(44);
    expect(resolvida.escopo).toBe("rede");
  });

  it("ignora regra cuja vigenciaInicio ainda não chegou", () => {
    const futura = regra({
      storeId: 10,
      chave: "jornada_max_semanal",
      valor: 999,
      vigenciaInicio: "2099-01-01",
      vigenciaFim: null,
    });
    const vigente = regra({
      chave: "jornada_max_semanal",
      valor: 44,
      vigenciaInicio: null,
      vigenciaFim: null,
    });

    const mapa = resolverRegras([futura, vigente], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(44);
  });

  it("vigenciaFim é inclusiva: regra vale até e no próprio dia do fim", () => {
    const regraLimite = regra({
      chave: "jornada_max_semanal",
      valor: 44,
      vigenciaInicio: null,
      vigenciaFim: "2026-12-15",
    });

    const mapaDentro = resolverRegras([regraLimite], { ...CTX_PADRAO, data: "2026-12-15" });
    expect(regraObrigatoria(mapaDentro, "jornada_max_semanal").valor).toBe(44);

    const mapaFora = resolverRegras([regraLimite], { ...CTX_PADRAO, data: "2026-12-16" });
    expect(() => regraObrigatoria(mapaFora, "jornada_max_semanal")).toThrow(RegraAusenteError);
  });
});

describe("regraObrigatoria", () => {
  it("lança RegraAusenteError quando a chave não existe no mapa resolvido", () => {
    const vazio = resolverRegras([], CTX_PADRAO);
    expect(() => regraObrigatoria(vazio, "jornada_max_semanal")).toThrow(RegraAusenteError);
  });

  it("lança RegraAusenteError quando a data não tem cobertura (nenhuma regra vige)", () => {
    const soFutura = regra({
      chave: "jornada_max_semanal",
      valor: 42,
      vigenciaInicio: "2099-01-01",
      vigenciaFim: null,
    });
    const mapa = resolverRegras([soFutura], CTX_PADRAO);
    expect(() => regraObrigatoria(mapa, "jornada_max_semanal")).toThrow(RegraAusenteError);
  });

  it("devolve a regra resolvida quando a chave existe", () => {
    const vigente = regra({ chave: "max_dias_consecutivos", valor: 6 });
    const mapa = resolverRegras([vigente], CTX_PADRAO);
    expect(regraObrigatoria(mapa, "max_dias_consecutivos").valor).toBe(6);
  });
});

describe("resolverRegras — integração com a linha do tempo real da EC 141/2026", () => {
  it("em 2026-12-15 jornada é 44h; em 2026-12-16 é 42h; em 2027-12-16 é 40h", () => {
    const mapa15 = resolverRegras(REGRAS_LEGAIS_INICIAIS, { ...CTX_PADRAO, data: "2026-12-15" });
    expect(regraObrigatoria(mapa15, "jornada_max_semanal").valor).toBe(44);

    const mapa16 = resolverRegras(REGRAS_LEGAIS_INICIAIS, { ...CTX_PADRAO, data: "2026-12-16" });
    expect(regraObrigatoria(mapa16, "jornada_max_semanal").valor).toBe(42);

    const mapaFutura = resolverRegras(REGRAS_LEGAIS_INICIAIS, {
      ...CTX_PADRAO,
      data: "2027-12-16",
    });
    expect(regraObrigatoria(mapaFutura, "jornada_max_semanal").valor).toBe(40);
  });

  it("hoje (2026-11-19) o regime vigente é 44h de jornada e 1 repouso semanal", () => {
    const mapaHoje = resolverRegras(REGRAS_LEGAIS_INICIAIS, { ...CTX_PADRAO, data: "2026-11-19" });
    expect(regraObrigatoria(mapaHoje, "jornada_max_semanal").valor).toBe(44);
    expect(regraObrigatoria(mapaHoje, "repousos_por_semana").valor).toBe(1);
  });

  it("domingos_folga_mulher_mes resolve como DEPENDE_CCT, nunca DURA", () => {
    const mapaHoje = resolverRegras(REGRAS_LEGAIS_INICIAIS, { ...CTX_PADRAO, data: "2026-11-19" });
    expect(regraObrigatoria(mapaHoje, "domingos_folga_mulher_mes").tipo).toBe("DEPENDE_CCT");
  });
});
