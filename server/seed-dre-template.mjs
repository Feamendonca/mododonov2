/**
 * Seed do catálogo completo de linhas da DRE
 * Baseado nas 7 planilhas reais: CulturaPaulista, CabanaAero T2/T3, Giraffas CGH, Pecorino T2/T3/MktPlace
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// Limpar catálogo existente
await db.execute("DELETE FROM dre_template_linhas");
await db.execute("ALTER TABLE dre_template_linhas AUTO_INCREMENT = 1");

const linhas = [
  // ─── GRUPO 1: RECEITA OPERACIONAL BRUTA ─────────────────────────────────────
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.0", l: "RECEITA OPERACIONAL BRUTA (TOTAL)", t: "rs", eg: 1, b: 0, o: 10 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.1", l: "Dinheiro", t: "rs", eg: 0, b: 0, o: 11 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.1", l: "Venda a Crédito — Visa", t: "rs", eg: 0, b: 0, o: 12 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.2", l: "Venda a Crédito — Mastercard", t: "rs", eg: 0, b: 0, o: 13 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.3", l: "Venda a Crédito — Elo", t: "rs", eg: 0, b: 0, o: 14 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.4", l: "Venda a Crédito — Amex", t: "rs", eg: 0, b: 0, o: 15 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.5", l: "Venda a Crédito — Hipercard", t: "rs", eg: 0, b: 0, o: 16 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.10", l: "Venda a Débito — Visa Electron", t: "rs", eg: 0, b: 0, o: 17 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.11", l: "Venda a Débito — Maestro", t: "rs", eg: 0, b: 0, o: 18 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.14", l: "Venda a Débito — Elo Débito", t: "rs", eg: 0, b: 0, o: 19 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.17", l: "Vale Refeição — Ticket", t: "rs", eg: 0, b: 0, o: 20 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.18", l: "Vale Refeição — Alelo", t: "rs", eg: 0, b: 0, o: 21 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.19", l: "Vale Refeição — Sodexho", t: "rs", eg: 0, b: 0, o: 22 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.20", l: "Vale Refeição — VR", t: "rs", eg: 0, b: 0, o: 23 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.25", l: "Vale Refeição — Ben Vale", t: "rs", eg: 0, b: 0, o: 24 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.2.26", l: "PIX", t: "rs", eg: 0, b: 0, o: 25 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.4.1", l: "Vendas iFood", t: "rs", eg: 0, b: 0, o: 26 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.4.10", l: "Vendas Rappi", t: "rs", eg: 0, b: 0, o: 27 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.4.20", l: "Vendas 99 Food", t: "rs", eg: 0, b: 0, o: 28 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.5", l: "Caixinha / Gorjeta (Serviço)", t: "rs", eg: 0, b: 0, o: 29 },
  { g: "G01", gl: "Receita Operacional Bruta", c: "1.6", l: "Venda Voucher / Cias Aéreas", t: "rs", eg: 0, b: 0, o: 30 },

  // ─── GRUPO 2: DEDUÇÕES DA RECEITA BRUTA ─────────────────────────────────────
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.1.1", l: "Taxa de Serviço Paga", t: "pct", eg: 0, b: 1, o: 110 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.2.1", l: "Descontos Promocionais", t: "pct", eg: 0, b: 1, o: 111 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.2.2", l: "Descontos Funcionários", t: "rs", eg: 0, b: 1, o: 112 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.2.3", l: "Devolução de Clientes", t: "rs", eg: 0, b: 1, o: 113 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.3.1", l: "Taxa de Aluguel de Máquina", t: "rs", eg: 0, b: 1, o: 114 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.3.2", l: "Taxa de Administração de Cartão", t: "pct", eg: 0, b: 1, o: 115 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.3.3", l: "Taxa de Antecipação de Cartão", t: "pct", eg: 0, b: 1, o: 116 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.3.5", l: "Taxa de Administração de Voucher", t: "pct", eg: 0, b: 1, o: 117 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.3.7", l: "Taxas de Delivery (iFood/Rappi)", t: "pct", eg: 0, b: 1, o: 118 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.4.1", l: "ICMS sobre Vendas", t: "pct", eg: 0, b: 1, o: 119 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.4.2", l: "Simples Nacional", t: "pct", eg: 0, b: 1, o: 120 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.4.3", l: "PIS", t: "pct", eg: 0, b: 1, o: 121 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.4.4", l: "COFINS", t: "pct", eg: 0, b: 1, o: 122 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.4.5", l: "ISS", t: "pct", eg: 0, b: 1, o: 123 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.5.1", l: "Royalties", t: "pct", eg: 0, b: 1, o: 124 },
  { g: "G02", gl: "Deduções da Receita Bruta", c: "2.5.2", l: "Fundo de Promoção / Marketing Marca", t: "pct", eg: 0, b: 1, o: 125 },

  // ─── GRUPO 3: RECEITA LÍQUIDA (calculado) ────────────────────────────────────
  { g: "G03", gl: "Receita Líquida", c: "3.0", l: "RECEITA LÍQUIDA", t: "calculado", eg: 0, b: 1, o: 200 },
  { g: "G03", gl: "Receita Líquida", c: "3A", l: "Receita Líquida para Análise (Bruta − Taxa Serviço)", t: "calculado", eg: 0, b: 1, o: 201 },

  // ─── GRUPO 4: CUSTO DE MERCADORIA (CMV) ──────────────────────────────────────
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.0", l: "CMV TOTAL", t: "pct", eg: 1, b: 0, o: 300 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.1.1", l: "Carnes e Proteínas", t: "pct", eg: 1, b: 0, o: 301 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.2.1", l: "Hortifruti", t: "pct", eg: 1, b: 0, o: 302 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.3.2", l: "Pães, Massas e Salgadinhos", t: "pct", eg: 1, b: 0, o: 303 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.3.4", l: "Sobremesas", t: "pct", eg: 1, b: 0, o: 304 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.3.5", l: "Secos, Conservas e Mercearia", t: "pct", eg: 1, b: 0, o: 305 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.3.6", l: "Queijos, Ovos e Laticínios", t: "pct", eg: 1, b: 0, o: 306 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.3.7", l: "Supermercado (compras gerais)", t: "pct", eg: 1, b: 0, o: 307 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.4.1", l: "Sucos e Frutas", t: "pct", eg: 1, b: 0, o: 308 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.4.2", l: "Chopp e Cervejas", t: "pct", eg: 1, b: 0, o: 309 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.4.3", l: "Vinhos", t: "pct", eg: 1, b: 0, o: 310 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.4.4", l: "Destilados", t: "pct", eg: 1, b: 0, o: 311 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.4.5", l: "Outras Bebidas Não Alcoólicas", t: "pct", eg: 1, b: 0, o: 312 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.5.1", l: "Diferença de Estoque (+)", t: "rs", eg: 1, b: 0, o: 313 },
  { g: "G04", gl: "Custo de Mercadoria (CMV)", c: "4.5.2", l: "Diferença de Estoque (−)", t: "rs", eg: 1, b: 0, o: 314 },

  // ─── GRUPO 5: LUCRO BRUTO (calculado) ────────────────────────────────────────
  { g: "G05", gl: "Lucro Bruto", c: "5.0", l: "LUCRO BRUTO", t: "calculado", eg: 0, b: 1, o: 400 },

  // ─── GRUPO 6: DESPESAS COM PESSOAL ───────────────────────────────────────────
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.1", l: "Salários e Remunerações", t: "rs", eg: 1, b: 0, o: 500 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.2", l: "Horas Extras", t: "rs", eg: 1, b: 0, o: 501 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.3", l: "Adicional Noturno", t: "rs", eg: 1, b: 0, o: 502 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.4", l: "13º Salário", t: "rs", eg: 1, b: 0, o: 503 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.5", l: "13º Salário s/ Provisão", t: "rs", eg: 1, b: 0, o: 504 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.6", l: "Férias", t: "rs", eg: 1, b: 0, o: 505 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.7", l: "Provisão de Férias", t: "rs", eg: 1, b: 0, o: 506 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.8", l: "FGTS", t: "rs", eg: 1, b: 0, o: 507 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.9", l: "FGTS s/ Rescisão", t: "rs", eg: 1, b: 0, o: 508 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.10", l: "INSS / Encargos Sociais", t: "rs", eg: 1, b: 0, o: 509 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.11", l: "Rescisão Trabalhista", t: "rs", eg: 1, b: 0, o: 510 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.12", l: "Rescisões Contratuais", t: "rs", eg: 1, b: 0, o: 511 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.13", l: "Pro-labore", t: "rs", eg: 0, b: 1, o: 512 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.14", l: "Comissões e Prêmios / Bonificação", t: "rs", eg: 1, b: 0, o: 513 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.1.15", l: "Adiantamento de Salário", t: "rs", eg: 1, b: 0, o: 514 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.2.1", l: "Vale Transporte", t: "rs", eg: 1, b: 0, o: 520 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.2.2", l: "Alimentação / Refeição Funcionários", t: "rs", eg: 1, b: 0, o: 521 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.2.3", l: "Plano de Saúde", t: "rs", eg: 1, b: 0, o: 522 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.2.4", l: "Plano Odontológico", t: "rs", eg: 1, b: 0, o: 523 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.2.5", l: "Seguro de Vida", t: "rs", eg: 1, b: 0, o: 524 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.2.6", l: "Ajuda de Custo / Combustível", t: "rs", eg: 1, b: 0, o: 525 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.2.7", l: "Uniformes e EPI", t: "rs", eg: 1, b: 0, o: 526 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.3.1", l: "Medicina do Trabalho / Nutricionista", t: "rs", eg: 1, b: 0, o: 530 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.3.2", l: "Cursos e Treinamentos", t: "rs", eg: 1, b: 0, o: 531 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.3.3", l: "Serviços de Pessoal Extra (Eventos)", t: "rs", eg: 1, b: 0, o: 532 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.3.4", l: "Contribuição Sindical / Assistencial", t: "rs", eg: 1, b: 0, o: 533 },
  { g: "G06", gl: "Despesas com Pessoal", c: "6.3.5", l: "Assessoria de Recursos Humanos", t: "rs", eg: 0, b: 1, o: 534 },

  // ─── GRUPO 7: OCUPAÇÃO / IMÓVEIS ─────────────────────────────────────────────
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.1", l: "Aluguel Mínimo / Fixo", t: "rs", eg: 0, b: 1, o: 600 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.2", l: "Condomínio", t: "rs", eg: 0, b: 1, o: 601 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.3", l: "IPTU", t: "rs", eg: 0, b: 1, o: 602 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.4", l: "Água e Esgoto", t: "rs", eg: 1, b: 0, o: 603 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.5", l: "Energia Elétrica", t: "rs", eg: 1, b: 0, o: 604 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.6", l: "Gás Natural", t: "rs", eg: 1, b: 0, o: 605 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.7", l: "Seguro Predial", t: "rs", eg: 0, b: 1, o: 606 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.8", l: "Taxa de Administração de Aluguel", t: "rs", eg: 0, b: 1, o: 607 },
  { g: "G07", gl: "Ocupação / Imóveis", c: "7.9", l: "Taxas Imobiliárias", t: "rs", eg: 0, b: 1, o: 608 },

  // ─── GRUPO 8: MANUTENÇÃO E CONSERVAÇÃO ───────────────────────────────────────
  { g: "G08", gl: "Manutenção e Conservação", c: "8.1", l: "Material de Limpeza e Higienização", t: "rs", eg: 1, b: 0, o: 700 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.2", l: "Coleta de Lixo / Dedetização", t: "rs", eg: 1, b: 0, o: 701 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.3", l: "Refrigeração e Exaustão", t: "rs", eg: 1, b: 0, o: 702 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.4", l: "Serviços / Materiais Elétricos", t: "rs", eg: 1, b: 0, o: 703 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.5", l: "Manutenção Predial (Mat/Serviço)", t: "rs", eg: 1, b: 0, o: 704 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.6", l: "Manutenção de Mobiliário", t: "rs", eg: 1, b: 0, o: 705 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.7", l: "Manutenção de Equipamentos (Cocção/Exaustor)", t: "rs", eg: 1, b: 0, o: 706 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.8", l: "Ar Condicionado", t: "rs", eg: 1, b: 0, o: 707 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.9", l: "Manutenção Preventiva", t: "rs", eg: 1, b: 0, o: 708 },
  { g: "G08", gl: "Manutenção e Conservação", c: "8.10", l: "Outros Serviços / Materiais de Manutenção", t: "rs", eg: 1, b: 0, o: 709 },

  // ─── GRUPO 9: UTENSÍLIOS E DESCARTÁVEIS ──────────────────────────────────────
  { g: "G09", gl: "Utensílios e Descartáveis", c: "9.1", l: "Utensílios e Materiais de Cozinha", t: "rs", eg: 1, b: 0, o: 800 },
  { g: "G09", gl: "Utensílios e Descartáveis", c: "9.2", l: "Utensílios e Materiais de Salão", t: "rs", eg: 1, b: 0, o: 801 },
  { g: "G09", gl: "Utensílios e Descartáveis", c: "9.3", l: "Utensílios de Refeição de Funcionários", t: "rs", eg: 1, b: 0, o: 802 },
  { g: "G09", gl: "Utensílios e Descartáveis", c: "9.4", l: "Descartáveis", t: "rs", eg: 1, b: 0, o: 803 },
  { g: "G09", gl: "Utensílios e Descartáveis", c: "9.5", l: "Descartáveis de Delivery", t: "rs", eg: 1, b: 0, o: 804 },

  // ─── GRUPO 10: TELECOMUNICAÇÕES E INFORMÁTICA ────────────────────────────────
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.1", l: "Planos de Telefonia Fixa", t: "rs", eg: 0, b: 1, o: 900 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.2", l: "Planos de Telefonia Móvel", t: "rs", eg: 0, b: 1, o: 901 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.3", l: "Planos de Acesso à Internet", t: "rs", eg: 0, b: 1, o: 902 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.4", l: "Materiais de Telecomunicações", t: "rs", eg: 0, b: 1, o: 903 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.5", l: "Suprimentos de Informática", t: "rs", eg: 0, b: 1, o: 904 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.6", l: "Serviços de Informática", t: "rs", eg: 0, b: 1, o: 905 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.7", l: "Direito de Uso de Software", t: "rs", eg: 0, b: 1, o: 906 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.8", l: "Sistema Everest / Frente de Loja", t: "rs", eg: 0, b: 1, o: 907 },
  { g: "G10", gl: "Telecomunicações e Informática", c: "10.9", l: "Relógio de Ponto", t: "rs", eg: 0, b: 1, o: 908 },

  // ─── GRUPO 11: ADMINISTRATIVAS ───────────────────────────────────────────────
  { g: "G11", gl: "Administrativas", c: "11.1", l: "Materiais de Escritório", t: "rs", eg: 0, b: 1, o: 1000 },
  { g: "G11", gl: "Administrativas", c: "11.2", l: "Correios e Postagens", t: "rs", eg: 0, b: 1, o: 1001 },
  { g: "G11", gl: "Administrativas", c: "11.3", l: "Reembolso de Refeições e Estacionamentos", t: "rs", eg: 0, b: 1, o: 1002 },
  { g: "G11", gl: "Administrativas", c: "11.4", l: "Assessoria Contábil e Fiscal", t: "rs", eg: 0, b: 1, o: 1003 },
  { g: "G11", gl: "Administrativas", c: "11.5", l: "Assessoria Jurídica Trabalhista", t: "rs", eg: 0, b: 1, o: 1004 },
  { g: "G11", gl: "Administrativas", c: "11.6", l: "Assessorias, Consultorias e Auditorias", t: "rs", eg: 0, b: 1, o: 1005 },
  { g: "G11", gl: "Administrativas", c: "11.7", l: "Multas e Juros s/ Atraso", t: "rs", eg: 0, b: 1, o: 1006 },
  { g: "G11", gl: "Administrativas", c: "11.8", l: "IOF / IRRF de Terceiros", t: "rs", eg: 0, b: 1, o: 1007 },
  { g: "G11", gl: "Administrativas", c: "11.9", l: "Mensalidade Abrasel / Credenciamento", t: "rs", eg: 0, b: 1, o: 1008 },
  { g: "G11", gl: "Administrativas", c: "11.10", l: "Despesas Legais e Cartório", t: "rs", eg: 0, b: 1, o: 1009 },

  // ─── GRUPO 12: MARKETING E VENDAS ────────────────────────────────────────────
  { g: "G12", gl: "Marketing e Vendas", c: "12.1", l: "Despesas com Marketing Local", t: "rs", eg: 1, b: 0, o: 1100 },
  { g: "G12", gl: "Marketing e Vendas", c: "12.2", l: "Despesas Marketing da Marca", t: "pct", eg: 0, b: 1, o: 1101 },
  { g: "G12", gl: "Marketing e Vendas", c: "12.3", l: "Mídia Digital", t: "rs", eg: 1, b: 0, o: 1102 },
  { g: "G12", gl: "Marketing e Vendas", c: "12.4", l: "Eventos e Confraternizações", t: "rs", eg: 1, b: 0, o: 1103 },
  { g: "G12", gl: "Marketing e Vendas", c: "12.5", l: "Músicos, Bandas e Atrações", t: "rs", eg: 1, b: 0, o: 1104 },
  { g: "G12", gl: "Marketing e Vendas", c: "12.6", l: "Materiais de Ambientação", t: "rs", eg: 1, b: 0, o: 1105 },
  { g: "G12", gl: "Marketing e Vendas", c: "12.7", l: "Serviços de Ambientação", t: "rs", eg: 1, b: 0, o: 1106 },

  // ─── GRUPO 13: TRANSPORTES ───────────────────────────────────────────────────
  { g: "G13", gl: "Transportes", c: "13.1", l: "Combustível", t: "rs", eg: 0, b: 1, o: 1200 },
  { g: "G13", gl: "Transportes", c: "13.2", l: "Seguro de Veículos", t: "rs", eg: 0, b: 1, o: 1201 },
  { g: "G13", gl: "Transportes", c: "13.3", l: "Táxi, Estacionamento e KM", t: "rs", eg: 0, b: 1, o: 1202 },
  { g: "G13", gl: "Transportes", c: "13.4", l: "Passagens", t: "rs", eg: 0, b: 1, o: 1203 },
  { g: "G13", gl: "Transportes", c: "13.5", l: "Viagens e Estadias", t: "rs", eg: 0, b: 1, o: 1204 },

  // ─── GRUPO 14: OUTRAS DESPESAS OPERACIONAIS ──────────────────────────────────
  { g: "G14", gl: "Outras Despesas Operacionais", c: "14.1", l: "Serviços de Locação de Equipamentos", t: "rs", eg: 1, b: 0, o: 1300 },
  { g: "G14", gl: "Outras Despesas Operacionais", c: "14.2", l: "Serviços de Lavanderia", t: "rs", eg: 1, b: 0, o: 1301 },
  { g: "G14", gl: "Outras Despesas Operacionais", c: "14.3", l: "Fretes", t: "rs", eg: 1, b: 0, o: 1302 },
  { g: "G14", gl: "Outras Despesas Operacionais", c: "14.4", l: "Contrato de Motoboys (Delivery)", t: "rs", eg: 1, b: 0, o: 1303 },
  { g: "G14", gl: "Outras Despesas Operacionais", c: "14.5", l: "Obras", t: "rs", eg: 0, b: 1, o: 1304 },
  { g: "G14", gl: "Outras Despesas Operacionais", c: "14.6", l: "Outras Despesas Operacionais", t: "rs", eg: 1, b: 0, o: 1305 },

  // ─── GRUPO 15: DESPESAS FINANCEIRAS ──────────────────────────────────────────
  { g: "G15", gl: "Despesas Financeiras", c: "15.1", l: "Tarifa Bancária", t: "rs", eg: 0, b: 1, o: 1400 },
  { g: "G15", gl: "Despesas Financeiras", c: "15.2", l: "Juros Cheque Especial / Conta Garantida", t: "rs", eg: 0, b: 1, o: 1401 },
  { g: "G15", gl: "Despesas Financeiras", c: "15.3", l: "Multas e Juros Financeiros", t: "rs", eg: 0, b: 1, o: 1402 },
  { g: "G15", gl: "Despesas Financeiras", c: "15.4", l: "Rendimentos de Aplicações Financeiras", t: "rs", eg: 0, b: 1, o: 1403 },
  { g: "G15", gl: "Despesas Financeiras", c: "15.5", l: "Outras Despesas Financeiras", t: "rs", eg: 0, b: 1, o: 1404 },

  // ─── RESULTADOS (calculados) ──────────────────────────────────────────────────
  { g: "RES", gl: "Resultados", c: "R.1", l: "EBITDA", t: "calculado", eg: 0, b: 1, o: 1500 },
  { g: "RES", gl: "Resultados", c: "R.2", l: "Resultado Operacional", t: "calculado", eg: 0, b: 1, o: 1501 },
  { g: "RES", gl: "Resultados", c: "R.3", l: "Resultado Antes IR", t: "calculado", eg: 0, b: 1, o: 1502 },
  { g: "RES", gl: "Resultados", c: "R.4", l: "Resultado Líquido", t: "calculado", eg: 0, b: 1, o: 1503 },
  { g: "RES", gl: "Resultados", c: "R.5", l: "Ponto de Equilíbrio (R$)", t: "calculado", eg: 0, b: 1, o: 1504 },
];

console.log(`Inserindo ${linhas.length} linhas no catálogo DRE...`);

for (const l of linhas) {
  await db.execute(
    `INSERT INTO dre_template_linhas (grupo_codigo, grupo_label, linha_codigo, linha_label, tipo_valor, editavel_gerente, bloqueada_padrao, ordem)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [l.g, l.gl, l.c, l.l, l.t, l.eg, l.b, l.o]
  );
}

console.log(`✅ ${linhas.length} linhas inseridas com sucesso!`);

// Verificar
const [rows] = await db.execute("SELECT COUNT(*) as total FROM dre_template_linhas");
console.log(`Total no banco: ${rows[0].total}`);

await db.end();
