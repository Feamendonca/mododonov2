import { useState } from "react";
import { useLocation } from "wouter";
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Target, Plus, Edit2, Trash2, TrendingUp, TrendingDown, Minus,
  ChevronRight, CheckCircle2, XCircle, AlertCircle, Zap, BarChart3,
  ArrowRight, Flame, ListChecks, Loader2, ChevronLeft
} from "lucide-react";

const INDICADORES = [
  { value: "faturamento", label: "Faturamento", unidade: "R$" },
  { value: "cmv", label: "CMV %", unidade: "%" },
  { value: "ebitda", label: "EBITDA %", unidade: "%" },
  { value: "qualidade", label: "Nota de Qualidade", unidade: "pts" },
  { value: "preturno", label: "Disciplina de Pré-turno", unidade: "%" },
  { value: "plano_acao", label: "Plano de Ação (% concluído)", unidade: "%" },
  { value: "ticket_medio", label: "Ticket Médio", unidade: "R$" },
  { value: "atendimentos", label: "Atendimentos/dia", unidade: "un" },
  { value: "custom", label: "Indicador customizado", unidade: "" },
];

const OPERADORES = [
  { value: "gte", label: "≥ (maior ou igual)" },
  { value: "lte", label: "≤ (menor ou igual)" },
  { value: "eq", label: "= (igual a)" },
];

function semaforo(medida: { metaValor: number | null; metaOperador: string; progresso?: { valorAtual: number | null; atingida: boolean } | null }) {
  if (!medida.progresso || medida.progresso.valorAtual === null) return "cinza";
  if (medida.progresso.atingida) return "verde";
  if (medida.metaValor !== null) {
    const diff = medida.progresso.valorAtual / medida.metaValor;
    if (medida.metaOperador === "gte") return diff >= 0.9 ? "amarelo" : "vermelho";
    if (medida.metaOperador === "lte") return diff <= 1.1 ? "amarelo" : "vermelho";
  }
  return "amarelo";
}

function SemaforoIcon({ cor }: { cor: string }) {
  if (cor === "verde") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (cor === "amarelo") return <AlertCircle className="w-5 h-5 text-amber-500" />;
  if (cor === "vermelho") return <XCircle className="w-5 h-5 text-red-500" />;
  return <Minus className="w-5 h-5 text-muted-foreground" />;
}

function calcAtingimentoPct(meta: { valorMeta: number | null }, faturamentoAtual?: number): number {
  if (!meta.valorMeta || !faturamentoAtual) return 0;
  return Math.min((faturamentoAtual / meta.valorMeta) * 100, 100);
}

