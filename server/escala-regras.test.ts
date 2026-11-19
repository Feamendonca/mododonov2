/**
 * escala-regras.test.ts — Resolvedor de regras por data e escopo
 *
 * Testa `resolverRegras`/`regraObrigatoria` (server/escala-regras.ts), a peça
 * central do módulo de Escala: "qual regra vale nesta data, nesta loja, nesta
 * CCT". Função pura, sem banco — recebe o array de regras (mesma forma de
 * `RegraSeed`, Task 1) e resolve.
 *
 * Nota pós-revisão (C1): os testes de precedência colocam o vencedor em MAIS
 * DE UMA posição do array (primeiro, e também em ordem invertida quando
 * aplicável) — nunca só "vencedor por último", que é o padrão que deixava
 * passar implementações erradas do tipo "pega o último elemento do array"
 * sem nenhuma lógica de precedência real. Ver mutantes m1/m2/m3 descritos no
 * relatório da Task 2.
 *
 * Ver .superpowers/sdd/2026-11-19-escala-configuracao/task-2-brief.md.
 */
import { describe, expect, it } from "vitest";
import { REGRAS_LEGAIS_INICIAIS } from "./escala-catalogo-seed";
import type { RegraSeed } from "./escala-catalogo-seed";
import {
  FormatoDataInvalidoError,
  regraObrigatoria,
  RegraAusenteError,
  resolverRegras,
} from "./escala-regras";

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
  it("escopo de loja vence o de uf, que vence o de rede (vencedor primeiro no array)", () => {
    const loja = regra({ storeId: 10, uf: null, chave: "jornada_max_semanal", valor: 40 });
    const uf = regra({ storeId: null, uf: "SP", chave: "jornada_max_semanal", valor: 42 });
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });

    const mapa = resolverRegras([loja, uf, rede], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(40);
    expect(resolvida.escopo).toBe("loja");
  });

  it("escopo de uf vence o de rede quando não há regra de loja (vencedor primeiro)", () => {
    const uf = regra({ storeId: null, uf: "SP", chave: "jornada_max_semanal", valor: 42 });
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });

    const mapa = resolverRegras([uf, rede], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(42);
    expect(resolvida.escopo).toBe("uf");
  });

  it("regra de loja de OUTRA loja não se aplica — cai para a de rede, em qualquer ordem", () => {
    const lojaOutra = regra({ storeId: 999, uf: null, chave: "jornada_max_semanal", valor: 40 });
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });

    const mapaA = resolverRegras([lojaOutra, rede], CTX_PADRAO);
    const mapaB = resolverRegras([rede, lojaOutra], CTX_PADRAO);

    for (const mapa of [mapaA, mapaB]) {
      const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");
      expect(resolvida.valor).toBe(44);
      expect(resolvida.escopo).toBe("rede");
    }
  });

  it("regra de uf de outra UF não se aplica — cai para a de rede, em qualquer ordem", () => {
    const ufOutra = regra({ storeId: null, uf: "RJ", chave: "jornada_max_semanal", valor: 42 });
    const rede = regra({ storeId: null, uf: null, chave: "jornada_max_semanal", valor: 44 });

    const mapaA = resolverRegras([ufOutra, rede], CTX_PADRAO);
    const mapaB = resolverRegras([rede, ufOutra], CTX_PADRAO);

    for (const mapa of [mapaA, mapaB]) {
      const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");
      expect(resolvida.valor).toBe(44);
      expect(resolvida.escopo).toBe("rede");
    }
  });

  it("escopo pesa mais que vigência: loja com vigência ANTIGA vence rede com vigência RECENTE", () => {
    // Prova que peso de escopo é aplicado ANTES do desempate por data — se a
    // implementação resolvesse por data primeiro (ignorando escopo), a regra
    // de rede (mais recente) venceria erradamente.
    const lojaAntiga = regra({
      storeId: 10,
      chave: "jornada_max_semanal",
      valor: 40,
      vigenciaInicio: "2020-01-01",
      vigenciaFim: null,
    });
    const redeRecente = regra({
      storeId: null,
      uf: null,
      chave: "jornada_max_semanal",
      valor: 44,
      vigenciaInicio: "2026-01-01",
      vigenciaFim: null,
    });

    const mapaA = resolverRegras([lojaAntiga, redeRecente], CTX_PADRAO);
    const mapaB = resolverRegras([redeRecente, lojaAntiga], CTX_PADRAO);

    for (const mapa of [mapaA, mapaB]) {
      expect(regraObrigatoria(mapa, "jornada_max_semanal").valor).toBe(40);
    }
  });
});

