import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  PlusCircle, Wrench, AlertTriangle, CheckCircle2, Clock,
  DollarSign, ChevronDown, ChevronRight, X, Loader2,
  ShieldCheck, Zap, Calendar, User, Building2, FileText
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TipoManutencao = "preventiva" | "corretiva";
type StatusManutencao = "aberta" | "em_andamento" | "concluida" | "cancelada";
type PrioridadeManutencao = "baixa" | "media" | "alta" | "urgente";

interface ManutencaoForm {
  tipo: TipoManutencao;
  titulo: string;
  descricao: string;
  localEquipamento: string;
  prioridade: PrioridadeManutencao;
  custo: number;
  fornecedor: string;
  dataAbertura: string;
  dataPrevista: string;
}

interface ConcluirForm {
  executadoPor: string;
  descritivoExecucao: string;
  custo: number;
  dataConclusao: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function defaultForm(): ManutencaoForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    tipo: "corretiva",
    titulo: "",
    descricao: "",
    localEquipamento: "",
    prioridade: "media",
    custo: 0,
    fornecedor: "",
    dataAbertura: today,
    dataPrevista: "",
  };
}

function defaultConcluirForm(): ConcluirForm {
  return {
    executadoPor: "",
    descritivoExecucao: "",
    custo: 0,
    dataConclusao: new Date().toISOString().slice(0, 10),
  };
}

const PRIORIDADE_CONFIG: Record<PrioridadeManutencao, { label: string; color: string; icon: React.ElementType }> = {
  urgente: { label: "Urgente", color: "text-rose-600 border-rose-300 bg-rose-50", icon: Zap },
  alta: { label: "Alta", color: "text-orange-600 border-orange-300 bg-orange-50", icon: AlertTriangle },
  media: { label: "Média", color: "text-amber-600 border-amber-300 bg-amber-50", icon: Clock },
  baixa: { label: "Baixa", color: "text-emerald-600 border-emerald-300 bg-emerald-50", icon: CheckCircle2 },
};

const STATUS_CONFIG: Record<StatusManutencao, { label: string; color: string }> = {
  aberta: { label: "Aberta", color: "text-rose-600 border-rose-300 bg-rose-50" },
  em_andamento: { label: "Em andamento", color: "text-amber-600 border-amber-300 bg-amber-50" },
  concluida: { label: "Concluída", color: "text-emerald-600 border-emerald-300 bg-emerald-50" },
  cancelada: { label: "Cancelada", color: "text-muted-foreground border-border bg-muted" },
};

// ─── Card de Manutenção ───────────────────────────────────────────────────────

