import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Circle, ClipboardCheck, Sun, Coffee, Moon,
  Plus, Pencil, Trash2, Settings, History, ChevronRight, AlertTriangle,
  Trophy, RefreshCw, MessageSquare, Upload, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useStore } from "@/components/AppLayout";

const TURNOS = [
  { key: "abertura", label: "Abertura", icon: Sun, cor: "text-amber-500" },
  { key: "operacao", label: "Operação", icon: Coffee, cor: "text-blue-500" },
  { key: "fechamento", label: "Fechamento", icon: Moon, cor: "text-purple-500" },
] as const;

type Turno = "abertura" | "operacao" | "fechamento";

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function pctColor(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 90) return "text-emerald-500";
  if (pct >= 70) return "text-amber-500";
  return "text-red-500";
}

function pctBg(pct: number | null) {
  if (pct === null) return "bg-muted";
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ChecklistPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "supervisor";

  const { storeId: lojaId } = useStore();
  const [abaSelecionada, setAbaSelecionada] = useState<"execucao" | "historico" | "config">("execucao");
  const [turnoSelecionado, setTurnoSelecionado] = useState<Turno>("abertura");
  const [execucaoAtiva, setExecucaoAtiva] = useState<any>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [respostas, setRespostas] = useState<Record<number, { ok: boolean | null; obs: string }>>({});
  const [obsAberta, setObsAberta] = useState<number | null>(null);
  const [obsTexto, setObsTexto] = useState("");
  const [concluido, setConcluido] = useState(false);
  const [modalConfig, setModalConfig] = useState(false);
  const [modalItem, setModalItem] = useState<any>(null);

  const dataHoje = useMemo(() => hoje(), []);

  const resumoQuery = trpc.checklist.resumoHoje.useQuery({ lojaId: lojaId!, hoje: dataHoje }, { enabled: !!lojaId });
  const historicoQuery = trpc.checklist.historico.useQuery({ lojaId: lojaId!, dias: 30 }, { enabled: !!lojaId && abaSelecionada === "historico" });
  const itensConfigQuery = trpc.checklist.listarItens.useQuery({ lojaId: lojaId! }, { enabled: !!lojaId && abaSelecionada === "config" });

  const iniciarMut = trpc.checklist.iniciarExecucao.useMutation({
    onSuccess: (data) => {
      setExecucaoAtiva(data.execucao);
      setItens(data.itens);
      // Popular respostas existentes
      const map: Record<number, { ok: boolean | null; obs: string }> = {};
      for (const r of data.execucao.respostas ?? []) {
        map[r.itemId] = { ok: r.ok, obs: r.observacao ?? "" };
      }
      setRespostas(map);
      setConcluido(data.execucao.status === "concluido");
    },
    onError: () => toast.error("Erro ao iniciar checklist"),
  });

  const responderMut = trpc.checklist.responderItem.useMutation({
    onError: () => toast.error("Erro ao salvar resposta"),
  });

  const finalizarMut = trpc.checklist.finalizarExecucao.useMutation({
    onSuccess: () => {
      setConcluido(true);
      resumoQuery.refetch();
      toast.success("Checklist finalizado!");
    },
    onError: () => toast.error("Erro ao finalizar checklist"),
  });

  const criarItemMut = trpc.checklist.criarItem.useMutation({
    onSuccess: () => { itensConfigQuery.refetch(); setModalItem(null); toast.success("Item criado"); },
  });
  const editarItemMut = trpc.checklist.editarItem.useMutation({
    onSuccess: () => { itensConfigQuery.refetch(); setModalItem(null); toast.success("Item atualizado"); },
  });
  const deletarItemMut = trpc.checklist.deletarItem.useMutation({
    onSuccess: () => { itensConfigQuery.refetch(); toast.success("Item removido"); },
  });
  const seedMut = trpc.checklist.seedItensPadrao.useMutation({
    onSuccess: () => { itensConfigQuery.refetch(); toast.success("Itens padrão carregados!"); },
  });
  const parseChecklistSheet = trpc.checklist.parseChecklistSheet.useMutation({
    onSuccess: (d) => { setChecklistPreview(d); setChecklistImportLoading(false); },
    onError: (e) => { toast.error(e.message); setChecklistImportLoading(false); },
  });
  const importChecklist = trpc.checklist.importChecklist.useMutation({
    onSuccess: (d) => { itensConfigQuery.refetch(); setShowChecklistImport(false); setChecklistPreview(null); toast.success(`Importado: ${d.created} itens de checklist!`); },
    onError: e => toast.error(e.message),
  });
  const downloadChecklistTemplate = trpc.checklist.downloadChecklistTemplate.useQuery(undefined, { enabled: false });
  const [showChecklistImport, setShowChecklistImport] = useState(false);
  const [checklistPreview, setChecklistPreview] = useState<{ rows: any[]; validCount: number; errorCount: number } | null>(null);
  const [checklistImportLoading, setChecklistImportLoading] = useState(false);
  const checklistFileRef = useRef<HTMLInputElement>(null);

  const handleChecklistFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setChecklistImportLoading(true);
    setChecklistPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target!.result as string;
      const base64 = result.split(",")[1];
      parseChecklistSheet.mutate({ base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadChecklistTemplate = async () => {
    const result = await downloadChecklistTemplate.refetch();
    if (result.data) {
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data.base64}`;
      link.download = result.data.filename;
      link.click();
    }
  };

  function iniciarChecklist() {
    iniciarMut.mutate({ lojaId: lojaId!, data: dataHoje, turno: turnoSelecionado });
  }

  function responder(itemId: number, ok: boolean) {
    if (!execucaoAtiva || concluido) return;
    const obs = respostas[itemId]?.obs ?? "";
    setRespostas(prev => ({ ...prev, [itemId]: { ok, obs } }));
    responderMut.mutate({ execucaoId: execucaoAtiva.id, itemId, ok, observacao: obs || null });
    if (!ok) { setObsAberta(itemId); setObsTexto(obs); }
  }

  function salvarObs() {
    if (obsAberta === null || !execucaoAtiva) return;
    setRespostas(prev => ({ ...prev, [obsAberta]: { ...prev[obsAberta], obs: obsTexto } }));
    responderMut.mutate({ execucaoId: execucaoAtiva.id, itemId: obsAberta, ok: false, observacao: obsTexto || null });
    setObsAberta(null);
    setObsTexto("");
  }

  const respondidos = Object.keys(respostas).length;
  const okCount = Object.values(respostas).filter(r => r.ok === true).length;
  const pct = itens.length > 0 ? Math.round((respondidos / itens.length) * 100) : 0;
  const pctOk = itens.length > 0 ? Math.round((okCount / itens.length) * 100) : 0;

  const resumoHoje = resumoQuery.data ?? [];

  return (
    <div className="container py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <ClipboardCheck className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Checklist Diário</h1>
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
          </div>
        </div>
      </div>

      {/* Resumo do dia */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {TURNOS.map(({ key, label, icon: Icon, cor }) => {
          const r = resumoHoje.find(x => x.turno === key);
          return (
            <Card key={key} className={cn("cursor-pointer transition-all hover:shadow-md", turnoSelecionado === key && "ring-2 ring-emerald-500")}
              onClick={() => { setTurnoSelecionado(key as Turno); setAbaSelecionada("execucao"); setExecucaoAtiva(null); setItens([]); setRespostas({}); setConcluido(false); }}>
              <CardContent className="p-4 text-center">
                <Icon className={cn("h-5 w-5 mx-auto mb-1", cor)} />
                <p className="text-xs font-medium">{label}</p>
                {r ? (
                  <p className={cn("text-lg font-bold", pctColor(r.percentual))}>
                    {r.percentual !== null ? `${Math.round(r.percentual)}%` : "—"}
                  </p>
                ) : (
                  <p className="text-lg font-bold text-muted-foreground">—</p>
                )}
                {r?.status === "concluido" && <Badge variant="outline" className="text-xs mt-1 border-emerald-500 text-emerald-500">Concluído</Badge>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={abaSelecionada} onValueChange={(v) => setAbaSelecionada(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="execucao"><ClipboardCheck className="h-4 w-4 mr-1" />Executar</TabsTrigger>
          <TabsTrigger value="historico"><History className="h-4 w-4 mr-1" />Histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1" />Configurar</TabsTrigger>}
        </TabsList>

        {/* ─── Aba Execução ─────────────────────────────────────────────────── */}
        <TabsContent value="execucao">
          {!execucaoAtiva ? (
            <Card>
              <CardContent className="py-12 text-center">
                {TURNOS.find(t => t.key === turnoSelecionado) && (() => {
                  const T = TURNOS.find(t => t.key === turnoSelecionado)!;
                  return (
                    <>
                      <T.icon className={cn("h-12 w-12 mx-auto mb-4", T.cor)} />
                      <h3 className="text-lg font-semibold mb-2">Checklist de {T.label}</h3>
                      <p className="text-muted-foreground mb-6">Clique para iniciar a verificação dos itens deste turno</p>
                      <Button onClick={iniciarChecklist} disabled={iniciarMut.isPending} size="lg" className="bg-emerald-600 hover:bg-emerald-700">
                        {iniciarMut.isPending ? "Carregando..." : `Iniciar Checklist de ${T.label}`}
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ) : concluido ? (
            // Tela de resultado
            <Card className="border-emerald-500/30">
              <CardContent className="py-12 text-center">
                <div className="mb-4">
                  {pctOk >= 90
                    ? <Trophy className="h-16 w-16 mx-auto text-amber-400" />
                    : pctOk >= 70
                    ? <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500" />
                    : <AlertTriangle className="h-16 w-16 mx-auto text-amber-500" />}
                </div>
                <h3 className="text-2xl font-bold mb-1">
                  {pctOk >= 90 ? "Excelente!" : pctOk >= 70 ? "Bom trabalho!" : "Atenção necessária"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {okCount} de {itens.length} itens conformes — {pctOk}% de conformidade
                </p>
                <div className="w-48 mx-auto mb-6">
                  <Progress value={pctOk} className="h-3" />
                </div>
                {Object.entries(respostas).filter(([, r]) => r.ok === false).length > 0 && (
                  <div className="text-left max-w-sm mx-auto mb-6">
                    <p className="text-sm font-medium text-red-500 mb-2 flex items-center gap-1">
                      <XCircle className="h-4 w-4" /> Itens não conformes:
                    </p>
                    {Object.entries(respostas).filter(([, r]) => r.ok === false).map(([itemId, r]) => {
                      const item = itens.find(i => i.id === Number(itemId));
                      return item ? (
                        <div key={itemId} className="text-sm text-muted-foreground mb-1">
                          • {item.titulo} {r.obs && <span className="italic">— {r.obs}</span>}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                <Button variant="outline" onClick={() => { setExecucaoAtiva(null); setItens([]); setRespostas({}); setConcluido(false); }}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Novo Checklist
                </Button>
              </CardContent>
            </Card>
          ) : (
            // Execução ativa
            <div className="space-y-3">
              {/* Barra de progresso */}
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{respondidos} / {itens.length} verificados</span>
                    <span className={cn("text-sm font-bold", pctColor(pctOk))}>{pctOk}% conformidade</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </CardContent>
              </Card>

              {/* Itens agrupados por categoria */}
              {(() => {
                const categorias = Array.from(new Set(itens.map((i: any) => i.categoria as string)));
                return categorias.map(cat => (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{cat}</p>
                    <div className="space-y-2">
                      {itens.filter(i => i.categoria === cat).map(item => {
                        const resp = respostas[item.id];
                        const isOk = resp?.ok === true;
                        const isNok = resp?.ok === false;
                        return (
                          <Card key={item.id} className={cn(
                            "transition-all duration-200",
                            isOk && "border-emerald-500/50 bg-emerald-500/5",
                            isNok && "border-red-500/50 bg-red-500/5",
                          )}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="flex gap-2 mt-0.5 shrink-0">
                                  <button
                                    onClick={() => responder(item.id, true)}
                                    className={cn(
                                      "rounded-full transition-all duration-150 active:scale-95",
                                      isOk ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-500"
                                    )}
                                  >
                                    <CheckCircle2 className="h-6 w-6" />
                                  </button>
                                  <button
                                    onClick={() => responder(item.id, false)}
                                    className={cn(
                                      "rounded-full transition-all duration-150 active:scale-95",
                                      isNok ? "text-red-500" : "text-muted-foreground hover:text-red-500"
                                    )}
                                  >
                                    <XCircle className="h-6 w-6" />
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn("font-medium text-sm", isOk && "line-through text-muted-foreground")}>{item.titulo}</p>
                                  {item.descricao && <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>}
                                  {isNok && resp?.obs && (
                                    <p className="text-xs text-red-400 mt-1 italic">"{resp.obs}"</p>
                                  )}
                                </div>
                                {isNok && (
                                  <button
                                    onClick={() => { setObsAberta(item.id); setObsTexto(resp?.obs ?? ""); }}
                                    className="text-muted-foreground hover:text-foreground shrink-0"
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}

              {/* Botão finalizar */}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 mt-4"
                size="lg"
                disabled={respondidos < itens.length || finalizarMut.isPending}
                onClick={() => finalizarMut.mutate({ execucaoId: execucaoAtiva.id })}
              >
                {respondidos < itens.length
                  ? `Responda todos os itens (${itens.length - respondidos} restantes)`
                  : finalizarMut.isPending ? "Finalizando..." : "Finalizar Checklist"}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ─── Aba Histórico ────────────────────────────────────────────────── */}
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conformidade — Últimos 30 dias</CardTitle>
            </CardHeader>
            <CardContent>
              {historicoQuery.isLoading ? (
                <p className="text-muted-foreground text-sm">Carregando...</p>
              ) : !historicoQuery.data?.length ? (
                <p className="text-muted-foreground text-sm">Nenhum registro encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {historicoQuery.data.map((h, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", pctBg(h.percentual))} />
                        <div>
                          <p className="text-sm font-medium">{new Date(h.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</p>
                          <p className="text-xs text-muted-foreground capitalize">{h.turno}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-bold", pctColor(h.percentual))}>
                          {h.percentual !== null ? `${Math.round(h.percentual)}%` : "—"}
                        </p>
                        <Badge variant={h.status === "concluido" ? "outline" : "secondary"} className="text-xs">
                          {h.status === "concluido" ? "Concluído" : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Aba Configuração ─────────────────────────────────────────────── */}
        {isAdmin && (
          <TabsContent value="config">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Itens do Checklist</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => seedMut.mutate({ lojaId: lojaId! })} disabled={seedMut.isPending}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Carregar padrão
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowChecklistImport(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Importar Excel
                </Button>
                <Button size="sm" onClick={() => setModalItem({ novo: true, turno: "abertura", categoria: "geral" })}>
                  <Plus className="h-4 w-4 mr-1" /> Novo item
                </Button>
              </div>
            </div>

            {TURNOS.map(({ key, label, icon: Icon, cor }) => {
              const itensTurno = (itensConfigQuery.data ?? []).filter(i => i.turno === key || i.turno === "todos");
              return (
                <div key={key} className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn("h-4 w-4", cor)} />
                    <p className="font-medium text-sm">{label}</p>
                    <Badge variant="secondary" className="text-xs">{itensTurno.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {itensTurno.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2">Nenhum item neste turno.</p>
                    ) : itensTurno.map(item => (
                      <Card key={item.id}>
                        <CardContent className="p-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.titulo}</p>
                            <p className="text-xs text-muted-foreground">{item.categoria}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModalItem(item)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deletarItemMut.mutate({ id: item.id })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        )}
      </Tabs>

      {/* Modal observação */}
      <Dialog open={obsAberta !== null} onOpenChange={(o) => !o && setObsAberta(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Observação</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Descreva o problema encontrado..."
            value={obsTexto}
            onChange={e => setObsTexto(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setObsAberta(null)}>Cancelar</Button>
            <Button onClick={salvarObs}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal importar checklist */}
      <Dialog open={showChecklistImport} onOpenChange={setShowChecklistImport}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
              Importar Checklist por Planilha
            </DialogTitle>
          </DialogHeader>
          {!checklistPreview ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg text-sm space-y-2 bg-muted/50 border">
                <p className="font-medium">Colunas esperadas na planilha:</p>
                <ul className="space-y-1 list-disc list-inside text-xs text-muted-foreground">
                  <li><strong>Turno</strong>: abertura, operacao ou fechamento</li>
                  <li><strong>Titulo</strong>: texto do item (obrigatório)</li>
                  <li><strong>Descricao</strong>: instrução detalhada (opcional)</li>
                  <li><strong>Categoria</strong>: higiene, seguranca, qualidade, financeiro, geral</li>
                  <li><strong>Ordem</strong>: número de ordenação (opcional)</li>
                </ul>
                <Button variant="outline" size="sm" onClick={handleDownloadChecklistTemplate} className="gap-2 mt-2">
                  <FileSpreadsheet className="w-3.5 h-3.5" />Baixar Template Excel
                </Button>
              </div>
              <div className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-emerald-500/50"
                onClick={() => checklistFileRef.current?.click()}>
                <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar o arquivo Excel</p>
                <p className="text-xs mt-1 text-muted-foreground">Formatos aceitos: .xlsx, .xls, .csv</p>
                {checklistImportLoading && <p className="text-xs mt-2 animate-pulse text-emerald-600">Analisando planilha...</p>}
              </div>
              <input ref={checklistFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleChecklistFileUpload} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-700">
                  <strong>{checklistPreview.validCount} itens válidos</strong> encontrados
                  {checklistPreview.errorCount > 0 && <span className="text-red-600 ml-2">· {checklistPreview.errorCount} com erro</span>}
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {["Turno","Título","Categoria","Ordem"].map((h,i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {checklistPreview.rows.filter((r: any) => r.errors.length === 0).slice(0, 20).map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", row.turno === "abertura" ? "bg-amber-100 text-amber-700" : row.turno === "operacao" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700")}>{row.turno}</span>
                        </td>
                        <td className="px-3 py-2 font-medium">{row.titulo}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.categoria}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.ordem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {checklistPreview.validCount > 20 && (
                  <div className="px-3 py-2 text-xs text-center text-muted-foreground">+ {checklistPreview.validCount - 20} itens adicionais</div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setChecklistPreview(null)} className="flex-1">Cancelar</Button>
                <Button
                  onClick={() => importChecklist.mutate({ lojaId: lojaId!, rows: checklistPreview.rows.filter((r: any) => r.errors.length === 0) })}
                  disabled={importChecklist.isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                  {importChecklist.isPending ? "Importando..." : `Importar ${checklistPreview.validCount} itens`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal criar/editar item */}
      <Dialog open={!!modalItem} onOpenChange={(o) => !o && setModalItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modalItem?.novo ? "Novo item" : "Editar item"}</DialogTitle>
          </DialogHeader>
          {modalItem && (
            <ItemForm
              item={modalItem}
              onSave={(data) => {
                if (modalItem.novo) {
                  criarItemMut.mutate({ lojaId, ...data });
                } else {
                  editarItemMut.mutate({ id: modalItem.id, ...data });
                }
              }}
              onCancel={() => setModalItem(null)}
              saving={criarItemMut.isPending || editarItemMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Formulário de item ───────────────────────────────────────────────────────

function ItemForm({ item, onSave, onCancel, saving }: {
  item: any; onSave: (d: any) => void; onCancel: () => void; saving: boolean;
}) {
  const [titulo, setTitulo] = useState(item.titulo ?? "");
  const [descricao, setDescricao] = useState(item.descricao ?? "");
  const [categoria, setCategoria] = useState(item.categoria ?? "geral");
  const [turno, setTurno] = useState<string>(item.turno ?? "abertura");
  const [ordem, setOrdem] = useState<string>(String(item.ordem ?? 0));

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block">Título *</label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Todos com uniforme completo" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Descrição</label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes do que verificar..." rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Categoria</label>
          <Input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Ex: Equipe, Ambiente..." />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Turno</label>
          <Select value={turno} onValueChange={setTurno}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abertura">Abertura</SelectItem>
              <SelectItem value="operacao">Operação</SelectItem>
              <SelectItem value="fechamento">Fechamento</SelectItem>
              <SelectItem value="todos">Todos os turnos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Ordem</label>
        <Input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} min={0} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => onSave({ titulo, descricao: descricao || null, categoria, turno: turno as any, ordem: Number(ordem) })} disabled={!titulo || saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </div>
  );
}
