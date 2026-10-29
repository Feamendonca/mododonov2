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
import { distribuirProporcional } from "@shared/orcamento-distribuir";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Save, Loader2 } from "lucide-react";

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
  /** Resumo devolvido pelo endpoint (propor/puxar), com os valores PROPOSTOS
   * (histórico) — serve de fallback quando a árvore não tem uma linha
   * derivada/de receita bruta identificável. */
  resumo: ResumoOrcamento;
  /** Dias do mês do PERÍODO do orçamento (calendário, não "dias de operação"
   * digitado) — usado só para `metaDiaria = receitaBruta / diasNoMes`. */
  diasNoMes: number;
  onSalvar: (linhas: LinhaParaSalvar[]) => void;
  salvando?: boolean;
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

export default function DreEditavel({ linhas, resumo, diasNoMes, onSalvar, salvando }: DreEditavelProps) {
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

      {/* Tabela da DRE (árvore completa) */}
      <div className="section-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linha</TableHead>
              <TableHead className="text-right">Histórico (média lida)</TableHead>
              <TableHead className="text-right">Proposto</TableHead>
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
                  <TableCell className="text-right text-sm font-mono text-muted-foreground">
                    {fmtCell(l.histMedia)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {fmtCell(l.proposto)}
                  </TableCell>
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

      <div className="flex justify-end">
        <Button onClick={handleSalvarClick} disabled={!!salvando}>
          {salvando ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
          Salvar rascunho
        </Button>
      </div>
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
