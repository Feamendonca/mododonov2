/**
 * DreEditavel.tsx
 * Tabela DINÂMICA do Orçamento (Task L4, reforma "orçamento linha a linha" —
 * ver docs/superpowers/sdd/2026-10-29-orcamento-linha-a-linha/task-l4-brief.md).
 *
 * Substitui o molde FIXO de campos (Fase B) por uma renderização da ÁRVORE
 * COMPLETA da DRE (`LinhaProposta[]`, Task L1/`server/orcamento-arvore.ts`):
 * grupos nível-1, sub-linhas nível-2, subtotais e linhas derivadas — na
 * MESMA ordem da planilha, espelhando exatamente a DRE da loja.
 *
 * - Nível-2 (e nível-1 sem filhos / não-derivado — "folha") → input editável.
 * - Nível-1 com filhos e NÃO derivado (subtotal de grupo, ex.: RECEITA
 *   BRUTA) → valor = soma ao vivo dos filhos, mas TAMBÉM editável: digitar
 *   uma meta `V` nesse campo distribui `V` proporcionalmente entre as
 *   folhas filhas (`distribuirProporcional`, `shared/orcamento-distribuir.ts`)
 *   — ver `handleChangeGrupo` abaixo. Edição de baixo pra cima (editar a
 *   folha) continua funcionando normalmente; os dois caminhos coexistem.
 * - Linha derivada (Receita Líquida, Margem Bruta, Resultado Operacional/
 *   EBITDA, Resultado Final) → SEMPRE read-only: valor = histMedia (o
 *   número REAL da DRE) + soma dos deltas (seuValor − proposto) de toda
 *   FOLHA posicionada ANTES dela na árvore — nunca recalculado do zero por
 *   categoria (isso é o que garante o card de EBITDA bater EXATO com a DRE;
 *   ver `resolve()` abaixo).
 * - Campo sem valor (histMedia null) → input/célula em BRANCO. NUNCA 0.
 *
 * Fonte de verdade dos tipos: `LinhaProposta` (server/orcamento-arvore.ts) e
 * `ResumoOrcamento` (server/orcamento-resumo.ts) — import TYPE-ONLY (apagado
 * na compilação), não arrasta `xlsx`/dependências de servidor pro bundle do
 * client (mesmo princípio do arquivo anterior). `distribuirProporcional` já
 * é importado em RUNTIME de `shared/` (não `server/`) de propósito — é
 * lógica pura, sem dependência pesada, reaproveitada do mesmo jeito que
 * `shared/calculations.ts`/`shared/const.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import type { LinhaProposta } from "../../../../server/orcamento-arvore";
import type { ResumoOrcamento } from "../../../../server/orcamento-resumo";
import type { PlanoIA } from "../../../../server/orcamento-plano-ia";
import { distribuirProporcional } from "@shared/orcamento-distribuir";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Save, Loader2, Info, Sparkles, CheckCircle2, AlertTriangle, Target,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface LinhaParaSalvar {
  codigo: string;
  label: string;
  nivel: number;
  valor: number | null;
  ordem: number;
  editavel: boolean;
}

interface DreEditavelProps {
  linhas: LinhaProposta[];
  /** Rótulos dos meses lidos da DRE ("YYYY-MM"), alinhados 1:1 com o
   * `porMes` de cada linha — vem do endpoint (propor/puxar). Mostrados como
   * colunas somente-leitura ANTES do "Proposto" (Task "3 meses"). */
  anoMeses: string[];
  /** Resumo devolvido pelo endpoint (propor/puxar), com os valores PROPOSTOS
   * (histórico) — serve de fallback quando a árvore não tem uma linha
   * derivada/de receita bruta identificável. */
  resumo: ResumoOrcamento;
  /** Dias do mês do PERÍODO do orçamento (calendário, não "dias de operação"
   * digitado) — usado só para `metaDiaria = receitaBruta / diasNoMes`. */
  diasNoMes: number;
  onSalvar: (linhas: LinhaParaSalvar[]) => void;
  salvando?: boolean;
  /** Resultado de `orcamento.gerarPlanoIA` (Task P3, Proposto Inteligente) —
   * `null`/`undefined` enquanto o gestor não gerou nenhum plano ainda.
   * `linhas: []` (mas objeto não-nulo) = a IA falhou (fallback silencioso do
   * servidor) — mostramos um aviso amigável e NÃO tocamos na tabela. */
  planoIA?: PlanoIA | null;
}

