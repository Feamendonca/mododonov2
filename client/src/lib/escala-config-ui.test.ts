/**
 * escala-config-ui.test.ts — lógica pura da tela "Configuração da Escala"
 *
 * Testa as três funções puras de client/src/lib/escala-config-ui.ts:
 * `validarFuncao` (espelha, sem relaxar, a validação de
 * `server/routers/escala.ts` para dar feedback imediato na tela —
 * o servidor continua sendo a tranca de verdade), `rotuloOrigemProdutividade`
 * (texto que o gerente lê para cada origem da sugestão) e
 * `mensagemProdutividadeIndisponivel` (frase que explica o motivo de a
 * sugestão ter vindo `null` e pede o número ao gerente).
 *
 * Roda em `environment: "node"` (vitest.config.ts não tem jsdom/RTL — ver
 * ruling R19 do controlador em task-5-brief.md): zero React aqui, só
 * lógica.
 */
import { describe, expect, it } from "vitest";
import {
  deveExibirAvisoProdutividadeIndisponivel,
  mensagemProdutividadeIndisponivel,
  rotuloOrigemProdutividade,
  validarFuncao,
  type EntradaValidarFuncao,
} from "./escala-config-ui";

function entradaValida(overrides: Partial<EntradaValidarFuncao> = {}): EntradaValidarFuncao {
  return {
    nome: "Atendente",
    driver: "tickets",
    produtividadeAlvo: 12,
    minPorBloco: 1,
    maxPorBloco: 3,
    ...overrides,
  };
}

