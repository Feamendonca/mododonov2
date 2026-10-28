/**
 * FASE A — módulos ocultos (port off-Manus)
 * ─────────────────────────────────────────────────────────────────────────
 * ~24 tabelas de detalhe de módulos existiam só no Manus (que morreu) e ainda
 * NÃO foram recriadas no banco novo (Supabase/Postgres). Os módulos abaixo
 * dependem dessas tabelas ausentes e quebrariam se o gerente clicasse neles.
 *
 * Em vez de apagar o código, escondemos: item de menu some (AppLayout.tsx) e
 * a rota correspondente (App.tsx) renderiza um placeholder amigável em vez da
 * página real. O servidor também tem uma rede de segurança central
 * (server/db.ts → runRaw / isMissingRelationError) que trata qualquer SQL cru
 * contra uma tabela ausente como "sem dados" em vez de derrubar a página —
 * então mesmo um link direto/stale para um módulo oculto não produz erro cru.
 *
 * REATIVAR NA FASE B: depois de recriar as tabelas do módulo no banco,
 * remova a entrada correspondente deste Set (ou o path inteiro, se o módulo
 * tiver mais de uma rota). O item volta a aparecer no menu e a rota volta a
 * renderizar a página real automaticamente — nenhuma outra mudança é
 * necessária em AppLayout.tsx/App.tsx.
 */
export const HIDDEN_MODULES = new Set<string>([
  // Orçamento (Fase B) — ATIVO desde 2026-10-28. Reconstruído sobre a tabela
  // `orcamentos` + `orcamento_metas_diarias` (migration 0029). A tela de
  // criar/conferir/aprovar orçamento voltou ao menu. O fluxo legado
  // `/orcamento-assistido` foi aposentado (código removido na reescrita).

  // pré-turno — preturno_configs, preturno_temas, preturno_condutores,
  // preturno_atas ausentes.
  "/preturno",

  // checklist diário — checklist_itens, checklist_execucoes,
  // checklist_respostas ausentes.
  "/checklist",

  // trilhas / formação — trilhas, trilha_modulos, trilha_aulas,
  // trilha_progresso, trilha_compromissos ausentes. (trail_completions, uma
  // tabela simples e DIFERENTE usada no cálculo de score, existe e continua
  // ativa — não é afetada por esta flag.)
  "/trilhas",

  // manutenções — tabela manutencoes ausente.
  "/manutencoes",

  // estoque / CMV — products e product_categories ausentes (stock_periods,
  // stock_movements, purchase_entries existem, mas o catálogo de produtos
  // que tudo o resto depende não existe — a tela não é utilizável).
  "/estoque",

  // experiência do cliente — reviews, council_cases, service_standards,
  // training_sessions, standard_observations ausentes. 100% da tela depende
  // dessas tabelas (os scores de qualidade usados no dashboard/ranking vêm
  // de monthly_quality/google_ratings/customer_occurrences, que EXISTEM e
  // são alimentados por outro caminho — não por esta tela).
  "/experiencia",
]);

/** true se a rota (path exato registrado em App.tsx) está oculta na Fase A. */
export function isModuleHidden(path: string): boolean {
  return HIDDEN_MODULES.has(path);
}
