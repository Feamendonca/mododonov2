import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useStore } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  PlusCircle, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, Clock, FileEdit, TrendingUp, TrendingDown,
  DollarSign, Users, Building2, Wrench, CreditCard, BarChart3,
  AlertTriangle, Info, Sparkles, X, Loader2, Calendar
} from "lucide-react";
import { ArrowRight } from "lucide-react";
import HolidaysPage from "./HolidaysPage";
import { OrcamentoAssistidoFlow } from "./OrcamentoAssistidoPage";
import { OrcamentoErrorBoundary } from "./OrcamentoAssistidoPage";
import { SetupDoMes } from "@/components/SetupDoMes";

// ─── Types ───────────────────────────────────────────────────────────────────

type TipoValor = "fixo" | "percentual";

interface Colaborador {
  funcao: string;
  quantidade: number;
  salarioBase: number;
  ordem: number;
}

interface LinhaCustomLocal {
  id?: number;       // undefined = nova (não salva ainda)
  grupoId: string;
  label: string;
  valor: number;
  tipo: TipoValor;
  origem?: string | null; // ex: "manutencao:42" — linha automática
  ordem: number;
  mes: string;
}

// Cada campo de despesa tem valor + tipo
interface CampoValor {
  valor: number;
  tipo: TipoValor;
}