// ─── Regex (mesmas de server/orcamento-resumo.ts — ver PONTO CRÍTICO no brief) ─

const REGEX_EBITDA = /resultado\s+operac|lucro\s+operac|ebitda/i;
const REGEX_RECEITA_BRUTA = /receita\s+bruta|receita\s+loja/i;

// ─── Helpers de formatação ───────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function fmtCell(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return fmtBRL(v);
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "2026-07" → "Jul/26" (cabeçalho amigável da coluna do mês). Formato
 * inesperado → devolve a string original (nunca quebra a tela). */
function fmtAnoMes(anoMes: string): string {
  const m = anoMes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return anoMes;
  const ano = m[1].slice(2);
  const mesIdx = Number(m[2]) - 1;
  if (mesIdx < 0 || mesIdx > 11) return anoMes;
  return `${MESES_ABREV[mesIdx]}/${ano}`;
}

// ─── KPI card (resumo vivo) ──────────────────────────────────────────────────

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" | "amber" }) {
  const color = tone === "green" ? "var(--green)" : tone === "red" ? "var(--red)" : tone === "amber" ? "var(--amber)" : "var(--ink)";
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color, fontSize: 24 }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ─── Campo de edição (texto livre, formata ao perder o foco) ─────────────────

function ValorInput({
  value,
  onChange,
  destaque,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  /** Subtotal de grupo editável — mantém o destaque visual (negrito) que a
   * linha já tinha quando era só um `<span>` read-only. */
  destaque?: boolean;
}) {
  const formatLocal = (v: number | null) => (v === null ? "" : String(Math.round(v)));
  const [local, setLocal] = useState(() => formatLocal(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(formatLocal(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="—"
      value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setLocal(raw);
        if (raw.trim() === "") { onChange(null); return; }
        const num = parseFloat(raw.replace(",", "."));
        if (!isNaN(num)) onChange(num);
      }}
      onBlur={() => { setFocused(false); setLocal(formatLocal(value)); }}
      className={`h-8 text-sm text-right font-mono${destaque ? " font-semibold" : ""}`}
    />
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function DreEditavel({ linhas, anoMeses, resumo, diasNoMes, onSalvar, salvando, planoIA }: DreEditavelProps) {
  // Só as linhas FOLHA (natureza !== "subtotal") têm estado editável próprio —
  // subtotais e derivadas são sempre recalculados ao vivo (nunca guardam
  // estado de edição direta).
  const valoresIniciais = (ls: LinhaProposta[]) =>
    Object.fromEntries(ls.filter((l) => l.natureza !== "subtotal").map((l) => [l.codigo, l.proposto]));

  const [valores, setValores] = useState<Record<string, number | null>>(() => valoresIniciais(linhas));

  // Nova DRE (nova proposta/importação) → reseta os valores editados pro
  // `proposto` de cada folha.
  useEffect(() => {
    setValores(valoresIniciais(linhas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas]);

  /**
   * `resolve(codigo)` — valor AO VIVO de qualquer linha da árvore:
   *   - folha (natureza !== "subtotal"): o que o gerente digitou (`valores`),
   *     ou `proposto` se ainda não editou.
   *   - subtotal (temFilhos, não-derivada): soma ao vivo dos filhos
   *     nível-2 (ignora filhos sem valor — nunca bloqueia a soma por um
   *     filho em branco).
   *   - derivada: `histMedia` (o número REAL lido da própria linha da DRE)
   *     + soma, folha a folha, de (valor atual − proposto) de TODA folha
   *     posicionada ANTES dela na árvore (subtotais/derivadas intermediárias
   *     são puladas — já estão refletidas nas folhas que as compõem, somá-las
   *     de novo duplicaria). Isso é o que faz o card de EBITDA (e qualquer
   *     outra derivada) bater EXATO com a DRE quando nada foi editado (delta
   *     = 0) e continuar coerente conforme o gerente edita.
   */
  const resolve = useMemo(() => {
    const porCodigo = new Map(linhas.map((l, i) => [l.codigo, { l, i }] as const));
    const cache = new Map<string, number | null>();

    function r(codigo: string): number | null {
      if (cache.has(codigo)) return cache.get(codigo)!;
      const entry = porCodigo.get(codigo);
      if (!entry) return null;
      const { l, i } = entry;

      let val: number | null;
      if (l.derivada) {
        if (l.histMedia === null) {
          val = null;
        } else {
          let delta = 0;
          for (let j = 0; j < i; j++) {
            const lj = linhas[j];
            if (lj.derivada || lj.temFilhos) continue; // só folhas — evita dupla contagem
            const atual = r(lj.codigo);
            const proposto = lj.proposto;
            if (atual === null && proposto === null) continue;
            delta += (atual ?? 0) - (proposto ?? 0);
          }
          val = l.histMedia + delta;
        }
      } else if (l.temFilhos) {
        const filhos = linhas.filter((f) => f.nivel === 2 && f.codigo.startsWith(`${l.codigo}.`));
        let soma = 0;
        let algumValor = false;
        for (const f of filhos) {
          const v = r(f.codigo);
          if (v !== null) { soma += v; algumValor = true; }
        }
        val = algumValor ? soma : null;
      } else {
        val = codigo in valores ? valores[codigo] : l.proposto;
      }

      cache.set(codigo, val);
      return val;
    }

    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, valores]);

  // ── Resumo ao vivo (cards) ─────────────────────────────────────────────────

  const ebitdaLinha = useMemo(
    () => linhas.find((l) => l.derivada && REGEX_EBITDA.test(l.label)),
    [linhas]
  );
  const ebitdaVivo = ebitdaLinha ? resolve(ebitdaLinha.codigo) : resumo.ebitda;

  const receitaBrutaVivo = useMemo(() => {
    let soma = 0;
    let algumValor = false;
    for (const l of linhas) {
      if (l.nivel !== 1 || l.derivada) continue;
      if (!REGEX_RECEITA_BRUTA.test(l.label)) continue;
      const v = resolve(l.codigo);
      if (v !== null) { soma += v; algumValor = true; }
    }
    return algumValor ? soma : resumo.receitaBruta;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, resolve, resumo.receitaBruta]);

  const ebitdaPctVivo =
    receitaBrutaVivo !== null && receitaBrutaVivo !== 0 && ebitdaVivo !== null
      ? ebitdaVivo / receitaBrutaVivo
      : null;
  const metaDiariaVivo =
    receitaBrutaVivo !== null && diasNoMes > 0 ? receitaBrutaVivo / diasNoMes : null;

  // "Parcial" = alguma folha ANTES da linha de EBITDA ainda está em branco
  // (mesmo espírito de `calcularResumoLinhas`: linha pós-resultado nunca
  // bloqueia o status, só o bloco operacional).
  const parcialVivo = useMemo(() => {
    const idxCorte = ebitdaLinha ? linhas.indexOf(ebitdaLinha) : linhas.length;
    for (let i = 0; i < idxCorte; i++) {
      const l = linhas[i];
      if (l.derivada || l.temFilhos) continue;
      if (resolve(l.codigo) === null) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, resolve, ebitdaLinha]);

  function handleChange(codigo: string, valor: number | null) {
    setValores((prev) => ({ ...prev, [codigo]: valor }));
  }

  /**
   * Edição de CIMA pra BAIXO: o gerente digitou uma meta `v` direto no
   * subtotal de um grupo nível-1 não-derivado (ex.: RECEITA BRUTA). Pega as
   * folhas filhas (nível-2 cujo `codigo` começa com `${codigoGrupo}.`) e
   * redistribui `v` entre elas (`distribuirProporcional`), preservando a
   * proporção atual (ou dividindo igual, se a soma atual for zero) — ver
   * `shared/orcamento-distribuir.ts`. O subtotal do grupo não guarda estado
   * próprio: ao atualizar os filhos, `resolve()` já volta a somá-los e o
   * subtotal passa a exibir exatamente `v` de novo.
   *
   * `v === null` (campo apagado) limpa os filhos de volta pro "sem base"
   * (mesmo espírito de apagar uma folha direto).
   */
  function handleChangeGrupo(codigoGrupo: string, v: number | null) {
    const filhos = linhas.filter((f) => f.nivel === 2 && f.codigo.startsWith(`${codigoGrupo}.`));
    if (filhos.length === 0) return;

    if (v === null) {
      setValores((prev) => {
        const next = { ...prev };
        for (const f of filhos) next[f.codigo] = null;
        return next;
      });
      return;
    }

    const atuais = filhos.map((f) => resolve(f.codigo) ?? 0);
    const distribuidos = distribuirProporcional(v, atuais);
    setValores((prev) => {
      const next = { ...prev };
      filhos.forEach((f, i) => { next[f.codigo] = distribuidos[i]; });
      return next;
    });
  }

  // ── Proposto Inteligente (Task P3): sugestões da IA por linha ─────────────
  // `planoIA` vem SÓ depois que o gestor clica "Gerar plano da IA"
  // (OrcamentoPage). Fix do review (Task P4): usa o flag EXPLÍCITO
  // `indisponivel` (não mais inferir pela lista vazia) — senão "IA caiu" e
  // "IA respondeu válido mas sem sugestões" ficavam indistinguíveis.
  const planoPorCodigo = useMemo(() => {
    const m = new Map<string, PlanoIA["linhas"][number]>();
    for (const l of planoIA?.linhas ?? []) m.set(l.codigo, l);
    return m;
  }, [planoIA]);
  const temSugestoes = planoPorCodigo.size > 0;
  const planoFalhou = planoIA?.indisponivel === true;

  /** Copia o `propostoIA` de cada linha sugerida pro "Seu valor" — o gestor
   * continua podendo editar livremente depois (a IA sugere, o gestor
   * decide). Linhas sem `propostoIA` (null — sem base no histórico) não são
   * tocadas. */
  function handleAplicarSugestoes() {
    if (!planoIA) return;
    setValores((prev) => {
      const next = { ...prev };
      for (const l of planoIA.linhas) {
        if (l.propostoIA !== null) next[l.codigo] = l.propostoIA;
      }
      return next;
    });
  }

  function handleSalvarClick() {
    const paraSalvar: LinhaParaSalvar[] = linhas.map((l, i) => ({
      codigo: l.codigo,
      label: l.label,
      nivel: l.nivel,
      valor: resolve(l.codigo),
      ordem: i,
      editavel: l.natureza !== "subtotal",
    }));
    onSalvar(paraSalvar);
  }

  return (
    <div className="space-y-4">
      {/* Resumo vivo */}
      <div className="kpi-board">
        <KpiCard
          label="EBITDA do mês"
          value={fmtCell(ebitdaVivo)}
          sub={ebitdaPctVivo !== null ? fmtPct(ebitdaPctVivo) : undefined}
          tone={ebitdaVivo === null ? undefined : ebitdaVivo >= 0 ? "green" : "red"}
        />
        <KpiCard label="Ponto de equilíbrio" value={fmtCell(resumo.pontoEquilibrio)} />
        <KpiCard label="Meta diária" value={fmtCell(metaDiariaVivo)} />
        <KpiCard
          label="Status da estimativa"
          value={parcialVivo ? "Parcial" : "Completa"}
          tone={parcialVivo ? "amber" : "green"}
          sub={parcialVivo ? "Há linhas sem base no histórico" : "Todas as linhas preenchidas"}
        />
      </div>

      {/* Proposto Inteligente (Task P3): resumo da meta + aviso de falha ─── */}
      {planoIA && temSugestoes && (
        <div className={`banner-alert ${planoIA.meta.atingiuMeta ? "banner-green" : "banner-amber"} items-start flex-wrap`}>
          {planoIA.meta.atingiuMeta ? <CheckCircle2 size={16} className="flex-shrink-0" /> : <AlertTriangle size={16} className="flex-shrink-0" />}
          <div className="flex-1">
            <div className="font-semibold">
              Meta: {planoIA.meta.alvoRs !== null ? fmtBRL(planoIA.meta.alvoRs) : "—"} · Plano da IA alcança: {planoIA.meta.alcancadoRs !== null ? fmtBRL(planoIA.meta.alcancadoRs) : "—"}
            </div>
            {planoIA.meta.motivo && <div>{planoIA.meta.motivo}</div>}
          </div>
        </div>
      )}
      {planoFalhou && (
        <div className="banner-alert banner-amber items-start flex-wrap">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Não consegui gerar o plano agora</div>
            <div>{planoIA?.meta.motivo || "Tente de novo em alguns instantes — os valores da tabela continuam como estavam."}</div>
          </div>
        </div>
      )}

      {/* Tabela da DRE (árvore completa) — rola horizontal se ficar larga
          (uma coluna por mês + Proposto + Sugestão IA + Seu valor + % receita). */}
      <div className="section-card p-0 overflow-hidden overflow-x-auto">
        {temSugestoes && (
          <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-b" style={{ borderColor: "var(--gray-line)" }}>
            <span className="text-xs" style={{ color: "var(--stone)" }}>
              A IA sugeriu valores para {planoIA!.linhas.filter((l) => l.propostoIA !== null).length} linha(s) — veja a coluna "Sugestão IA".
            </span>
            <Button size="sm" variant="outline" onClick={handleAplicarSugestoes}>
              <Sparkles size={13} className="mr-1.5" /> Aplicar sugestões
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linha</TableHead>
              {anoMeses.map((am) => (
                <TableHead key={am} className="text-right text-muted-foreground">
                  {fmtAnoMes(am)}
                </TableHead>
              ))}
              <TableHead className="text-right">Proposto</TableHead>
              {temSugestoes && <TableHead className="text-right w-44">Sugestão IA</TableHead>}
              <TableHead className="text-right w-40">Seu valor</TableHead>
              <TableHead className="text-right w-20">% receita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => {
              const isSubtotal = l.natureza === "subtotal";
              // Nível-1, tem filhos, NÃO é derivado (Receita Líquida, Margem
              // Bruta, EBITDA, Resultado seguem SEMPRE read-only) → meta de
              // grupo editável, distribui de cima pra baixo nos filhos.
              const isGrupoEditavel = l.nivel === 1 && l.temFilhos && !l.derivada;
              const atual = resolve(l.codigo);
              const pct =
                receitaBrutaVivo !== null && receitaBrutaVivo !== 0 && atual !== null
                  ? atual / receitaBrutaVivo
                  : null;
              return (
                <TableRow key={l.codigo} className={isSubtotal ? "bg-muted/40 hover:bg-muted/40" : undefined}>
                  <TableCell
                    className={`text-sm ${l.nivel === 1 ? "font-semibold" : "pl-8 text-muted-foreground"}`}
                    style={l.nivel === 1 ? { color: "var(--ink)" } : undefined}
                  >
                    {l.label}
                  </TableCell>
                  {anoMeses.map((am, i) => (
                    <TableCell key={am} className="text-right text-sm font-mono text-muted-foreground">
                      {fmtCell(l.porMes[i])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-sm font-mono">
                    {fmtCell(l.proposto)}
                  </TableCell>
                  {temSugestoes && (
                    <TableCell className="text-right w-44">
                      <SugestaoIACell linha={planoPorCodigo.get(l.codigo)} />
                    </TableCell>
                  )}
                  <TableCell className="text-right w-40">
                    {isGrupoEditavel ? (
                      <ValorInput
                        value={atual}
                        onChange={(v) => handleChangeGrupo(l.codigo, v)}
                        destaque
                      />
                    ) : isSubtotal ? (
                      <span className="text-sm font-mono font-semibold">{fmtCell(atual)}</span>
                    ) : (
                      <ValorInput
                        value={valorExibido(valores, l.codigo)}
                        onChange={(v) => handleChange(l.codigo, v)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono text-muted-foreground">
                    {pct !== null ? fmtPct(pct) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Plano de batalha da IA (Task P3) — bloco separado, SÓ LEITURA por
          ora (persistir/virar 4DX é módulo futuro). Mostra as ações que
          sustentam a meta, não os valores de linha (isso já está na tabela). */}
      {planoIA && planoIA.planoBatalha.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
            <Target size={14} /> Plano de batalha da IA
          </h3>
          <div className="space-y-2">
            {planoIA.planoBatalha.map((acao, i) => (
              <PlanoBatalhaCard key={i} acao={acao} linhas={linhas} />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSalvarClick} disabled={!!salvando}>
          {salvando ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
          Salvar rascunho
        </Button>
      </div>
    </div>
  );
}

// ─── Proposto Inteligente (Task P3): célula de sugestão da IA ──────────────

/** Mostra o `propostoIA` + ícone de info (abre o `porque`) + badge de
 * confiança (alta=verde, média=âmbar, baixa=vermelho). Sem sugestão para
 * essa linha (não veio no `plano.linhas`, ou `propostoIA` é `null` por falta
 * de base no histórico) → célula em branco ("—"), nunca inventa um número. */
function SugestaoIACell({ linha }: { linha: PlanoIA["linhas"][number] | undefined }) {
  if (!linha || linha.propostoIA === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const badgeCls =
    linha.confianca === "alta" ? "badge-green" : linha.confianca === "media" ? "badge-amber" : "badge-red";
  const confiancaLabel =
    linha.confianca === "alta" ? "Confiança alta" : linha.confianca === "media" ? "Confiança média" : "Confiança baixa";
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className={`badge-base ${badgeCls}`} style={{ fontSize: 10, padding: "1px 7px" }}>
        {confiancaLabel.replace("Confiança ", "")}
      </span>
      <span className="text-sm font-mono">{fmtCell(linha.propostoIA)}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={confiancaLabel + ": " + linha.porque}>
            <Info size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left">{linha.porque}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── Proposto Inteligente (Task P3): card do plano de batalha ──────────────

function PlanoBatalhaCard({ acao, linhas }: { acao: PlanoIA["planoBatalha"][number]; linhas: LinhaProposta[] }) {
  const prioridadeCls =
    acao.prioridade === "alta" ? "badge-red" : acao.prioridade === "media" ? "badge-amber" : "badge-green";
  const prioridadeLabel =
    acao.prioridade === "alta" ? "Prioridade alta" : acao.prioridade === "media" ? "Prioridade média" : "Prioridade baixa";
  const borderColor =
    acao.prioridade === "alta" ? "var(--red)" : acao.prioridade === "media" ? "var(--amber)" : "var(--green)";

  return (
    <div className="action-card" style={{ borderLeftColor: borderColor }}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className={`badge-base ${prioridadeCls}`}>{prioridadeLabel}</span>
        {acao.impactoEstimadoRs !== null && (
          <span className="text-xs font-mono" style={{ color: "var(--stone)" }}>
            Impacto estimado: {fmtBRL(acao.impactoEstimadoRs)}
          </span>
        )}
      </div>
      <div className="font-medium text-sm" style={{ color: "var(--ink)" }}>{acao.titulo}</div>
      <div className="text-xs mt-1" style={{ color: "var(--stone-light)" }}>{acao.descricao}</div>
      {acao.linhasAfetadas.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {acao.linhasAfetadas.map((codigo) => {
            const label = linhas.find((l) => l.codigo === codigo)?.label ?? codigo;
            return (
              <span
                key={codigo}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "rgba(113,14,43,0.08)", color: "var(--vinho)" }}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Lê `valores[codigo]` respeitando `null` explícito (gerente apagou o campo
 * de propósito) — nunca cai pro `proposto` aqui (isso só acontece dentro de
 * `resolve`, pra efeito de CÁLCULO; a CÉLULA mostra exatamente o que está no
 * estado, em branco quando `null`). */
function valorExibido(valores: Record<string, number | null>, codigo: string): number | null {
  return codigo in valores ? valores[codigo] : null;
}
