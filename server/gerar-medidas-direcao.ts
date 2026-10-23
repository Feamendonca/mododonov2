import { invokeLLM } from "./_core/llm";
import { MODEL_DEEP } from "./_core/llm-models";
import { createMedida } from "./db-metas";
import { rawQuery } from "./db";

interface DreContexto {
  receitaBruta: number;
  cmvPct: number;
  folhaPct: number;
  ebitdaPct: number;
  pontosFrageis: string; // linhas piores identificadas
}

interface MedidaGerada {
  titulo: string;
  indicador: "cmv" | "folha" | "faturamento" | "experiencia" | "outro";
  metaComportamental: string;
  porque: string;
  planoAcao: Array<{ descricao: string; cadencia: string }>;
}

/**
 * Gera medidas de direção COMPORTAMENTAIS via IA (MODEL_DEEP).
 * Cada medida é gravada em medidas_direcao e seus planos em action_plans.
 */
export async function gerarMedidasDirecao(params: {
  metaId: number;
  storeId: number;
  orcamentoId: number;
  dre: DreContexto;
}): Promise<{ medidasCriadas: number; planosCriados: number }> {
  const { metaId, storeId, orcamentoId, dre } = params;

  const systemPrompt = `Você é especialista em 4DX aplicado a restaurantes. Distinção obrigatória:
- Medida de RESULTADO (lag): o placar (CMV%, EBITDA%, faturamento). O gerente NÃO controla diretamente. NÃO gere isso.
- Medida de DIREÇÃO (lead): um COMPORTAMENTO específico, controlável no dia a dia, mensurável, que PREVÊ o resultado. Sempre um verbo de ação + alvo + cadência.
Exemplos corretos (restaurante):
· CMV → 'Conferir 100% das notas de entrada contra o pedido a cada recebimento'; 'Fazer contagem de estoque toda terça'; 'Registrar quebra/desperdício ao fim de cada turno'.
· Folha → 'Fechar a escala dentro das horas orçadas por semana'; 'Acompanhar venda por hora trabalhada diariamente'.
· Faturamento → 'Executar 2 ações de upsell definidas por turno'; 'Registrar nº de atendimentos e ticket médio por dia'.
Gere de 3 a 5 medidas de direção COMPORTAMENTAIS, priorizando as alavancas mais fracas da DRE desta loja. Cada uma com 1-3 itens de plano de ação concretos (a rotina que executa a medida). Nunca devolva um % de resultado como medida.`;

  const userPrompt = `DRE meta da loja:
- Receita bruta: R$ ${dre.receitaBruta.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- CMV: ${dre.cmvPct.toFixed(1)}%
- Folha: ${dre.folhaPct.toFixed(1)}%
- EBITDA: ${dre.ebitdaPct.toFixed(1)}%

Pontos fracos identificados:
${dre.pontosFrageis || "Nenhum ponto fraco específico identificado."}

Gere as medidas de direção comportamentais para este mês.`;

  let medidas: MedidaGerada[] = [];

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: MODEL_DEEP,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "medidas_direcao",
          strict: true,
          schema: {
            type: "object",
            properties: {
              medidas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    titulo: { type: "string", description: "Comportamento no imperativo" },
                    indicador: { type: "string", enum: ["cmv", "folha", "faturamento", "experiencia", "outro"] },
                    metaComportamental: { type: "string", description: "Alvo + cadência" },
                    porque: { type: "string", description: "Por que move o resultado, citando nº da DRE" },
                    planoAcao: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          descricao: { type: "string" },
                          cadencia: { type: "string" },
                        },
                        required: ["descricao", "cadencia"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["titulo", "indicador", "metaComportamental", "porque", "planoAcao"],
                  additionalProperties: false,
                },
              },
            },
            required: ["medidas"],
            additionalProperties: false,
          },
        },
      },
      thinkingBudget: 6000,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[gerarMedidasDirecao] Resposta vazia da IA");
      return { medidasCriadas: 0, planosCriados: 0 };
    }
    const parsed = JSON.parse(content as string);
    medidas = parsed.medidas ?? [];
  } catch (err) {
    console.error("[gerarMedidasDirecao] Erro na chamada IA:", err);
    return { medidasCriadas: 0, planosCriados: 0 };
  }

  let medidasCriadas = 0;
  let planosCriados = 0;

  for (let i = 0; i < medidas.length; i++) {
    const m = medidas[i];
    try {
      const medidaId = await createMedida({
        metaId,
        lojaId: storeId,
        titulo: m.titulo,
        descricao: `${m.porque}\n\nMeta comportamental: ${m.metaComportamental}`,
        indicador: m.indicador,
        metaValor: null as any,
        metaOperador: "gte",
        unidade: m.metaComportamental,
        pesoRemuneracaoPct: 0,
        ordem: i + 1,
      });
      medidasCriadas++;

      // Criar planos de ação ligados à medida
      for (const pa of m.planoAcao) {
        await rawQuery(
          `INSERT INTO action_plans (storeId, title, description, status, reason, medida_id, isSuggestion)
           VALUES (?, ?, ?, 'active', ?, ?, 1)`,
          [storeId, pa.descricao, `Cadência: ${pa.cadencia}`, `[orc:${orcamentoId}] Medida: ${m.titulo}`, medidaId]
        );
        planosCriados++;
      }
    } catch (err) {
      console.error(`[gerarMedidasDirecao] Erro ao criar medida ${i}:`, err);
    }
  }

  console.log(`[gerarMedidasDirecao] ${medidasCriadas} medidas, ${planosCriados} planos criados para meta ${metaId}`);
  return { medidasCriadas, planosCriados };
}
