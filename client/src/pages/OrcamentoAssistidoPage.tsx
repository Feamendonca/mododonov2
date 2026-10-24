import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useStore } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Upload,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  BarChart3,
  FileText,
  Zap,
  ArrowRight,
  X,
  ThumbsUp,
} from "lucide-react";
import { parseNumericInput } from "@/hooks/useCurrencyInput";

import { Component, ReactNode } from "react";

// ─── Error Boundary para o fluxo IA (mostra erro em vez de reset mudo) ────────
class OrcamentoErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[OrcamentoIA] Crash capturado:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError && this.state.error) {
      const errText = `${this.state.error.message}\n\n${this.state.error.stack ?? ""}`;
      return (
        <div className="p-6 border border-red-500/50 bg-red-500/10 rounded-lg">
          <h3 className="text-red-600 font-bold text-lg mb-2">Erro no Orçamento IA</h3>
          <p className="text-sm text-red-500 mb-3">{this.state.error.message}</p>
          <pre className="text-xs bg-red-950/20 p-3 rounded overflow-auto max-h-48 mb-3 text-red-300">
            {this.state.error.stack}
          </pre>
          <button
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-500"
            onClick={() => { navigator.clipboard.writeText(errText); toast.success("Erro copiado"); }}
          >
            Copiar erro
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
export { OrcamentoErrorBoundary };

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Viabilidade = "alta" | "media" | "baixa";
type Prioridade = "alta" | "media" | "baixa";
type Prazo = "imediato" | "7_dias" | "30_dias" | "60_dias";
type Dificuldade = "baixa" | "media" | "alta";

interface DRESumario {
  faturamento: number;
  cmv: number;
  cmvPct: number;
  folha: number;
  folhaPct: number;
  custosFixos: number;
  custosFixosPct: number;
  custosVariaveis: number;
  custosVariaveisPct: number;
  impostos: number;
  impostosPct: number;
  ebitda: number;
  ebitdaPct: number;
}

interface CustoFixo {
  nome: string;
  valorAtualRs: number;
  pctReceita: number;
  observacao: string;
}

interface Gap {
  categoria: string;
  tipo: string;
  valorAtualRs: number;
  valorMetaRs: number;
  gapRs: number;
  pctAtual: number;
  pctMeta: number;
  prioridade: Prioridade;
}

interface AcaoPlano {
  acao: string;
  comoFazer?: string;
  categoria: string;
  impactoEstimadoRs: number;
  prazo: Prazo;
  dificuldade: Dificuldade;
  responsavel: string;
  indicadorSucesso?: string;
  semanaInicio?: number | null;
  checkpointNumerico?: string | null;
  acaoSeEstourar?: string | null;
}

interface LinhaCompleta {
  descricao: string;
  tipo: string;
  valorAtualRs: number;
  valorMetaRs: number;
  pctAtual: number;
  pctMeta: number;
  ehFixo: boolean;
}

interface DiagnosticoLinha {
  id: string;
  linha: string;
  valorPassado: number;
  pctReceita: number;
  avaliacao: "ok" | "atenção" | "melhorar";
  comentario: string;
}
interface Questionamento {
  id: string;
  tema: string;
  de: number;
  para: number;
  variacaoPct: number;
  pergunta: string;
}
interface SugestaoCorte {
  id: string;
  linha: string;
  tipo: string;
  valorAtual: number;
  valorSugerido: number;
  economiaRs: number;
  justificativa: string;
}
interface LinhaNova {
  id: string;
  nome: string;
  tipo: string;
  valorSugerido: number;
  porque: string;
}
interface Insight {
  tipo: "sazonalidade" | "risco" | "padrao" | "oportunidade";
  texto: string;
}
interface ResultadoSimulacao {
  resumo: string;
  viabilidade: Viabilidade;
  observacoes: string;
  dreAtual: DRESumario;
  dreMeta: DRESumario;
  custosFixos: CustoFixo[];
  gaps: Gap[];
  planoDeAcao: AcaoPlano[];
  linhasCompletas?: LinhaCompleta[];
  diagnosticoPorLinha?: DiagnosticoLinha[];
  questionamentos?: Questionamento[];
  sugestoesCorte?: SugestaoCorte[];
  linhasNovas?: LinhaNova[];
  insights?: Insight[];
  totalLinhasHistorico: number;
  faturamentoMeta: number;
  resultadoMetaPct: number;
  resultadoMetaRs: number;
  resumoExecutivo?: string;
  analiseDegradada?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number | undefined | null): string =>
  typeof v === "number" && isFinite(v)
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

const fmtPct = (v: number | undefined | null): string =>
  typeof v === "number" && isFinite(v) ? `${v.toFixed(1)}%` : "—";

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const PRAZO_LABEL: Record<Prazo, string> = {
  imediato: "Imediato",
  "7_dias": "7 dias",
  "30_dias": "30 dias",
  "60_dias": "60 dias",
};

const DIFICULDADE_COLOR: Record<Dificuldade, string> = {
  baixa: "text-emerald-400",
  media: "text-amber-400",
  alta: "text-red-400",
};

const VIABILIDADE_CONFIG: Record<Viabilidade, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  alta: { label: "Alta viabilidade", color: "text-emerald-400", icon: CheckCircle2 },
  media: { label: "Viabilidade média", color: "text-amber-400", icon: AlertTriangle },
  baixa: { label: "Baixa viabilidade", color: "text-red-400", icon: AlertTriangle },
};

// ─── Componente de linha DRE comparativa ─────────────────────────────────────

function LinhaDRE({
  label,
  atual,
  meta,
  pctAtual,
  pctMeta,
  isReceita = false,
}: {
  label: string;
  atual: number;
  meta: number;
  pctAtual: number;
  pctMeta: number;
  isReceita?: boolean;
}) {
  const gap = meta - atual;
  const melhorou = isReceita ? gap > 0 : gap < 0;
  return (
    <div className="grid grid-cols-5 gap-2 py-2 text-sm border-b border-border/30 last:border-0">
      <div className="col-span-1 text-muted-foreground truncate">{label}</div>
      <div className="text-right font-mono">{fmtBRL(atual)}</div>
      <div className="text-right text-muted-foreground font-mono text-xs">{fmtPct(pctAtual)}</div>
      <div className="text-right font-mono">{fmtBRL(meta)}</div>
      <div className={`text-right font-mono text-xs ${melhorou ? "text-emerald-400" : gap === 0 ? "text-muted-foreground" : "text-red-400"}`}>
        {gap > 0 ? "+" : ""}{fmtBRL(gap)} ({fmtPct(pctMeta)})
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function OrcamentoAssistidoFlow({
  onBaseAprovada,
}: {
  onBaseAprovada?: (data: { orcamentoId: number; storeId: number }) => void;
} = {}) {
  const { user, loading: authLoading } = useAuth();
  const { storeId: storeIdCtx } = useStore();
  const now = new Date();

  const [step, setStep] = useState<"meta" | "dre" | "resultado" | "revisao">("meta");

  // Passo 1 — Meta
  // lojaId derivado do contexto na hora do clique (não useState) — evita mismatch
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2);
  const [faturamentoMeta, setFaturamentoMeta] = useState<string>("");
  const [resultadoMetaPct, setResultadoMetaPct] = useState<string>("");

  // Passo 2 — DRE
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Passo 2.5 — Prévia editável (Bloco C)
  type PreviaField = { valor: number | null; origem: string };
  type PreviaStrField = { valor: string | null; origem: string };
  type Previa = {
    receitaBase: PreviaField;
    crescimentoPct: PreviaField;
    cmvMetaPct: PreviaField;
    custoFixoTotal: PreviaField;
    folhaPagamento: PreviaField;
    aluguel: PreviaField;
    royalties: PreviaField;
    taxaFundo: PreviaField;
    energiaEletrica: PreviaField;
    dayWeights: { valor: number[] | null; origem: string };
    observacoes: PreviaStrField;
  };
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [needsSheetSelection, setNeedsSheetSelection] = useState(false);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);

  // Passo 3 — Resultado
  const [resultado, setResultado] = useState<ResultadoSimulacao | null>(null);
  // A3 — Estado de revisão item-a-item
  type DecisaoCorte = "aceito" | "rejeitado" | "pendente";
  type DecisaoLinha = "adicionado" | "ignorado" | "pendente";
  type DecisaoQuestionamento = { decisao: "ciente" | "pendente"; resposta: string };
  const [revisaoCortes, setRevisaoCortes] = useState<Record<string, DecisaoCorte>>({});
  const [revisaoLinhasNovas, setRevisaoLinhasNovas] = useState<Record<string, DecisaoLinha>>({});
  const [revisaoQuestionamentos, setRevisaoQuestionamentos] = useState<Record<string, DecisaoQuestionamento>>({});
  const [orcamentoIdRevisao, setOrcamentoIdRevisao] = useState<number | null>(null);
  const salvarRevisaoMut = trpc.orcamentoAssistido.salvarRevisaoIA.useMutation();
  const [abaResultado, setAbaResultado] = useState<"dre" | "completa" | "gaps" | "plano" | "diagnostico" | "insights">("dre");
  // Resetar aba para "dre" se a aba selecionada for de enriquecimento e o array sumir
  useEffect(() => {
    if (!resultado) return;
    if (abaResultado === "diagnostico" && !(resultado.diagnosticoPorLinha?.length)) setAbaResultado("dre");
    if (abaResultado === "insights" && !(resultado.insights?.length)) setAbaResultado("dre");
  }, [resultado, abaResultado]);

  // Dados
  const { data: lojas } = trpc.stores.list.useQuery(undefined, { enabled: !!user });

  // Estado de aprovação
  const [aprovando, setAprovando] = useState(false);

  const aprovarMut = trpc.orcamentoAssistido.aprovarParaOrcamento.useMutation({
    onSuccess: (data) => {
      toast.success("Base salva. Revise e aprove no DRE.");
      onBaseAprovada?.({ orcamentoId: data.orcamentoId, storeId: storeIdCtx ?? 0 });
    },
    onError: (e) => toast.error("Erro ao aprovar: " + e.message),
    onSettled: () => setAprovando(false),
  });


  // Mutations Bloco B+C
  const getUploadUrlMut = trpc.orcamentoAssistido.getUploadUrl.useMutation();



  // Upload inteligente: arquivo > 1,5 MB sobe ao storage, menor fica em base64
  const UPLOAD_THRESHOLD = 8 * 1024 * 1024; // 8 MB — DREs normais têm poucos KB; S3 presigned falha em alguns ambientes de piloto

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStorageKey(null);
    setFileBase64(null);

    if (file.size > UPLOAD_THRESHOLD) {
      // Arquivo grande: upload direto ao storage
      setUploadingFile(true);
      try {
        // Derivar Content-Type pela extensão — file.type vem vazio/errado em arquivos convertidos
        const _ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const _ctMap: Record<string, string> = {
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
          xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
          xls: "application/vnd.ms-excel",
          csv: "text/csv",
        };
        const contentType = _ctMap[_ext] ?? "application/octet-stream";
        const { uploadUrl, key } = await getUploadUrlMut.mutateAsync({ fileName: file.name, contentType });
        const resp = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
        if (!resp.ok) throw new Error(`Upload falhou (${resp.status})`);
        setStorageKey(key);
        toast.success("Arquivo enviado com sucesso!");
      } catch (err) {
        toast.error("Erro no upload: " + (err instanceof Error ? err.message : String(err)));
        setFileName(null);
      } finally {
        setUploadingFile(false);
      }
    } else {
      // Arquivo pequeno: base64
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        setFileBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // Mutation
  const simularMut = trpc.orcamentoAssistido.simularPorMeta.useMutation({
    onSuccess: (data) => {
      setResultado(data as ResultadoSimulacao);
      setStep("resultado");
      toast.success("Simulação concluída!");
    },
    onError: (e) => toast.error("Erro na simulação: " + e.message),
  });

  // ─── Guard de login ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-6">
        <div className="p-4 rounded-full bg-amber-500/10 w-fit mx-auto">
          <Sparkles className="h-10 w-10 text-amber-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Orçamento Assistido por IA</h1>
          <p className="text-muted-foreground">
            Faça login para usar esta funcionalidade. Informe sua meta de faturamento e resultado,
            importe a DRE histórica e a IA mostra o caminho para chegar lá.
          </p>
        </div>
        <Button size="lg" className="w-full" onClick={() => (window.location.href = "/")}>
          Fazer login para continuar
        </Button>
      </div>
    );
  }