describe("resolverRegras — empate de escopo e vigência", () => {
  it("no empate de escopo, vence a vigenciaInicio mais recente (vencedor primeiro no array)", () => {
    const nova = regra({
      chave: "jornada_max_semanal",
      valor: 42,
      vigenciaInicio: "2026-01-01",
      vigenciaFim: null,
    });
    const antiga = regra({
      chave: "jornada_max_semanal",
      valor: 44,
      vigenciaInicio: null,
      vigenciaFim: null,
    });

    const mapa = resolverRegras([nova, antiga], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");

    expect(resolvida.valor).toBe(42);
  });

  it("empate de escopo entre DUAS vigências reais (não-null) — vence a mais recente, em qualquer ordem", () => {
    // O teste acima só opõe null (vigenciaInicio "sempre") contra uma data
    // real. Este opõe duas datas reais, para exercitar a comparação
    // data-vs-data de fato (e não só "data vs ausência de data").
    const dataAntiga = regra({
      chave: "jornada_max_semanal",
      valor: 44,
      vigenciaInicio: "2026-01-01",
      vigenciaFim: null,
    });
    const dataRecente = regra({
      chave: "jornada_max_semanal",
      valor: 42,
      vigenciaInicio: "2026-06-01",
      vigenciaFim: null,
    });

    const mapaA = resolverRegras([dataAntiga, dataRecente], CTX_PADRAO);
    const mapaB = resolverRegras([dataRecente, dataAntiga], CTX_PADRAO);

    for (const mapa of [mapaA, mapaB]) {
      expect(regraObrigatoria(mapa, "jornada_max_semanal").valor).toBe(42);
    }
  });

  it("ignora regra cuja vigenciaFim já passou, mesmo sendo escopo loja (maior peso)", () => {
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

    const mapaA = resolverRegras([expirada, vigente], CTX_PADRAO);
    const mapaB = resolverRegras([vigente, expirada], CTX_PADRAO);

    for (const mapa of [mapaA, mapaB]) {
      // a regra expirada é escopo loja (pesaria mais), mas está fora de
      // vigência — tem que ser descartada ANTES da comparação de escopo.
      const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");
      expect(resolvida.valor).toBe(44);
      expect(resolvida.escopo).toBe("rede");
    }
  });

  it("ignora regra cuja vigenciaInicio ainda não chegou, mesmo sendo escopo loja", () => {
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

    const mapaA = resolverRegras([futura, vigente], CTX_PADRAO);
    const mapaB = resolverRegras([vigente, futura], CTX_PADRAO);

    for (const mapa of [mapaA, mapaB]) {
      expect(regraObrigatoria(mapa, "jornada_max_semanal").valor).toBe(44);
    }
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

describe("resolverRegras — desempate final determinístico (empate total)", () => {
  it("mesmo escopo e mesma vigenciaInicio, diferindo só em cct/fonte — resultado NÃO depende da ordem do array", () => {
    // O unique de regras_escala é (storeId, uf, cct, chave, vigenciaInicio) —
    // duas regras assim são permitidas pelo banco, e um SELECT sem ORDER BY
    // não garante a ordem em que chegam aqui. O desempate documentado
    // (vence() em escala-regras.ts) é `fonte` em ordem alfabética ascendente.
    const regraA = regra({
      chave: "jornada_max_diaria",
      valor: 10,
      cct: "SINDHA-SP",
      fonte: "fonteA",
    });
    const regraB = regra({
      chave: "jornada_max_diaria",
      valor: 8,
      cct: "SINTHORESP",
      fonte: "fonteB",
    });

    const mapaAB = resolverRegras([regraA, regraB], CTX_PADRAO);
    const mapaBA = resolverRegras([regraB, regraA], CTX_PADRAO);

    const resolvidaAB = regraObrigatoria(mapaAB, "jornada_max_diaria");
    const resolvidaBA = regraObrigatoria(mapaBA, "jornada_max_diaria");

    expect(resolvidaAB.valor).toBe(resolvidaBA.valor);
    expect(resolvidaAB.fonte).toBe(resolvidaBA.fonte);
    // critério documentado: fonte alfabeticamente menor vence
    expect(resolvidaAB.fonte).toBe("fonteA");
    expect(resolvidaAB.valor).toBe(10);
  });
});

describe("resolverRegras — normalização de UF", () => {
  it("ctx.uf em minúsculo ou com espaços ainda casa com regra de escopo uf", () => {
    const regraUf = regra({ uf: "SP", chave: "jornada_max_semanal", valor: 42 });

    for (const uf of ["sp", " SP ", "SP", " sp "]) {
      const mapa = resolverRegras([regraUf], { storeId: 10, uf, data: "2026-11-19" });
      const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");
      expect(resolvida.valor, `uf="${uf}"`).toBe(42);
      expect(resolvida.escopo, `uf="${uf}"`).toBe("uf");
    }
  });

  it("regra cadastrada com uf em minúsculo também casa — normaliza os dois lados", () => {
    const regraUfMinuscula = regra({ uf: "sp", chave: "jornada_max_semanal", valor: 42 });
    const mapa = resolverRegras([regraUfMinuscula], { storeId: 10, uf: "SP", data: "2026-11-19" });
    expect(regraObrigatoria(mapa, "jornada_max_semanal").valor).toBe(42);
  });

  it("UF realmente diferente (normalizada) continua caindo para rede", () => {
    const regraUf = regra({ uf: "RJ", chave: "jornada_max_semanal", valor: 42 });
    const rede = regra({ chave: "jornada_max_semanal", valor: 44 });
    const mapa = resolverRegras([regraUf, rede], { storeId: 10, uf: " sp ", data: "2026-11-19" });
    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");
    expect(resolvida.valor).toBe(44);
    expect(resolvida.escopo).toBe("rede");
  });
});

describe("resolverRegras — validação de formato de data", () => {
  it("lança FormatoDataInvalidoError quando ctx.data está em formato brasileiro (não ISO)", () => {
    expect(() =>
      resolverRegras(REGRAS_LEGAIS_INICIAIS, { storeId: 10, uf: "SP", data: "20/01/2028" }),
    ).toThrow(FormatoDataInvalidoError);
  });

  it("nunca devolve um regime antigo silenciosamente para uma data em formato inválido", () => {
    // Regressão provada pela revisão: "20/01/2028" caía no regime de 44h
    // (deveria ser 40h, se fosse interpretada) sem erro nenhum.
    expect(() =>
      resolverRegras(REGRAS_LEGAIS_INICIAIS, { storeId: 10, uf: "SP", data: "20/01/2028" }),
    ).toThrow(/ISO|AAAA-MM-DD/);
  });

  it("lança FormatoDataInvalidoError quando ctx.data tem hora/timezone anexados (quebra o limite inclusivo)", () => {
    expect(() =>
      resolverRegras(REGRAS_LEGAIS_INICIAIS, {
        storeId: 10,
        uf: "SP",
        data: "2027-12-15T12:00:00Z",
      }),
    ).toThrow(FormatoDataInvalidoError);
  });

  it("lança FormatoDataInvalidoError quando a vigenciaInicio de uma regra não está em ISO", () => {
    const regraInvalida = regra({
      chave: "jornada_max_semanal",
      valor: 1,
      vigenciaInicio: "01/01/2026",
    });
    expect(() => resolverRegras([regraInvalida], CTX_PADRAO)).toThrow(FormatoDataInvalidoError);
  });

  it("lança FormatoDataInvalidoError quando a vigenciaFim de uma regra não está em ISO", () => {
    const regraInvalida = regra({
      chave: "jornada_max_semanal",
      valor: 1,
      vigenciaFim: "2026-12-15T00:00:00Z",
    });
    expect(() => resolverRegras([regraInvalida], CTX_PADRAO)).toThrow(FormatoDataInvalidoError);
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

describe("resolverRegras — imutabilidade do valor devolvido (R9)", () => {
  it("mutar o `valor` do resultado não afeta a regra original passada como entrada", () => {
    const original: RegraSeed = regra({
      chave: "intervalo_intrajornada",
      valor: { minutos: 60, condicaoJornadaAcimaHoras: 6 },
    });
    const mapa = resolverRegras([original], CTX_PADRAO);
    const resolvida = regraObrigatoria(mapa, "intervalo_intrajornada");

    expect(() => {
      (resolvida.valor as Record<string, unknown>).minutos = 999;
    }).toThrow(TypeError); // Object.freeze, em módulo ESM (strict mode), lança ao mutar

    expect((original.valor as Record<string, unknown>).minutos).toBe(60);
  });

  it("mutar o valor resolvido de REGRAS_LEGAIS_INICIAIS não envenena o seed para resoluções seguintes", () => {
    const mapa1 = resolverRegras(REGRAS_LEGAIS_INICIAIS, CTX_PADRAO);
    const resolvida1 = regraObrigatoria(mapa1, "intervalo_intrajornada");

    expect(() => {
      (resolvida1.valor as Record<string, unknown>).minutos = 1;
    }).toThrow(TypeError);

    const seedOriginal = REGRAS_LEGAIS_INICIAIS.find((r) => r.chave === "intervalo_intrajornada")!;
    expect((seedOriginal.valor as Record<string, unknown>).minutos).toBe(60);

    // uma segunda resolução, após a tentativa de mutação acima, continua
    // devolvendo o valor correto — prova que o seed não foi envenenado.
    const mapa2 = resolverRegras(REGRAS_LEGAIS_INICIAIS, CTX_PADRAO);
    const resolvida2 = regraObrigatoria(mapa2, "intervalo_intrajornada");
    expect((resolvida2.valor as Record<string, unknown>).minutos).toBe(60);
  });

  it("valores primitivos (number) continuam funcionando normalmente — freeze/clone não altera o tipo", () => {
    const mapa = resolverRegras(REGRAS_LEGAIS_INICIAIS, CTX_PADRAO);
    expect(regraObrigatoria(mapa, "jornada_max_semanal").valor).toBe(44);
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

// ─── 🔴 R26 (C1 da review final): tipo entra na precedência ──────────────────
//
// O furo que anulava o módulo: `vence()` decidia só por escopo → vigência →
// fonte, e `tipo` nunca entrava. Uma `MOLE` de escopo LOJA derrubava a
// `DURA` de rede — e `upsertRegraLoja` liberava exatamente isso. Os testes
// abaixo provam COMPORTAMENTO (o valor que o motor leria), não a forma da
// implementação, e colocam a regra perdedora em mais de uma posição do
// array para não passar por acidente de ordenação.

describe("resolverRegras — R26: DURA de escopo mais amplo não cai para MOLE/DEPENDE_CCT mais específica", () => {
  it("MOLE de loja NÃO derruba DURA de rede — em qualquer ordem do array", () => {
    const moleDaLoja = regra({
      storeId: 10,
      chave: "jornada_max_semanal",
      valor: 60,
      tipo: "MOLE",
      fonte: "politica da loja",
    });
    const duraDaRede = regra({ chave: "jornada_max_semanal", valor: 42, tipo: "DURA" });

    for (const entrada of [[moleDaLoja, duraDaRede], [duraDaRede, moleDaLoja]]) {
      const resolvida = regraObrigatoria(resolverRegras(entrada, CTX_PADRAO), "jornada_max_semanal");
      expect(resolvida.valor).toBe(42);
      expect(resolvida.tipo).toBe("DURA");
      expect(resolvida.escopo).toBe("rede");
    }
  });

  it("DEPENDE_CCT de loja NÃO derruba DURA de rede", () => {
    const dependeDaLoja = regra({
      storeId: 10,
      chave: "repousos_por_semana",
      valor: 1,
      tipo: "DEPENDE_CCT",
    });
    const duraDaRede = regra({ chave: "repousos_por_semana", valor: 2, tipo: "DURA" });

    const resolvida = regraObrigatoria(
      resolverRegras([dependeDaLoja, duraDaRede], CTX_PADRAO),
      "repousos_por_semana",
    );
    expect(resolvida.valor).toBe(2);
  });

  it("MOLE de UF também não derruba DURA de rede (vale para qualquer escopo, não só loja)", () => {
    const moleDaUf = regra({ uf: "SP", chave: "jornada_max_diaria", valor: 14, tipo: "MOLE" });
    const duraDaRede = regra({ chave: "jornada_max_diaria", valor: 10, tipo: "DURA" });

    expect(
      regraObrigatoria(resolverRegras([moleDaUf, duraDaRede], CTX_PADRAO), "jornada_max_diaria").valor,
    ).toBe(10);
  });

  it("entre regras da MESMA força a escada de escopo continua valendo: DURA de UF vence DURA de rede", () => {
    // Caso legítimo que a correção não pode matar: CCT/lei estadual mais
    // restritiva, cadastrada como trava de praça.
    const duraDaUf = regra({ uf: "SP", chave: "jornada_max_semanal", valor: 40, tipo: "DURA" });
    const duraDaRede = regra({ chave: "jornada_max_semanal", valor: 42, tipo: "DURA" });

    const resolvida = regraObrigatoria(
      resolverRegras([duraDaRede, duraDaUf], CTX_PADRAO),
      "jornada_max_semanal",
    );
    expect(resolvida.valor).toBe(40);
    expect(resolvida.escopo).toBe("uf");
  });

  it("entre duas MOLE, a de loja continua vencendo a de rede (preferência de loja segue funcionando)", () => {
    const moleDaLoja = regra({ storeId: 10, chave: "folga_preferencial", valor: "domingo", tipo: "MOLE" });
    const moleDaRede = regra({ chave: "folga_preferencial", valor: null, tipo: "MOLE" });

    const resolvida = regraObrigatoria(
      resolverRegras([moleDaRede, moleDaLoja], CTX_PADRAO),
      "folga_preferencial",
    );
    expect(resolvida.valor).toBe("domingo");
    expect(resolvida.escopo).toBe("loja");
  });

  it("PONTA A PONTA com o seed REAL: a MOLE de loja de 60h não tira a DURA de 42h da EC 141 do mapa", () => {
    // Exatamente o cenário que o revisor provou rodando o código real.
    const moleDaLoja = regra({
      storeId: 10,
      chave: "jornada_max_semanal",
      valor: 60,
      tipo: "MOLE",
      fonte: "politica interna da loja",
    });
    const data = "2026-12-16"; // já sob a EC 141
    const mapa = resolverRegras([...REGRAS_LEGAIS_INICIAIS, moleDaLoja], { ...CTX_PADRAO, data });

    const resolvida = regraObrigatoria(mapa, "jornada_max_semanal");
    expect(resolvida.valor).toBe(42);
    expect(resolvida.tipo).toBe("DURA");
    expect(resolvida.fonte).toContain("EC 141/2026");
  });
});

// ─── Menor (review final): regraObrigatoria rejeita valor nulo ───────────────

describe("regraObrigatoria — valor nulo é tão inválido quanto chave ausente", () => {
  it("regra vigente com valor null lança RegraAusenteError (motivo valor-nulo) em vez de virar 0 no motor", () => {
    const mapa = resolverRegras([regra({ chave: "jornada_max_semanal", valor: null })], CTX_PADRAO);
    expect(() => regraObrigatoria(mapa, "jornada_max_semanal")).toThrow(RegraAusenteError);
    try {
      regraObrigatoria(mapa, "jornada_max_semanal");
    } catch (erro) {
      expect((erro as InstanceType<typeof RegraAusenteError>).motivo).toBe("valor-nulo");
    }
  });

  it("valor 0 continua válido — zero é dado, nulo é ausência", () => {
    const mapa = resolverRegras([regra({ chave: "adicional_noturno_inicio", valor: 0 })], CTX_PADRAO);
    expect(regraObrigatoria(mapa, "adicional_noturno_inicio").valor).toBe(0);
  });
});
