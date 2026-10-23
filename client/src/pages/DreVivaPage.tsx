import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, ChevronDown, TrendingUp, Target, BarChart3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MESES_FULL = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtPct(n: number) { return (n * 100).toFixed(1) + "%"; }
function pad2(n: number) { return String(n).padStart(2, "0"); }

// ─── Categorias lançáveis ────────────────────────────────────────────────────
const CATEGORIAS_LANCAVEIS = [
  { id: "folha", label: "Folha" },
  { id: "encargos", label: "Encargos" },
  { id: "pro_labore", label: "Pró-labore" },
  { id: "aluguel", label: "Aluguel" },
  { id: "condominio", label: "Condomínio" },
  { id: "energia", label: "Energia" },
  { id: "gas", label: "Gás" },
  { id: "agua", label: "Água" },
  { id: "royalties", label: "Royalties" },
  { id: "fundo_marketing", label: "Fundo de Marketing" },
  { id: "marketing", label: "Marketing Local" },
  { id: "contabilidade", label: "Contabilidade" },
  { id: "sistemas", label: "Sistemas" },
  { id: "sanitarismo", label: "Sanitarismo" },
  { id: "impostos", label: "Impostos" },
  { id: "taxa_cartao", label: "Taxa Cartão/Delivery" },
  { id: "manutencao", label: "Manutenção" },
  { id: "outras_despesas", label: "Outras Despesas" },
] as const;

type CategoriaId = typeof CATEGORIAS_LANCAVEIS[number]["id"];