  // ─── Inicializar lojaId ──────────────────────────────────────────────────────
  // ─── Indicador de steps ──────────────────────────────────────────────────────
  const STEPS = [
    { id: "meta", label: "1. Sua meta", icon: Target },
    { id: "dre", label: "2. DRE histórica", icon: FileText },
    { id: "resultado", label: "3. Resultado + Plano", icon: BarChart3 },
  ] as const;

  function StepIndicator() {
    return (
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const active = step === s.id;
          const done =
            (s.id === "meta" && (step === "dre" || step === "resultado" || step === "revisao")) ||
            (s.id === "dre" && step === "resultado");
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : done
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Passo 1: Meta ───────────────────────────────────────────────────────────
  if (step === "meta") {
    const fat = parseNumericInput(faturamentoMeta);
    const res = parseNumericInput(resultadoMetaPct);
    const resultadoRs = fat * (res / 100);
    const canAdvance = fat > 0 && res !== 0 && !!storeIdCtx;

    return (
      <div className="max-w-xl mx-auto py-8 px-4 space-y-6">
        <StepIndicator />

        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-amber-400" />
            Qual é a sua meta?
          </h1>
          <p className="text-muted-foreground text-sm">
            Informe onde você quer chegar. A IA vai calcular o que precisa mudar para atingir isso.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-5">
            {/* Loja e período */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1.5">
                <Label>Loja</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={storeIdCtx ?? ""}
                  onChange={() => {}} // Trocar loja pelo seletor global no topo
                >
                  {lojas?.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={mes}
                  onChange={(e) => setMes(Number(e.target.value))}
                >
                  {MESES.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Input
                  type="number"
                  value={ano}
                  onChange={(e) => setAno(Number(e.target.value))}
                  min={2020}
                  max={2030}
                />
              </div>
            </div>

            <Separator />

            {/* Faturamento meta */}
            <div className="space-y-1.5">
              <Label>Faturamento desejado (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <Input
                  className="pl-9"
                  placeholder="Ex: 150.000,00"
                  value={faturamentoMeta}
                  onChange={(e) => setFaturamentoMeta(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Quanto você quer faturar neste mês?</p>
            </div>

            {/* Resultado meta */}
            <div className="space-y-1.5">
              <Label>Resultado / EBITDA desejado (%)</Label>
              <div className="relative">
                <Input
                  placeholder="Ex: 15"
                  value={resultadoMetaPct}
                  onChange={(e) => setResultadoMetaPct(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Qual % de resultado você quer ter? (positivo = lucro, negativo = prejuízo aceitável)
              </p>
            </div>

            {/* Preview */}
            {fat > 0 && res !== 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Faturamento meta</p>
                      <p className="font-semibold text-lg">{fmtBRL(fat)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Resultado meta</p>
                      <p className={`font-semibold text-lg ${resultadoRs >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmtBRL(resultadoRs)} ({fmtPct(res)})
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Custos totais permitidos</p>
                      <p className="font-medium">{fmtBRL(fat - resultadoRs)} ({fmtPct(100 - res)})</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold"
          disabled={!canAdvance}
          onClick={() => setStep("dre")}
        >
          Próximo: Importar DRE histórica
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>

        {!canAdvance && (
          <p className="text-xs text-center text-muted-foreground">
            Preencha faturamento, resultado e selecione uma loja para continuar.
          </p>
        )}
      </div>
    );
  }

  // ─── Passo 2: DRE Histórica ──────────────────────────────────────────────────
  if (step === "dre") {
    const fat = parseNumericInput(faturamentoMeta);
    const res = parseNumericInput(resultadoMetaPct);

    // A4b-fix: botão principal chama simularPorMeta com o arquivo (não analisarPlanilha)
    const handleSimularComPlanilha = () => {
      const loja = storeIdCtx;
      if (!loja || !fileName) return;
      simularMut.mutate({
        lojaId: loja,
        faturamentoMeta: fat,
        resultadoMetaPct: res,
        fileBase64: fileBase64 ?? undefined,
        fileName,
        storageKey: storageKey ?? undefined,
      });
    };
    const handleSimularSemPlanilha = () => {
      const loja = storeIdCtx;
      if (!loja) return;
      simularMut.mutate({
        lojaId: loja,
        faturamentoMeta: fat,
        resultadoMetaPct: res,
        fileBase64: undefined,
        fileName: undefined,
      });
    };

    return (
      <div className="max-w-xl mx-auto py-8 px-4 space-y-6">
        <StepIndicator />

        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-amber-400" />
            DRE histórica
          </h1>
          <p className="text-muted-foreground text-sm">
            Importe a DRE do mês de referência. A IA vai identificar o que é fixo, o que é imposto
            e o que pode ser ajustado para atingir sua meta.
          </p>
        </div>

        {/* Resumo da meta */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Meta</p>
                <p className="font-semibold">{fmtBRL(fat)} com {fmtPct(res)} de resultado</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep("meta")}>
                Alterar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Upload */}
        <Card
          className={`border-2 border-dashed cursor-pointer transition-colors ${
            fileName ? "border-emerald-500/50 bg-emerald-500/5" : "border-border hover:border-amber-500/50"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xlsb,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileName ? (
              <>
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
                <div>
                  <p className="font-medium text-emerald-400">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">Clique para trocar o arquivo</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileName(null);
                    setFileBase64(null);
                  }}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Remover
                </Button>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
                <div>
                  <p className="font-medium">Clique para importar a DRE</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aceita .xlsx, .xlsm, .xlsb, .xls ou .csv — qualquer formato de DRE ou relatório financeiro
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Opção sem planilha */}
        {!fileName && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">Não tem a planilha agora?</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSimularSemPlanilha}
              disabled={simularMut.isPending}
            >
              Simular só com as metas (sem histórico)
            </Button>
          </div>
        )}

        {/* Seleção de abas quando o arquivo tem > 5 */}
        {needsSheetSelection && sheetNames.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 space-y-3">
              <p className="text-sm font-medium">Este arquivo tem {sheetNames.length} abas. Selecione quais analisar:</p>
              <div className="flex flex-wrap gap-2">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedSheets(prev =>
                      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
                    )}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      selectedSheets.includes(name)
                        ? "bg-amber-500 text-black border-amber-500"
                        : "border-border text-muted-foreground hover:border-amber-500/50"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {selectedSheets.length > 0 && (
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-400 text-black"
                  onClick={handleSimularComPlanilha}
                  disabled={simularMut.isPending}
                >
                  {simularMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Analisar abas selecionadas
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* O que a IA vai fazer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium">O que a IA vai analisar:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-amber-400 shrink-0" /> Identificar custos fixos (aluguel, royalties, energia, etc.) que não mudam</li>
              <li className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-amber-400 shrink-0" /> Calcular impostos sobre a receita meta</li>
              <li className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-amber-400 shrink-0" /> Mostrar o que precisa mudar (CMV, folha, etc.) para atingir o resultado</li>
              <li className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-amber-400 shrink-0" /> Gerar um plano de ação com ações específicas e impacto estimado</li>
            </ul>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setStep("meta")}>
            Voltar
          </Button>
          <Button
            className="flex-[2] bg-amber-500 hover:bg-amber-400 text-black font-semibold"
            disabled={simularMut.isPending || uploadingFile || !fileName || (!fileBase64 && !storageKey)}
            onClick={handleSimularComPlanilha}
          >
            {simularMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Simulando...
              </>
            ) : uploadingFile ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Enviando arquivo...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Simular com planilha
              </>
            )}
          </Button>
        </div>

        {simularMut.isPending && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-4 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto" />
              <div>
                <p className="text-sm font-medium">Analisando sua planilha...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  A IA está lendo o arquivo e calculando o orçamento para atingir sua meta.
                  Isso pode levar até 30 segundos.
                </p>
              </div>
              <Progress value={undefined} className="h-1" />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ─── Passo 3: Resultado + Plano de Ação ─────────────────────────────────────
  // ─── Passo 2.5: Prévia editável (Bloco C) ──────────────────────────────────
  if (step === "resultado" && resultado) {
    const viabConfig = VIABILIDADE_CONFIG[resultado.viabilidade] ?? VIABILIDADE_CONFIG.media;
    const ViabilidadeIcon = viabConfig.icon;
    const totalImpacto = (resultado.planoDeAcao ?? []).reduce((s, a) => s + a.impactoEstimadoRs, 0);

    return (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-5">
        <StepIndicator />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-amber-400" />
              Simulação: {lojas?.find((l) => l.id === storeIdCtx)?.name} — {MESES[mes - 1]}/{ano}
            </h1>
            <p className="text-muted-foreground text-sm">{resultado.resumo}</p>
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-medium ${viabConfig.color}`}>
            <ViabilidadeIcon className="h-4 w-4" />
            {viabConfig.label}
          </div>
        </div>

        {/* Resumo Executivo — primeira coisa que o gerente lê */}
        {resultado.resumoExecutivo && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-amber-500/10 shrink-0">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300 mb-1">Resumo do consultor</p>
                  <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{resultado.resumoExecutivo}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Faturamento meta</p>
              <p className="text-xl font-bold">{fmtBRL(resultado.faturamentoMeta)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Atual: {fmtBRL(resultado.dreAtual.faturamento)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Resultado meta</p>
              <p className={`text-xl font-bold ${resultado.resultadoMetaRs >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtBRL(resultado.resultadoMetaRs)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{fmtPct(resultado.resultadoMetaPct)}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Ações no plano</p>
              <p className="text-xl font-bold">{(resultado.planoDeAcao ?? []).length}</p>
              <p className="text-xs text-emerald-400 mt-1">+{fmtBRL(totalImpacto)} impacto</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Custos fixos</p>
              <p className="text-xl font-bold">{(resultado.custosFixos ?? []).length} itens</p>
              <p className="text-xs text-muted-foreground mt-1">
                {fmtBRL((resultado.custosFixos ?? []).reduce((s, c) => s + c.valorAtualRs, 0))}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Observações */}
        {resultado.observacoes && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 pb-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200">{resultado.observacoes}</p>
            </CardContent>
          </Card>
        )}

        {/* Abas */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {(["dre", ...(resultado.linhasCompletas?.length ? ["completa"] : []), "gaps", "plano", ...(resultado.diagnosticoPorLinha?.length ? ["diagnostico"] : []), ...(resultado.insights?.length ? ["insights"] : [])] as const).map((aba) => (
            <button
              key={aba}
              onClick={() => setAbaResultado(aba as typeof abaResultado)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                abaResultado === aba
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {aba === "dre" ? "DRE Resumida"
                : aba === "completa" ? `DRE Completa (${resultado.linhasCompletas!.length} linhas)`
                : aba === "gaps" ? "Gaps & Oportunidades"
                : aba === "plano" ? "Plano de Ação"
                : aba === "diagnostico" ? `Diagnóstico (${resultado.diagnosticoPorLinha!.length} linhas)`
                : "Insights"}
            </button>
          ))}
        </div>

        {/* Aba DRE Completa — todas as linhas da planilha importada */}
        {abaResultado === "completa" && resultado.linhasCompletas && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">DRE Completa — {resultado.linhasCompletas.length} linhas (linhas em branco ignoradas)</CardTitle>
              <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground font-medium mt-2">
                <div className="col-span-2">Descrição</div>
                <div>Tipo</div>
                <div className="text-right">Atual (R$)</div>
                <div className="text-right">Atual (%)</div>
                <div className="text-right">Meta (R$)</div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 max-h-[600px] overflow-y-auto">
              {resultado.linhasCompletas.map((linha, i) => {
                const TIPO_COLOR: Record<string, string> = {
                  receita: "text-emerald-400",
                  resultado: "text-emerald-400",
                  cmv: "text-red-400",
                  folha: "text-orange-400",
                  fixo: "text-blue-400",
                  imposto: "text-purple-400",
                  variavel: "text-amber-400",
                  outros: "text-muted-foreground",
                };
                const gap = linha.valorMetaRs - linha.valorAtualRs;
                const isReceita = linha.tipo === "receita" || linha.tipo === "resultado";
                const melhorou = isReceita ? gap > 0 : gap < 0;
                return (
                  <div key={i} className="grid grid-cols-6 gap-2 py-1.5 text-xs border-b border-border/20 last:border-0 hover:bg-muted/20">
                    <div className="col-span-2 truncate" title={linha.descricao}>{linha.descricao}</div>
                    <div className={`text-xs font-medium ${TIPO_COLOR[linha.tipo] ?? "text-muted-foreground"}`}>
                      {linha.tipo}{linha.ehFixo ? " 🔒" : ""}
                    </div>
                    <div className="text-right font-mono">{fmtBRL(linha.valorAtualRs)}</div>
                    <div className="text-right text-muted-foreground font-mono">{fmtPct(linha.pctAtual)}</div>
                    <div className={`text-right font-mono ${gap !== 0 ? (melhorou ? "text-emerald-400" : "text-red-400") : ""}`}>
                      {fmtBRL(linha.valorMetaRs)}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Aba DRE Comparativa */}
        {abaResultado === "dre" && (
          <Card>
            <CardHeader className="pb-2">
              <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground font-medium">
                <div>Linha</div>
                <div className="text-right">Atual (R$)</div>
                <div className="text-right">Atual (%)</div>
                <div className="text-right">Meta (R$)</div>
                <div className="text-right">Meta (% / Δ)</div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <LinhaDRE label="Receita" atual={resultado.dreAtual.faturamento} meta={resultado.dreMeta.faturamento} pctAtual={100} pctMeta={100} isReceita />
              <LinhaDRE label="CMV" atual={resultado.dreAtual.cmv} meta={resultado.dreMeta.cmv} pctAtual={resultado.dreAtual.cmvPct} pctMeta={resultado.dreMeta.cmvPct} />
              <LinhaDRE label="Folha" atual={resultado.dreAtual.folha} meta={resultado.dreMeta.folha} pctAtual={resultado.dreAtual.folhaPct} pctMeta={resultado.dreMeta.folhaPct} />
              <LinhaDRE label="Custos Fixos" atual={resultado.dreAtual.custosFixos} meta={resultado.dreMeta.custosFixos} pctAtual={resultado.dreAtual.custosFixosPct} pctMeta={resultado.dreMeta.custosFixosPct} />
              <LinhaDRE label="Custos Variáveis" atual={resultado.dreAtual.custosVariaveis} meta={resultado.dreMeta.custosVariaveis} pctAtual={resultado.dreAtual.custosVariaveisPct} pctMeta={resultado.dreMeta.custosVariaveisPct} />
              <LinhaDRE label="Impostos" atual={resultado.dreAtual.impostos} meta={resultado.dreMeta.impostos} pctAtual={resultado.dreAtual.impostosPct} pctMeta={resultado.dreMeta.impostosPct} />
              <div className="grid grid-cols-5 gap-2 py-3 text-sm font-bold border-t border-border mt-2">
                <div>Resultado</div>
                <div className={`text-right ${resultado.dreAtual.ebitda >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtBRL(resultado.dreAtual.ebitda)}</div>
                <div className={`text-right text-xs ${resultado.dreAtual.ebitda >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtPct(resultado.dreAtual.ebitdaPct)}</div>
                <div className={`text-right ${resultado.dreMeta.ebitda >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtBRL(resultado.dreMeta.ebitda)}</div>
                <div className={`text-right text-xs ${resultado.dreMeta.ebitda >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtPct(resultado.dreMeta.ebitdaPct)}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aba Gaps */}
        {abaResultado === "gaps" && (
          <div className="space-y-3">
            {(resultado.gaps ?? []).length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                  <p>Nenhum gap identificado — as metas são compatíveis com o histórico.</p>
                </CardContent>
              </Card>
            ) : (
              (resultado.gaps ?? []).map((gap, i) => (
                <Card key={i} className={`border-l-4 ${gap.prioridade === "alta" ? "border-l-red-500" : gap.prioridade === "media" ? "border-l-amber-500" : "border-l-blue-500"}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{gap.categoria}</p>
                          <Badge variant="outline" className="text-xs">{gap.tipo}</Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${gap.prioridade === "alta" ? "border-red-500 text-red-400" : gap.prioridade === "media" ? "border-amber-500 text-amber-400" : "border-blue-500 text-blue-400"}`}
                          >
                            {gap.prioridade}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm mt-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Atual</p>
                            <p className="font-mono">{fmtBRL(gap.valorAtualRs)}</p>
                            <p className="text-xs text-muted-foreground">{fmtPct(gap.pctAtual)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Meta</p>
                            <p className="font-mono">{fmtBRL(gap.valorMetaRs)}</p>
                            <p className="text-xs text-muted-foreground">{fmtPct(gap.pctMeta)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Gap</p>
                            <p className={`font-mono font-semibold ${gap.gapRs < 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {gap.gapRs > 0 ? "+" : ""}{fmtBRL(gap.gapRs)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Aba Plano de Ação */}
        {abaResultado === "plano" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {(resultado.planoDeAcao ?? []).length} ações · impacto total estimado:{" "}
                <span className="text-emerald-400 font-medium">{fmtBRL(totalImpacto)}/mês</span>
              </p>
            </div>
            {(resultado.planoDeAcao ?? []).map((acao, i) => (
              <Card key={i} className="border-amber-500/20">
                <CardContent className="pt-4 pb-4">
                  <div className="space-y-3">
                    {/* Cabeçalho da ação */}
                    <div className="flex items-start gap-2">
                      <div className="p-1.5 rounded bg-amber-500/10 shrink-0 mt-0.5">
                        {(acao.categoria ?? "").toLowerCase().includes("receita") ? (
                          <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{acao.acao}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Badge variant="outline" className="text-xs">{acao.categoria ?? "geral"}</Badge>
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40">
                            +{fmtBRL(acao.impactoEstimadoRs)}/mês
                          </Badge>
                          <Badge variant="outline" className="text-xs">{PRAZO_LABEL[acao.prazo]}</Badge>
                          <span className={`text-xs ${DIFICULDADE_COLOR[acao.dificuldade ?? "media"]}`}>
                            Dificuldade: {acao.dificuldade ?? "media"}
                          </span>
                          <span className="text-xs text-muted-foreground">→ {acao.responsavel}</span>
                        </div>
                      </div>
                    </div>
                    {/* Como fazer */}
                    {acao.comoFazer && (
                      <div className="ml-7 p-3 rounded-md bg-muted/30 border border-border/50">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Como fazer</p>
                        <p className="text-sm text-foreground/90 whitespace-pre-line">{acao.comoFazer}</p>
                      </div>
                    )}
                    {/* Indicador de sucesso */}
                    {acao.indicadorSucesso && (
                      <div className="ml-7 flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-emerald-400">Sucesso quando: </span>
                          {acao.indicadorSucesso}
                        </p>
                      </div>
                    )}
                    {/* Guia do mês: semana + checkpoint + ação corretiva */}
                    {(acao.semanaInicio || acao.checkpointNumerico || acao.acaoSeEstourar) && (
                      <div className="ml-7 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20 space-y-1">
                        {acao.semanaInicio && (
                          <p className="text-xs text-blue-300">
                            <span className="font-medium">📅 Semana {acao.semanaInicio}</span> do mês
                          </p>
                        )}
                        {acao.checkpointNumerico && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-blue-300">📊 Checkpoint: </span>
                            {acao.checkpointNumerico}
                          </p>
                        )}
                        {acao.acaoSeEstourar && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-amber-400">⚠ Se estourar: </span>
                            {acao.acaoSeEstourar}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Aba Diagnóstico por Linha */}
        {abaResultado === "diagnostico" && resultado.diagnosticoPorLinha && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Avaliação linha a linha do DRE histórico vs. benchmarks de restaurante (CMV ≤30%, Folha ≤28%, Aluguel ≤8%)
            </p>
            {(resultado.diagnosticoPorLinha ?? []).map((d, i) => (
              <Card key={i} className={`border-l-4 ${d.avaliacao === "ok" ? "border-l-emerald-500 bg-emerald-500/5" : d.avaliacao === "atenção" ? "border-l-amber-500 bg-amber-500/5" : "border-l-red-500 bg-red-500/5"}`}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{d.linha}</span>
                        <Badge variant="outline" className={`text-xs ${d.avaliacao === "ok" ? "text-emerald-400 border-emerald-500/40" : d.avaliacao === "atenção" ? "text-amber-400 border-amber-500/40" : "text-red-400 border-red-500/40"}`}>
                          {d.avaliacao === "ok" ? "✓ ok" : d.avaliacao === "atenção" ? "⚠ atenção" : "✗ melhorar"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{d.comentario}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{fmtBRL(d.valorPassado)}</p>
                      <p className="text-xs text-muted-foreground">{fmtPct(d.pctReceita)} da receita</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* Questionamentos */}
            {resultado.questionamentos && resultado.questionamentos.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Questionamentos — saltos que precisam de justificativa
                </p>
                {resultado.questionamentos.map((q, i) => (
                  <Card key={i} className="border-amber-500/30 bg-amber-500/5 mb-2">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold">{q.tema}</span>
                            <Badge variant="outline" className={`text-xs ${q.variacaoPct >= 0 ? "text-emerald-400 border-emerald-500/40" : "text-red-400 border-red-500/40"}`}>
                              {q.variacaoPct >= 0 ? "+" : ""}{q.variacaoPct.toFixed(1)}%
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {fmtBRL(q.de)} → {fmtBRL(q.para)}
                          </p>
                          <p className="text-xs text-amber-200 italic">{q.pergunta}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {/* Sugestões de Corte */}
            {resultado.sugestoesCorte && resultado.sugestoesCorte.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-emerald-400" />
                  Sugestões de Corte — economia potencial: {fmtBRL(resultado.sugestoesCorte.reduce((s, c) => s + c.economiaRs, 0))}/mês
                </p>
                {resultado.sugestoesCorte.map((s, i) => (
                  <Card key={i} className="border-emerald-500/20 mb-2">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold">{s.linha}</span>
                            <Badge variant="outline" className="text-xs">{s.tipo}</Badge>
                            <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40">
                              -{fmtBRL(s.economiaRs)}/mês
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{s.justificativa}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground line-through">{fmtBRL(s.valorAtual)}</p>
                          <p className="text-sm font-medium text-emerald-400">{fmtBRL(s.valorSugerido)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {/* Linhas Novas */}
            {resultado.linhasNovas && resultado.linhasNovas.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-blue-400" />
                  Linhas que você talvez esqueça de provisionar
                </p>
                {resultado.linhasNovas.map((l, i) => (
                  <Card key={i} className="border-blue-500/20 bg-blue-500/5 mb-2">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold">{l.nome}</span>
                            <Badge variant="outline" className="text-xs">{l.tipo}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{l.porque}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-blue-400">{fmtBRL(l.valorSugerido)}/mês</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Aba Insights */}
        {abaResultado === "insights" && resultado.insights && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sazonalidade, riscos e padrões identificados no histórico
            </p>
            {(resultado.insights ?? []).map((ins, i) => {
              const colors = {
                sazonalidade: "border-l-blue-500 bg-blue-500/5",
                risco: "border-l-red-500 bg-red-500/5",
                padrao: "border-l-purple-500 bg-purple-500/5",
                oportunidade: "border-l-emerald-500 bg-emerald-500/5",
              };
              const labels = {
                sazonalidade: "📅 Sazonalidade",
                risco: "⚠ Risco",
                padrao: "📊 Padrão",
                oportunidade: "💡 Oportunidade",
              };
              return (
                <Card key={i} className={`border-l-4 ${colors[ins.tipo]}`}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="text-xs shrink-0 mt-0.5">{labels[ins.tipo]}</Badge>
                      <p className="text-sm text-foreground/90">{ins.texto}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {/* Botão de Aprovação */}
        <div className="border-t border-border pt-4 space-y-3">
          {(step as string) === "revisao" ? (
            /* A3 — Passo Revisão */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Revisão das sugestões da IA</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Decida item a item. Nada congela — você edita no DRE depois.</p>
                </div>
                <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/40">
                  Triagem do gerente · Aprovação final do supervisor
                </Badge>
              </div>
              {/* Sugestões de Corte */}
              {resultado?.sugestoesCorte && resultado.sugestoesCorte.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-emerald-400" />
                    Sugestões de Corte
                    <span className="text-xs text-muted-foreground font-normal">
                      — economia aceita: {fmtBRL(resultado.sugestoesCorte.filter(s => revisaoCortes[s.id] === "aceito").reduce((sum, s) => sum + s.economiaRs, 0))}/mês
                    </span>
                  </p>
                  {resultado.sugestoesCorte.map((s) => {
                    const decisao = revisaoCortes[s.id] ?? "pendente";
                    return (
                      <Card key={s.id} className={`border-l-4 transition-colors ${decisao === "aceito" ? "border-l-emerald-500 bg-emerald-500/5" : decisao === "rejeitado" ? "border-l-red-500/40 bg-red-500/5 opacity-60" : "border-l-amber-500/40"}`}>
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold">{s.linha}</span>
                                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40">-{fmtBRL(s.economiaRs)}/mês</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">{s.justificativa}</p>
                              <p className="text-xs text-muted-foreground">
                                <span className="line-through">{fmtBRL(s.valorAtual)}</span>
                                <span className="text-emerald-400 ml-2">→ {fmtBRL(s.valorSugerido)}</span>
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant={decisao === "aceito" ? "default" : "outline"} className={`h-7 text-xs ${decisao === "aceito" ? "bg-emerald-600 hover:bg-emerald-500" : ""}`}
                                onClick={() => setRevisaoCortes(prev => ({ ...prev, [s.id]: "aceito" }))}>
                                ✓ Aceitar
                              </Button>
                              <Button size="sm" variant={decisao === "rejeitado" ? "destructive" : "outline"} className="h-7 text-xs"
                                onClick={() => setRevisaoCortes(prev => ({ ...prev, [s.id]: "rejeitado" }))}>
                                ✗ Rejeitar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              {/* Linhas Novas */}
              {resultado?.linhasNovas && resultado.linhasNovas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-blue-400" />
                    Linhas para provisionar
                  </p>
                  {resultado.linhasNovas.map((l) => {
                    const decisao = revisaoLinhasNovas[l.id] ?? "pendente";
                    return (
                      <Card key={l.id} className={`border-l-4 transition-colors ${decisao === "adicionado" ? "border-l-blue-500 bg-blue-500/5" : decisao === "ignorado" ? "border-l-muted opacity-60" : "border-l-blue-500/40"}`}>
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold">{l.nome}</span>
                                <Badge variant="outline" className="text-xs">{l.tipo}</Badge>
                                <span className="text-xs text-blue-400">{fmtBRL(l.valorSugerido)}/mês</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{l.porque}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant={decisao === "adicionado" ? "default" : "outline"} className={`h-7 text-xs ${decisao === "adicionado" ? "bg-blue-600 hover:bg-blue-500" : ""}`}
                                onClick={() => setRevisaoLinhasNovas(prev => ({ ...prev, [l.id]: "adicionado" }))}>
                                + Adicionar
                              </Button>
                              <Button size="sm" variant={decisao === "ignorado" ? "secondary" : "outline"} className="h-7 text-xs"
                                onClick={() => setRevisaoLinhasNovas(prev => ({ ...prev, [l.id]: "ignorado" }))}>
                                Ignorar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              {/* Questionamentos */}
              {resultado?.questionamentos && resultado.questionamentos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Questionamentos — responda para prosseguir
                  </p>
                  {resultado.questionamentos.map((q) => {
                    const dec = revisaoQuestionamentos[q.id] ?? { decisao: "pendente", resposta: "" };
                    return (
                      <Card key={q.id} className={`border-l-4 transition-colors ${dec.decisao === "ciente" ? "border-l-emerald-500 bg-emerald-500/5" : "border-l-amber-500 bg-amber-500/5"}`}>
                        <CardContent className="pt-3 pb-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/40 shrink-0">{q.tema} {q.variacaoPct >= 0 ? "+" : ""}{q.variacaoPct.toFixed(0)}%</Badge>
                            <p className="text-sm text-amber-200 italic">{q.pergunta}</p>
                          </div>
                          <textarea
                            className="w-full text-sm bg-muted/30 border border-border/50 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                            rows={2}
                            placeholder="Sua justificativa (opcional)..."
                            value={dec.resposta}
                            onChange={(e) => setRevisaoQuestionamentos(prev => ({ ...prev, [q.id]: { ...dec, resposta: e.target.value } }))}
                          />
                          <Button size="sm" variant={dec.decisao === "ciente" ? "default" : "outline"} className={`h-7 text-xs ${dec.decisao === "ciente" ? "bg-emerald-600 hover:bg-emerald-500" : ""}`}
                            onClick={() => setRevisaoQuestionamentos(prev => ({ ...prev, [q.id]: { ...dec, decisao: "ciente" } }))}>
                            {dec.decisao === "ciente" ? "✓ Ciente" : "Marcar como ciente"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              {/* Prévia viva da baseDre */}
              {resultado && (
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardContent className="pt-3 pb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Prévia da baseDre com decisões aplicadas</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Faturamento meta</p>
                        <p className="text-sm font-semibold">{fmtBRL(resultado.faturamentoMeta)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Economia aceita</p>
                        <p className="text-sm font-semibold text-emerald-400">
                          {fmtBRL((resultado.sugestoesCorte ?? []).filter(s => revisaoCortes[s.id] === "aceito").reduce((sum, s) => sum + s.economiaRs, 0))}/mês
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Provisões adicionadas</p>
                        <p className="text-sm font-semibold text-blue-400">
                          {fmtBRL((resultado.linhasNovas ?? []).filter(l => revisaoLinhasNovas[l.id] === "adicionado").reduce((sum, l) => sum + l.valorSugerido, 0))}/mês
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {/* Botões de ação */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("resultado")}>
                  ← Voltar à análise
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                  onClick={async () => {
                    // Salvar decisões no banco (se já temos um orcamentoId)
                    if (orcamentoIdRevisao && storeIdCtx) {
                      const revisao = {
                        sugestoesCorte: Object.fromEntries(
                          Object.entries(revisaoCortes).filter(([, v]) => v !== "pendente")
                        ) as Record<string, "aceito" | "rejeitado">,
                        linhasNovas: Object.fromEntries(
                          Object.entries(revisaoLinhasNovas).filter(([, v]) => v !== "pendente")
                        ) as Record<string, "adicionado" | "ignorado">,
                        questionamentos: Object.fromEntries(
                          Object.entries(revisaoQuestionamentos).filter(([, v]) => v.decisao !== "pendente")
                            .map(([k, v]) => [k, { decisao: "ciente" as const, resposta: v.resposta }])
                        ),
                      };
                      await salvarRevisaoMut.mutateAsync({ orcamentoId: orcamentoIdRevisao, lojaId: storeIdCtx ?? 0, revisao: { ...revisao, planoDeAcao: resultado?.planoDeAcao ?? [] } });
                    }
                    // Prosseguir para aprovação
                    setStep("resultado");
                    // Disparar aprovação
                    const loja = storeIdCtx;
                    if (!loja) { toast.error("Selecione uma loja antes de continuar."); return; }
                    setAprovando(true);
                    // A4b: aplicar cortes aceitos na baseDre ANTES de enviar ao servidor
                    // Para cada sugestaoCorte ACEITA, substituir o valorAtualRs pelo valorSugerido
                    // na linha correspondente dos custosFixos (match por nome normalizado)
                    const cortesAceitosMap: Record<string, number> = {};
                    for (const [id, decisao] of Object.entries(revisaoCortes)) {
                      if (decisao !== "aceito") continue;
                      const sugestao = resultado?.sugestoesCorte?.find(s => s.id === id);
                      if (sugestao) cortesAceitosMap[id] = sugestao.valorSugerido;
                    }
                    // Helper: retorna o valor do custo fixo, aplicando corte aceito se houver
                    const custoComCorte = (keywords: string[], corteId?: string): number => {
                      const base = (resultado?.custosFixos ?? []).find(c =>
                        keywords.some(k => c.nome.toLowerCase().includes(k))
                      )?.valorAtualRs ?? 0;
                      if (corteId && cortesAceitosMap[corteId] !== undefined) return cortesAceitosMap[corteId];
                      return base;
                    };
                    const aluguel = custoComCorte(["aluguel"], "aluguel");
                    const energia = custoComCorte(["energia", "luz"], "energia");
                    const contabilidade = custoComCorte(["contabilidade"], "contabilidade");
                    const sistemas = custoComCorte(["sistema", "software"], "sistemas");
                    // Calcular outrasDespesas: soma dos cortes aceitos que não mapeiam para campo direto
                    // (ex: manutenção, marketing, pro_labore) — reduzir do valor base
                    let outrasDespesasBase = (resultado?.custosFixos ?? [])
                      .filter(c => !["aluguel", "energia", "luz", "contabilidade", "sistema", "software"].some(k => c.nome.toLowerCase().includes(k)))
                      .reduce((s, c) => s + c.valorAtualRs, 0) ?? 0;
                    // Aplicar cortes aceitos nas outras despesas
                    for (const [id, valorSugerido] of Object.entries(cortesAceitosMap)) {
                      if (["aluguel", "energia", "contabilidade", "sistemas"].includes(id)) continue;
                      const sugestao = resultado?.sugestoesCorte?.find(s => s.id === id);
                      if (sugestao) {
                        // Substituir valorAtual por valorSugerido na soma
                        outrasDespesasBase = outrasDespesasBase - sugestao.valorAtual + valorSugerido;
                      }
                    }
                    const cmvPct = ((resultado?.dreMeta?.cmvPct ?? 30)) / 100;
                    const impostosPct = ((resultado?.dreMeta?.impostosPct ?? 8)) / 100;
                    const royaltiesPct = false
                      ? 0
                      : 0.05;
                    const folhaPct = ((resultado?.dreMeta?.folhaPct ?? 25)) / 100;
                    aprovarMut.mutate({
                      lojaId: loja, ano, mes,
                      faturamentoMeta: resultado?.faturamentoMeta ?? 0,
                      resultadoMetaPct: resultado?.resultadoMetaPct ?? 0,
                      cmvPct, impostosPct, royaltiesPct, folhaPct,
                      aluguel, energia, contabilidade, sistemas,
                      outrasDespesas: Math.max(0, outrasDespesasBase), notas: "",
                    });
                  }}
                  disabled={aprovarMut.isPending || aprovando || salvarRevisaoMut.isPending}
                >
                  {aprovarMut.isPending || aprovando ? "Salvando..." : "Levar para ajuste fino do DRE →"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              disabled={aprovarMut.isPending || aprovando}
              onClick={() => {
                // Se há sugestões/questionamentos da IA, ir para revisão primeiro
                if (resultado && (
                  (resultado.sugestoesCorte?.length ?? 0) > 0 ||
                  (resultado.linhasNovas?.length ?? 0) > 0 ||
                  (resultado.questionamentos?.length ?? 0) > 0
                )) {
                  setStep("revisao");
                  return;
                }
                const loja = storeIdCtx;
                if (!loja) { toast.error("Selecione uma loja antes de continuar."); return; }
                setAprovando(true);
                // Extrai custos fixos identificados pela IA para popular o orçamento normal
                const aluguel = (resultado?.custosFixos ?? []).find(c =>
                  c.nome.toLowerCase().includes("aluguel"))?.valorAtualRs ?? 0;
                const energia = (resultado?.custosFixos ?? []).find(c =>
                  c.nome.toLowerCase().includes("energia") || c.nome.toLowerCase().includes("luz"))?.valorAtualRs ?? 0;
                const contabilidade = (resultado?.custosFixos ?? []).find(c =>
                  c.nome.toLowerCase().includes("contabilidade"))?.valorAtualRs ?? 0;
                const sistemas = (resultado?.custosFixos ?? []).find(c =>
                  c.nome.toLowerCase().includes("sistema") || c.nome.toLowerCase().includes("software"))?.valorAtualRs ?? 0;
                const cmvPct = (resultado?.dreMeta?.cmvPct ?? 30) / 100;
                const impostosPct = (resultado?.dreMeta?.impostosPct ?? 8) / 100;
                const royaltiesPct = 0 > 0
                  ? 0 / (resultado?.faturamentoMeta || 1)
                  : 0.05;
                const folhaPct = (resultado?.dreMeta?.folhaPct ?? 25) / 100;
                aprovarMut.mutate({
                  lojaId: loja,
                  ano,
                  mes,
                  faturamentoMeta: resultado?.faturamentoMeta ?? 0,
                  resultadoMetaPct: resultado?.resultadoMetaPct ?? 0,
                  cmvPct: Math.min(Math.max(cmvPct, 0), 1),
                  impostosPct: Math.min(Math.max(impostosPct, 0), 1),
                  royaltiesPct: Math.min(Math.max(royaltiesPct, 0), 1),
                  fundoMarketingPct: 0.02,
                  folhaPct: Math.min(Math.max(folhaPct, 0), 1),
                  aluguel,
                  energia,
                  contabilidade,
                  sistemas,
                  outrasDespesas: (resultado?.dreAtual?.custosFixos ?? 0) > 0
                    ? (resultado?.dreAtual?.custosFixos ?? 0) * 0.5
                    : 0,
                  notas: `Aprovado via Orçamento IA — ${mes}/${ano}`,
                });
              }}
            >
              {aprovarMut.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando base...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Continuar para ajuste fino do DRE →</>
              )}
            </Button>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setStep("meta"); setResultado(null); }}>
              Nova simulação
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setStep("dre")}>
              Alterar DRE e simular novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function OrcamentoAssistidoPage() {
  return <OrcamentoErrorBoundary><OrcamentoAssistidoFlow /></OrcamentoErrorBoundary>;
}
