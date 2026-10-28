# Formato real da DRE (export F360) — referência para o parser

**Fonte:** SharePoint AMFoods, `sites/AmFoods/Gestão/DRE´s/<MARCA>/` (ex.: `DRE AGROBAR FRANQUEADORA/DRE Agrobar Porto Alegre_Novo.xlsx`). Capturado 2026-10-27 do arquivo real. É o formato que o módulo de Orçamento deve ler (Task 2/3 do plano).

## Dois formatos existem no SharePoint
1. **Multi-mês (PREFERIDO)** — ex.: `DRE Agrobar Porto Alegre_Novo.xlsx`, `DRE_CONSOLIDADO_2026.xlsx`. Um arquivo tem vários meses em **colunas**. É o que o `extractDreHistorico` (MESES_REGEX) já ataca.
2. **Mês a mês** — ex.: `DRE Abarsol - Março2026.xlsx` (pasta `ABARSOL - JULIANO`). Um arquivo por mês; layout `Descrição | Valor Total | Percentual %`, códigos `001. RECEITA / 001.001 VENDAS`. (Branch secundário; tratar depois se necessário.)

## Estrutura do formato multi-mês (F360)
- Aba de dados chama **"DRE"** (há também aba "Filtros Escolhidos" com metadados do export: `Modelo = DRE F360º`, empresa, período, regime=Competência).
- **Linha 1 (cabeçalho):** nome da loja na 1ª célula, depois blocos de **3 colunas por mês**: `<valor> | % | <espaçador vazio>`. Meses como `12/2025`, `01/2026`, … (detectar com regex de `MM/AAAA`). Pegar os **últimos N meses** (N=2 ou 3).
- **Valores:** pt-BR com `R$`: `R$ 727.648,25`; negativos `-R$ 23.388,87`; zero `R$ -`. Usar `cellToNumberDre`/`parseNumeroBR`.
- **Linhas:** hierárquicas por código `G - Nome` e `G.sub - Nome`. Grupos de nível 1 são o que importa pro orçamento; sub-linhas são detalhe.

### As 15 linhas de nível 1 (a taxonomia canônica da DRE AMFoods)
| Cód | Linha nível 1 | Mapeia no orçamento para | Alavanca? |
|---|---|---|---|
| 1 | **Receita Bruta** (1.1 Dinheiro, 1.2 Cartão Créd, 1.3 Cartão Déb, 1.4 PIX) | `receitaBruta` | — |
| 2 | **Redutores de Venda** (2.1 Taxa de Serviço) | redutor | — |
| 3 | **Receita Líquida** (calculada) | — (derivada) | — |
| 4 | **Custo de Mercadoria** = CMV (4.1 Mat.Limpeza, 4.2 Carnes, 4.3 HortiFruti, 4.4 Bebidas, 4.5 Diversos, 4.6 Descartáveis, 4.7 Cafés, 4.8 Pães, 4.9 Salgados) | `cmv` | **SIM (CMV)** |
| 5 | **Impostos** (5.1 Simples, 5.2 ICMS, 5.3 Cofins, 5.4 Pis, 5.5 IR/CSLL) | `impostos` | — |
| 6 | **Taxa Mensal Franquias** (6.1 Royalties, 6.2 Fundo de Promoção) | `royalties` + `fundoMarketing` | — |
| 7 | **Colaboradores** = Folha (7.1 Salários, 7.2 Adiant., 7.3 FGTS, 7.4 INSS+IR, 7.5 Extras, 7.6 VT, 7.7 Ajuda Custo, 7.8 UBER, 7.9 Exames, 7.10 Rescisões, 7.11 FGTS Resc, 7.12 Brindes, 7.13/7.14 13º) | folha (`proLabore`/`encargos` + linha folha) | **SIM (Folha)** |
| 8 | **Serviços de Terceiros** (8.2 Contador, 8.3 Sistemas, 8.6 Manutenção, 8.7 Internet, 8.9 Músicos, 8.10 Segurança…) | `contabilidade`/`sistemas`/`outrosServicos` | — |
| 9 | **Terceiros Eventuais** (9.1 Publicidade, 9.2 Uniformes, 9.4 Utensílios, 9.6 Diversas…) | `marketing`/`outrasDespesas` | — |
| 10 | **Custo de Ocupação** (10.1 Aluguel, 10.2 Condomínio, 10.3 IPTU, 10.4 Seguro, 10.5 Gás, 10.6 Energia, 10.7 Água) | `aluguel`/`condominio`/`energia`/`gas`/`agua` | — |
| 11 | **Despesas Financeiras** (11.1 Taxas cartões, 11.2 Juros) | `taxaCartao`/`juros`/`tarifasBancarias` | — |
| 12 | **Lucro Operacional** (calculado) | — (derivada) | — |
| 13 | **Pró-labore / Distribuição** | `proLabore` | — |
| 14 | **Lucro Líquido** (calculado) | — (derivada) | — |
| 15 | **Despesas Não Operacionais** (15.1 Novos Investimentos, 15.4 Empréstimo, 15.6 Investimento Inicial) | fora do EBITDA operacional | — |
| 14* | **Resultado** (linha final, repete o código 14) | resultado final | — |

> O **EBITDA/Resultado operacional** sai de Receita Líquida − CMV − Impostos − Franquias − Colaboradores − Terceiros − Ocupação − Financeiras (linhas 3 a 11), **antes** de pró-labore (13) e não-operacionais (15). Conferir contra a linha `12 - Lucro Operacional` do arquivo.

### Ruído a ignorar (abaixo da DRE principal, na mesma aba)
Blocos extras após a linha de Resultado: "Taxa de Serviço Real", "CMV Real (mês)" com Receita Bruta/Couvert/Brindes/Músicos/Sócios/Total Faturamento CMV/`CMV %`. **Não** são linhas da DRE — o parser para na linha `14 - Resultado` (ou detecta a quebra). *(Porém o `CMV %` desse bloco é a visão "CMV real" da operação — útil como referência da alavanca CMV, mas não é linha de orçamento.)*

## Implicações para o build
- **Task 2 (parser):** `extractDreHistorico` + `CATEGORIA_MAP` precisam reconhecer estes nomes de grupo nível 1 (`4 - Custo de Mercadoria` → cmv, `7 - Colaboradores` → folha, `10 - Custo de Ocupação` → ocupação, etc.). Ajustar o `CATEGORIA_MAP` a estes rótulos exatos. Parar na linha de Resultado; ignorar blocos "Real".
- **Fixture de teste:** criar um `.xlsx` sintético com esta estrutura (cabeçalho de meses em 3 colunas, 15 grupos, valores pt-BR com `R$`, negativos, `R$ -`) — espelhando o Agrobar POA.
- **Task 3 (proposta):** mapear os 15 grupos nível 1 para os campos de `orcamentos` conforme a coluna "Mapeia para" acima. Linhas derivadas (3, 12, 14) são calculadas pelo motor, não lidas.
- **Fonte SharePoint (fast-follow):** navegar `Gestão/DRE´s/<MARCA>/` e pegar o `.xlsx` multi-mês mais recente da loja. As DREs já são export F360 — então "SharePoint" e "F360" são a mesma origem, só que o arquivo já está salvo no SharePoint (é o que o Fernando quer: ler do SharePoint, não chamar a API do F360).