interface OrcForm {
  periodoInicio: string;
  periodoFim: string;
  tipo: "mensal" | "trimestral" | "anual";
  receitaBruta: number;
  ticketMedio: number | null;
  diasOperacao: number;
  // Deduções — valor + tipo (fixo|percentual)
  taxaCartao: CampoValor;
  taxaDelivery: CampoValor;
  // Impostos
  impostos: CampoValor;
  // CMV
  cmv: CampoValor;
  // Franquia
  royalties: CampoValor;
  fundoMarketing: CampoValor;
  // Ocupação
  aluguel: CampoValor;
  condominio: CampoValor;
  energia: CampoValor;
  gas: CampoValor;
  agua: CampoValor;
  outrosOcupacao: CampoValor;
  // Serviços
  contabilidade: CampoValor;
  sistemas: CampoValor;
  sanitarismo: CampoValor;
  outrosServicos: CampoValor;
  // Financeiras
  juros: CampoValor;
  tarifasBancarias: CampoValor;
  // Outras
  marketing: CampoValor;
  outrasDespesas: CampoValor;
  proLabore: CampoValor;
  encargos: CampoValor;
  notas: string;
  colaboradores: Colaborador[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function pctOf(rb: number, v: number) {
  return rb > 0 ? v / rb : 0;
}

/** Resolve valor: se percentual, multiplica pela receita bruta */
function resolve(campo: CampoValor, rb: number): number {
  return campo.tipo === "percentual" ? rb * campo.valor : campo.valor;
}

function defaultCampo(valor = 0, tipo: TipoValor = "fixo"): CampoValor {
  return { valor, tipo };
}

function defaultForm(): OrcForm {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(y, m, 0);
  const endStr = `${y}-${String(m).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return {
    periodoInicio: start,
    periodoFim: endStr,
    tipo: "mensal",
    receitaBruta: 0,
    ticketMedio: null,
    diasOperacao: 26,
    taxaCartao: defaultCampo(0.025, "percentual"),
    taxaDelivery: defaultCampo(0.0, "percentual"),
    impostos: defaultCampo(0.06, "percentual"),
    cmv: defaultCampo(0.30, "percentual"),
    royalties: defaultCampo(0.0, "percentual"),
    fundoMarketing: defaultCampo(0.0, "percentual"),
    aluguel: defaultCampo(0, "fixo"),
    condominio: defaultCampo(0, "fixo"),
    energia: defaultCampo(0, "fixo"),
    gas: defaultCampo(0, "fixo"),
    agua: defaultCampo(0, "fixo"),
    outrosOcupacao: defaultCampo(0, "fixo"),
    contabilidade: defaultCampo(0, "fixo"),
    sistemas: defaultCampo(0, "fixo"),
    sanitarismo: defaultCampo(0, "fixo"),
    outrosServicos: defaultCampo(0, "fixo"),
    juros: defaultCampo(0, "fixo"),
    tarifasBancarias: defaultCampo(0, "fixo"),
    marketing: defaultCampo(0, "fixo"),
    outrasDespesas: defaultCampo(0, "fixo"),
    proLabore: defaultCampo(0, "fixo"),
    encargos: defaultCampo(0.35, "percentual"),
    notas: "",
    colaboradores: [
      { funcao: "Gerente", quantidade: 1, salarioBase: 0, ordem: 0 },
      { funcao: "Cozinheiro", quantidade: 1, salarioBase: 0, ordem: 1 },
      { funcao: "Atendente", quantidade: 1, salarioBase: 0, ordem: 2 },
    ],
  };
}

// ─── DRE Line Component ───────────────────────────────────────────────────────

interface DRELineProps {
  label: string;
  value: number;
  pct: number;
  isTotal?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
  indent?: boolean;
  benchmark?: { min: number; max: number };
}

function DRELine({ label, value, pct, isTotal, isPositive, isNegative, indent, benchmark }: DRELineProps) {
  const outOfRange = benchmark && (pct < benchmark.min || pct > benchmark.max);
  return (
    <div className={`flex items-center justify-between py-1.5 ${indent ? "pl-4" : ""} ${isTotal ? "font-semibold border-t border-border mt-1 pt-2" : ""}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {outOfRange && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
        <span className={`text-sm truncate ${isTotal ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <span className={`text-xs font-mono w-14 text-right ${outOfRange ? "text-amber-500" : "text-muted-foreground"}`}>
          {fmtPct(pct)}
        </span>
        <span className={`text-sm font-mono w-28 text-right ${isPositive ? "text-emerald-600" : isNegative ? "text-rose-600" : isTotal ? "text-foreground font-bold" : "text-foreground"}`}>
          {fmt(value)}
        </span>
      </div>
    </div>
  );
}

// ─── Input Row com toggle R$/% ────────────────────────────────────────────────

interface InputRowProps {
  label: string;
  campo: CampoValor;
  onChange: (campo: CampoValor) => void;
  hint?: string;
  alwaysPct?: boolean; // para campos que são sempre %
}

function InputRow({ label, campo, onChange, hint, alwaysPct }: InputRowProps) {
  const isPct = alwaysPct || campo.tipo === "percentual";
  const [localVal, setLocalVal] = useState(() => isPct ? (campo.valor * 100).toFixed(2) : String(Math.round(campo.valor)));

  // Sincroniza quando o valor externo muda (ex: ao carregar orçamento)
  useEffect(() => {
    setLocalVal(isPct ? (campo.valor * 100).toFixed(2) : String(Math.round(campo.valor)));
  }, [campo.valor, isPct]);

  const toggleTipo = () => {
    if (alwaysPct) return;
    onChange({ ...campo, tipo: campo.tipo === "percentual" ? "fixo" : "percentual", valor: 0 });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalVal(raw);
    // Aceita vírgula como separador decimal
    const num = parseFloat(raw.replace(",", ".")) || 0;
    onChange({ ...campo, valor: isPct ? num / 100 : num });
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate">{label}</span>
      {hint && <span className="text-xs text-muted-foreground/60 hidden sm:block">{hint}</span>}
      <button
        type="button"
        onClick={toggleTipo}
        title={alwaysPct ? "Sempre em %" : `Clique para mudar para ${campo.tipo === "percentual" ? "R$" : "%"}`}
        className={`text-xs font-mono px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${
          alwaysPct
            ? "bg-muted text-muted-foreground cursor-default"
            : "bg-muted hover:bg-accent cursor-pointer"
        }`}
      >
        {isPct ? "%" : "R$"}
      </button>
      <Input
        type="text"
        inputMode="decimal"
        min={0}
        value={localVal}
        onChange={handleChange}
        onBlur={() => {
          // Formata ao sair do campo
          const num = parseFloat(localVal.replace(",", ".")) || 0;
          setLocalVal(isPct ? num.toFixed(2) : String(Math.round(num)));
        }}
        className="w-28 text-right font-mono text-sm h-8 flex-shrink-0"
      />
    </div>
  );
}

// ─── Linha Customizável ───────────────────────────────────────────────────────

interface LinhaCustomRowProps {
  linha: LinhaCustomLocal;
  rb: number;
  onChange: (l: LinhaCustomLocal) => void;
  onDelete: () => void;
}

function LinhaCustomRow({ linha, rb, onChange, onDelete }: LinhaCustomRowProps) {
  const isPct = linha.tipo === "percentual";
  const valorResolvido = isPct ? rb * linha.valor : linha.valor;
  const isAuto = !!linha.origem; // linha gerada automaticamente por manutenção
  const [localVal, setLocalVal] = useState(() => isPct ? (linha.valor * 100).toFixed(2) : String(Math.round(linha.valor)));

  useEffect(() => {
    setLocalVal(isPct ? (linha.valor * 100).toFixed(2) : String(Math.round(linha.valor)));
  }, [linha.valor, isPct]);

  return (
    <div className={`flex items-center gap-2 py-1 pl-2 border-l-2 ${isAuto ? "border-amber-400" : "border-primary/20"}`}>
      {isAuto && (
        <span
          title={`Lançado automaticamente: ${linha.label}`}
          className="flex-shrink-0 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 py-0.5 flex items-center gap-0.5"
        >
          <Wrench size={9} className="inline" /> Auto
        </span>
      )}
      <Input
        value={linha.label}
        onChange={(e) => !isAuto && onChange({ ...linha, label: e.target.value })}
        readOnly={isAuto}
        placeholder="Nome da despesa"
        className={`flex-1 h-7 text-sm ${isAuto ? "bg-muted cursor-default" : ""}`}
      />
      <button
        type="button"
        onClick={() => onChange({ ...linha, tipo: isPct ? "fixo" : "percentual", valor: 0 })}
        className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded hover:bg-accent transition-colors flex-shrink-0"
        title="Alternar R$/% "
      >
        {isPct ? "%" : "R$"}
      </button>
      <Input
        type="text"
        inputMode="decimal"
        min={0}
        value={localVal}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalVal(raw);
          const num = parseFloat(raw.replace(",", ".")) || 0;
          onChange({ ...linha, valor: isPct ? num / 100 : num });
        }}
        onBlur={() => {
          const num = parseFloat(localVal.replace(",", ".")) || 0;
          setLocalVal(isPct ? num.toFixed(2) : String(Math.round(num)));
        }}
        className="w-24 text-right font-mono text-sm h-7 flex-shrink-0"
      />
      {rb > 0 && (
        <span className="text-xs text-muted-foreground font-mono w-16 text-right flex-shrink-0">
          {fmtPct(pctOf(rb, valorResolvido))}
        </span>
      )}
      {isAuto ? (
        <span
          title="Esta linha foi gerada automaticamente por uma manutenção. Para remover, conclua ou exclua a manutenção correspondente."
          className="text-muted-foreground/40 flex-shrink-0 cursor-not-allowed"
        >
          <X size={13} />
        </span>
      ) : (
        <button type="button" onClick={onDelete} className="text-muted-foreground hover:text-rose-500 flex-shrink-0">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true, total, rb }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  total?: number;
  rb?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section-card mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left font-semibold text-sm mb-2"
      >
        <Icon size={15} className="text-primary" />
        <span className="flex-1">{title}</span>
        {total !== undefined && rb && rb > 0 && (
          <span className="text-xs font-mono text-muted-foreground mr-2">
            {fmt(total)} ({fmtPct(pctOf(rb, total))})
          </span>
        )}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrcamentoPage() {
  const { user } = useAuth();
  const { storeId: storeIdRaw } = useStore();
  const storeId = storeIdRaw ?? 0;
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  // Admin e supervisor usam listGeral (todas as lojas visíveis para o usuário)
  const useGeralList = isAdmin || isSupervisor;

  const [tab, setTab] = useState("construir");
  const [step, setStep] = useState<1 | 2>(2); // 1=IA, 2=DRE editável (default)
  const [form, setForm] = useState<OrcForm>(defaultForm());
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [linhasCustom, setLinhasCustom] = useState<LinhaCustomLocal[]>([]);
  const [showIA, setShowIA] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null);
  const [iaResult, setIaResult] = useState<null | {
    sugestoes: Array<{ conta: string; grupoId: string; situacao: string; potencialEconomia: string; acao: string; prioridade: string }>;
    resumo: string;
  }>(null);

  // Queries
  const { data: orcAtivo, refetch: refetchAtivo } = trpc.orcamento.getAtivo.useQuery(
    { storeId }, { enabled: storeId > 0 }
  );
  // Lista geral: admin/supervisor vêm todos os orçamentos das lojas visíveis
  const { data: listaGeralOrc, refetch: refetchGeralLista } = trpc.orcamento.listGeral.useQuery(
    { storeId: storeId > 0 ? storeId : undefined },
    { enabled: useGeralList }
  );
  // Lista por loja: gerente/user vêm apenas a loja selecionada
  const { data: listaLojaOrc, refetch: refetchLojaLista } = trpc.orcamento.list.useQuery(
    { storeId }, { enabled: !useGeralList && storeId > 0 }
  );
  // Unificação: usa a lista geral para admin/supervisor, lista por loja para os demais
  const listaOrc = useGeralList ? listaGeralOrc : listaLojaOrc;
  const refetchLista = useGeralList ? refetchGeralLista : refetchLojaLista;

  const [, navigate] = useLocation();
  const [matchEdit, paramsEdit] = useRoute("/orcamento/editar/:id");
  const searchStr = useSearch();

  // ── Handoff do fluxo IA: ler :id do path param /orcamento/editar/:id ──────
  useEffect(() => {
    // Fonte 1: path param /orcamento/editar/:id
    let editId: number | null = null;
    if (matchEdit && paramsEdit?.id) {
      editId = parseInt(paramsEdit.id, 10);
    }
    // Fonte 2 (fallback): query string ?edit=<id>
    if (!editId) {
      const params = new URLSearchParams(searchStr);
      const qEdit = params.get("edit");
      if (qEdit) editId = parseInt(qEdit, 10);
    }
    if (!editId || isNaN(editId)) return;
    console.log(`[OrcamentoPage] edit param lido: ${editId} (path=${matchEdit}, search=${searchStr})`);
    setStep(2);
    setTab("construir");
    // Invalidar queries em background (não-bloqueante)
    void utils.orcamento.getAtivo.invalidate();
    void utils.orcamento.list.invalidate();
    loadOrcamento(editId).then(() => {
      console.log(`[OrcamentoPage] loadOrcamento(${editId}) concluído com sucesso`);
      // Limpar o param da URL com replace (sem push) APÓS load concluir
      if (matchEdit) {
        navigate("/orcamento", { replace: true });
      } else if (searchStr.includes("edit=")) {
        navigate("/orcamento", { replace: true });
      }
    }).catch((e) => {
      console.error(`[OrcamentoPage] loadOrcamento(${editId}) falhou:`, e);
      toast.error("Erro ao carregar orçamento: " + (e instanceof Error ? e.message : String(e)));
      // Permanecer no passo 2 (DRE vazio) — nunca voltar ao passo 1
    });
  }, [matchEdit, paramsEdit?.id, searchStr]); // re-dispara quando path OU query muda
  const [aprovacaoConfirmada, setAprovacaoConfirmada] = useState<{ periodo: string; orcId: number; medidasCriadas?: number; planosCriados?: number; avisos?: string[] } | null>(null);
  const mesPeriodo = form.periodoInicio.slice(0, 7);
  const { data: linhasCustomDB, refetch: refetchLinhas } = trpc.orcamento.linhasCustom.list.useQuery(
    { lojaId: storeId, mes: mesPeriodo },
    { enabled: storeId > 0 && mesPeriodo.length === 7 }
  );

  // Sincronizar linhas do DB ao carregar
  const linhasParaUsar: LinhaCustomLocal[] = useMemo(() => {
    if (linhasCustomDB && linhasCustomDB.length > 0 && linhasCustom.length === 0) {
      return linhasCustomDB.map((l) => ({
        id: l.id,
        grupoId: l.grupoId,
        label: l.label,
        valor: l.valor,
        tipo: l.tipo,
        origem: l.origem ?? null,
        ordem: l.ordem,
        mes: l.mes,
      }));
    }
    return linhasCustom;
  }, [linhasCustomDB, linhasCustom]);

  // Mutations
  const saveMut = trpc.orcamento.save.useMutation({
    onSuccess: async (data) => {
      setEditingId(data.id);
      // Salvar linhas custom
      for (const linha of linhasParaUsar) {
        if (!linha.id) {
          await createLinhaMut.mutateAsync({
            lojaId: storeId, mes: mesPeriodo,
            grupoId: linha.grupoId, label: linha.label,
            valor: linha.valor, tipo: linha.tipo,
          });
        } else {
          await updateLinhaMut.mutateAsync({
            id: linha.id, label: linha.label,
            valor: linha.valor, tipo: linha.tipo,
          });
        }
      }
      refetchLinhas();
      toast.success("Orçamento salvo como rascunho");
      refetchLista();
    },
    onError: () => toast.error("Erro ao salvar orçamento"),
  });

  const proporMut = trpc.orcamento.propor.useMutation({
    onSuccess: () => { toast.success("Orçamento proposto para aprovação"); refetchLista(); },
  });
  const excluirMut = trpc.orcamento.excluir.useMutation({
    onSuccess: () => { toast.success("Orçamento excluído"); refetchAtivo(); refetchLista(); },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  const zerarMesMut = trpc.orcamento.zerarMes.useMutation({
    onSuccess: (data) => {
      const l = data.limpeza;
      toast.success(`Mês zerado: ${l.orcamentosApagados} orçamento(s), ${l.metasApagadas} meta(s), ${l.medidasApagadas} medida(s), ${l.planosApagados} plano(s) automático(s).`);
      refetchAtivo(); refetchLista();
    },
    onError: (e) => toast.error("Erro ao zerar mês: " + e.message),
  });
  const aprovarMut = trpc.orcamento.aprovar.useMutation({
    onSuccess: (data, vars) => {
      refetchAtivo(); refetchLista();
      // Mostrar confirmação visível com links e contagens reais
      const orcId = vars.id;
      const periodo = form.periodoInicio.slice(0, 7);
      setAprovacaoConfirmada({
        periodo,
        orcId,
        medidasCriadas: data.medidasCriadas,
        planosCriados: data.planosCriados,
        avisos: data.avisos ?? [],
      });
    },
    onError: (e) => toast.error("Erro ao aprovar: " + e.message),
  });

  const createLinhaMut = trpc.orcamento.linhasCustom.create.useMutation();
  const updateLinhaMut = trpc.orcamento.linhasCustom.update.useMutation();
  const deleteLinhaMut = trpc.orcamento.linhasCustom.delete.useMutation({
    onSuccess: () => refetchLinhas(),
  });

  const analisarMut = trpc.orcamento.analisarConsumo.useMutation({
    onSuccess: (data) => {
      setIaResult(data);
      setShowIA(true);
    },
    onError: () => toast.error("Erro ao analisar com IA"),
  });

  // ─── Cálculo em tempo real ────────────────────────────────────────────────

  const rb = form.receitaBruta;
  const rv = (campo: CampoValor) => resolve(campo, rb);

  const deducoes = rv(form.taxaCartao) + rv(form.taxaDelivery);
  const receitaLiquida = rb - deducoes;
  const cmv = rv(form.cmv);
  const impostos = rv(form.impostos);
  const royalties = rv(form.royalties);
  const fundoMkt = rv(form.fundoMarketing);

  const totalFolha = form.colaboradores.reduce((s, c) => {
    const encargosVal = form.encargos.tipo === "fixo"
      ? c.quantidade * form.encargos.valor
      : c.salarioBase * c.quantidade * form.encargos.valor;
    return s + c.salarioBase * c.quantidade + encargosVal;
  }, 0);

  const customPorGrupo = (grupoId: string) =>
    linhasParaUsar.filter((l) => l.grupoId === grupoId).reduce((s, l) => s + resolve(l, rb), 0);

  const ocupacao = rv(form.aluguel) + rv(form.condominio) + rv(form.energia) +
    rv(form.gas) + rv(form.agua) + rv(form.outrosOcupacao) + customPorGrupo("ocupacao");
  const servicos = rv(form.contabilidade) + rv(form.sistemas) + rv(form.sanitarismo) +
    rv(form.outrosServicos) + customPorGrupo("servicos_terceiros");
  const financeiras = rv(form.juros) + rv(form.tarifasBancarias) + customPorGrupo("financeiras");
  const outrasTotal = rv(form.marketing) + rv(form.outrasDespesas) + rv(form.proLabore) + customPorGrupo("outras_despesas");

  const totalCustos = deducoes + cmv + impostos + royalties + fundoMkt +
    totalFolha + ocupacao + servicos + financeiras + outrasTotal;
  const ebitda = rb - totalCustos;
  const ebitdaPct = rb > 0 ? ebitda / rb : 0;

  // Ponto de equilíbrio
  const pctVariaveis =
    (form.taxaCartao.tipo === "percentual" ? form.taxaCartao.valor : 0) +
    (form.taxaDelivery.tipo === "percentual" ? form.taxaDelivery.valor : 0) +
    (form.cmv.tipo === "percentual" ? form.cmv.valor : 0) +
    (form.impostos.tipo === "percentual" ? form.impostos.valor : 0) +
    (form.royalties.tipo === "percentual" ? form.royalties.valor : 0) +
    (form.fundoMarketing.tipo === "percentual" ? form.fundoMarketing.valor : 0) +
    (form.aluguel.tipo === "percentual" ? form.aluguel.valor : 0) +
    (form.condominio.tipo === "percentual" ? form.condominio.valor : 0) +
    (form.energia.tipo === "percentual" ? form.energia.valor : 0) +
    (form.gas.tipo === "percentual" ? form.gas.valor : 0) +
    (form.agua.tipo === "percentual" ? form.agua.valor : 0) +
    (form.outrosOcupacao.tipo === "percentual" ? form.outrosOcupacao.valor : 0) +
    (form.contabilidade.tipo === "percentual" ? form.contabilidade.valor : 0) +
    (form.sistemas.tipo === "percentual" ? form.sistemas.valor : 0) +
    (form.sanitarismo.tipo === "percentual" ? form.sanitarismo.valor : 0) +
    (form.outrosServicos.tipo === "percentual" ? form.outrosServicos.valor : 0) +
    (form.juros.tipo === "percentual" ? form.juros.valor : 0) +
    (form.tarifasBancarias.tipo === "percentual" ? form.tarifasBancarias.valor : 0) +
    (form.marketing.tipo === "percentual" ? form.marketing.valor : 0) +
    (form.outrasDespesas.tipo === "percentual" ? form.outrasDespesas.valor : 0) +
    (form.proLabore.tipo === "percentual" ? form.proLabore.valor : 0) +
    linhasParaUsar.filter((l) => l.tipo === "percentual").reduce((s, l) => s + l.valor, 0);

  const _custosFixos = totalFolha + ocupacao + servicos + financeiras + outrasTotal;
  const pontoEquilibrio = pctVariaveis < 1 ? (totalFolha + ocupacao + servicos + financeiras + outrasTotal) / (1 - pctVariaveis) : 0;
  const metaDiaria = form.diasOperacao > 0 ? rb / form.diasOperacao : 0;
  const metaAtend = form.ticketMedio && form.ticketMedio > 0 ? Math.ceil(metaDiaria / form.ticketMedio) : null;

  // ─── Form helpers ─────────────────────────────────────────────────────────

  const setField = useCallback(<K extends keyof OrcForm>(key: K, value: OrcForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setCampo = useCallback((key: keyof OrcForm, campo: CampoValor) => {
    setForm((prev) => ({ ...prev, [key]: campo }));
  }, []);

  const setColabField = (idx: number, key: keyof Colaborador, value: string | number) => {
    setForm((prev) => {
      const cols = [...prev.colaboradores];
      cols[idx] = { ...cols[idx], [key]: value };
      return { ...prev, colaboradores: cols };
    });
  };

  const addColab = () => {
    setForm((prev) => ({
      ...prev,
      colaboradores: [...prev.colaboradores, { funcao: "", quantidade: 1, salarioBase: 0, ordem: prev.colaboradores.length }],
    }));
  };

  const removeColab = (idx: number) => {
    setForm((prev) => ({ ...prev, colaboradores: prev.colaboradores.filter((_, i) => i !== idx) }));
  };

  const addLinhaCustom = (grupoId: string) => {
    const nova: LinhaCustomLocal = {
      grupoId, label: "", valor: 0, tipo: "fixo",
      ordem: linhasParaUsar.filter((l) => l.grupoId === grupoId).length,
      mes: mesPeriodo,
    };
    setLinhasCustom([...linhasParaUsar, nova]);
  };

  const updateLinhaCustomLocal = (idx: number, updated: LinhaCustomLocal) => {
    const all = [...linhasParaUsar];
    all[idx] = updated;
    setLinhasCustom(all);
  };

  const deleteLinhaCustomLocal = async (idx: number) => {
    const linha = linhasParaUsar[idx];
    if (linha.id) {
      await deleteLinhaMut.mutateAsync({ id: linha.id });
    }
    setLinhasCustom(linhasParaUsar.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!storeId) return toast.error("Selecione uma loja");
    saveMut.mutate({
      storeId,
      id: editingId,
      periodoInicio: form.periodoInicio,
      periodoFim: form.periodoFim,
      tipo: form.tipo,
      receitaBruta: form.receitaBruta,
      ticketMedio: form.ticketMedio,
      diasOperacao: form.diasOperacao,
      // Novos campos com toggle R$/%
      taxaCartaoPct: form.taxaCartao.valor, taxaCartaoTipo: form.taxaCartao.tipo,
      taxaDeliveryPct: form.taxaDelivery.valor, taxaDeliveryTipo: form.taxaDelivery.tipo,
      impostosPct: form.impostos.valor, impostosTipo: form.impostos.tipo,
      cmvPct: form.cmv.valor, cmvTipo: form.cmv.tipo,
      royaltiesPct: form.royalties.valor, royaltiesTipo: form.royalties.tipo,
      fundoMarketingPct: form.fundoMarketing.valor, fundoMarketingTipo: form.fundoMarketing.tipo,
      // Campos de ocupação
      aluguel: form.aluguel.valor, aluguelTipo: form.aluguel.tipo,
      condominio: form.condominio.valor, condominioTipo: form.condominio.tipo,
      energia: form.energia.valor, energiaTipo: form.energia.tipo,
      gas: form.gas.valor, gasTipo: form.gas.tipo,
      agua: form.agua.valor, aguaTipo: form.agua.tipo,
      outrosOcupacao: form.outrosOcupacao.valor, outrosOcupacaoTipo: form.outrosOcupacao.tipo,
      contabilidade: form.contabilidade.valor, contabilidadeTipo: form.contabilidade.tipo,
      sistemas: form.sistemas.valor, sistemasTipo: form.sistemas.tipo,
      sanitarismo: form.sanitarismo.valor, sanitarismoTipo: form.sanitarismo.tipo,
      outrosServicos: form.outrosServicos.valor, outrosServicosTipo: form.outrosServicos.tipo,
      juros: form.juros.valor, jurosTipo: form.juros.tipo,
      tarifasBancarias: form.tarifasBancarias.valor, tarifasBancariasTipo: form.tarifasBancarias.tipo,
      marketing: form.marketing.valor, marketingTipo: form.marketing.tipo,
      outrasDespesas: form.outrasDespesas.valor, outrasDespesasTipo: form.outrasDespesas.tipo,
      proLabore: form.proLabore.valor, proLaboreTipo: form.proLabore.tipo,
      encargosPct: form.encargos.valor, encargosTipo: form.encargos.tipo,
      notas: form.notas,
      colaboradores: form.colaboradores,
    });
  };

  const handlePropor = () => {
    if (!editingId) return toast.error("Salve o orçamento primeiro");
    proporMut.mutate({ id: editingId });
  };

  const utils = trpc.useUtils();

  const loadOrcamento = async (id: number) => {
    setLoadingEditId(id);
    try {
    const full = await utils.orcamento.getById.fetch({ id });
    if (!full) { toast.error("Orçamento não encontrado"); return; }
    setEditingId(full.id);
    setForm({
      periodoInicio: full.periodoInicio,
      periodoFim: full.periodoFim,
      tipo: full.tipo,
      receitaBruta: full.receitaBruta,
      ticketMedio: full.ticketMedio,
      diasOperacao: full.diasOperacao,
      taxaCartao: { valor: full.taxaCartaoPct, tipo: full.taxaCartaoTipo ?? "percentual" },
      taxaDelivery: { valor: full.taxaDeliveryPct, tipo: full.taxaDeliveryTipo ?? "percentual" },
      impostos: { valor: full.impostosPct, tipo: full.impostosTipo ?? "percentual" },
      cmv: { valor: full.cmvPct, tipo: full.cmvTipo ?? "percentual" },
      royalties: { valor: full.royaltiesPct, tipo: full.royaltiesTipo ?? "percentual" },
      fundoMarketing: { valor: full.fundoMarketingPct, tipo: full.fundoMarketingTipo ?? "percentual" },
      aluguel: { valor: full.aluguel, tipo: (full as any).aluguelTipo ?? "fixo" },
      condominio: { valor: full.condominio, tipo: (full as any).condominioTipo ?? "fixo" },
      energia: { valor: full.energia, tipo: (full as any).energiaTipo ?? "fixo" },
      gas: { valor: full.gas, tipo: (full as any).gasTipo ?? "fixo" },
      agua: { valor: full.agua, tipo: (full as any).aguaTipo ?? "fixo" },
      outrosOcupacao: { valor: full.outrosOcupacao, tipo: (full as any).outrosOcupacaoTipo ?? "fixo" },
      contabilidade: { valor: full.contabilidade, tipo: (full as any).contabilidadeTipo ?? "fixo" },
      sistemas: { valor: full.sistemas, tipo: (full as any).sistemasTipo ?? "fixo" },
      sanitarismo: { valor: full.sanitarismo, tipo: (full as any).sanitarismoTipo ?? "fixo" },
      outrosServicos: { valor: full.outrosServicos, tipo: (full as any).outrosServicosTipo ?? "fixo" },
      juros: { valor: full.juros, tipo: (full as any).jurosTipo ?? "fixo" },
      tarifasBancarias: { valor: full.tarifasBancarias, tipo: (full as any).tarifasBancariasTipo ?? "fixo" },
      marketing: { valor: full.marketing, tipo: (full as any).marketingTipo ?? "fixo" },
      outrasDespesas: { valor: full.outrasDespesas, tipo: (full as any).outrasDespesasTipo ?? "fixo" },
      proLabore: { valor: full.proLabore, tipo: full.proLaboreTipo ?? "fixo" },
      encargos: { valor: full.encargosPct, tipo: full.encargosTipo ?? "percentual" },
      notas: full.notas ?? "",
      colaboradores: full.colaboradores?.map((c) => ({
        funcao: c.funcao, quantidade: c.quantidade, salarioBase: c.salarioBase, ordem: c.ordem,
      })) ?? [],
    });
    // Carregar linhas custom do DB (usar storeId do orçamento, não do contexto)
    const linhasDB = await utils.orcamento.linhasCustom.list.fetch({
      lojaId: full.storeId || storeId, mes: full.periodoInicio.slice(0, 7)
    });
    setLinhasCustom(linhasDB.map((l) => ({
      id: l.id, grupoId: l.grupoId, label: l.label,
      valor: l.valor, tipo: l.tipo, origem: l.origem ?? null, ordem: l.ordem, mes: l.mes,
    })));
    // Invalidações não-bloqueantes (não segurar a UI)
    void utils.orcamento.getAtivo.invalidate();
    void utils.orcamento.list.invalidate();
    setTab("construir");
    toast.success("Orçamento carregado para edição");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[loadOrcamento] erro:", msg, e);
      toast.error("Erro ao carregar orçamento: " + msg);
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleAnalisarIA = () => {
    if (!listaOrc || listaOrc.length === 0) {
      return toast.error("Nenhum histórico disponível para análise");
    }
    const historico = listaOrc.slice(0, 3).map((orc) => ({
      mes: orc.periodoInicio.slice(0, 7),
      receitaBruta: orc.receitaBruta,
      linhas: [
        { label: "Aluguel", grupoId: "ocupacao", valorR: (orc as any).aluguel ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).aluguel ?? 0) / orc.receitaBruta : 0 },
        { label: "Energia", grupoId: "ocupacao", valorR: (orc as any).energia ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).energia ?? 0) / orc.receitaBruta : 0 },
        { label: "Gás", grupoId: "ocupacao", valorR: (orc as any).gas ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).gas ?? 0) / orc.receitaBruta : 0 },
        { label: "Água", grupoId: "ocupacao", valorR: (orc as any).agua ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).agua ?? 0) / orc.receitaBruta : 0 },
        { label: "Contabilidade", grupoId: "servicos_terceiros", valorR: (orc as any).contabilidade ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).contabilidade ?? 0) / orc.receitaBruta : 0 },
        { label: "Sistemas", grupoId: "servicos_terceiros", valorR: (orc as any).sistemas ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).sistemas ?? 0) / orc.receitaBruta : 0 },
        { label: "Marketing", grupoId: "outras_despesas", valorR: (orc as any).marketing ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).marketing ?? 0) / orc.receitaBruta : 0 },
        { label: "Outras despesas", grupoId: "outras_despesas", valorR: (orc as any).outrasDespesas ?? 0, pctReceita: orc.receitaBruta > 0 ? ((orc as any).outrasDespesas ?? 0) / orc.receitaBruta : 0 },
      ],
    }));
    analisarMut.mutate({ storeId, historico });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* ── Header 4DX ── */}
      <div className="mb-6">
        <div className="eyebrow mb-1" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--stone)" }}>1. Planejar</div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--ink)" }}>
          Orçamento<span style={{ color: "var(--vinho)" }}>.</span>
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--stone)" }}>
          O plano do mês — a base de onde nasce a Meta Crucialmente Importante.
        </p>
      </div>

      {/* ── Stepper 4DX ── */}
      <div className="flex items-center gap-3 mb-6 p-4 rounded-xl border" style={{ background: "var(--white)", borderColor: "var(--gray-line)" }}>
        <button
          onClick={() => setStep(1)}
          className="flex items-center gap-3 flex-1 text-left rounded-lg p-3 transition-colors hover:bg-muted/50"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: "var(--vinho)", color: "var(--ivory)" }}>1</div>
          <div className="min-w-0">
            <div className="font-semibold text-sm" style={{ color: "var(--ink)" }}>Gerar base com IA</div>
            <div className="text-xs" style={{ color: "var(--stone)" }}>Suba o histórico → IA propõe meta, DRE e plano de ação</div>
          </div>
          <Sparkles size={16} style={{ color: "var(--vinho)", flexShrink: 0 }} />
        </button>
        <ArrowRight size={16} style={{ color: "var(--stone-light)", flexShrink: 0 }} />
        <button onClick={() => setStep(2)} className="flex items-center gap-3 flex-1 rounded-lg p-3 text-left transition-colors hover:bg-muted/50"
          style={{ background: step === 2 ? "rgba(113,14,43,0.06)" : "transparent", border: step === 2 ? "1px solid rgba(113,14,43,0.2)" : "1px solid var(--gray-line)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: "var(--ink)", color: "var(--ivory)" }}>2</div>
          <div className="min-w-0">
            <div className="font-semibold text-sm" style={{ color: "var(--ink)" }}>Ajustar e aprovar</div>
            <div className="text-xs" style={{ color: "var(--stone)" }}>Edite linha a linha e aprove o orçamento do mês</div>
          </div>
          {orcAtivo && (
            <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 flex-shrink-0 text-xs">
              <CheckCircle2 size={10} className="mr-1" />
              Aprovado
            </Badge>
          )}
        </button>
      </div>


      {/* ── Passo 1: Fluxo IA ── */}
      {step === 1 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setStep(2)}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              ← Voltar ao orçamento manual
            </button>
          </div>
        <OrcamentoErrorBoundary>
        <OrcamentoAssistidoFlow
            onBaseAprovada={({ orcamentoId }) => {
              // Handoff à prova de bala: navegação COMPLETA (full page reload)
              // garante que o OrcamentoPage remonta do zero com o id correto
              console.log(`[OrcamentoPage] onBaseAprovada → navegando para /orcamento/editar/${orcamentoId}`);
              window.location.href = `/orcamento/editar/${orcamentoId}`;
            }}
          />
        </OrcamentoErrorBoundary>
        </div>
      )}

      {/* ── Passo 2: DRE editável (só renderiza quando step===2) ── */}
      {step === 2 && (
        <>
      {/* Painel de IA */}
      {showIA && iaResult && (
        <div className="section-card mb-4 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              <Sparkles size={14} className="text-primary" />
              Análise de Consumo — IA
            </h3>
            <button onClick={() => setShowIA(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{iaResult.resumo}</p>
          <div className="space-y-2">
            {iaResult.sugestoes.map((s, i) => (
              <div key={i} className="bg-background rounded-lg p-3 border border-border">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-sm">{s.conta}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs flex-shrink-0 ${s.prioridade === "alta" ? "border-rose-300 text-rose-600" : s.prioridade === "media" ? "border-amber-300 text-amber-600" : "border-emerald-300 text-emerald-600"}`}
                  >
                    {s.prioridade === "alta" ? "Alta" : s.prioridade === "media" ? "Média" : "Baixa"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{s.situacao}</p>
                <p className="text-xs font-medium">{s.acao}</p>
                <p className="text-xs text-emerald-600 mt-1">Potencial: {s.potencialEconomia}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="construir">
            <FileEdit size={14} className="mr-1.5" /> Construir
          </TabsTrigger>
          <TabsTrigger value="preview">
            <BarChart3 size={14} className="mr-1.5" /> DRE Projetada
          </TabsTrigger>
          <TabsTrigger value="historico">
            <Clock size={14} className="mr-1.5" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="feriados">
            <Calendar size={14} className="mr-1.5" /> Feriados
          </TabsTrigger>
        </TabsList>

        {/* ── Construir ─────────────────────────────────────────────────── */}
        <TabsContent value="construir">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Formulário */}
            <div className="lg:col-span-2 space-y-2">

              {/* Período */}
              <Section title="Período e tipo" icon={Clock}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Início</Label>
                    <Input type="date" value={form.periodoInicio} onChange={(e) => setField("periodoInicio", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Fim</Label>
                    <Input type="date" value={form.periodoFim} onChange={(e) => setField("periodoFim", e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <select
                      value={form.tipo}
                      onChange={(e) => setField("tipo", e.target.value as OrcForm["tipo"])}
                      className="w-full h-8 text-sm border border-input rounded-md px-2 bg-background"
                    >
                      <option value="mensal">Mensal</option>
                      <option value="trimestral">Trimestral</option>
                      <option value="anual">Anual</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Dias de operação</Label>
                    <Input type="number" min={1} max={31} value={form.diasOperacao} onChange={(e) => setField("diasOperacao", parseInt(e.target.value) || 26)} className="h-8 text-sm" />
                  </div>
                </div>
              </Section>

              {/* Receita */}
              <Section title="Receita" icon={DollarSign}>
                <InputRow
                  label="Receita bruta mensal"
                  campo={{ valor: form.receitaBruta, tipo: "fixo" }}
                  onChange={(c) => setField("receitaBruta", c.valor)}
                  hint="base de tudo"
                  alwaysPct={false}
                />
                <InputRow
                  label="Ticket médio estimado"
                  campo={{ valor: form.ticketMedio ?? 0, tipo: "fixo" }}
                  onChange={(c) => setField("ticketMedio", c.valor || null)}
                  hint="opcional"
                />
                {form.ticketMedio && form.ticketMedio > 0 && metaDiaria > 0 && (
                  <div className="text-xs text-muted-foreground pl-1 mt-1 flex items-center gap-1">
                    <Info size={11} />
                    Meta: {Math.ceil(metaDiaria / form.ticketMedio)} atendimentos/dia para atingir {fmt(metaDiaria)}/dia
                  </div>
                )}
              </Section>

              {/* Deduções */}
              <Section title="Deduções da receita" icon={CreditCard}>
                <InputRow
                  label="Taxa cartão / maquininha"
                  campo={form.taxaCartao}
                  onChange={(c) => setCampo("taxaCartao", c)}
                  hint="ex: 2,5%"
                />
                <InputRow
                  label="Taxa delivery (iFood, Rappi)"
                  campo={form.taxaDelivery}
                  onChange={(c) => setCampo("taxaDelivery", c)}
                  hint="ex: 12%"
                />
                <InputRow
                  label="Impostos sobre vendas"
                  campo={form.impostos}
                  onChange={(c) => setCampo("impostos", c)}
                  hint="Simples / ICMS"
                />
              </Section>

              {/* CMV */}
              <Section title="Custo de Mercadoria (CMV)" icon={PackageIcon}>
                <InputRow
                  label="CMV total"
                  campo={form.cmv}
                  onChange={(c) => setCampo("cmv", c)}
                  hint="benchmark: 28–33%"
                />
                {rb > 0 && (
                  <div className={`text-xs pl-1 mt-1 flex items-center gap-1 ${pctOf(rb, cmv) > 0.33 ? "text-rose-500" : pctOf(rb, cmv) > 0.30 ? "text-amber-500" : "text-emerald-600"}`}>
                    {pctOf(rb, cmv) > 0.33 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {fmtPct(pctOf(rb, cmv))} da receita = {fmt(cmv)}/mês
                  </div>
                )}
              </Section>

              {/* Franquia */}
              <Section title="Franquia / Royalties" icon={Building2} defaultOpen={false}>
                <InputRow
                  label="Royalties"
                  campo={form.royalties}
                  onChange={(c) => setCampo("royalties", c)}
                />
                <InputRow
                  label="Fundo de marketing"
                  campo={form.fundoMarketing}
                  onChange={(c) => setCampo("fundoMarketing", c)}
                />
              </Section>

              {/* Colaboradores */}
              <Section title="Colaboradores" icon={Users} total={totalFolha} rb={rb}>
                <div className="mb-2">
                  <InputRow
                    label="Encargos sobre folha"
                    campo={form.encargos}
                    onChange={(c) => setCampo("encargos", c)}
                    hint="% do salário ou R$ fixo/cabeça"
                  />
                </div>
                <div className="space-y-2">
                  {form.colaboradores.map((c, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                      <Input value={c.funcao} onChange={(e) => setColabField(i, "funcao", e.target.value)} placeholder="Função" className="col-span-4 h-8 text-sm" />
                      <Input type="number" min={1} value={c.quantidade} onChange={(e) => setColabField(i, "quantidade", parseInt(e.target.value) || 1)} className="col-span-2 h-8 text-sm text-center" title="Quantidade" />
                      <Input type="number" min={0} value={c.salarioBase} onChange={(e) => setColabField(i, "salarioBase", parseFloat(e.target.value) || 0)} placeholder="Salário base" className="col-span-4 h-8 text-sm text-right font-mono" />
                      <div className="col-span-1 text-xs text-muted-foreground text-right font-mono">
                        {rb > 0 ? fmtPct(pctOf(rb, c.salarioBase * c.quantidade)) : ""}
                      </div>
                      <button type="button" onClick={() => removeColab(i)} className="col-span-1 text-muted-foreground hover:text-rose-500 flex justify-center">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground flex justify-between pt-1 border-t border-border">
                    <span>Total colaboradores (com encargos)</span>
                    <span className={`font-mono font-semibold ${rb > 0 && pctOf(rb, totalFolha) > 0.25 ? "text-amber-500" : ""}`}>
                      {fmt(totalFolha)} {rb > 0 ? `(${fmtPct(pctOf(rb, totalFolha))})` : ""}
                    </span>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addColab} className="w-full h-7 text-xs">
                    <PlusCircle size={12} className="mr-1" /> Adicionar função
                  </Button>
                </div>
              </Section>

              {/* Ocupação */}
              <Section title="Ocupação e utilidades" icon={Building2} total={ocupacao} rb={rb}>
                <InputRow label="Aluguel" campo={form.aluguel} onChange={(c) => setCampo("aluguel", c)} />
                <InputRow label="Condomínio / taxas" campo={form.condominio} onChange={(c) => setCampo("condominio", c)} />
                <InputRow label="Energia elétrica" campo={form.energia} onChange={(c) => setCampo("energia", c)} />
                <InputRow label="Gás de cozinha" campo={form.gas} onChange={(c) => setCampo("gas", c)} />
                <InputRow label="Água e esgoto" campo={form.agua} onChange={(c) => setCampo("agua", c)} />
                <InputRow label="Outros (IPTU, seguro predial)" campo={form.outrosOcupacao} onChange={(c) => setCampo("outrosOcupacao", c)} />
                {/* Linhas custom de ocupação */}
                {linhasParaUsar.filter((l) => l.grupoId === "ocupacao").map((linha, i) => {
                  const globalIdx = linhasParaUsar.indexOf(linha);
                  return (
                    <LinhaCustomRow
                      key={linha.id ?? `new-${i}`}
                      linha={linha}
                      rb={rb}
                      onChange={(updated) => updateLinhaCustomLocal(globalIdx, updated)}
                      onDelete={() => deleteLinhaCustomLocal(globalIdx)}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => addLinhaCustom("ocupacao")}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors"
                >
                  <PlusCircle size={11} /> Adicionar linha
                </button>
              </Section>

              {/* Serviços */}
              <Section title="Serviços de terceiros" icon={Wrench} defaultOpen={false} total={servicos} rb={rb}>
                <InputRow label="Contabilidade" campo={form.contabilidade} onChange={(c) => setCampo("contabilidade", c)} />
                <InputRow label="Sistemas (PDV, gestão)" campo={form.sistemas} onChange={(c) => setCampo("sistemas", c)} />
                <InputRow label="Sanitarismo / dedetização" campo={form.sanitarismo} onChange={(c) => setCampo("sanitarismo", c)} />
                <InputRow label="Outros serviços" campo={form.outrosServicos} onChange={(c) => setCampo("outrosServicos", c)} />
                {linhasParaUsar.filter((l) => l.grupoId === "servicos_terceiros").map((linha, i) => {
                  const globalIdx = linhasParaUsar.indexOf(linha);
                  return (
                    <LinhaCustomRow key={linha.id ?? `new-st-${i}`} linha={linha} rb={rb}
                      onChange={(updated) => updateLinhaCustomLocal(globalIdx, updated)}
                      onDelete={() => deleteLinhaCustomLocal(globalIdx)} />
                  );
                })}
                <button type="button" onClick={() => addLinhaCustom("servicos_terceiros")}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors">
                  <PlusCircle size={11} /> Adicionar linha
                </button>
              </Section>

              {/* Financeiras */}
              <Section title="Despesas financeiras" icon={CreditCard} defaultOpen={false} total={financeiras} rb={rb}>
                <InputRow label="Juros e multas" campo={form.juros} onChange={(c) => setCampo("juros", c)} />
                <InputRow label="Tarifas bancárias" campo={form.tarifasBancarias} onChange={(c) => setCampo("tarifasBancarias", c)} />
                {linhasParaUsar.filter((l) => l.grupoId === "financeiras").map((linha, i) => {
                  const globalIdx = linhasParaUsar.indexOf(linha);
                  return (
                    <LinhaCustomRow key={linha.id ?? `new-fin-${i}`} linha={linha} rb={rb}
                      onChange={(updated) => updateLinhaCustomLocal(globalIdx, updated)}
                      onDelete={() => deleteLinhaCustomLocal(globalIdx)} />
                  );
                })}
                <button type="button" onClick={() => addLinhaCustom("financeiras")}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors">
                  <PlusCircle size={11} /> Adicionar linha
                </button>
              </Section>

              {/* Outras */}
              <Section title="Marketing, pró-labore e outras" icon={BarChart3} defaultOpen={false} total={outrasTotal} rb={rb}>
                <InputRow label="Marketing" campo={form.marketing} onChange={(c) => setCampo("marketing", c)} />
                <InputRow label="Outras despesas" campo={form.outrasDespesas} onChange={(c) => setCampo("outrasDespesas", c)} />
                <InputRow label="Pró-labore (não operacional)" campo={form.proLabore} onChange={(c) => setCampo("proLabore", c)} />
                {linhasParaUsar.filter((l) => l.grupoId === "outras_despesas").map((linha, i) => {
                  const globalIdx = linhasParaUsar.indexOf(linha);
                  return (
                    <LinhaCustomRow key={linha.id ?? `new-out-${i}`} linha={linha} rb={rb}
                      onChange={(updated) => updateLinhaCustomLocal(globalIdx, updated)}
                      onDelete={() => deleteLinhaCustomLocal(globalIdx)} />
                  );
                })}
                <button type="button" onClick={() => addLinhaCustom("outras_despesas")}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors">
                  <PlusCircle size={11} /> Adicionar linha
                </button>
              </Section>

              {/* Notas */}
              <div className="section-card">
                <Label className="text-sm font-semibold mb-2 block">Notas e premissas</Label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setField("notas", e.target.value)}
                  placeholder="Registre as premissas usadas na construção deste orçamento..."
                  className="w-full min-h-[80px] text-sm border border-input rounded-md p-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saveMut.isPending} className="flex-1">
                    {saveMut.isPending ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar rascunho"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handlePropor}
                    disabled={!editingId || proporMut.isPending}
                    title={!editingId ? "Salve o orçamento primeiro" : "Envia para aprovação do admin"}
                  >
                    {proporMut.isPending ? "Enviando..." : "Propor aprovação"}
                  </Button>
                </div>
                {/* Fluxo de status */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                    !editingId ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-700 font-semibold"
                  }`}>Rascunho</span>
                  <span>→</span>
                  <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-muted text-muted-foreground">Proposto</span>
                  <span>→</span>
                  <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-muted text-muted-foreground">Aprovado ✓</span>
                  <span className="ml-1 text-muted-foreground/60">(metas geradas)</span>
                </div>
                {!editingId && (
                  <p className="text-xs text-muted-foreground">
                    Salve o rascunho para habilitar a proposta de aprovação.
                  </p>
                )}
              </div>
            </div>

            {/* Painel lateral — DRE resumida em tempo real */}
            <div className="lg:col-span-1">
              <div className="section-card sticky top-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <BarChart3 size={14} className="text-primary" />
                  DRE em tempo real
                </h3>
                {rb === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Preencha a receita bruta para ver a DRE projetada
                  </p>
                ) : (
                  <div className="space-y-0">
                    <DRELine label="Receita bruta" value={rb} pct={1} isPositive />
                    <DRELine label="Deduções" value={-deducoes} pct={pctOf(rb, deducoes)} indent isNegative />
                    <DRELine label="Receita líquida" value={receitaLiquida} pct={pctOf(rb, receitaLiquida)} isTotal />
                    <Separator className="my-1" />
                    <DRELine label="CMV" value={-cmv} pct={pctOf(rb, cmv)} indent isNegative benchmark={{ min: 0.26, max: 0.33 }} />
                    <DRELine label="Impostos" value={-impostos} pct={pctOf(rb, impostos)} indent isNegative />
                    <DRELine label="Royalties + Fundo" value={-(royalties + fundoMkt)} pct={pctOf(rb, royalties + fundoMkt)} indent isNegative />
                    <DRELine label="Colaboradores" value={-totalFolha} pct={pctOf(rb, totalFolha)} indent isNegative benchmark={{ min: 0.12, max: 0.25 }} />
                    <DRELine label="Ocupação" value={-ocupacao} pct={pctOf(rb, ocupacao)} indent isNegative benchmark={{ min: 0.10, max: 0.20 }} />
                    <DRELine label="Serviços terceiros" value={-servicos} pct={pctOf(rb, servicos)} indent isNegative />
                    <DRELine label="Financeiras" value={-financeiras} pct={pctOf(rb, financeiras)} indent isNegative />
                    <DRELine label="Marketing + Outras" value={-outrasTotal} pct={pctOf(rb, outrasTotal)} indent isNegative />
                    <Separator className="my-1" />
                    <DRELine label="EBITDA" value={ebitda} pct={ebitdaPct} isTotal isPositive={ebitda > 0} isNegative={ebitda < 0} />
                  </div>
                )}

                {rb > 0 && (
                  <div className="mt-4 space-y-2 pt-3 border-t border-border">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Ponto de equilíbrio</span>
                      <span className="font-mono font-semibold">{fmt(pontoEquilibrio)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Meta diária</span>
                      <span className="font-mono font-semibold">{fmt(metaDiaria)}</span>
                    </div>
                    {metaAtend && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Atendimentos/dia</span>
                        <span className="font-mono font-semibold">{metaAtend}</span>
                      </div>
                    )}
                    <div className={`flex justify-between text-xs font-semibold ${ebitdaPct >= 0.10 ? "text-emerald-600" : ebitdaPct >= 0.05 ? "text-amber-500" : "text-rose-600"}`}>
                      <span>EBITDA %</span>
                      <span className="font-mono">{fmtPct(ebitdaPct)}</span>
                    </div>
                    {ebitdaPct < 0.05 && rb > 0 && (
                      <div className="text-xs text-rose-600 bg-rose-50 rounded p-2 mt-1">
                        <AlertTriangle size={11} className="inline mr-1" />
                        EBITDA abaixo de 5%. Revise CMV, M.O. ou ocupação.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── DRE Projetada ─────────────────────────────────────────────── */}
        <TabsContent value="preview">
          {rb === 0 ? (
            <div className="section-card text-center py-12 text-muted-foreground">
              <BarChart3 size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Construa o orçamento primeiro para ver a DRE completa</p>
            </div>
          ) : (
            <div className="section-card max-w-2xl">
              <h2 className="font-display font-bold text-lg mb-4">DRE Projetada — {form.periodoInicio.slice(0, 7)}</h2>
              <div className="space-y-0.5">
                <DRELine label="(+) Receita Bruta" value={rb} pct={1} isPositive />
                <DRELine label="(-) Taxas cartão / delivery" value={-deducoes} pct={pctOf(rb, deducoes)} indent />
                <DRELine label="(=) Receita Líquida" value={receitaLiquida} pct={pctOf(rb, receitaLiquida)} isTotal />
                <div className="h-2" />
                <DRELine label="(-) CMV" value={-cmv} pct={pctOf(rb, cmv)} indent isNegative benchmark={{ min: 0.26, max: 0.33 }} />
                <DRELine label="(-) Impostos" value={-impostos} pct={pctOf(rb, impostos)} indent />
                <DRELine label="(-) Royalties" value={-royalties} pct={pctOf(rb, royalties)} indent />
                <DRELine label="(-) Fundo de marketing" value={-fundoMkt} pct={pctOf(rb, fundoMkt)} indent />
                <div className="h-2" />
                <DRELine label="(-) Colaboradores" value={-totalFolha} pct={pctOf(rb, totalFolha)} indent isNegative benchmark={{ min: 0.12, max: 0.25 }} />
                {form.colaboradores.map((c, i) => {
                  const encV = form.encargos.tipo === "fixo"
                    ? c.quantidade * form.encargos.valor
                    : c.salarioBase * c.quantidade * form.encargos.valor;
                  const total = c.salarioBase * c.quantidade + encV;
                  return (
                    <DRELine key={i} label={`${c.funcao} (${c.quantidade}x)`}
                      value={-total} pct={pctOf(rb, total)} indent />
                  );
                })}
                <div className="h-2" />
                <DRELine label="(-) Ocupação" value={-ocupacao} pct={pctOf(rb, ocupacao)} indent isNegative benchmark={{ min: 0.10, max: 0.20 }} />
                {[
                  { label: "Aluguel", v: rv(form.aluguel) },
                  { label: "Condomínio", v: rv(form.condominio) },
                  { label: "Energia", v: rv(form.energia) },
                  { label: "Gás", v: rv(form.gas) },
                  { label: "Água", v: rv(form.agua) },
                  { label: "Outros ocupação", v: rv(form.outrosOcupacao) },
                  ...linhasParaUsar.filter((l) => l.grupoId === "ocupacao").map((l) => ({ label: l.label || "—", v: resolve(l, rb) })),
                ].filter((x) => x.v > 0).map((x, i) => (
                  <DRELine key={i} label={x.label} value={-x.v} pct={pctOf(rb, x.v)} indent />
                ))}
                <div className="h-2" />
                <DRELine label="(-) Serviços de terceiros" value={-servicos} pct={pctOf(rb, servicos)} indent />
                <DRELine label="(-) Despesas financeiras" value={-financeiras} pct={pctOf(rb, financeiras)} indent />
                <DRELine label="(-) Marketing + Outras" value={-outrasTotal} pct={pctOf(rb, outrasTotal)} indent />
                <div className="h-2" />
                <DRELine label="(=) EBITDA" value={ebitda} pct={ebitdaPct} isTotal isPositive={ebitda > 0} isNegative={ebitda < 0} />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="kpi-card text-center">
                  <div className="text-xs text-muted-foreground mb-1">Ponto de equilíbrio</div>
                  <div className="font-mono font-bold text-sm">{fmt(pontoEquilibrio)}</div>
                </div>
                <div className="kpi-card text-center">
                  <div className="text-xs text-muted-foreground mb-1">Meta diária</div>
                  <div className="font-mono font-bold text-sm">{fmt(metaDiaria)}</div>
                  {metaAtend && <div className="text-xs text-muted-foreground">{metaAtend} atend.</div>}
                </div>
                <div className={`kpi-card text-center ${ebitdaPct >= 0.10 ? "border-emerald-300" : ebitdaPct >= 0.05 ? "border-amber-300" : "border-rose-300"}`}>
                  <div className="text-xs text-muted-foreground mb-1">EBITDA</div>
                  <div className={`font-mono font-bold text-sm ${ebitdaPct >= 0.10 ? "text-emerald-600" : ebitdaPct >= 0.05 ? "text-amber-500" : "text-rose-600"}`}>
                    {fmtPct(ebitdaPct)}
                  </div>
                </div>
              </div>

              {isAdmin && editingId && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {aprovacaoConfirmada && aprovacaoConfirmada.orcId === editingId ? (
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-bold text-emerald-400 text-base">
                            ✅ Orçamento aprovado para {aprovacaoConfirmada.periodo.replace("-", "/")}!
                          </p>
                          {aprovacaoConfirmada.medidasCriadas != null && aprovacaoConfirmada.medidasCriadas > 0 ? (
                            <p className="text-sm text-emerald-300 font-medium">
                              Meta criada · {aprovacaoConfirmada.medidasCriadas} medidas de direção · {aprovacaoConfirmada.planosCriados} planos de ação
                            </p>
                          ) : aprovacaoConfirmada.medidasCriadas === 0 ? (
                            <p className="text-sm text-amber-400 font-medium">
                              ⚠ Meta/medidas não foram criadas (0 registros). Verifique os logs do servidor.
                            </p>
                          ) : (
                            <p className="text-sm text-emerald-300">Meta do Mês criada · Medidas de Direção geradas · Planos de ação vinculados</p>
                          )}
                          {aprovacaoConfirmada.avisos && aprovacaoConfirmada.avisos.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {aprovacaoConfirmada.avisos.map((aviso, i) => (
                                <p key={i} className="text-xs text-amber-400">⚠ {aviso}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => navigate(`/meta?mes=${aprovacaoConfirmada!.periodo}`)}>
                          Ver Meta do Mês → <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                        <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400" onClick={() => navigate("/plano")}>
                          Ver Plano de Ação <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                      {/* Setup do Mês — guia para completar a configuração */}
                      {editingId && storeId && aprovacaoConfirmada && (
                        <SetupDoMes
                          storeId={storeId}
                          mes={parseInt(aprovacaoConfirmada.periodo.split("-")[1])}
                          ano={parseInt(aprovacaoConfirmada.periodo.split("-")[0])}
                          colapsavel={false}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Aviso de rascunho — impossível de perder */}
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span>
                          <strong>Orçamento ainda em rascunho.</strong> Clique em "Aprovar" para criar a Meta do Mês e os planos de ação.
                        </span>
                      </div>
                      <Button
                        onClick={() => aprovarMut.mutate({ id: editingId })}
                        disabled={aprovarMut.isPending}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        size="lg"
                      >
                        <CheckCircle2 size={16} className="mr-2" />
                        {aprovarMut.isPending ? "Aprovando..." : "✅ Aprovar e gerar Meta + Planos"}
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Este botão cria a Meta do Mês, as 4 Medidas de Direção e os planos de ação.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Histórico ─────────────────────────────────────────────────── */}
        <TabsContent value="historico">
          {!listaOrc?.length ? (
            <div className="section-card text-center py-12 text-muted-foreground">
              <Clock size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum orçamento cadastrado ainda</p>
              <p className="text-xs mt-1">Construa e salve um orçamento na aba Construir</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Legenda do fluxo */}
              <div className="section-card bg-muted/30 py-2 px-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Fluxo de aprovação:</strong> Rascunho → Proposto (gerente envia) → Aprovado (admin confirma e metas diárias são geradas automaticamente)
                </p>
              </div>
              {listaOrc.map((orc) => (
                <div key={orc.id} className={`section-card ${
                  orc.status === "proposto" && isAdmin ? "border-amber-300 bg-amber-50/30" : ""
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">
                          {new Date(orc.periodoInicio + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                        </span>
                        <Badge
                          variant={orc.status === "aprovado" ? "default" : orc.status === "proposto" ? "secondary" : "outline"}
                          className={`text-xs ${
                            orc.status === "aprovado" ? "bg-emerald-600" :
                            orc.status === "proposto" ? "bg-amber-500 text-white" : ""
                          }`}
                        >
                          {orc.status === "aprovado" ? "✓ Aprovado" : orc.status === "proposto" ? "⏳ Aguardando aprovação" : "Rascunho"}
                        </Badge>
                        {/* Exibe o nome da loja para admin/supervisor */}
                        {useGeralList && (orc as any).storeName && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium text-muted-foreground">
                            {(orc as any).storeName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Receita: {fmt(orc.receitaBruta)} · Tipo: {orc.tipo}
                        {orc.status === "aprovado" && orc.aprovadoPor && (
                          <span className="ml-1">· Aprovado por: {orc.aprovadoPor}</span>
                        )}
                      </div>
                      {orc.status === "proposto" && isAdmin && (
                        <p className="text-xs text-amber-600 mt-1 font-medium">
                          ⚠️ Aguardando sua aprovação. Ao aprovar, as metas diárias serão geradas automaticamente.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => loadOrcamento(orc.id)} disabled={loadingEditId === orc.id}>
                        {loadingEditId === orc.id ? "Carregando..." : "Editar"}
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-500 border-amber-200 hover:bg-amber-50 hover:text-amber-600"
                            disabled={zerarMesMut.isPending}
                            onClick={() => {
                              const mesAno = new Date(orc.periodoInicio).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                              if (!confirm(`⚠️ ZERAR ${mesAno.toUpperCase()}?\n\nIsso apagará:\n• O orçamento\n• A Meta do Mês e suas medidas\n• Os planos de ação gerados automaticamente\n• As metas diárias\n\nPlanos criados manualmente são preservados.\n\nConfirmar?`)) return;
                              const d = new Date(orc.periodoInicio);
                              zerarMesMut.mutate({ storeId: orc.storeId, mes: d.getMonth() + 1, ano: d.getFullYear() });
                            }}
                          >
                            Zerar mês
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-500 border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                            disabled={excluirMut.isPending}
                            onClick={() => {
                              const mes = new Date(orc.periodoInicio + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                              if (confirm(`⚠️ Excluir orçamento de ${mes}?\n\nIsso também remove:\n• A Meta do Mês e as Medidas de Direção geradas\n• Os Planos de Ação gerados automaticamente\n• As metas diárias do período\n\nPlanos criados manualmente pelo gestor são preservados.\n\nEsta ação não pode ser desfeita.`)) {
                                excluirMut.mutate({ id: orc.id });
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </>
                      )}
                      {isAdmin && orc.status === "proposto" && (
                        <Button
                          size="sm"
                          onClick={() => aprovarMut.mutate({ id: orc.id })}
                          disabled={aprovarMut.isPending}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <CheckCircle2 size={13} className="mr-1" />
                          {aprovarMut.isPending ? "Aprovando..." : "Aprovar"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Feriados ──────────────────────────────────────────────────── */}
        <TabsContent value="feriados">
          <HolidaysPage storeId={storeId} />
        </TabsContent>
      </Tabs>
      </>
    )}
    </div>
  );
}

// ─── Ícone Package inline ─────────────────────────────────────────────────────
function PackageIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </svg>
  );
}
import { useSearch } from "wouter";