// ─── Barra de ritmo ─────────────────────────────────────────────────────────
function RitmoBar({ orcado, realizado, tipo, ritmo, primeiros3Dias }: {
  orcado: number; realizado: number; tipo: "receita" | "despesa"; ritmo: number; primeiros3Dias: boolean;
}) {
  if (orcado <= 0) return null;
  const pct = Math.min(realizado / orcado, 1.5); // cap at 150% for display
  const barWidth = Math.min(pct * 100, 100);
  const ritmoPos = Math.min(ritmo * 100, 100);

  // Cor da barra
  let barColor = "bg-zinc-300 dark:bg-zinc-600"; // neutro
  if (!primeiros3Dias) {
    if (tipo === "receita") {
      if (pct >= ritmo) barColor = "bg-emerald-500";
      else if (pct < ritmo - 0.10) barColor = "bg-red-500";
      else barColor = "bg-amber-500";
    } else {
      const desvio = pct - ritmo;
      if (desvio <= 0.05) barColor = "bg-emerald-500";
      else if (desvio <= 0.15) barColor = "bg-amber-500";
      else barColor = "bg-red-500";
    }
  }

  return (
    <div className="relative h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-visible">
      <div className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${barWidth}%` }} />
      {/* Marcador de ritmo esperado */}
      <div
        className="absolute top-[-2px] w-0.5 h-3 bg-zinc-900 dark:bg-zinc-100 opacity-60 rounded-full"
        style={{ left: `${ritmoPos}%` }}
        title={`Ritmo esperado: ${(ritmo * 100).toFixed(0)}%`}
      />
    </div>
  );
}

// ─── Hero Card ──────────────────────────────────────────────────────────────
function HeroCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Icon size={12} />
        {title}
      </div>
      {children}
    </div>
  );
}

// Simple Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return d[m][n];
}

// ─── Linha DRE ──────────────────────────────────────────────────────────────
interface DreLinhaProps {
  id: string;
  label: string;
  orcado: number;
  realizado: number;
  tipo: "receita" | "despesa" | "subtotal";
  receitaRealizada: number;
  ritmo: number;
  primeiros3Dias: boolean;
  indent?: boolean;
  isSubtotal?: boolean;
  isAutomatic?: boolean;
  expandedRow: string | null;
  setExpandedRow: (id: string | null) => void;
  despesas: any[];
  onLancar: (categoriaId: string) => void;
  onExcluir: (id: number) => void;
  form: { valor: string; data: string; fornecedor: string; observacao: string; categoriaId: string };
  setForm: (fn: (f: any) => any) => void;
  lancarPending: boolean;
  mes: number;
  ano: number;
  fornecedoresSugestoes: string[];
  storeId: number;
}

function DreLinha({
  id, label, orcado, realizado, tipo, receitaRealizada, ritmo, primeiros3Dias,
  indent, isSubtotal, isAutomatic, expandedRow, setExpandedRow, despesas,
  onLancar, onExcluir, form, setForm, lancarPending,
  mes, ano,
  fornecedoresSugestoes, storeId,
}: DreLinhaProps) {
  const isExpanded = expandedRow === id;
  const [showSugestoes, setShowSugestoes] = useState(false);
  const [sugestaoProxima, setSugestaoProxima] = useState<string | null>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const pctReceita = receitaRealizada > 0 ? realizado / receitaRealizada : 0;
  const showAnaliseVertical = tipo === "despesa" && realizado > 0 && !isSubtotal;

  return (
    <div className={`${isSubtotal ? "border-t border-border" : ""}`}>
      <div
        className={`grid grid-cols-[1fr_auto_auto_1fr] gap-3 px-4 py-2.5 items-center transition-colors
          ${isSubtotal ? "bg-muted/30" : "hover:bg-muted/10"}
          ${indent ? "pl-8" : ""}
        `}
      >
        {/* Label + badges */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm ${isSubtotal ? "font-bold" : "font-medium"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
            {isSubtotal ? "= " : tipo === "despesa" && !isSubtotal ? "(−) " : ""}{label}
          </span>
          {isAutomatic && <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">auto</span>}
          {showAnaliseVertical && (
            <span className="text-[10px] text-muted-foreground">{(pctReceita * 100).toFixed(1)}% da receita</span>
          )}
          {!isAutomatic && !isSubtotal && tipo === "despesa" && (
            <button
              onClick={() => {
                if (isExpanded) setExpandedRow(null);
                else { setExpandedRow(id); setForm((f: any) => ({ ...f, categoriaId: id })); }
              }}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus size={10} />
            </button>
          )}
        </div>

        {/* Orçado */}
        <span className="text-right text-sm text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>
          {orcado > 0 ? fmt(orcado) : "—"}
        </span>

        {/* Realizado */}
        <span className={`text-right text-sm font-medium ${isSubtotal ? "font-bold" : ""}`} style={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>
          {realizado > 0 ? fmt(realizado) : "—"}
        </span>

        {/* Barra de ritmo */}
        <div className="w-full max-w-[120px]">
          {orcado > 0 && !isSubtotal && (
            <RitmoBar orcado={orcado} realizado={realizado} tipo={tipo === "subtotal" ? "receita" : tipo} ritmo={ritmo} primeiros3Dias={primeiros3Dias} />
          )}
          {isSubtotal && orcado > 0 && (
            <span className="text-xs text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
              {receitaRealizada > 0 ? fmtPct(realizado / receitaRealizada) : "—"}
            </span>
          )}
        </div>
      </div>

      {/* Lançamentos expandidos */}
      {isExpanded && (
        <div className="px-8 pb-3 space-y-2">
          {despesas.length > 0 && (
            <div className="space-y-1">
              {despesas.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 rounded px-3 py-1.5">
                  <span className="flex items-center gap-2" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span className="text-foreground font-medium">{fmt(d.valor)}</span>
                    <span className="opacity-50">·</span>
                    <span>{d.data}</span>
                    {d.fornecedor && <><span className="opacity-50">·</span><span className="text-foreground">{d.fornecedor}</span></>}
                    {d.observacao && <><span className="opacity-50">·</span><span className="italic max-w-[200px] truncate">{d.observacao}</span></>}
                    {!d.fornecedor && d.descricao && <><span className="opacity-50">·</span><span className="italic max-w-[200px] truncate">{d.descricao}</span></>}
                  </span>
                  <button onClick={() => { if (confirm("Remover?")) onExcluir(d.id); }} className="hover:text-red-500 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Form inline — Lançar despesa */}
          <a href="/lancamentos" className="flex items-center gap-1.5 text-xs text-primary hover:underline transition-colors mt-1">
            <Plus size={10} /> Lançar na Central de Lançamentos
          </a>
        </div>
      )}

      {/* Despesas visíveis quando não expandido mas tem lançamentos */}
      {!isExpanded && despesas.length > 0 && !isSubtotal && (
        <button
          onClick={() => { setExpandedRow(id); setForm((f: any) => ({ ...f, categoriaId: id })); }}
          className="px-8 pb-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown size={10} /> {despesas.length} lançamento{despesas.length > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

// ─── Grupo expansível ───────────────────────────────────────────────────────
function GrupoExpansivel({ title, children, total, receitaRealizada }: {
  title: string; children: React.ReactNode; total: number; receitaRealizada: number;
}) {
  const [open, setOpen] = useState(true);
  const pct = receitaRealizada > 0 ? total / receitaRealizada : 0;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full grid grid-cols-[1fr_auto_auto_1fr] gap-3 px-4 py-2 items-center hover:bg-muted/10 transition-colors">
        <span className="text-sm font-semibold text-left flex items-center gap-1.5">
          <ChevronDown size={12} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
          (−) {title}
        </span>
        <span className="text-right text-sm text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>—</span>
        <span className="text-right text-sm font-medium" style={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>{total > 0 ? fmt(total) : "—"}</span>
        <span className="text-xs text-muted-foreground">{total > 0 ? `${(pct * 100).toFixed(1)}% da receita` : ""}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function DreVivaPage() {
  const { storeId } = useStore();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const period = `${ano}-${pad2(mes)}`;
  // Data local (nunca UTC/toISOString que pode dar dia seguinte)
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [form, setForm] = useState({ categoriaId: "", valor: "", data: today, fornecedor: "", observacao: "" });

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.despesas.resumoDreViva.useQuery(
    { storeId: storeId!, period },
    { enabled: !!storeId }
  );

  const { data: despesasList = [] } = trpc.despesas.list.useQuery(
    { storeId: storeId!, period },
    { enabled: !!storeId }
  );

  // Fornecedores para autocomplete da categoria expandida
  const { data: fornecedoresData = [] } = trpc.despesas.fornecedores.useQuery(
    { storeId: storeId!, categoria: expandedRow ?? "" },
    { enabled: !!storeId && !!expandedRow }
  );

  const lancarMut = trpc.despesas.lancar.useMutation({
    onSuccess: (_data, vars) => {
      const catLabel = CATEGORIAS_LANCAVEIS.find(c => c.id === vars.categoria)?.label ?? vars.categoria;
      toast.success(`Lançado: ${fmt(vars.valor)} em ${catLabel}`);
      // Manter form aberto, limpar valor e observação, manter fornecedor e data
      setForm(f => ({ ...f, valor: "", observacao: "" }));
      utils.despesas.resumoDreViva.invalidate();
      utils.despesas.list.invalidate();
      utils.despesas.fornecedores.invalidate();
    },
    onError: (e) => toast.error("Erro ao lançar: " + e.message),
  });

  const excluirMut = trpc.despesas.excluir.useMutation({
    onSuccess: () => {
      toast.success("Despesa removida.");
      utils.despesas.resumoDreViva.invalidate();
      utils.despesas.list.invalidate();
    },
    onError: (e) => toast.error("Erro ao remover: " + e.message),
  });

  function navMes(delta: number) {
    let nm = mes + delta; let na = ano;
    if (nm < 1) { nm = 12; na--; }
    if (nm > 12) { nm = 1; na++; }
    setMes(nm); setAno(na);
  }

  function handleLancar(categoriaId: string) {
    if (!storeId) return;
    const raw = form.valor.replace(/\./g, "").replace(",", ".");
    const valor = parseFloat(raw);
    if (!valor || valor <= 0) { toast.error("Informe um valor válido"); return; }
    lancarMut.mutate({
      storeId, period,
      categoria: categoriaId as CategoriaId,
      valor,
      data: form.data || today,
      descricao: form.fornecedor ? `${form.fornecedor}${form.observacao ? " — " + form.observacao : ""}` : form.observacao || undefined,
      fornecedor: form.fornecedor || undefined,
      observacao: form.observacao || undefined,
      fonte: "manual",
    });
  }

  function getDespesasDaLinha(linhaId: string) {
    if (linhaId === "folha") return despesasList.filter(d => ["folha", "encargos", "pro_labore"].includes(d.categoria));
    return despesasList.filter(d => d.categoria === linhaId);
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (data?.semOrcamento) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="eyebrow mb-1">Resultado do Mês</div>
        <h1 className="text-3xl font-bold mb-6" style={{ fontFamily: "var(--font-display)" }}>DRE Viva<span style={{ color: "var(--vinho)" }}>.</span></h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-6 text-center">
          <p className="text-amber-800 dark:text-amber-200 font-medium">Nenhum orçamento aprovado para {MESES_FULL[mes]}/{ano}.</p>
          <p className="text-amber-600 dark:text-amber-400 text-sm mt-1">Aprove o orçamento do mês para acompanhar a DRE Viva.</p>
        </div>
      </div>
    );
  }

  // ─── Dados ────────────────────────────────────────────────────────────────
  const linhas = data?.linhas ?? [];
  const resumo = data?.resumo;
  const receitaRealizada = resumo?.receitaRealizada ?? 0;
  const receitaOrcada = resumo?.receitaOrcada ?? 1;

  // Ritmo do mês
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diaAtual = (ano === now.getFullYear() && mes === now.getMonth() + 1) ? now.getDate() : diasNoMes;
  const ritmo = diaAtual / diasNoMes;
  const primeiros3Dias = diaAtual <= 3 && (ano === now.getFullYear() && mes === now.getMonth() + 1);

  // Projeção
  const projecaoMes = diaAtual > 0 ? (receitaRealizada / diaAtual) * diasNoMes : 0;
  const variacaoProjecao = receitaOrcada > 0 ? (projecaoMes - receitaOrcada) / receitaOrcada : 0;

  // Subtotais em cascata
  const receita = linhas.find(l => l.id === "receita");
  const impostos = linhas.find(l => l.id === "impostos");
  const taxaCartao = linhas.find(l => l.id === "taxa_cartao");
  const cmv = linhas.find(l => l.id === "cmv");

  const receitaLiqReal = receitaRealizada - (impostos?.realizado ?? 0) - (taxaCartao?.realizado ?? 0);
  const receitaLiqOrc = (receita?.orcado ?? 0) - (impostos?.orcado ?? 0) - (taxaCartao?.orcado ?? 0);
  const lucroBrutoReal = receitaLiqReal - (cmv?.realizado ?? 0);
  const lucroBrutoOrc = receitaLiqOrc - (cmv?.orcado ?? 0);

  // Despesas operacionais (tudo que não é receita, impostos, taxa_cartao, cmv)
  const despOp = linhas.filter(l => l.tipo === "despesa" && !["impostos", "taxa_cartao", "cmv"].includes(l.id));
  const totalDespOpReal = despOp.reduce((s, l) => s + l.realizado, 0);
  const totalDespOpOrc = despOp.reduce((s, l) => s + l.orcado, 0);

  const ebitdaReal = resumo?.ebitdaRealizado ?? 0;
  const ebitdaOrc = resumo?.ebitdaOrcado ?? 0;
  const ebitdaMargemReal = receitaRealizada > 0 ? ebitdaReal / receitaRealizada : 0;
  const ebitdaMargemMeta = 0.525; // meta fixa 52,5%

  const temLancamentos = receitaRealizada > 0 || despesasList.length > 0;

  // Shared props for DreLinha
  const linhaProps = {
    receitaRealizada, ritmo, primeiros3Dias, expandedRow, setExpandedRow,
    form, setForm, onLancar: handleLancar,
    onExcluir: (id: number) => excluirMut.mutate({ id, storeId: storeId! }),
    lancarPending: lancarMut.isPending,
    mes, ano,
    fornecedoresSugestoes: fornecedoresData,
    storeId: storeId ?? 0,
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-1" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--stone)" }}>Resultado do Mês</div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
            DRE Viva<span style={{ color: "var(--vinho)" }}>.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
          <button onClick={() => navMes(-1)} className="p-1 hover:bg-muted rounded transition-colors"><ChevronLeft size={14} /></button>
          <span className="text-sm font-medium min-w-[100px] text-center">{MESES_FULL[mes]} {ano}</span>
          <button onClick={() => navMes(1)} className="p-1 hover:bg-muted rounded transition-colors"><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* ─── HERO CARDS ──────────────────────────────────────────────────── */}
      {!temLancamentos ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <div className="text-muted-foreground text-sm mb-2">Nenhum lançamento neste mês ainda.</div>
          <p className="text-lg font-medium" style={{ color: "var(--ink)" }}>Lance a primeira receita do mês</p>
          <p className="text-xs text-muted-foreground mt-1">Os dados de venda são importados automaticamente do lançamento diário.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <HeroCard title="Receita realizada" icon={TrendingUp}>
            <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{fmt(receitaRealizada)}</div>
            <div className="text-xs text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
              {(receitaRealizada / receitaOrcada * 100).toFixed(0)}% do orçado · ritmo esperado {(ritmo * 100).toFixed(0)}%
            </div>
          </HeroCard>
          <HeroCard title="Projeção do mês" icon={Target}>
            <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{fmt(projecaoMes)}</div>
            <div className="text-xs text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
              {variacaoProjecao >= 0 ? "+" : ""}{(variacaoProjecao * 100).toFixed(1)}% vs orçado
            </div>
          </HeroCard>
          <HeroCard title="Margem EBITDA" icon={BarChart3}>
            <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{fmtPct(ebitdaMargemReal)}</div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Meta: {fmtPct(ebitdaMargemMeta)}</span>
              {ebitdaMargemReal >= ebitdaMargemMeta ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">acima</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-medium">
                  {((ebitdaMargemMeta - ebitdaMargemReal) * 100).toFixed(1)}pp abaixo
                </span>
              )}
            </div>
          </HeroCard>
        </div>
      )}

      {/* ─── DRE EM CASCATA ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Cabeçalho */}
        <div className="grid grid-cols-[1fr_auto_auto_1fr] gap-3 border-b border-border bg-muted/30 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Linha</span>
          <span className="text-right" style={{ minWidth: 90 }}>Orçado</span>
          <span className="text-right" style={{ minWidth: 90 }}>Realizado</span>
          <span>Ritmo</span>
        </div>

        {/* (+) Receita Bruta */}
        {receita && (
          <DreLinha id="receita" label="Receita Bruta" orcado={receita.orcado} realizado={receita.realizado}
            tipo="receita" isAutomatic despesas={[]} {...linhaProps} />
        )}

        {/* (−) Impostos */}
        {impostos && (
          <DreLinha id="impostos" label="Impostos" orcado={impostos.orcado} realizado={impostos.realizado}
            tipo="despesa" indent despesas={getDespesasDaLinha("impostos")} {...linhaProps} />
        )}

        {/* (−) Taxa Cartão */}
        {taxaCartao && (
          <DreLinha id="taxa_cartao" label="Taxa Cartão/Delivery" orcado={taxaCartao.orcado} realizado={taxaCartao.realizado}
            tipo="despesa" indent despesas={getDespesasDaLinha("taxa_cartao")} {...linhaProps} />
        )}

        {/* = Receita Líquida */}
        <DreLinha id="_recLiq" label="Receita Líquida" orcado={receitaLiqOrc} realizado={receitaLiqReal}
          tipo="subtotal" isSubtotal despesas={[]} {...linhaProps} />

        {/* (−) CMV */}
        {cmv && (
          <DreLinha id="cmv" label="CMV" orcado={cmv.orcado} realizado={cmv.realizado}
            tipo="despesa" isAutomatic despesas={[]} {...linhaProps} />
        )}

        {/* = Lucro Bruto */}
        <DreLinha id="_lucroBruto" label={`Lucro Bruto ${receitaRealizada > 0 ? `(${(lucroBrutoReal / receitaRealizada * 100).toFixed(1)}%)` : ""}`}
          orcado={lucroBrutoOrc} realizado={lucroBrutoReal}
          tipo="subtotal" isSubtotal despesas={[]} {...linhaProps} />

        {/* (−) Despesas Operacionais — grupo expansível */}
        <GrupoExpansivel title="Despesas Operacionais" total={totalDespOpReal} receitaRealizada={receitaRealizada}>
          {despOp.map(l => (
            <DreLinha key={l.id} id={l.id} label={l.label} orcado={l.orcado} realizado={l.realizado}
              tipo="despesa" indent despesas={getDespesasDaLinha(l.id)} {...linhaProps} />
          ))}
        </GrupoExpansivel>

        {/* = EBITDA */}
        <div className="border-t-2 border-border bg-muted/30">
          <div className="grid grid-cols-[1fr_auto_auto_1fr] gap-3 px-4 py-3 items-center">
            <span className="text-sm font-bold">= EBITDA</span>
            <span className="text-right text-sm font-bold text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>{fmt(ebitdaOrc)}</span>
            <span className={`text-right text-sm font-bold ${ebitdaReal >= 0 ? "" : "text-red-600"}`} style={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>{fmt(ebitdaReal)}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPct(ebitdaMargemReal)}</span>
              {ebitdaMargemReal >= ebitdaMargemMeta ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">meta atingida</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-medium">
                  {((ebitdaMargemMeta - ebitdaMargemReal) * 100).toFixed(1)}pp da meta
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