describe("validarFuncao — espelha a validação do servidor (conveniência de tela, não a tranca)", () => {
  it("não gera erro para uma entrada completamente válida", () => {
    expect(validarFuncao(entradaValida())).toEqual([]);
  });

  it("bloqueia salvar com minPorBloco = 0 (R13/brief: 0 não é configuração, é não cadastrar)", () => {
    const erros = validarFuncao(entradaValida({ minPorBloco: 0 }));
    expect(erros.length).toBeGreaterThan(0);
    expect(erros.some((e) => /mínimo.*bloco/i.test(e) || /minPorBloco/i.test(e))).toBe(true);
  });

  it("bloqueia minPorBloco negativo", () => {
    const erros = validarFuncao(entradaValida({ minPorBloco: -1 }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("bloqueia minPorBloco fracionário (servidor exige int)", () => {
    const erros = validarFuncao(entradaValida({ minPorBloco: 1.5 }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("bloqueia produtividadeAlvo = 0 (I7 do fix loop da Task 4: 0 vira Infinity na divisão)", () => {
    const erros = validarFuncao(entradaValida({ produtividadeAlvo: 0 }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("bloqueia produtividadeAlvo negativo", () => {
    const erros = validarFuncao(entradaValida({ produtividadeAlvo: -5 }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("bloqueia produtividadeAlvo = NaN (M4: comparação `NaN <= 0` é sempre falsa — passava sem checagem explícita)", () => {
    const erros = validarFuncao(entradaValida({ produtividadeAlvo: NaN }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("aceita produtividadeAlvo nula (ainda não definida pelo gestor)", () => {
    expect(validarFuncao(entradaValida({ produtividadeAlvo: null }))).toEqual([]);
  });

  it("bloqueia maxPorBloco menor que minPorBloco (I7: min=5/max=2 era restrição insatisfazível silenciosa)", () => {
    const erros = validarFuncao(entradaValida({ minPorBloco: 5, maxPorBloco: 2 }));
    expect(erros.length).toBeGreaterThan(0);
    expect(erros.some((e) => /máximo.*bloco|maxPorBloco/i.test(e))).toBe(true);
  });

  it("aceita maxPorBloco igual a minPorBloco", () => {
    expect(validarFuncao(entradaValida({ minPorBloco: 2, maxPorBloco: 2 }))).toEqual([]);
  });

  it("aceita maxPorBloco nulo (sem teto)", () => {
    expect(validarFuncao(entradaValida({ maxPorBloco: null }))).toEqual([]);
  });

  it("bloqueia maxPorBloco fracionário, mesmo quando >= minPorBloco (I2: servidor exige z.number().int(), a tela só checava < minPorBloco — 2.5 passava)", () => {
    const erros = validarFuncao(entradaValida({ minPorBloco: 1, maxPorBloco: 2.5 }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("bloqueia driver fora de tickets|pratos|cobertos", () => {
    const erros = validarFuncao(entradaValida({ driver: "qualquer-coisa" as any }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("aceita os três drivers válidos", () => {
    expect(validarFuncao(entradaValida({ driver: "tickets" }))).toEqual([]);
    expect(validarFuncao(entradaValida({ driver: "pratos" }))).toEqual([]);
    expect(validarFuncao(entradaValida({ driver: "cobertos" }))).toEqual([]);
  });

  it("bloqueia nome vazio", () => {
    const erros = validarFuncao(entradaValida({ nome: "" }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("bloqueia nome só com espaços", () => {
    const erros = validarFuncao(entradaValida({ nome: "   " }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("bloqueia nome maior que 64 caracteres (limite do servidor)", () => {
    const erros = validarFuncao(entradaValida({ nome: "a".repeat(65) }));
    expect(erros.length).toBeGreaterThan(0);
  });

  it("aceita nome com exatamente 64 caracteres", () => {
    expect(validarFuncao(entradaValida({ nome: "a".repeat(64) }))).toEqual([]);
  });

  it("acumula múltiplos erros ao mesmo tempo (não para no primeiro)", () => {
    const erros = validarFuncao(entradaValida({ nome: "", minPorBloco: 0, driver: "x" as any }));
    expect(erros.length).toBeGreaterThanOrEqual(3);
  });
});

describe("rotuloOrigemProdutividade — texto que o gerente lê (R22: honestidade de rótulo)", () => {
  it("driver tickets: rotula sugestão vinda do histórico da loja, SEM ressalva (atendimentos ≈ tickets, base é específica)", () => {
    expect(rotuloOrigemProdutividade("sugerida_historico", "tickets")).toBe("histórico da loja");
  });

  it("driver tickets: rotula sugestão vinda de benchmark da rede, SEM ressalva", () => {
    expect(rotuloOrigemProdutividade("sugerida_benchmark", "tickets")).toBe("melhor loja da rede");
  });

  it("driver pratos: sugestão do histórico da loja carrega a ressalva — base é o total de atendimentos genérico, não pratos", () => {
    const rotulo = rotuloOrigemProdutividade("sugerida_historico", "pratos");
    expect(rotulo).toContain("histórico da loja");
    expect(rotulo.toLowerCase()).toContain("atendimentos");
    expect(rotulo.toLowerCase()).toMatch(/confir|confere|verifi/);
  });

  it("driver cobertos: sugestão do histórico da loja carrega a ressalva — mesma razão do pratos (mesa com várias pessoas, atendimento ≠ coberto)", () => {
    const rotulo = rotuloOrigemProdutividade("sugerida_historico", "cobertos");
    expect(rotulo).toContain("histórico da loja");
    expect(rotulo.toLowerCase()).toContain("atendimentos");
    expect(rotulo.toLowerCase()).toMatch(/confir|confere|verifi/);
  });

  it("driver pratos: sugestão de benchmark da rede também carrega a ressalva — mesma base genérica, outra loja", () => {
    const rotulo = rotuloOrigemProdutividade("sugerida_benchmark", "pratos");
    expect(rotulo).toContain("melhor loja da rede");
    expect(rotulo.toLowerCase()).toContain("atendimentos");
  });

  it("driver cobertos: sugestão de benchmark da rede também carrega a ressalva", () => {
    const rotulo = rotuloOrigemProdutividade("sugerida_benchmark", "cobertos");
    expect(rotulo).toContain("melhor loja da rede");
    expect(rotulo.toLowerCase()).toContain("atendimentos");
  });

  it("valor definido manualmente pelo gestor: NUNCA leva ressalva, em nenhum driver — o gestor já sabe a base do número que ele mesmo digitou", () => {
    expect(rotuloOrigemProdutividade("definida_gestor", "tickets")).toBe("definida por você");
    expect(rotuloOrigemProdutividade("definida_gestor", "pratos")).toBe("definida por você");
    expect(rotuloOrigemProdutividade("definida_gestor", "cobertos")).toBe("definida por você");
  });

  it("origem nula: devolve string vazia independente do driver (sem sugestão ainda, campo em branco)", () => {
    expect(rotuloOrigemProdutividade(null, "tickets")).toBe("");
    expect(rotuloOrigemProdutividade(null, "pratos")).toBe("");
    expect(rotuloOrigemProdutividade(null, "cobertos")).toBe("");
  });
});

describe("mensagemProdutividadeIndisponivel — motivo + pedido do número", () => {
  it("inclui o motivo recebido do servidor na mensagem", () => {
    const msg = mensagemProdutividadeIndisponivel(
      "Amostra insuficiente para virar régua: são necessários ao menos 5 dias válidos de histórico (há 2).",
    );
    expect(msg).toContain("Amostra insuficiente para virar régua");
  });

  it("pede explicitamente o número ao gestor", () => {
    const msg = mensagemProdutividadeIndisponivel("Sem escala registrada.");
    expect(msg.toLowerCase()).toMatch(/informe|digite|preencha/);
  });

  it("nunca devolve string vazia, mesmo sem motivo (fallback explica a ausência)", () => {
    const msg = mensagemProdutividadeIndisponivel(undefined);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).toMatch(/informe|digite|preencha/);
  });
});

describe("deveExibirAvisoProdutividadeIndisponivel — I1: não pode contradizer um valor já definido", () => {
  it("mostra o aviso quando não há sugestão e o campo está vazio (loja nova, sem histórico — o caso que o aviso existe para cobrir)", () => {
    expect(
      deveExibirAvisoProdutividadeIndisponivel({
        carregandoSugestao: false,
        valorSugerido: null,
        produtividadeTocada: false,
        produtividadeAtual: "",
      }),
    ).toBe(true);
  });

  it("NÃO mostra o aviso enquanto a sugestão ainda está carregando", () => {
    expect(
      deveExibirAvisoProdutividadeIndisponivel({
        carregandoSugestao: true,
        valorSugerido: null,
        produtividadeTocada: false,
        produtividadeAtual: "",
      }),
    ).toBe(false);
  });

  it("NÃO mostra o aviso quando o gestor já tocou o campo manualmente — não pode dizer 'indisponível, informe o número' e 'definida por você' ao mesmo tempo", () => {
    expect(
      deveExibirAvisoProdutividadeIndisponivel({
        carregandoSugestao: false,
        valorSugerido: null,
        produtividadeTocada: true,
        produtividadeAtual: "12",
      }),
    ).toBe(false);
  });

  it("NÃO mostra o aviso quando já existe um valor no campo, mesmo sem ter sido 'tocado' nesta sessão (ex.: reabrindo função já salva com valor antes de a sugestão nova chegar)", () => {
    expect(
      deveExibirAvisoProdutividadeIndisponivel({
        carregandoSugestao: false,
        valorSugerido: null,
        produtividadeTocada: false,
        produtividadeAtual: "8",
      }),
    ).toBe(false);
  });

  it("NÃO mostra o aviso quando a sugestão existe (valorSugerido não é null)", () => {
    expect(
      deveExibirAvisoProdutividadeIndisponivel({
        carregandoSugestao: false,
        valorSugerido: 15,
        produtividadeTocada: false,
        produtividadeAtual: "15",
      }),
    ).toBe(false);
  });
});
