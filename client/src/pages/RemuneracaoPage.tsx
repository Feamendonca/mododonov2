import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  DollarSign, Settings, Plus, Edit2, Trash2, CheckCircle2, XCircle,
  TrendingUp, Award, AlertTriangle, Info, ShieldCheck, FileText, User,
} from "lucide-react";

const INDICADORES_REGRA = [
  { value: "cmv", label: "CMV %" },
  { value: "qualidade", label: "Nota de Qualidade" },
  { value: "preturno", label: "Disciplina de Pré-turno %" },
  { value: "plano_acao", label: "Plano de Ação (% concluído)" },
  { value: "faturamento_pct", label: "Faturamento (% da meta)" },
  { value: "custom", label: "Indicador manual" },
];

function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function fmtNota(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toFixed(1);
}

export default function RemuneracaoPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const now = new Date();
  const [mes] = useState(now.getMonth() + 1);
  const [ano] = useState(now.getFullYear());
  const [lojaId, setLojaId] = useState<number | null>(null);
  const period = `${ano}-${String(mes).padStart(2, "0")}`;

  const storesQ = trpc.stores.list.useQuery();
  const stores = storesQ.data ?? [];
  const selectedLojaId = lojaId ?? (stores[0]?.id ?? 0);

  const configQ = trpc.remuneracao.getConfig.useQuery(
    { lojaId: selectedLojaId },
    { enabled: selectedLojaId > 0 }
  );
  const config = configQ.data;

  const apuracaoQ = trpc.remuneracao.getApuracao.useQuery(
    { lojaId: selectedLojaId, mes, ano },
    { enabled: selectedLojaId > 0 }
  );
  const apuracao = apuracaoQ.data;

  const historicoQ = trpc.remuneracao.historico.useQuery(
    { lojaId: selectedLojaId },
    { enabled: selectedLojaId > 0 }
  );
  const historico = historicoQ.data ?? [];

  const employeesQ = trpc.pessoas.getEmployees.useQuery(
    { storeId: selectedLojaId },
    { enabled: selectedLojaId > 0 }
  );
  type EmpItem = { id: number; name: string; papelRemuneravel?: string | null };
  const employees: EmpItem[] = (employeesQ.data ?? []) as EmpItem[];

  // Gatilhos mensais
  const gatilhosQ = trpc.gatilhos.listForStore.useQuery(
    { storeId: selectedLojaId, period },
    { enabled: selectedLojaId > 0 }
  );
  const gatilhosData = gatilhosQ.data ?? [];

  // Extrato do gestor logado
  const extratoQ = trpc.remuneracao.meuExtrato.useQuery(
    { lojaId: selectedLojaId, period },
    { enabled: selectedLojaId > 0 }
  );
  const extratoData = extratoQ.data;

  const utils = trpc.useUtils();

  const saveConfigMut = trpc.remuneracao.saveConfig.useMutation({
    onSuccess: () => { utils.remuneracao.getConfig.invalidate(); toast.success("Configuração salva!"); setShowConfigModal(false); },
  });
  const addRegraMut = trpc.remuneracao.addRegra.useMutation({
    onSuccess: () => { utils.remuneracao.getConfig.invalidate(); toast.success("Regra adicionada!"); setShowRegraModal(false); },
  });
  const updateRegraMut = trpc.remuneracao.updateRegra.useMutation({
    onSuccess: () => { utils.remuneracao.getConfig.invalidate(); toast.success("Regra atualizada!"); setShowRegraModal(false); },
  });
  const deleteRegraMut = trpc.remuneracao.deleteRegra.useMutation({
    onSuccess: () => { utils.remuneracao.getConfig.invalidate(); toast.success("Regra removida!"); },
  });
  const calcularMut = trpc.remuneracao.calcularPorPessoa.useMutation({
    onSuccess: () => {
      utils.remuneracao.getApuracao.invalidate();
      utils.remuneracao.historico.invalidate();
      utils.remuneracao.meuExtrato.invalidate();
      toast.success("Apuração calculada!");
      setShowApuracaoModal(false);
    },
  });
  const aprovarMut = trpc.remuneracao.aprovar.useMutation({
    onSuccess: () => { utils.remuneracao.getApuracao.invalidate(); toast.success("Apuração aprovada!"); },
    onError: (err) => { toast.error(err.message); },
  });
  const upsertGatilhoMut = trpc.gatilhos.upsert.useMutation({
    onSuccess: () => { utils.gatilhos.listForStore.invalidate(); toast.success("Gatilho salvo!"); setShowGatilhoModal(false); },
    onError: (err) => { toast.error(err.message); },
  });

  // Modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showRegraModal, setShowRegraModal] = useState(false);
  const [showApuracaoModal, setShowApuracaoModal] = useState(false);
  const [editingRegra, setEditingRegra] = useState<any>(null);
  const [showGatilhoModal, setShowGatilhoModal] = useState(false);
  const [editingGatilhoEmp, setEditingGatilhoEmp] = useState<{ id: number; name: string } | null>(null);

  const [configForm, setConfigForm] = useState({
    bonusBasePctFaturamento: "",
    gatilhoMinimoPct: "80",
    tetoMaximoPct: "120",
    descricao: "",
  });
  const [regraForm, setRegraForm] = useState({
    titulo: "", descricao: "", tipo: "manual", indicador: "custom",
    metaValor: "", metaOperador: "gte", descontoPct: "25",
  });
  const [apuracaoForm, setApuracaoForm] = useState({
    employeeId: 0,
    ebitdaRealRs: "",
    ebitdaOrcadoRs: "",
    cmvRealPp: "",
    cmvMetaPp: "",
    vozDoCliente: "",
    auditoria: "",
    checklist: "",
    gateSanitarioOk: true,
    migTurnoRealPp: "",
    migTurnoMetaPp: "",
    checklistTurno: "",
  });
  const [gatilhoForm, setGatilhoForm] = useState({
    semFaltasInjustificadas: null as boolean | null,
    avaliacaoDesempenho: "" as string,
    semSancoes: null as boolean | null,
  });

  function openConfigModal() {
    setConfigForm({
      bonusBasePctFaturamento: config ? String(config.bonusBasePctFaturamento * 100) : "",
      gatilhoMinimoPct: config ? String(config.gatilhoMinimoPct) : "80",
      tetoMaximoPct: config ? String(config.tetoMaximoPct) : "120",
      descricao: config?.descricao ?? "",
    });
    setShowConfigModal(true);
  }

  function openRegraModal(regra?: any) {
    if (regra) {
      setEditingRegra(regra);
      setRegraForm({ titulo: regra.titulo, descricao: regra.descricao ?? "", tipo: regra.tipo, indicador: regra.indicador ?? "custom", metaValor: String(regra.metaValor ?? ""), metaOperador: regra.metaOperador ?? "gte", descontoPct: String(regra.descontoPct) });
    } else {
      setEditingRegra(null);
      setRegraForm({ titulo: "", descricao: "", tipo: "manual", indicador: "custom", metaValor: "", metaOperador: "gte", descontoPct: "25" });
    }
    setShowRegraModal(true);
  }

  function openApuracaoModal() {
    setApuracaoForm(prev => ({ ...prev, ebitdaRealRs: "", ebitdaOrcadoRs: "", cmvRealPp: "", cmvMetaPp: "", vozDoCliente: "", auditoria: "", checklist: "", migTurnoRealPp: "", migTurnoMetaPp: "", checklistTurno: "", employeeId: 0 }));
    setShowApuracaoModal(true);
  }

  function openGatilhoModal(emp: { id: number; name: string }, existing: any) {
    setEditingGatilhoEmp(emp);
    setGatilhoForm({
      semFaltasInjustificadas: existing?.semFaltasInjustificadas ?? null,
      avaliacaoDesempenho: existing?.avaliacaoDesempenho != null ? String(existing.avaliacaoDesempenho) : "",
      semSancoes: existing?.semSancoes ?? null,
    });
    setShowGatilhoModal(true);
  }

  function submitConfig() {
    if (!configForm.bonusBasePctFaturamento) return toast.error("Informe o % do bônus base");
    saveConfigMut.mutate({
      lojaId: selectedLojaId,
      bonusBasePctFaturamento: Number(configForm.bonusBasePctFaturamento) / 100,
      gatilhoMinimoPct: Number(configForm.gatilhoMinimoPct),
      tetoMaximoPct: Number(configForm.tetoMaximoPct),
      descricao: configForm.descricao || null,
    });
  }

  function submitRegra() {
    if (!regraForm.titulo) return toast.error("Informe o título da regra");
    if (!config) return;
    const payload = {
      titulo: regraForm.titulo,
      descricao: regraForm.descricao || null,
      tipo: regraForm.tipo as "automatico" | "manual",
      indicador: regraForm.indicador,
      metaValor: regraForm.metaValor ? Number(regraForm.metaValor) : null,
      metaOperador: regraForm.metaOperador as "gte" | "lte" | "eq",
      descontoPct: Number(regraForm.descontoPct),
    };
    if (editingRegra) {
      updateRegraMut.mutate({ id: editingRegra.id, ...payload });
    } else {
      addRegraMut.mutate({ configId: config.id, ...payload });
    }
  }

  function submitApuracao() {
    if (!apuracaoForm.employeeId) return toast.error("Selecione a pessoa a apurar");
    // Realizados derivados do banco — não há mais campos de input manual para resultado/cmv/qualidade.
    calcularMut.mutate({
      employeeId: apuracaoForm.employeeId,
      lojaId: selectedLojaId,
      period,
    });
  }

  function submitGatilho() {
    if (!editingGatilhoEmp) return;
    upsertGatilhoMut.mutate({
      employeeId: editingGatilhoEmp.id,
      storeId: selectedLojaId,
      period,
      semFaltasInjustificadas: gatilhoForm.semFaltasInjustificadas,
      avaliacaoDesempenho: gatilhoForm.avaliacaoDesempenho !== "" ? Number(gatilhoForm.avaliacaoDesempenho) : null,
      semSancoes: gatilhoForm.semSancoes,
    });
  }

  const regras = config?.regras ?? [];
  const totalDescontoPossivel = regras.reduce((s, r) => s + r.descontoPct, 0);
  const gatilhosPendentes = gatilhosData.filter(g => g.status === "pendente").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <DollarSign className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Remuneração Variável</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(ano, mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stores.length > 1 && (
            <Select value={String(selectedLojaId)} onValueChange={v => setLojaId(Number(v))}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={openConfigModal} className="gap-1">
              <Settings className="w-4 h-4" /> Configurar
            </Button>
          )}
        </div>
      </div>

      {!config ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center space-y-4">
            <Award className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <p className="text-lg font-medium">Remuneração não configurada</p>
              <p className="text-sm text-muted-foreground mt-1">Configure o modelo de bônus para esta loja</p>
            </div>
            {isAdmin && (
              <Button onClick={openConfigModal} className="gap-2">
                <Settings className="w-4 h-4" /> Configurar Remuneração
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="placar">
          <TabsList>
            <TabsTrigger value="placar">Placar do Mês</TabsTrigger>
            <TabsTrigger value="gatilhos" className="relative">
              Gatilhos
              {gatilhosPendentes > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                  {gatilhosPendentes}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="extrato">Meu Extrato</TabsTrigger>
            <TabsTrigger value="regras">Regras</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          {/* ─── Placar ─────────────────────────────────────────────────── */}
          <TabsContent value="placar" className="space-y-4 mt-4">
            {/* Alerta de gatilhos pendentes */}
            {gatilhosPendentes > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>{gatilhosPendentes} pessoa(s)</strong> com gatilhos não apontados. A apuração será bloqueada até que todos sejam preenchidos.
                  {" "}<button className="underline" onClick={() => {}}>Ver na aba Gatilhos</button>
                </p>
              </div>
            )}

            {/* Card do bônus */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
              <CardContent className="pt-6 pb-6 relative">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Bônus Base</p>
                    <p className="text-3xl font-black text-primary">
                      {apuracao ? fmtMoeda(apuracao.bonusBaseRs ?? 0) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{fmtPct(config.bonusBasePctFaturamento * 100)} do faturamento</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Atingimento</p>
                    <p className="text-3xl font-black">
                      {apuracao ? fmtPct(apuracao.resultadoAtingimentoPct ?? 0) : "—"}
                    </p>
                    <div className="mt-2">
                      <Progress value={apuracao ? Math.min(apuracao.resultadoAtingimentoPct ?? 0, 100) : 0} className="h-1.5" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Gatilho: {config.gatilhoMinimoPct}% | Teto: {config.tetoMaximoPct}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Bônus Final</p>
                    <p className={`text-3xl font-black ${apuracao && (apuracao.bonusFinalRs ?? 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {apuracao ? fmtMoeda(apuracao.bonusFinalRs ?? 0) : "—"}
                    </p>
                    {apuracao && apuracao.status === "aprovado" && (
                      <Badge className="mt-1 bg-emerald-100 text-emerald-700 border-0">Aprovado</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Regras aplicadas */}
            {apuracao?.regras && apuracao.regras.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Regras Aplicadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {apuracao.regras.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        {r.metaAtingida ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        <span className="text-sm">{r.titulo}</span>
                      </div>
                      <Badge variant={r.metaAtingida ? "secondary" : "destructive"} className="text-xs">
                        {r.metaAtingida ? "✓ Cumprida" : `-${r.descontoAplicadoPct}%`}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Ações */}
            <div className="flex gap-2">
              {isAdmin && (
                <Button onClick={openApuracaoModal} className="gap-2">
                  <TrendingUp className="w-4 h-4" /> Apurar Mês
                </Button>
              )}
              {isAdmin && apuracao && apuracao.status !== "aprovado" && (
                <Button variant="outline" onClick={() => aprovarMut.mutate({ apuracaoId: apuracao.id })} disabled={aprovarMut.isPending} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Aprovar Apuração
                </Button>
              )}
            </div>
          </TabsContent>

          {/* ─── Gatilhos ───────────────────────────────────────────────── */}
          <TabsContent value="gatilhos" className="space-y-4 mt-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
              <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Os gatilhos de elegibilidade devem ser apontados <strong>antes</strong> de calcular a remuneração.
                Gatilhos não apontados bloqueiam a apuração da pessoa correspondente.
              </p>
            </div>

            {gatilhosQ.isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
            ) : gatilhosData.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground text-sm">Nenhuma pessoa remunerável cadastrada nesta loja.</p>
                  <p className="text-xs text-muted-foreground mt-1">Configure o papel remunerável (gestor/líder) no cadastro de funcionários.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {gatilhosData.map((item: any) => {
                  const g = item.gatilho;
                  const isCompleto = item.status === "completo";
                  return (
                    <Card key={item.employee.id} className={isCompleto ? "" : "border-amber-300 dark:border-amber-700"}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isCompleto ? "bg-emerald-100 dark:bg-emerald-950" : "bg-amber-100 dark:bg-amber-950"}`}>
                              {isCompleto
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                : <AlertTriangle className="w-4 h-4 text-amber-600" />
                              }
                            </div>
                            <div>
                              <p className="font-medium text-sm">{item.employee.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{item.employee.papelRemuneravel}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Status dos 3 gatilhos */}
                            <div className="hidden sm:flex items-center gap-2 text-xs">
                              <span className={`flex items-center gap-1 ${g?.semFaltasInjustificadas === null ? "text-muted-foreground" : g?.semFaltasInjustificadas ? "text-emerald-600" : "text-red-500"}`}>
                                {g?.semFaltasInjustificadas === null ? "○" : g?.semFaltasInjustificadas ? "✓" : "✗"} Faltas
                              </span>
                              <span className={`flex items-center gap-1 ${g?.avaliacaoDesempenho === null ? "text-muted-foreground" : "text-emerald-600"}`}>
                                {g?.avaliacaoDesempenho === null ? "○" : `✓ ${g.avaliacaoDesempenho}/10`} Avaliação
                              </span>
                              <span className={`flex items-center gap-1 ${g?.semSancoes === null ? "text-muted-foreground" : g?.semSancoes ? "text-emerald-600" : "text-red-500"}`}>
                                {g?.semSancoes === null ? "○" : g?.semSancoes ? "✓" : "✗"} Sanções
                              </span>
                            </div>
                            {!isCompleto && (
                              <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                                Pendente: {item.pendentes.join(", ")}
                              </Badge>
                            )}
                            {isAdmin && (
                              <Button size="sm" variant="outline" onClick={() => openGatilhoModal(item.employee, g)} className="gap-1">
                                <Edit2 className="w-3 h-3" /> Apontar
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── Extrato do gestor logado ────────────────────────────────── */}
          <TabsContent value="extrato" className="space-y-4 mt-4">
            {extratoQ.isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Carregando extrato...</div>
            ) : !extratoData || !extratoData.employee ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center space-y-2">
                  <User className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground text-sm">Você não está cadastrado como pessoa remunerável nesta loja.</p>
                  <p className="text-xs text-muted-foreground">Solicite ao administrador que vincule seu usuário ao cadastro de funcionário.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Cabeçalho do extrato */}
                <Card>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{extratoData.employee.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">{extratoData.employee.papelRemuneravel} · {new Date(ano, mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Salário fixo</p>
                        <p className="font-semibold">{extratoData.employee.salaryBase ? fmtMoeda(extratoData.employee.salaryBase) : "—"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Apuração do mês */}
                {!extratoData.apuracao ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhuma apuração registrada para este mês.</p>
                      <p className="text-xs text-muted-foreground mt-1">O administrador precisa calcular a remuneração do mês.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Notas do extrato */}
                    {extratoData.extrato && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Notas do Mês</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Nota Resultado */}
                          {extratoData.extrato.notaResultado != null && (
                            <div className="flex items-center justify-between py-2 border-b">
                              <div>
                                <p className="text-sm font-medium">Resultado (EBITDA)</p>
                                <p className="text-xs text-muted-foreground">Peso: 40%</p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold">{fmtNota(extratoData.extrato.notaResultado)}</p>
                                <p className="text-xs text-muted-foreground">/ 100</p>
                              </div>
                            </div>
                          )}
                          {/* Nota CMV */}
                          {extratoData.extrato.notaCmv != null && (
                            <div className="flex items-center justify-between py-2 border-b">
                              <div>
                                <p className="text-sm font-medium">CMV</p>
                                <p className="text-xs text-muted-foreground">Peso: 30%</p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold">{fmtNota(extratoData.extrato.notaCmv)}</p>
                                <p className="text-xs text-muted-foreground">/ 100</p>
                              </div>
                            </div>
                          )}
                          {/* Nota Qualidade */}
                          {extratoData.extrato.notaQualidade != null && (
                            <div className="flex items-center justify-between py-2 border-b">
                              <div>
                                <p className="text-sm font-medium">Qualidade</p>
                                <p className="text-xs text-muted-foreground">Peso: 30%</p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold">{fmtNota(extratoData.extrato.notaQualidade)}</p>
                                <p className="text-xs text-muted-foreground">/ 100</p>
                              </div>
                            </div>
                          )}
                          {/* Nota Total */}
                          {extratoData.extrato.notaTotal != null && (
                            <div className="flex items-center justify-between py-2">
                              <p className="text-sm font-semibold">Nota Total</p>
                              <div className="text-right">
                                <p className={`text-xl font-black ${extratoData.extrato.notaTotal >= 80 ? "text-emerald-600" : extratoData.extrato.notaTotal >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                  {fmtNota(extratoData.extrato.notaTotal)}
                                </p>
                                <p className="text-xs text-muted-foreground">/ 100</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Variável calculada */}
                    <Card className="relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
                      <CardContent className="py-5 px-5 relative">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Variável Calculada</p>
                            {extratoData.extrato?.variavelRs != null ? (
                              <p className="text-2xl font-black text-primary mt-1">{fmtMoeda(extratoData.extrato.variavelRs)}</p>
                            ) : (
                              <p className="text-2xl font-black text-muted-foreground mt-1">—</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                            <div className="mt-1">
                              {(extratoData.apuracao as any).status === "aprovado" ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0">Aprovado</Badge>
                              ) : (
                                <Badge variant="outline">Rascunho</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {extratoData.extrato?.corte && (
                          <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              Nota total abaixo de 50 — variável zerada (corte de nota mínima)
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Gatilhos do extrato */}
                    {extratoData.extrato?.gatilhos && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Gatilhos de Elegibilidade</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {Object.entries(extratoData.extrato.gatilhos as Record<string, boolean | null>).map(([key, val]) => (
                            <div key={key} className="flex items-center justify-between py-1.5 border-b last:border-0">
                              <p className="text-sm capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                              {val === null ? (
                                <Badge variant="outline" className="text-xs text-muted-foreground">Não apontado</Badge>
                              ) : val ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">✓ Ok</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">✗ Falhou</Badge>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}
          </TabsContent>

          {/* ─── Regras ─────────────────────────────────────────────────── */}
          <TabsContent value="regras" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total de desconto possível: <strong>{totalDescontoPossivel}%</strong> do bônus
                </p>
                {totalDescontoPossivel > 100 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> Soma dos descontos ultrapassa 100% — o bônus será zerado se todas falharem
                  </p>
                )}
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => openRegraModal()} className="gap-1">
                  <Plus className="w-4 h-4" /> Nova Regra
                </Button>
              )}
            </div>

            {/* Config resumo */}
            <Card className="bg-muted/30">
              <CardContent className="py-3 px-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>Bônus base: <strong>{fmtPct(config.bonusBasePctFaturamento * 100)} do faturamento</strong></span>
                  <span>Gatilho mínimo: <strong>{config.gatilhoMinimoPct}%</strong></span>
                  <span>Teto máximo: <strong>{config.tetoMaximoPct}%</strong></span>
                </div>
                {config.descricao && <p className="text-xs text-muted-foreground mt-1">{config.descricao}</p>}
              </CardContent>
            </Card>

            {regras.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground text-sm">Nenhuma regra de desconto configurada.</p>
                  <p className="text-xs text-muted-foreground mt-1">Adicione regras que, se não cumpridas, descontam % do bônus.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {regras.map(r => (
                  <Card key={r.id}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-red-600">-{r.descontoPct}%</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{r.titulo}</p>
                          {r.descricao && <p className="text-xs text-muted-foreground">{r.descricao}</p>}
                          {r.metaValor != null && (
                            <p className="text-xs text-muted-foreground">
                              Meta: {r.metaOperador === "gte" ? "≥" : r.metaOperador === "lte" ? "≤" : "="} {r.metaValor}
                            </p>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openRegraModal(r)}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" onClick={() => deleteRegraMut.mutate({ id: r.id })}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Histórico ──────────────────────────────────────────────── */}
          <TabsContent value="historico" className="mt-4">
            {historico.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground text-sm">Nenhuma apuração registrada ainda.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {historico.map((a: any) => (
                  <Card key={a.id}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {new Date(a.ano, a.mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Atingimento: {fmtPct(a.resultadoAtingimentoPct)} | Faturamento: {fmtMoeda(a.faturamentoReal)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${(a.bonusFinalRs ?? 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {fmtMoeda(a.bonusFinalRs ?? 0)}
                        </p>
                        <Badge variant={a.status === "aprovado" ? "secondary" : "outline"} className="text-xs">
                          {a.status === "aprovado" ? "Aprovado" : "Pendente"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Modal Configuração */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Remuneração</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Bônus base (% do faturamento) *</Label>
              <Input type="number" step="0.1" min="0" max="10" placeholder="1.5" value={configForm.bonusBasePctFaturamento} onChange={e => setConfigForm(f => ({ ...f, bonusBasePctFaturamento: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">Ex: 1.5 = 1,5% do faturamento real do mês</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gatilho mínimo (%)</Label>
                <Input type="number" min="0" max="100" placeholder="80" value={configForm.gatilhoMinimoPct} onChange={e => setConfigForm(f => ({ ...f, gatilhoMinimoPct: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">Abaixo disso = bônus zero</p>
              </div>
              <div>
                <Label>Teto máximo (%)</Label>
                <Input type="number" min="100" max="200" placeholder="120" value={configForm.tetoMaximoPct} onChange={e => setConfigForm(f => ({ ...f, tetoMaximoPct: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">Limite do atingimento considerado</p>
              </div>
            </div>
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea placeholder="Regras específicas desta loja..." value={configForm.descricao} onChange={e => setConfigForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigModal(false)}>Cancelar</Button>
            <Button onClick={submitConfig} disabled={saveConfigMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Regra */}
      <Dialog open={showRegraModal} onOpenChange={setShowRegraModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRegra ? "Editar Regra" : "Nova Regra de Desconto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da Regra *</Label>
              <Input placeholder="Ex: Nota da franqueadora ≥ 90" value={regraForm.titulo} onChange={e => setRegraForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={regraForm.tipo} onValueChange={v => setRegraForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatico">Automático (do sistema)</SelectItem>
                    <SelectItem value="manual">Manual (lançado pelo admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Desconto se não cumprida (%)</Label>
                <Input type="number" min="0" max="100" placeholder="25" value={regraForm.descontoPct} onChange={e => setRegraForm(f => ({ ...f, descontoPct: e.target.value }))} />
              </div>
            </div>
            {regraForm.tipo === "automatico" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Indicador</Label>
                  <Select value={regraForm.indicador} onValueChange={v => setRegraForm(f => ({ ...f, indicador: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INDICADORES_REGRA.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operador</Label>
                  <Select value={regraForm.metaOperador} onValueChange={v => setRegraForm(f => ({ ...f, metaOperador: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gte">≥</SelectItem>
                      <SelectItem value="lte">≤</SelectItem>
                      <SelectItem value="eq">=</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor Meta</Label>
                  <Input type="number" placeholder="90" value={regraForm.metaValor} onChange={e => setRegraForm(f => ({ ...f, metaValor: e.target.value }))} />
                </div>
              </div>
            )}
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea placeholder="Detalhes de como medir..." value={regraForm.descricao} onChange={e => setRegraForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegraModal(false)}>Cancelar</Button>
            <Button onClick={submitRegra} disabled={addRegraMut.isPending || updateRegraMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Apuração — Motor único v3 (por pessoa) */}
      <Dialog open={showApuracaoModal} onOpenChange={setShowApuracaoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apurar Remuneração — {new Date(ano, mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">O salário fixo e o papel são lidos automaticamente do cadastro da pessoa. Aponte os gatilhos na aba Gatilhos antes de apurar.</p>
          </DialogHeader>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Pessoa */}
            <div>
              <Label>Pessoa a apurar *</Label>
              <Select value={String(apuracaoForm.employeeId || "")} onValueChange={v => setApuracaoForm(f => ({ ...f, employeeId: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {employees?.filter(e => e.papelRemuneravel && e.papelRemuneravel !== "nenhum").map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.papelRemuneravel})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            {/* Realizados derivados do banco — placar == pagamento */}
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-1">✓ Realizados derivados automaticamente do banco</p>
              <p className="text-xs">
                EBITDA, CMV e qualidade são lidos dos lançamentos do mês — os mesmos números do placar (Ranking).
                Isso garante que o placar e o pagamento usem exatamente a mesma fonte de verdade.
              </p>
              <p className="text-xs mt-1 font-medium">
                Pré-requisitos: orçamento aprovado para {period} + qualidade lançada em Experiência do Cliente.
              </p>
            </div>
            {apuracaoForm.employeeId ? (
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <Info className="w-3 h-3 inline mr-1" />
                Os gatilhos (faltas, sanções, avaliação) devem ser apontados na aba <strong>Gatilhos</strong> antes de apurar.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApuracaoModal(false)}>Cancelar</Button>
            <Button onClick={submitApuracao} disabled={calcularMut.isPending}>Calcular Variável</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Apontamento de Gatilhos */}
      <Dialog open={showGatilhoModal} onOpenChange={setShowGatilhoModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apontar Gatilhos — {editingGatilhoEmp?.name}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(ano, mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
          </DialogHeader>
          <div className="space-y-5">
            {/* Faltas injustificadas */}
            <div className="flex items-center justify-between py-3 border-b">
              <div>
                <p className="text-sm font-medium">Sem faltas injustificadas</p>
                <p className="text-xs text-muted-foreground">O colaborador não teve faltas injustificadas no mês</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{gatilhoForm.semFaltasInjustificadas === null ? "—" : gatilhoForm.semFaltasInjustificadas ? "Sim" : "Não"}</span>
                <Switch
                  checked={gatilhoForm.semFaltasInjustificadas === true}
                  onCheckedChange={v => setGatilhoForm(f => ({ ...f, semFaltasInjustificadas: v }))}
                />
              </div>
            </div>

            {/* Avaliação de desempenho */}
            <div className="py-3 border-b">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium">Avaliação de desempenho (0–10)</p>
                  <p className="text-xs text-muted-foreground">Nota da avaliação formal do período</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  placeholder="—"
                  className="w-20 text-center"
                  value={gatilhoForm.avaliacaoDesempenho}
                  onChange={e => setGatilhoForm(f => ({ ...f, avaliacaoDesempenho: e.target.value }))}
                />
              </div>
            </div>

            {/* Sem sanções */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">Sem sanções disciplinares</p>
                <p className="text-xs text-muted-foreground">Não houve advertências, suspensões ou sanções no mês</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{gatilhoForm.semSancoes === null ? "—" : gatilhoForm.semSancoes ? "Sim" : "Não"}</span>
                <Switch
                  checked={gatilhoForm.semSancoes === true}
                  onCheckedChange={v => setGatilhoForm(f => ({ ...f, semSancoes: v }))}
                />
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <Info className="w-3 h-3 inline mr-1" />
              Deixar um campo sem preencher (—) bloqueia a apuração desta pessoa. Preencha todos os campos antes de calcular.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGatilhoModal(false)}>Cancelar</Button>
            <Button onClick={submitGatilho} disabled={upsertGatilhoMut.isPending}>Salvar Gatilhos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