export default function MetaPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "supervisor";
  const now = new Date();
  // Ler ?mes=YYYY-MM da URL para abrir no mês correto (ex.: vindo do banner de aprovação)
  const [location] = useLocation();
  const initialFromUrl = (() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mes"); // "2026-09"
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      const [y, mo] = m.split("-").map(Number);
      return { ano: y, mes: mo };
    }
    return { ano: now.getFullYear(), mes: now.getMonth() + 1 };
  })();
  const [mes, setMes] = useState(initialFromUrl.mes);
  const [ano, setAno] = useState(initialFromUrl.ano);

  function irMesAnterior() {
    if (mes === 1) { setMes(12); setAno(a => a - 1); }
    else { setMes(m => m - 1); }
  }
  function irProximoMes() {
    if (mes === 12) { setMes(1); setAno(a => a + 1); }
    else { setMes(m => m + 1); }
  }

  const [lojaId, setLojaId] = useState<number | null>(null);

  // Queries
  const storesQ = trpc.stores.list.useQuery();
  const stores = storesQ.data ?? [];

  const selectedLojaId = lojaId ?? (stores[0]?.id ?? 0);

  const metasQ = trpc.metas.list.useQuery(
    { lojaId: selectedLojaId, mes, ano },
    { enabled: selectedLojaId > 0 }
  );
  const metas = metasQ.data ?? [];
  const meta = metas[0] ?? null;

  // Mutations
  const utils = trpc.useUtils();
  const createMetaMut = trpc.metas.create.useMutation({
    onSuccess: () => { utils.metas.list.invalidate(); toast.success("Meta criada!"); setShowMetaModal(false); },
  });
  const updateMetaMut = trpc.metas.update.useMutation({
    onSuccess: () => { utils.metas.list.invalidate(); toast.success("Meta atualizada!"); setShowMetaModal(false); },
  });
  const createMedidaMut = trpc.metas.createMedida.useMutation({
    onSuccess: () => { utils.metas.list.invalidate(); toast.success("Medida adicionada!"); setShowMedidaModal(false); },
  });
  const updateMedidaMut = trpc.metas.updateMedida.useMutation({
    onSuccess: () => { utils.metas.list.invalidate(); toast.success("Medida atualizada!"); setShowMedidaModal(false); },
  });
  const deleteMedidaMut = trpc.metas.deleteMedida.useMutation({
    onSuccess: () => { utils.metas.list.invalidate(); toast.success("Medida removida!"); },
  });
  const registrarProgressoMut = trpc.metas.registrarProgresso.useMutation({
    onSuccess: () => { utils.metas.list.invalidate(); toast.success("Progresso registrado!"); setShowProgressoModal(false); },
  });
  const gerarAcoesMut = trpc.metas.gerarAcoesPlano.useMutation();
  const deleteMetaMut = trpc.orcamento.deleteMeta.useMutation({
    onSuccess: () => { utils.metas.list.invalidate(); toast.success("Meta excluída com sucesso."); },
    onError: (e: any) => toast.error("Erro ao excluir meta: " + e.message),
  });

  // Modal states
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [showMedidaModal, setShowMedidaModal] = useState(false);
  const [showProgressoModal, setShowProgressoModal] = useState(false);
  const [editingMedida, setEditingMedida] = useState<typeof meta extends null ? never : NonNullable<typeof meta>["medidas"] extends undefined ? never : NonNullable<NonNullable<typeof meta>["medidas"]>[number] | null>(null);
  const [progressoMedida, setProgressoMedida] = useState<{ id: number; titulo: string; unidade: string; metaValor: number | null } | null>(null);

  // Form states
  const [metaForm, setMetaForm] = useState({ titulo: "", valorMeta: "", unidade: "R$", descricao: "" });
  const [medidaForm, setMedidaForm] = useState({ titulo: "", descricao: "", indicador: "custom", metaValor: "", metaOperador: "gte", unidade: "%", pesoRemuneracaoPct: "0" });
  const [progressoForm, setProgressoForm] = useState({ valorAtual: "", atingida: false, observacao: "" });

  function openMetaModal(edit?: typeof meta) {
    if (edit) {
      setMetaForm({ titulo: edit.titulo, valorMeta: String(edit.valorMeta ?? ""), unidade: edit.unidade, descricao: edit.descricao ?? "" });
    } else {
      setMetaForm({ titulo: "", valorMeta: "", unidade: "R$", descricao: "" });
    }
    setShowMetaModal(true);
  }

  function openMedidaModal(edit?: NonNullable<typeof meta>["medidas"] extends undefined ? never : NonNullable<NonNullable<typeof meta>["medidas"]>[number]) {
    if (edit) {
      setEditingMedida(edit as any);
      setMedidaForm({
        titulo: edit.titulo,
        descricao: edit.descricao ?? "",
        indicador: edit.indicador,
        metaValor: String(edit.metaValor ?? ""),
        metaOperador: edit.metaOperador,
        unidade: edit.unidade,
        pesoRemuneracaoPct: String(edit.pesoRemuneracaoPct),
      });
    } else {
      setEditingMedida(null);
      setMedidaForm({ titulo: "", descricao: "", indicador: "custom", metaValor: "", metaOperador: "gte", unidade: "%", pesoRemuneracaoPct: "0" });
    }
    setShowMedidaModal(true);
  }

  function openProgressoModal(medida: { id: number; titulo: string; unidade: string; metaValor: number | null; progresso?: { valorAtual: number | null; atingida: boolean; observacao: string | null } | null }) {
    setProgressoMedida({ id: medida.id, titulo: medida.titulo, unidade: medida.unidade, metaValor: medida.metaValor });
    setProgressoForm({
      valorAtual: String(medida.progresso?.valorAtual ?? ""),
      atingida: medida.progresso?.atingida ?? false,
      observacao: medida.progresso?.observacao ?? "",
    });
    setShowProgressoModal(true);
  }

  function submitMeta() {
    if (!metaForm.titulo) return toast.error("Informe o título da meta");
    if (meta && showMetaModal) {
      updateMetaMut.mutate({ id: meta.id, titulo: metaForm.titulo, valorMeta: metaForm.valorMeta ? Number(metaForm.valorMeta) : null, unidade: metaForm.unidade, descricao: metaForm.descricao || null });
    } else {
      createMetaMut.mutate({ lojaId: selectedLojaId, mes, ano, titulo: metaForm.titulo, valorMeta: metaForm.valorMeta ? Number(metaForm.valorMeta) : null, unidade: metaForm.unidade, descricao: metaForm.descricao || null });
    }
  }

  function submitMedida() {
    if (!medidaForm.titulo) return toast.error("Informe o título da medida");
    if (!meta) return;
    const payload = {
      titulo: medidaForm.titulo,
      descricao: medidaForm.descricao || null,
      indicador: medidaForm.indicador,
      metaValor: medidaForm.metaValor ? Number(medidaForm.metaValor) : null,
      metaOperador: medidaForm.metaOperador as "gte" | "lte" | "eq",
      unidade: medidaForm.unidade,
      pesoRemuneracaoPct: Number(medidaForm.pesoRemuneracaoPct),
    };
    if (editingMedida) {
      updateMedidaMut.mutate({ id: (editingMedida as any).id, ...payload });
    } else {
      createMedidaMut.mutate({ metaId: meta.id, lojaId: selectedLojaId, ...payload });
    }
  }

  function submitProgresso() {
    if (!progressoMedida) return;
    registrarProgressoMut.mutate({
      medidaId: progressoMedida.id,
      mes,
      ano,
      valorAtual: progressoForm.valorAtual ? Number(progressoForm.valorAtual) : null,
      atingida: progressoForm.atingida,
      observacao: progressoForm.observacao || null,
    });
  }

  const medidas = meta?.medidas ?? [];
  const medidasAtingidas = medidas.filter(m => m.progresso?.atingida).length;
  const atingimentoGeral = medidas.length > 0 ? (medidasAtingidas / medidas.length) * 100 : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Target className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Meta do Mês</h1>
            {/* Controles de navegação de mês */}
            <div className="flex items-center gap-1 mt-0.5">
              <button
                onClick={irMesAnterior}
                className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                title="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-muted-foreground min-w-[150px] text-center capitalize">
                {new Date(ano, mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </span>
              <button
                onClick={irProximoMes}
                className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                title="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        {stores.length > 1 && (
          <Select value={String(selectedLojaId)} onValueChange={v => setLojaId(Number(v))}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Selecionar loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Card principal da meta */}
      {!meta ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Target className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-medium">Nenhuma meta definida para este mês</p>
              <p className="text-sm text-muted-foreground mt-1">Defina a Meta Crucialmente Importante para começar</p>
            </div>
            {isAdmin && (
              <Button onClick={() => openMetaModal()} className="gap-2">
                <Plus className="w-4 h-4" /> Definir Meta do Mês
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Card da meta principal */}
          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-32 translate-x-32" />
            <CardContent className="pt-6 pb-6 relative">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Meta Crucialmente Importante</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openMetaModal(meta)} className="gap-1">
                      <Edit2 className="w-3 h-3" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-red-400 hover:text-red-600"
                      disabled={deleteMetaMut.isPending}
                      onClick={() => {
                        if (!confirm(`Excluir a Meta "${meta.titulo}" e suas medidas?\n\nPlanos automáticos ligados às medidas também serão removidos. Planos manuais são preservados.\n\nConfirmar?`)) return;
                        deleteMetaMut.mutate({ metaId: meta.id, storeId: meta.lojaId });
                      }}
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </Button>
                  </div>
                )}
              </div>

              <h2 className="text-3xl font-bold mb-1">{meta.titulo}</h2>
              {meta.valorMeta && (
                <p className="text-4xl font-black text-primary mt-2">
                  {meta.unidade === "R$" ? `R$ ${meta.valorMeta.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` : `${meta.valorMeta}${meta.unidade}`}
                </p>
              )}
              {meta.descricao && <p className="text-sm text-muted-foreground mt-2">{meta.descricao}</p>}

              {/* Progresso geral das medidas */}
              {medidas.length > 0 && (
                <div className="mt-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Medidas de Direção</span>
                    <span className="font-medium">{medidasAtingidas}/{medidas.length} atingidas</span>
                  </div>
                  <Progress value={atingimentoGeral} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Placar do Mês — resultado-alvo (lag measures) */}
          {meta.valorMeta && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Faturamento", valor: `R$ ${(meta.valorMeta ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` },
                { label: "CMV alvo", valor: "do orçamento" },
                { label: "Folha alvo", valor: "do orçamento" },
                { label: "EBITDA alvo", valor: "do orçamento" },
              ].map(item => (
                <div key={item.label} className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">{item.valor}</p>
                </div>
              ))}
            </div>
          )}

          {/* Medidas de Direção */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Medidas de Direção</h3>
                <Badge variant="secondary">{medidas.length}/5</Badge>
              </div>
              {isAdmin && medidas.length < 5 && (
                <Button variant="outline" size="sm" onClick={() => openMedidaModal()} className="gap-1">
                  <Plus className="w-4 h-4" /> Adicionar Medida
                </Button>
              )}
            </div>

            {/* Nota lead/lag — explica a lógica 4DX em linguagem de gestor */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border mb-4 text-sm text-muted-foreground">
              <Zap className="w-4 h-4 mt-0.5 shrink-0 text-primary/60" />
              <p>
                <strong className="text-foreground">Medida de Direção = comportamento</strong> que você controla no dia a dia e que prevê o resultado.
                O resultado-alvo (CMV, EBITDA, Faturamento) está no placar acima — aqui ficam as rotinas que te levam até lá.{" "}
                <strong className="text-foreground">O bônus é pago pelo Resultado</strong>; as medidas te ajudam a chegar lá.
              </p>
            </div>
            {medidas.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground text-sm">Nenhuma medida de direção definida.</p>
                  <p className="text-xs text-muted-foreground mt-1">Adicione até 5 indicadores que vão guiar o time rumo à meta.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {medidas.map((medida, idx) => {
                  const cor = semaforo(medida);
                  const corBg = cor === "verde" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800" :
                    cor === "amarelo" ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800" :
                    cor === "vermelho" ? "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800" :
                    "border-border";

                  return (
                    <Card key={medida.id} className={`transition-all ${corBg}`}>
                      <CardContent className="py-4 px-5">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background border text-sm font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <SemaforoIcon cor={cor} />
                              <span className="font-semibold truncate">{medida.titulo}</span>
                              {medida.pesoRemuneracaoPct > 0 && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {medida.pesoRemuneracaoPct}% remuneração
                                </Badge>
                              )}
                            </div>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>
                              Meta: {medida.metaOperador === "gte" ? "≥" : medida.metaOperador === "lte" ? "≤" : "="}{" "}
                              <strong className="text-foreground">{medida.metaValor ?? "—"} {medida.unidade}</strong>
                            </span>
                            {medida.progresso?.valorAtual != null && (
                              <>
                                <ArrowRight className="w-3 h-3" />
                                <span>
                                  Atual: <strong className="text-foreground">{medida.progresso.valorAtual} {medida.unidade}</strong>
                                </span>
                              </>
                            )}
                          </div>

                        {medida.descricao && (
                          <p className="text-xs text-muted-foreground mt-1">{medida.descricao}</p>
                        )}

                        {/* Ações vinculadas à medida */}
                        <AcoesDaMedida
                          medidaId={medida.id}
                          lojaId={meta.lojaId}
                          medidaTitulo={medida.titulo}
                          indicador={medida.indicador}
                          metaValor={medida.metaValor}
                          unidade={medida.unidade}
                          furada={cor === "vermelho" || cor === "amarelo"}
                        />
                      </div>

                        <div className="flex items-center gap-1 shrink-0">
                            {(medida as any).fonteProgresso === "auto" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 shrink-0">
                                <TrendingUp className="w-3 h-3" /> Automático
                              </span>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => openProgressoModal(medida)} className="text-xs gap-1">
                                <TrendingUp className="w-3 h-3" /> Atualizar
                              </Button>
                            )}
                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openMedidaModal(medida as any)}>
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" onClick={() => deleteMedidaMut.mutate({ id: medida.id })}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ação rápida: gerar plano de ação */}
          {medidas.some(m => semaforo(m) === "vermelho" || semaforo(m) === "amarelo") && (
            <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800">
              <CardContent className="py-4 px-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-orange-500" />
                  <div>
                    <p className="font-medium text-sm">Medidas em atenção detectadas</p>
                    <p className="text-xs text-muted-foreground">Gere ações no Plano de Ação para corrigir o curso</p>
                  </div>
                </div>
                <Button
                  variant="outline" size="sm" className="gap-1 border-orange-300"
                  disabled={gerarAcoesMut.isPending}
                  onClick={() => {
                    const medidasEmRisco = medidas.filter(m => semaforo(m) === "vermelho" || semaforo(m) === "amarelo");
                    if (!meta || medidasEmRisco.length === 0) return;
                    Promise.all(medidasEmRisco.map(m =>
                      gerarAcoesMut.mutateAsync({
                        medidaId: m.id,
                        lojaId: selectedLojaId,
                        tituleMedida: m.titulo,
                        descricaoMedida: m.descricao ?? undefined,
                        indicador: m.indicador ?? undefined,
                        metaValor: m.metaValor,
                        unidade: m.unidade ?? undefined,
                      })
                    )).then(results => {
                      const total = results.reduce((s, r) => s + r.total, 0);
                      toast.success(`${total} ações criadas no Plano de Ação!`);
                    }).catch(() => toast.error("Erro ao gerar ações"));
                  }}
                >
                  {gerarAcoesMut.isPending
                    ? <span className="text-xs">Gerando...</span>
                    : <><Zap className="w-4 h-4" /> Gerar Ações com IA</>
                  }
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modal Meta */}
      <Dialog open={showMetaModal} onOpenChange={setShowMetaModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{meta ? "Editar Meta" : "Definir Meta do Mês"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da Meta *</Label>
              <Input placeholder="Ex: Atingir R$ 220.000 em faturamento" value={metaForm.titulo} onChange={e => setMetaForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor da Meta</Label>
                <Input type="number" placeholder="220000" value={metaForm.valorMeta} onChange={e => setMetaForm(f => ({ ...f, valorMeta: e.target.value }))} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={metaForm.unidade} onValueChange={v => setMetaForm(f => ({ ...f, unidade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R$">R$ (reais)</SelectItem>
                    <SelectItem value="%">% (percentual)</SelectItem>
                    <SelectItem value="un">un (unidades)</SelectItem>
                    <SelectItem value="pts">pts (pontos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea placeholder="Contexto ou motivação da meta..." value={metaForm.descricao} onChange={e => setMetaForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMetaModal(false)}>Cancelar</Button>
            <Button onClick={submitMeta} disabled={createMetaMut.isPending || updateMetaMut.isPending}>Salvar Meta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Medida */}
      <Dialog open={showMedidaModal} onOpenChange={setShowMedidaModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMedida ? "Editar Medida" : "Nova Medida de Direção"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da Medida *</Label>
              <Input placeholder="Ex: Manter CMV abaixo de 32%" value={medidaForm.titulo} onChange={e => setMedidaForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div>
              <Label>Indicador</Label>
              <Select value={medidaForm.indicador} onValueChange={v => {
                const ind = INDICADORES.find(i => i.value === v);
                setMedidaForm(f => ({ ...f, indicador: v, unidade: ind?.unidade ?? f.unidade }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDICADORES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Operador</Label>
                <Select value={medidaForm.metaOperador} onValueChange={v => setMedidaForm(f => ({ ...f, metaOperador: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERADORES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor Meta</Label>
                <Input type="number" placeholder="32" value={medidaForm.metaValor} onChange={e => setMedidaForm(f => ({ ...f, metaValor: e.target.value }))} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input placeholder="%" value={medidaForm.unidade} onChange={e => setMedidaForm(f => ({ ...f, unidade: e.target.value }))} />
              </div>
            </div>
            <div>
              {/* Campo peso travado: medidas são placar/cadência, não entram no bônus (decisão de negócio) */}
              <p className="text-xs text-muted-foreground p-2 rounded bg-muted/50 border border-dashed">
                Medidas de Direção não entram no bônus — o pagamento é pelo Resultado do mês (Resultado / CMV / Qualidade).
              </p>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea placeholder="Como medir, onde buscar o dado..." value={medidaForm.descricao} onChange={e => setMedidaForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMedidaModal(false)}>Cancelar</Button>
            <Button onClick={submitMedida} disabled={createMedidaMut.isPending || updateMedidaMut.isPending}>Salvar Medida</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Progresso */}
      <Dialog open={showProgressoModal} onOpenChange={setShowProgressoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Progresso</DialogTitle>
          </DialogHeader>
          {progressoMedida && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted text-sm">
                <strong>{progressoMedida.titulo}</strong>
                {progressoMedida.metaValor && (
                  <p className="text-muted-foreground mt-1">Meta: {progressoMedida.metaValor} {progressoMedida.unidade}</p>
                )}
              </div>
              <div>
                <Label>Valor Atual ({progressoMedida.unidade})</Label>
                <Input type="number" placeholder="0" value={progressoForm.valorAtual} onChange={e => setProgressoForm(f => ({ ...f, valorAtual: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="atingida" checked={progressoForm.atingida} onChange={e => setProgressoForm(f => ({ ...f, atingida: e.target.checked }))} className="w-4 h-4" />
                <Label htmlFor="atingida">Medida atingida neste mês</Label>
              </div>
              <div>
                <Label>Observação (opcional)</Label>
                <Textarea placeholder="Contexto, ações tomadas..." value={progressoForm.observacao} onChange={e => setProgressoForm(f => ({ ...f, observacao: e.target.value }))} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProgressoModal(false)}>Cancelar</Button>
            <Button onClick={submitProgresso} disabled={registrarProgressoMut.isPending}>Salvar Progresso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Componente: Ações vinculadas a uma medida ────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  todo:      { label: "A fazer",    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  doing:     { label: "Em andamento", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  done:      { label: "Concluída",  className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  failed:    { label: "Falhou",     className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  cancelled: { label: "Cancelada",  className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

function AcoesDaMedida({
  medidaId, lojaId, medidaTitulo, indicador, metaValor, unidade, furada,
}: {
  medidaId: number;
  lojaId: number;
  medidaTitulo: string;
  indicador: string;
  metaValor: number | null;
  unidade: string;
  furada: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: acoes = [], isLoading } = trpc.metas.acoesDaMedida.useQuery({ medidaId });
  const gerarMut = trpc.metas.gerarAcoesPlano.useMutation({
    onSuccess: () => { utils.metas.acoesDaMedida.invalidate({ medidaId }); toast.success("Ações criadas!"); },
    onError: () => toast.error("Erro ao gerar ações."),
  });

  if (isLoading) return <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> carregando ações…</div>;

  return (
    <div className="mt-2 space-y-1">
      {acoes.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <ListChecks className="w-3 h-3" /> Ações vinculadas ({acoes.length})
          </div>
          {acoes.map((acao: any) => {
            const s = STATUS_LABEL[acao.status ?? "todo"] ?? STATUS_LABEL.todo;
            return (
              <div key={acao.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${s.className}`}>{s.label}</span>
                <span className="truncate text-muted-foreground">{acao.description}</span>
              </div>
            );
          })}
        </div>
      )}
      {furada && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1 h-6 px-2 text-orange-600 dark:text-orange-400 hover:text-orange-700"
          disabled={gerarMut.isPending}
          onClick={() => gerarMut.mutate({ medidaId, lojaId, tituleMedida: medidaTitulo, indicador, metaValor: metaValor ?? undefined, unidade })}
        >
          {gerarMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {acoes.length === 0 ? "Criar ações (IA)" : "Gerar mais ações"}
        </Button>
      )}
    </div>
  );
}