function ManutencaoCard({
  m,
  onConcluir,
  onUpdateStatus,
  onDelete,
}: {
  m: any;
  onConcluir: (id: number) => void;
  onUpdateStatus: (id: number, status: StatusManutencao) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pConfig = PRIORIDADE_CONFIG[m.prioridade as PrioridadeManutencao];
  const sConfig = STATUS_CONFIG[m.status as StatusManutencao];
  const PIcon = pConfig.icon;

  return (
    <div className="section-card">
      <div className="flex items-start gap-3">
        {/* Tipo ícone */}
        <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${m.tipo === "preventiva" ? "bg-blue-100 text-blue-600" : "bg-rose-100 text-rose-600"}`}>
          {m.tipo === "preventiva" ? <ShieldCheck size={15} /> : <Wrench size={15} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <span className="font-semibold text-sm">{m.titulo}</span>
              {m.localEquipamento && (
                <span className="text-xs text-muted-foreground ml-2">· {m.localEquipamento}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge variant="outline" className={`text-xs ${pConfig.color}`}>
                <PIcon size={10} className="mr-1" />
                {pConfig.label}
              </Badge>
              <Badge variant="outline" className={`text-xs ${sConfig.color}`}>
                {sConfig.label}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              Aberta: {fmtDate(m.dataAbertura)}
            </span>
            {m.dataPrevista && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Prevista: {fmtDate(m.dataPrevista)}
              </span>
            )}
            {m.custo > 0 && (
              <span className="flex items-center gap-1 font-medium text-foreground">
                <DollarSign size={11} />
                {fmt(m.custo)}
              </span>
            )}
          </div>

          {m.descricao && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{m.descricao}</p>
          )}

          {/* Descritivo de execução (se concluída) */}
          {m.status === "concluida" && m.descritivoExecucao && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-2 mb-2">
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-700 mb-1">
                <FileText size={11} />
                Descritivo de execução
              </div>
              <p className="text-xs text-emerald-800">{m.descritivoExecucao}</p>
              {m.executadoPor && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <User size={10} />
                  {m.executadoPor} · {m.dataConclusao ? fmtDate(m.dataConclusao) : ""}
                </p>
              )}
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center gap-2 flex-wrap">
            {m.status === "aberta" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onUpdateStatus(m.id, "em_andamento")}
              >
                Iniciar
              </Button>
            )}
            {(m.status === "aberta" || m.status === "em_andamento") && (
              <Button
                size="sm"
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onConcluir(m.id)}
              >
                <CheckCircle2 size={11} className="mr-1" />
                Concluir
              </Button>
            )}
            {m.status !== "cancelada" && m.status !== "concluida" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => onUpdateStatus(m.id, "cancelada")}
              >
                Cancelar
              </Button>
            )}
            <button
              onClick={() => onDelete(m.id)}
              className="ml-auto text-muted-foreground hover:text-rose-500 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManutencoesPage() {
  const { storeId: storeIdRaw } = useStore();
  const storeId = storeIdRaw ?? 0;

  const [tab, setTab] = useState("abertas");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ManutencaoForm>(defaultForm());
  const [concluirId, setConcluirId] = useState<number | null>(null);
  const [concluirForm, setConcluirForm] = useState<ConcluirForm>(defaultConcluirForm());

  // Queries
  const { data: resumo, refetch: refetchResumo } = trpc.manutencoes.resumo.useQuery(
    { lojaId: storeId }, { enabled: storeId > 0 }
  );
  const { data: abertas, refetch: refetchAbertas } = trpc.manutencoes.list.useQuery(
    { lojaId: storeId, status: "aberta" }, { enabled: storeId > 0 }
  );
  const { data: emAndamento, refetch: refetchEmAndamento } = trpc.manutencoes.list.useQuery(
    { lojaId: storeId, status: "em_andamento" }, { enabled: storeId > 0 }
  );
  const { data: concluidas, refetch: refetchConcluidas } = trpc.manutencoes.list.useQuery(
    { lojaId: storeId, status: "concluida" }, { enabled: storeId > 0 }
  );

  const refetchAll = () => {
    refetchResumo(); refetchAbertas(); refetchEmAndamento(); refetchConcluidas();
  };

  // Mutations
  const createMut = trpc.manutencoes.create.useMutation({
    onSuccess: () => {
      toast.success("Manutenção registrada");
      setShowForm(false);
      setForm(defaultForm());
      refetchAll();
    },
    onError: () => toast.error("Erro ao registrar manutenção"),
  });

  const updateStatusMut = trpc.manutencoes.update.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); refetchAll(); },
  });

  const concluirMut = trpc.manutencoes.concluir.useMutation({
    onSuccess: () => {
      toast.success("Manutenção concluída");
      setConcluirId(null);
      setConcluirForm(defaultConcluirForm());
      refetchAll();
    },
    onError: () => toast.error("Erro ao concluir manutenção"),
  });

  const deleteMut = trpc.manutencoes.delete.useMutation({
    onSuccess: () => { toast.success("Removido"); refetchAll(); },
  });

  const handleCreate = () => {
    if (!form.titulo.trim()) return toast.error("Informe o título da manutenção");
    createMut.mutate({
      lojaId: storeId,
      tipo: form.tipo,
      titulo: form.titulo,
      descricao: form.descricao || null,
      localEquipamento: form.localEquipamento || null,
      prioridade: form.prioridade,
      custo: form.custo,
      fornecedor: form.fornecedor || null,
      dataAbertura: new Date(form.dataAbertura + "T12:00:00").getTime(),
      dataPrevista: form.dataPrevista
        ? new Date(form.dataPrevista + "T12:00:00").getTime()
        : null,
    });
  };

  const handleConcluir = () => {
    if (!concluirId) return;
    if (!concluirForm.executadoPor.trim()) return toast.error("Informe quem executou");
    if (!concluirForm.descritivoExecucao.trim()) return toast.error("Informe o que foi feito");
    concluirMut.mutate({
      id: concluirId,
      lojaId: storeId,
      executadoPor: concluirForm.executadoPor,
      descritivoExecucao: concluirForm.descritivoExecucao,
      custo: concluirForm.custo,
      dataConclusao: new Date(concluirForm.dataConclusao + "T12:00:00").getTime(),
    });
  };

  const abertasCount = (abertas?.length ?? 0) + (emAndamento?.length ?? 0);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold font-display">Manutenções</h1>
          <p className="text-sm text-muted-foreground">Preventivas e corretivas com histórico descritivo</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm">
          <PlusCircle size={14} className="mr-1.5" />
          Nova manutenção
        </Button>
      </div>

      {/* KPIs */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="kpi-card text-center">
            <div className="text-xs text-muted-foreground mb-1">Abertas</div>
            <div className={`font-mono font-bold text-lg ${resumo.totalAberta > 0 ? "text-rose-600" : "text-foreground"}`}>
              {resumo.totalAberta}
            </div>
          </div>
          <div className="kpi-card text-center">
            <div className="text-xs text-muted-foreground mb-1">Em andamento</div>
            <div className={`font-mono font-bold text-lg ${resumo.totalEmAndamento > 0 ? "text-amber-500" : "text-foreground"}`}>
              {resumo.totalEmAndamento}
            </div>
          </div>
          <div className="kpi-card text-center">
            <div className="text-xs text-muted-foreground mb-1">Custo este mês</div>
            <div className="font-mono font-bold text-sm">{fmt(resumo.custoMesAtual)}</div>
          </div>
          <div className="kpi-card text-center">
            <div className="text-xs text-muted-foreground mb-1">Custo total</div>
            <div className="font-mono font-bold text-sm">{fmt(resumo.custoTotal)}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="abertas">
            <AlertTriangle size={13} className="mr-1.5" />
            Abertas
            {abertasCount > 0 && (
              <span className="ml-1.5 bg-rose-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {abertasCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico">
            <CheckCircle2 size={13} className="mr-1.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ── Abertas ──────────────────────────────────────────────────── */}
        <TabsContent value="abertas">
          {abertasCount === 0 ? (
            <div className="section-card text-center py-12 text-muted-foreground">
              <Wrench size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma manutenção aberta</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowForm(true)}>
                <PlusCircle size={13} className="mr-1.5" /> Registrar manutenção
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Em andamento primeiro */}
              {(emAndamento ?? []).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 size={13} className="text-amber-500 animate-spin" />
                    <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Em andamento</span>
                  </div>
                  {(emAndamento ?? []).map((m) => (
                    <ManutencaoCard
                      key={m.id} m={m}
                      onConcluir={(id) => { setConcluirId(id); setConcluirForm(defaultConcluirForm()); }}
                      onUpdateStatus={(id, status) => updateStatusMut.mutate({ id, status })}
                      onDelete={(id) => deleteMut.mutate({ id })}
                    />
                  ))}
                </div>
              )}
              {/* Abertas */}
              {(abertas ?? []).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={13} className="text-rose-500" />
                    <span className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Aguardando início</span>
                  </div>
                  {(abertas ?? []).map((m) => (
                    <ManutencaoCard
                      key={m.id} m={m}
                      onConcluir={(id) => { setConcluirId(id); setConcluirForm(defaultConcluirForm()); }}
                      onUpdateStatus={(id, status) => updateStatusMut.mutate({ id, status })}
                      onDelete={(id) => deleteMut.mutate({ id })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Histórico ────────────────────────────────────────────────── */}
        <TabsContent value="historico">
          {!concluidas?.length ? (
            <div className="section-card text-center py-12 text-muted-foreground">
              <CheckCircle2 size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma manutenção concluída ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {concluidas.map((m) => (
                <ManutencaoCard
                  key={m.id} m={m}
                  onConcluir={(id) => { setConcluirId(id); setConcluirForm(defaultConcluirForm()); }}
                  onUpdateStatus={(id, status) => updateStatusMut.mutate({ id, status })}
                  onDelete={(id) => deleteMut.mutate({ id })}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Modal Nova Manutenção ──────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench size={16} />
              Registrar manutenção
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Tipo */}
            <div>
              <Label className="text-xs mb-1 block">Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["preventiva", "corretiva"] as TipoManutencao[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo: t }))}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                      form.tipo === t
                        ? t === "preventiva"
                          ? "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {t === "preventiva" ? <ShieldCheck size={14} /> : <Wrench size={14} />}
                    <span className="capitalize">{t}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Título */}
            <div>
              <Label className="text-xs mb-1 block">Título *</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Troca de filtro da fritadeira"
                className="h-8 text-sm"
              />
            </div>

            {/* Local/Equipamento */}
            <div>
              <Label className="text-xs mb-1 block">Local / Equipamento</Label>
              <Input
                value={form.localEquipamento}
                onChange={(e) => setForm((f) => ({ ...f, localEquipamento: e.target.value }))}
                placeholder="Ex: Cozinha — Fritadeira 1"
                className="h-8 text-sm"
              />
            </div>

            {/* Descrição */}
            <div>
              <Label className="text-xs mb-1 block">Descrição do problema</Label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Descreva o problema ou o que deve ser feito..."
                className="w-full min-h-[70px] text-sm border border-input rounded-md p-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Prioridade */}
            <div>
              <Label className="text-xs mb-1 block">Prioridade</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["baixa", "media", "alta", "urgente"] as PrioridadeManutencao[]).map((p) => {
                  const cfg = PRIORIDADE_CONFIG[p];
                  const PIcon = cfg.icon;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, prioridade: p }))}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                        form.prioridade === p ? cfg.color : "border-border hover:bg-muted"
                      }`}
                    >
                      <PIcon size={13} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Data de abertura</Label>
                <Input
                  type="date"
                  value={form.dataAbertura}
                  onChange={(e) => setForm((f) => ({ ...f, dataAbertura: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Data prevista</Label>
                <Input
                  type="date"
                  value={form.dataPrevista}
                  onChange={(e) => setForm((f) => ({ ...f, dataPrevista: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Custo e Fornecedor */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Custo estimado (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.custo}
                  onChange={(e) => setForm((f) => ({ ...f, custo: parseFloat(e.target.value) || 0 }))}
                  className="h-8 text-sm text-right font-mono"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Fornecedor / Técnico</Label>
                <Input
                  value={form.fornecedor}
                  onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Nome ou empresa"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <PlusCircle size={14} className="mr-1.5" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Concluir ────────────────────────────────────────────── */}
      <Dialog open={concluirId !== null} onOpenChange={(open) => { if (!open) setConcluirId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Concluir manutenção
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Quem executou *</Label>
              <Input
                value={concluirForm.executadoPor}
                onChange={(e) => setConcluirForm((f) => ({ ...f, executadoPor: e.target.value }))}
                placeholder="Nome do técnico ou empresa"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs mb-1 block">Descritivo do que foi executado *</Label>
              <textarea
                value={concluirForm.descritivoExecucao}
                onChange={(e) => setConcluirForm((f) => ({ ...f, descritivoExecucao: e.target.value }))}
                placeholder="Descreva detalhadamente o que foi feito, peças trocadas, procedimentos realizados..."
                className="w-full min-h-[100px] text-sm border border-input rounded-md p-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Custo final (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={concluirForm.custo}
                  onChange={(e) => setConcluirForm((f) => ({ ...f, custo: parseFloat(e.target.value) || 0 }))}
                  className="h-8 text-sm text-right font-mono"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Data de conclusão</Label>
                <Input
                  type="date"
                  value={concluirForm.dataConclusao}
                  onChange={(e) => setConcluirForm((f) => ({ ...f, dataConclusao: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluirId(null)}>Cancelar</Button>
            <Button
              onClick={handleConcluir}
              disabled={concluirMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {concluirMut.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={14} className="mr-1.5" />}
              Confirmar conclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
