import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Clock, CheckCircle2, AlertTriangle, XCircle, Plus, Pencil,
  ChevronRight, Users, MessageSquare, Lightbulb, Trash2,
  CalendarDays, BarChart3, Settings2, ArrowRight
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AtaEstado = {
  configId: number | null;
  nomeReuniao: string;
  horarioEsperado: string;
  toleranciaMinutos: number;
  estado: "pendente" | "realizado" | "atrasado" | "nao-realizado";
  ata: any | null;
  minutosAtraso: number;
};

type AtaForm = {
  condutorNome: string;
  horarioInicio: string;
  participantesNomes: string;
  motivoAusencia: string;
  assunto: string;
  temReivindicacao: boolean;
  reivindicacao: string;
  reivindicacaoStatus: "nota-pra-depois" | "tratada-na-hora" | "";
  comentarios: string;
};

const emptyForm = (): AtaForm => ({
  condutorNome: "",
  horarioInicio: new Date().toTimeString().slice(0, 5),
  participantesNomes: "",
  motivoAusencia: "",
  assunto: "",
  temReivindicacao: false,
  reivindicacao: "",
  reivindicacaoStatus: "",
  comentarios: "",
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estadoColor(estado: string) {
  if (estado === "realizado") return "var(--verde)";
  if (estado === "atrasado") return "var(--amarelo, #d97706)";
  if (estado === "nao-realizado") return "var(--vinho)";
  return "var(--stone)";
}

function estadoLabel(estado: string) {
  if (estado === "realizado") return "Realizado";
  if (estado === "atrasado") return "Atrasado";
  if (estado === "nao-realizado") return "Não realizado";
  return "Pendente";
}

function estadoIcon(estado: string) {
  if (estado === "realizado") return <CheckCircle2 size={16} />;
  if (estado === "atrasado") return <AlertTriangle size={16} />;
  if (estado === "nao-realizado") return <XCircle size={16} />;
  return <Clock size={16} />;
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAYS_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ─── Sub-aba Hoje ─────────────────────────────────────────────────────────────

function HojeTab({ storeId }: { storeId: number }) {
  const utils = trpc.useUtils();
  const { data: todayData = [], isLoading } = trpc.preturno.atas.today.useQuery({ storeId });
  const { data: sugestoes = [] } = trpc.preturno.sugestoes.useQuery({ storeId });
  const { data: condutores = [] } = trpc.preturno.condutores.list.useQuery({ storeId });
  const { data: temas = [] } = trpc.preturno.temas.list.useQuery({ storeId });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<AtaEstado | null>(null);
  const [viewAtaId, setViewAtaId] = useState<number | null>(null);
  const [form, setForm] = useState<AtaForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [markNotDone, setMarkNotDone] = useState(false);
  const [motivoNaoRealizada, setMotivoNaoRealizada] = useState("");

  const createMutation = trpc.preturno.atas.create.useMutation({
    onSuccess: () => {
      utils.preturno.atas.today.invalidate({ storeId });
      setSheetOpen(false);
      toast.success("Ata registrada com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });
  const createActionMutation = trpc.actions.create.useMutation();

  const updateMutation = trpc.preturno.atas.update.useMutation({
    onSuccess: () => {
      utils.preturno.atas.today.invalidate({ storeId });
      setSheetOpen(false);
      toast.success("Ata atualizada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: viewAta } = trpc.preturno.atas.get.useQuery(
    { id: viewAtaId! },
    { enabled: !!viewAtaId }
  );

  const activeCondutores = condutores.filter(c => c.podeConduzir);

  function openRegister(card: AtaEstado) {
    setSelectedCard(card);
    if (card.ata) {
      setForm({
        condutorNome: card.ata.condutorNome ?? "",
        horarioInicio: card.ata.horarioInicio ?? new Date().toTimeString().slice(0, 5),
        participantesNomes: (card.ata.participantesNomes ?? []).join(", "),
        motivoAusencia: card.ata.motivoAusencia ?? "",
        assunto: card.ata.assunto ?? "",
        temReivindicacao: !!card.ata.reivindicacao,
        reivindicacao: card.ata.reivindicacao ?? "",
        reivindicacaoStatus: card.ata.reivindicacaoStatus ?? "",
        comentarios: card.ata.comentarios ?? "",
      });
    } else {
      setForm(emptyForm());
    }
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!selectedCard) return;
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];
    const participantesNomes = form.participantesNomes
      .split(",").map(s => s.trim()).filter(Boolean);

    const payload = {
      storeId,
      configId: selectedCard.configId,
      nomeReuniao: selectedCard.nomeReuniao,
      data: today,
      horarioEsperado: selectedCard.horarioEsperado,
      horarioInicio: form.horarioInicio || null,
      status: "realizada" as const,
      condutorNome: form.condutorNome || null,
      participantesNomes,
      motivoAusencia: form.motivoAusencia || null,
      assunto: form.assunto || null,
      reivindicacao: form.temReivindicacao ? form.reivindicacao || null : null,
      reivindicacaoStatus: form.temReivindicacao && form.reivindicacaoStatus
        ? (form.reivindicacaoStatus as "nota-pra-depois" | "tratada-na-hora")
        : null,
      comentarios: form.comentarios || null,
      criadoPor: null,
    };

    if (selectedCard.ata) {
      await updateMutation.mutateAsync({ id: selectedCard.ata.id, ...payload });
    } else {
      const ata = await createMutation.mutateAsync(payload);
      // Se reivindicação marcada como "nota-pra-depois", criar ação automática no Plano
      if (
        form.temReivindicacao &&
        form.reivindicacao.trim() &&
        form.reivindicacaoStatus === "nota-pra-depois"
      ) {
        try {
          await createActionMutation.mutateAsync({
            storeId,
            description: `Reivindicação do pré-turno (${selectedCard.nomeReuniao}): ${form.reivindicacao.trim()}`,
            reason: "Reivindicação registrada no pré-turno — pendente de tratamento",
            category: "people",
            isSuggestion: false,
          });
          toast.info("Reivindicação convertida em ação no Plano de Ação.");
        } catch {
          // Non-fatal: ata was saved, just action creation failed
        }
      }
    }
    setSaving(false);
  }

  async function handleMarkNotDone(card: AtaEstado) {
    const today = new Date().toISOString().split("T")[0];
    await createMutation.mutateAsync({
      storeId,
      configId: card.configId,
      nomeReuniao: card.nomeReuniao,
      data: today,
      horarioEsperado: card.horarioEsperado,
      status: "nao-realizada",
      motivoNaoRealizada: motivoNaoRealizada || null,
      criadoPor: null,
    });
    setMarkNotDone(false);
    setMotivoNaoRealizada("");
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
    </div>
  );

  const today = new Date();
  const todayLabel = `${DAYS_FULL[today.getDay()]}, ${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Date header */}
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays size={16} style={{ color: "var(--stone)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--stone)" }}>{todayLabel}</span>
      </div>

      {/* No config state */}
      {todayData.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
          <Clock size={32} className="mx-auto mb-3" style={{ color: "var(--stone)" }} />
          <p className="font-medium mb-1" style={{ color: "var(--ink)" }}>Nenhuma reunião configurada para hoje</p>
          <p className="text-sm mb-4" style={{ color: "var(--stone)" }}>Configure a frequência das reuniões na aba Configurar.</p>
          <Button size="sm" variant="outline" onClick={() => {
            const el = document.querySelector('[data-tab="configurar"]') as HTMLButtonElement;
            el?.click();
          }}>
            Ir para Configurar
          </Button>
        </div>
      )}

      {/* Cards */}
      {todayData.map((card: AtaEstado, i: number) => (
        <div
          key={i}
          className="rounded-xl p-5"
          style={{
            background: "var(--white)",
            border: "1px solid var(--gray-line)",
            borderLeft: `4px solid ${estadoColor(card.estado)}`,
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: estadoColor(card.estado) }}>{estadoIcon(card.estado)}</span>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>{card.nomeReuniao}</span>
                <Badge variant="outline" className="text-xs" style={{ color: estadoColor(card.estado), borderColor: estadoColor(card.estado) }}>
                  {estadoLabel(card.estado)}
                </Badge>
              </div>
              <p className="text-sm" style={{ color: "var(--stone)" }}>
                Esperado até: {card.horarioEsperado}
                {card.estado === "atrasado" && card.minutosAtraso > 0 && (
                  <span className="ml-2 font-medium" style={{ color: "var(--vinho)" }}>
                    · {card.minutosAtraso}min de atraso
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Realizado — show summary */}
          {card.estado === "realizado" && card.ata && (
            <div className="space-y-1 mb-3 text-sm" style={{ color: "var(--stone)" }}>
              {card.ata.condutorNome && <p><span className="font-medium">Conduzido por:</span> {card.ata.condutorNome}</p>}
              {card.ata.participantesNomes?.length > 0 && (
                <p><span className="font-medium">Participaram:</span> {card.ata.participantesNomes.join(", ")}</p>
              )}
              {card.ata.assunto && <p><span className="font-medium">Assunto:</span> {card.ata.assunto}</p>}
              {card.ata.reivindicacao && (
                <p className="flex items-start gap-1">
                  <MessageSquare size={13} className="mt-0.5 flex-shrink-0" style={{ color: "var(--vinho)" }} />
                  <span><span className="font-medium">Reivindicação:</span> {card.ata.reivindicacao}</span>
                </p>
              )}
            </div>
          )}

          {/* Não realizado */}
          {card.estado === "nao-realizado" && card.ata?.motivoNaoRealizada && (
            <p className="text-sm mb-3" style={{ color: "var(--stone)" }}>
              <span className="font-medium">Motivo:</span> {card.ata.motivoNaoRealizada}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {(card.estado === "pendente" || card.estado === "atrasado") && (
              <>
                <Button size="sm" onClick={() => openRegister(card)}>
                  Registrar agora <ArrowRight size={14} className="ml-1" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setSelectedCard(card);
                  setMarkNotDone(true);
                }}>
                  Marcar como não feito
                </Button>
              </>
            )}
            {card.estado === "realizado" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setViewAtaId(card.ata?.id)}>
                  Ver ata completa <ChevronRight size={14} className="ml-1" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openRegister(card)}>
                  <Pencil size={13} className="mr-1" /> Editar
                </Button>
              </>
            )}
            {card.estado === "nao-realizado" && (
              <Button size="sm" variant="outline" onClick={() => openRegister(card)}>
                <Pencil size={13} className="mr-1" /> Editar
              </Button>
            )}
          </div>
        </div>
      ))}

      {/* Sugestões de tema */}
      {sugestoes.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "rgba(113,14,43,0.04)", border: "1px dashed rgba(113,14,43,0.2)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={15} style={{ color: "var(--vinho)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--vinho)" }}>Sugestões para o próximo pré-turno</span>
            <span className="ml-auto text-xs" style={{ color: "var(--stone)" }}>Baseadas nos dados da loja</span>
          </div>
          <div className="space-y-2">
            {sugestoes.map((s: any) => {
              const prioColor = s.prioridade === "alta" ? "var(--red, #dc2626)" : s.prioridade === "media" ? "var(--amber, #d97706)" : "var(--stone)";
              const catIcon: Record<string, string> = { experiencia: "👤", financeiro: "💰", pessoas: "🤝", operacoes: "⚙️", reconhecimento: "⭐" };
              return (
                <div key={s.id} className="rounded-lg p-3" style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">{catIcon[s.categoria] ?? "💡"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{s.titulo}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: `${prioColor}18`, color: prioColor }}>
                          {s.prioridade === "alta" ? "⚠️ Alta" : s.prioridade === "media" ? "▲ Média" : "▼ Baixa"}
                        </span>
                        <span className="ml-auto text-xs" style={{ color: "var(--stone)" }}>{s.motivo}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--stone)" }}>{s.descricao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mark not done dialog */}
      <Dialog open={markNotDone} onOpenChange={setMarkNotDone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como não realizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              placeholder="Ex: equipe reduzida, líder único cobrindo caixa..."
              value={motivoNaoRealizada}
              onChange={e => setMotivoNaoRealizada(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkNotDone(false)}>Cancelar</Button>
            <Button onClick={() => selectedCard && handleMarkNotDone(selectedCard)}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View ata dialog */}
      <Dialog open={!!viewAtaId} onOpenChange={v => !v && setViewAtaId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ata completa</DialogTitle>
          </DialogHeader>
          {viewAta && (
            <div className="space-y-3 text-sm py-2" style={{ color: "var(--ink)" }}>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Reunião</span>{viewAta.nomeReuniao}</div>
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Data</span>{formatDate(viewAta.data)}</div>
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Início</span>{viewAta.horarioInicio ?? "—"}</div>
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Condutor</span>{viewAta.condutorNome ?? "—"}</div>
              </div>
              {(viewAta.participantesNomes ?? []).length > 0 && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Participantes</span>{(viewAta.participantesNomes ?? []).join(", ")}</div>
              )}
              {viewAta.motivoAusencia && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Ausência</span>{viewAta.motivoAusencia}</div>
              )}
              {viewAta.assunto && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Assunto</span>{viewAta.assunto}</div>
              )}
              {viewAta.reivindicacao && (
                <div>
                  <span className="font-medium block" style={{ color: "var(--stone)" }}>Reivindicação</span>
                  {viewAta.reivindicacao}
                  {viewAta.reivindicacaoStatus && (
                    <Badge className="ml-2 text-xs" variant="outline">
                      {viewAta.reivindicacaoStatus === "tratada-na-hora" ? "Tratada na hora" : viewAta.reivindicacaoStatus === "nota-pra-depois" ? "Nota para depois" : "Virou ação"}
                    </Badge>
                  )}
                </div>
              )}
              {viewAta.comentarios && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Comentários</span>{viewAta.comentarios}</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAtaId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{selectedCard?.ata ? "Editar ata" : "Nova ata"} · {selectedCard?.nomeReuniao}</SheetTitle>
          </SheetHeader>

          <div className="space-y-5">
            {/* Sugestões */}
            {sugestoes.length > 0 && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(113,14,43,0.04)", border: "1px dashed rgba(113,14,43,0.2)" }}>
                <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: "var(--vinho)" }}>
                  <Lightbulb size={13} /> Sugestões de assunto
                  <span className="ml-auto font-normal" style={{ color: "var(--stone)" }}>Clique para usar</span>
                </div>
                {sugestoes.map((s: any) => {
                  const prioColor = s.prioridade === "alta" ? "#dc2626" : s.prioridade === "media" ? "#d97706" : "#6b7280";
                  const catIcon: Record<string, string> = { experiencia: "👤", financeiro: "💰", pessoas: "🤝", operacoes: "⚙️", reconhecimento: "⭐" };
                  return (
                    <button
                      key={s.id}
                      className="w-full text-left rounded-lg p-2.5 transition-all hover:shadow-sm"
                      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
                      onClick={() => setForm(f => ({ ...f, assunto: `${s.titulo}: ${s.descricao}` }))}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm">{catIcon[s.categoria] ?? "💡"}</span>
                        <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{s.titulo}</span>
                        <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: `${prioColor}18`, color: prioColor }}>
                          {s.prioridade === "alta" ? "⚠️" : s.prioridade === "media" ? "▲" : "▼"} {s.motivo || (s.prioridade === "alta" ? "Alta" : s.prioridade === "media" ? "Média" : "Baixa")}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--stone)" }}>{s.descricao}</p>
                      <span className="text-xs font-medium" style={{ color: "var(--vinho)" }}>→ usar como assunto</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Condutor */}
            <div className="space-y-1.5">
              <Label>Quem conduziu *</Label>
              {activeCondutores.length > 0 ? (
                <Select value={form.condutorNome} onValueChange={v => setForm(f => ({ ...f, condutorNome: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar condutor" /></SelectTrigger>
                  <SelectContent>
                    {activeCondutores.map(c => (
                      <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nome de quem conduziu"
                  value={form.condutorNome}
                  onChange={e => setForm(f => ({ ...f, condutorNome: e.target.value }))}
                />
              )}
            </div>

            {/* Hora de início */}
            <div className="space-y-1.5">
              <Label>Hora de início</Label>
              <Input
                type="time"
                value={form.horarioInicio}
                onChange={e => setForm(f => ({ ...f, horarioInicio: e.target.value }))}
              />
            </div>

            {/* Participantes */}
            <div className="space-y-1.5">
              <Label>Participantes *</Label>
              <Input
                placeholder="Ex: João, Maria, Carlos (separados por vírgula)"
                value={form.participantesNomes}
                onChange={e => setForm(f => ({ ...f, participantesNomes: e.target.value }))}
              />
            </div>

            {/* Ausência */}
            <div className="space-y-1.5">
              <Label>Ausência / atraso (opcional)</Label>
              <Input
                placeholder="Ex: Pedro chegou 9h05, atraso"
                value={form.motivoAusencia}
                onChange={e => setForm(f => ({ ...f, motivoAusencia: e.target.value }))}
              />
            </div>

            {/* Assunto */}
            <div className="space-y-1.5">
              <Label>Assunto abordado *</Label>
              {temas.length > 0 && (
                <Select value="" onValueChange={v => setForm(f => ({ ...f, assunto: v }))}>
                  <SelectTrigger className="mb-1.5"><SelectValue placeholder="Escolher tema sugerido..." /></SelectTrigger>
                  <SelectContent>
                    {temas.map((t: any) => (
                      <SelectItem key={t.id} value={t.label}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Textarea
                placeholder="Descreva o assunto abordado..."
                value={form.assunto}
                onChange={e => setForm(f => ({ ...f, assunto: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Reivindicação */}
            <div className="space-y-2">
              <Label>Veio reivindicação da equipe?</Label>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={{
                    background: !form.temReivindicacao ? "var(--vinho)" : "transparent",
                    color: !form.temReivindicacao ? "var(--ivory)" : "var(--stone)",
                    borderColor: !form.temReivindicacao ? "var(--vinho)" : "var(--gray-line)",
                  }}
                  onClick={() => setForm(f => ({ ...f, temReivindicacao: false }))}
                >
                  Não
                </button>
                <button
                  className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={{
                    background: form.temReivindicacao ? "var(--vinho)" : "transparent",
                    color: form.temReivindicacao ? "var(--ivory)" : "var(--stone)",
                    borderColor: form.temReivindicacao ? "var(--vinho)" : "var(--gray-line)",
                  }}
                  onClick={() => setForm(f => ({ ...f, temReivindicacao: true }))}
                >
                  Sim
                </button>
              </div>
              {form.temReivindicacao && (
                <div className="space-y-2 mt-2">
                  <Textarea
                    placeholder="Descreva a reivindicação..."
                    value={form.reivindicacao}
                    onChange={e => setForm(f => ({ ...f, reivindicacao: e.target.value }))}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      className="flex-1 py-2 rounded-lg text-xs font-medium border transition-colors"
                      style={{
                        background: form.reivindicacaoStatus === "nota-pra-depois" ? "rgba(113,14,43,0.1)" : "transparent",
                        color: form.reivindicacaoStatus === "nota-pra-depois" ? "var(--vinho)" : "var(--stone)",
                        borderColor: form.reivindicacaoStatus === "nota-pra-depois" ? "var(--vinho)" : "var(--gray-line)",
                      }}
                      onClick={() => setForm(f => ({ ...f, reivindicacaoStatus: "nota-pra-depois" }))}
                    >
                      Nota para depois
                    </button>
                    <button
                      className="flex-1 py-2 rounded-lg text-xs font-medium border transition-colors"
                      style={{
                        background: form.reivindicacaoStatus === "tratada-na-hora" ? "rgba(113,14,43,0.1)" : "transparent",
                        color: form.reivindicacaoStatus === "tratada-na-hora" ? "var(--vinho)" : "var(--stone)",
                        borderColor: form.reivindicacaoStatus === "tratada-na-hora" ? "var(--vinho)" : "var(--gray-line)",
                      }}
                      onClick={() => setForm(f => ({ ...f, reivindicacaoStatus: "tratada-na-hora" }))}
                    >
                      Já tratei na hora
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Comentários */}
            <div className="space-y-1.5">
              <Label>Outros comentários (opcional)</Label>
              <Textarea
                placeholder="Observações gerais sobre a reunião..."
                value={form.comentarios}
                onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Cancelar</Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !form.condutorNome || !form.assunto}
              >
                {saving ? "Salvando..." : "Salvar ata"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Sub-aba Histórico ────────────────────────────────────────────────────────

function HistoricoTab({ storeId }: { storeId: number }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterReiv, setFilterReiv] = useState(false);
  const [viewAtaId, setViewAtaId] = useState<number | null>(null);

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: atas = [], isLoading } = trpc.preturno.atas.history.useQuery({
    storeId,
    startDate,
    endDate,
    status: filterStatus === "all" ? undefined : filterStatus,
    comReivindicacao: filterReiv || undefined,
  });

  const { data: stats } = trpc.preturno.stats.useQuery({ storeId, year, month });
  const { data: viewAta } = trpc.preturno.atas.get.useQuery({ id: viewAtaId! }, { enabled: !!viewAtaId });

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Calendar grid
  const calendarData = useMemo(() => {
    if (!stats?.calendarData) return [];
    return stats.calendarData;
  }, [stats]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  return (
    <div className="space-y-5">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: "var(--stone)" }}>‹</button>
        <span className="font-semibold capitalize" style={{ color: "var(--ink)" }}>{monthLabel}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: "var(--stone)" }}>›</button>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-4 text-center" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
            <div className="text-2xl font-bold mb-0.5" style={{ color: "var(--vinho)" }}>{stats.disciplinaPct}%</div>
            <div className="text-xs" style={{ color: "var(--stone)" }}>Disciplina</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--stone)" }}>{stats.realizadasMes}/{stats.esperadasMes} reuniões</div>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
            <div className="text-2xl font-bold mb-0.5" style={{ color: stats.reivindicacoesAbertas > 0 ? "var(--vinho)" : "var(--ink)" }}>
              {stats.reivindicacoesAbertas}
            </div>
            <div className="text-xs" style={{ color: "var(--stone)" }}>Reivindicações</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--stone)" }}>abertas</div>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
            <div className="text-sm font-bold mb-0.5 truncate" style={{ color: "var(--ink)" }}>
              {stats.quemMaisConduziu?.nome ?? "—"}
            </div>
            <div className="text-xs" style={{ color: "var(--stone)" }}>Mais conduziu</div>
            {stats.quemMaisConduziu && (
              <div className="text-xs mt-0.5" style={{ color: "var(--stone)" }}>{stats.quemMaisConduziu.count}x</div>
            )}
          </div>
        </div>
      )}

      {/* Calendar */}
      {calendarData.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
          <div className="text-xs font-semibold mb-3" style={{ color: "var(--stone)" }}>Calendário do mês</div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS_SHORT.map(d => (
              <div key={d} className="text-center text-xs font-medium" style={{ color: "var(--stone)" }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for first day of month */}
            {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {calendarData.map((cell) => {
              const dayNum = parseInt(cell.date.split("-")[2]);
              const colorMap: Record<string, string> = {
                verde: "#22c55e",
                amarelo: "#d97706",
                vermelho: "#dc2626",
                cinza: "#e5e7eb",
              };
              return (
                <div
                  key={cell.date}
                  className="aspect-square rounded flex items-center justify-center text-xs font-medium cursor-default"
                  style={{
                    background: colorMap[cell.estado] ?? "#e5e7eb",
                    color: cell.estado === "cinza" ? "#9ca3af" : "white",
                    fontSize: 10,
                  }}
                  title={`${cell.date}: ${cell.estado}`}
                >
                  {dayNum}
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 mt-3 flex-wrap">
            {[
              { cor: "#22c55e", label: "Realizado" },
              { cor: "#d97706", label: "Parcial" },
              { cor: "#dc2626", label: "Não realizado" },
              { cor: "#e5e7eb", label: "Sem reunião" },
            ].map(({ cor, label }) => (
              <div key={label} className="flex items-center gap-1 text-xs" style={{ color: "var(--stone)" }}>
                <div className="w-3 h-3 rounded" style={{ background: cor }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="realizada">Realizadas</SelectItem>
            <SelectItem value="nao-realizada">Não realizadas</SelectItem>
          </SelectContent>
        </Select>
        <button
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{
            background: filterReiv ? "var(--vinho)" : "transparent",
            color: filterReiv ? "var(--ivory)" : "var(--stone)",
            borderColor: filterReiv ? "var(--vinho)" : "var(--gray-line)",
          }}
          onClick={() => setFilterReiv(v => !v)}
        >
          Com reivindicação
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
        </div>
      ) : atas.length === 0 ? (
        <div className="text-center py-10" style={{ color: "var(--stone)" }}>
          <CalendarDays size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma ata registrada neste período.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {atas.map((ata: any) => (
            <button
              key={ata.id}
              className="w-full text-left rounded-xl p-4 transition-colors hover:bg-black/5"
              style={{
                background: "var(--white)",
                border: "1px solid var(--gray-line)",
                borderLeft: `4px solid ${ata.status === "realizada" ? "#22c55e" : ata.status === "nao-realizada" ? "#dc2626" : "#d97706"}`,
              }}
              onClick={() => setViewAtaId(ata.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm" style={{ color: "var(--ink)" }}>{ata.nomeReuniao}</span>
                    <span className="text-xs" style={{ color: "var(--stone)" }}>· {formatDate(ata.data)}</span>
                    {ata.reivindicacao && (
                      <Badge variant="outline" className="text-xs" style={{ color: "var(--vinho)", borderColor: "var(--vinho)" }}>
                        Reivindicação
                      </Badge>
                    )}
                  </div>
                  {ata.condutorNome && (
                    <p className="text-xs" style={{ color: "var(--stone)" }}>Condutor: {ata.condutorNome}</p>
                  )}
                  {ata.assunto && (
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--stone)" }}>
                      {ata.assunto.slice(0, 80)}{ata.assunto.length > 80 ? "..." : ""}
                    </p>
                  )}
                  {ata.status === "nao-realizada" && ata.motivoNaoRealizada && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--vinho)" }}>
                      Não realizado: {ata.motivoNaoRealizada}
                    </p>
                  )}
                </div>
                <ChevronRight size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--stone)" }} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* View ata dialog */}
      <Dialog open={!!viewAtaId} onOpenChange={v => !v && setViewAtaId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ata completa</DialogTitle>
          </DialogHeader>
          {viewAta && (
            <div className="space-y-3 text-sm py-2" style={{ color: "var(--ink)" }}>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Reunião</span>{viewAta.nomeReuniao}</div>
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Data</span>{formatDate(viewAta.data)}</div>
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Início</span>{viewAta.horarioInicio ?? "—"}</div>
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Condutor</span>{viewAta.condutorNome ?? "—"}</div>
              </div>
              {(viewAta.participantesNomes ?? []).length > 0 && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Participantes</span>{(viewAta.participantesNomes ?? []).join(", ")}</div>
              )}
              {viewAta.motivoAusencia && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Ausência</span>{viewAta.motivoAusencia}</div>
              )}
              {viewAta.assunto && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Assunto</span>{viewAta.assunto}</div>
              )}
              {viewAta.reivindicacao && (
                <div>
                  <span className="font-medium block" style={{ color: "var(--stone)" }}>Reivindicação</span>
                  {viewAta.reivindicacao}
                  {viewAta.reivindicacaoStatus && (
                    <Badge className="ml-2 text-xs" variant="outline">
                      {viewAta.reivindicacaoStatus === "tratada-na-hora" ? "Tratada na hora" : viewAta.reivindicacaoStatus === "nota-pra-depois" ? "Nota para depois" : "Virou ação"}
                    </Badge>
                  )}
                </div>
              )}
              {viewAta.comentarios && (
                <div><span className="font-medium block" style={{ color: "var(--stone)" }}>Comentários</span>{viewAta.comentarios}</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAtaId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-aba Configurar ───────────────────────────────────────────────────────

function ConfigurarTab({ storeId }: { storeId: number }) {
  const utils = trpc.useUtils();
  const { data: configs = [], isLoading: loadingConfigs } = trpc.preturno.config.list.useQuery({ storeId });
  const { data: temas = [], isLoading: loadingTemas } = trpc.preturno.temas.list.useQuery({ storeId });
  const { data: condutores = [], isLoading: loadingCondutores } = trpc.preturno.condutores.list.useQuery({ storeId });

  // Config form
  const [configDialog, setConfigDialog] = useState(false);
  const [editConfig, setEditConfig] = useState<any>(null);
  const [configForm, setConfigForm] = useState({
    nome: "",
    horarioEsperado: "08:00",
    diasDaSemana: [1, 2, 3, 4, 5, 6] as number[],
    toleranciaMinutos: 60,
  });

  // Tema form
  const [novoTema, setNovoTema] = useState("");

  // Condutor form
  const [condutorDialog, setCondutorDialog] = useState(false);
  const [condutorForm, setCondutorForm] = useState({ id: undefined as number | undefined, nome: "", podeConduzir: true });

  const upsertConfig = trpc.preturno.config.upsert.useMutation({
    onSuccess: () => { utils.preturno.config.list.invalidate({ storeId }); setConfigDialog(false); toast.success("Configuração salva!"); },
    onError: e => toast.error(e.message),
  });
  const deleteConfig = trpc.preturno.config.delete.useMutation({
    onSuccess: () => { utils.preturno.config.list.invalidate({ storeId }); toast.success("Reunião removida."); },
  });
  const createTema = trpc.preturno.temas.create.useMutation({
    onSuccess: () => { utils.preturno.temas.list.invalidate({ storeId }); setNovoTema(""); toast.success("Tema adicionado!"); },
  });
  const deleteTema = trpc.preturno.temas.delete.useMutation({
    onSuccess: () => utils.preturno.temas.list.invalidate({ storeId }),
  });
  const upsertCondutor = trpc.preturno.condutores.upsert.useMutation({
    onSuccess: () => { utils.preturno.condutores.list.invalidate({ storeId }); setCondutorDialog(false); toast.success("Condutor salvo!"); },
  });

  function openNewConfig() {
    setEditConfig(null);
    setConfigForm({ nome: "", horarioEsperado: "08:00", diasDaSemana: [1, 2, 3, 4, 5, 6], toleranciaMinutos: 60 });
    setConfigDialog(true);
  }

  function openEditConfig(c: any) {
    setEditConfig(c);
    setConfigForm({ nome: c.nome, horarioEsperado: c.horarioEsperado, diasDaSemana: c.diasDaSemana, toleranciaMinutos: c.toleranciaMinutos });
    setConfigDialog(true);
  }

  function toggleDia(d: number) {
    setConfigForm(f => ({
      ...f,
      diasDaSemana: f.diasDaSemana.includes(d)
        ? f.diasDaSemana.filter(x => x !== d)
        : [...f.diasDaSemana, d].sort(),
    }));
  }

  function openNewCondutor() {
    setCondutorForm({ id: undefined, nome: "", podeConduzir: true });
    setCondutorDialog(true);
  }

  function openEditCondutor(c: any) {
    setCondutorForm({ id: c.id, nome: c.nome, podeConduzir: c.podeConduzir });
    setCondutorDialog(true);
  }

  return (
    <div className="space-y-8">

      {/* ── Reuniões ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold" style={{ color: "var(--ink)" }}>Reuniões configuradas</h3>
          <Button size="sm" onClick={openNewConfig}>
            <Plus size={14} className="mr-1" /> Nova reunião
          </Button>
        </div>
        {loadingConfigs ? (
          <div className="text-sm" style={{ color: "var(--stone)" }}>Carregando...</div>
        ) : configs.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: "var(--white)", border: "1px dashed var(--gray-line)" }}>
            <Clock size={24} className="mx-auto mb-2 opacity-40" style={{ color: "var(--stone)" }} />
            <p className="text-sm" style={{ color: "var(--stone)" }}>Nenhuma reunião configurada ainda.</p>
            <p className="text-xs mt-1" style={{ color: "var(--stone)" }}>Clique em "Nova reunião" para começar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map((c: any) => (
              <div key={c.id} className="rounded-xl p-4 flex items-start justify-between gap-3" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
                <div>
                  <div className="font-medium text-sm" style={{ color: "var(--ink)" }}>{c.nome}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--stone)" }}>
                    {c.diasDaSemana.map((d: number) => DAYS_SHORT[d]).join(", ")} · {c.horarioEsperado} · tolerância {c.toleranciaMinutos}min
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEditConfig(c)}>
                    <Pencil size={13} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteConfig.mutate({ id: c.id, storeId })}>
                    <Trash2 size={13} style={{ color: "var(--vinho)" }} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Temas sugeridos ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold" style={{ color: "var(--ink)" }}>Temas sugeridos</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Novo tema..."
            value={novoTema}
            onChange={e => setNovoTema(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && novoTema.trim()) createTema.mutate({ storeId, label: novoTema.trim() }); }}
          />
          <Button
            size="sm"
            disabled={!novoTema.trim()}
            onClick={() => createTema.mutate({ storeId, label: novoTema.trim() })}
          >
            <Plus size={14} />
          </Button>
        </div>
        {loadingTemas ? (
          <div className="text-sm" style={{ color: "var(--stone)" }}>Carregando...</div>
        ) : temas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--stone)" }}>Nenhum tema cadastrado.</p>
        ) : (
          <div className="space-y-1.5">
            {temas.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
                <span className="text-sm" style={{ color: "var(--ink)" }}>{t.label}</span>
                <button onClick={() => deleteTema.mutate({ id: t.id, storeId })} className="p-1 rounded hover:bg-black/5 transition-colors">
                  <Trash2 size={13} style={{ color: "var(--stone)" }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Condutores ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold" style={{ color: "var(--ink)" }}>Quem pode conduzir</h3>
          <Button size="sm" onClick={openNewCondutor}>
            <Plus size={14} className="mr-1" /> Adicionar
          </Button>
        </div>
        {loadingCondutores ? (
          <div className="text-sm" style={{ color: "var(--stone)" }}>Carregando...</div>
        ) : condutores.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--stone)" }}>Nenhum condutor cadastrado.</p>
        ) : (
          <div className="space-y-1.5">
            {condutores.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: c.podeConduzir ? "var(--vinho)" : "var(--gray-line)" }}
                  >
                    {c.podeConduzir && <span style={{ color: "white", fontSize: 10 }}>✓</span>}
                  </div>
                  <span className="text-sm" style={{ color: "var(--ink)" }}>{c.nome}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openEditCondutor(c)}>
                  <Pencil size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Config dialog */}
      <Dialog open={configDialog} onOpenChange={setConfigDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editConfig ? "Editar reunião" : "Nova reunião"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome da reunião *</Label>
              <Input
                placeholder="Ex: Pré-turno manhã"
                value={configForm.nome}
                onChange={e => setConfigForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Horário esperado *</Label>
              <Input
                type="time"
                value={configForm.horarioEsperado}
                onChange={e => setConfigForm(f => ({ ...f, horarioEsperado: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dias da semana</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_SHORT.map((d, i) => (
                  <button
                    key={i}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors"
                    style={{
                      background: configForm.diasDaSemana.includes(i) ? "var(--vinho)" : "transparent",
                      color: configForm.diasDaSemana.includes(i) ? "var(--ivory)" : "var(--stone)",
                      borderColor: configForm.diasDaSemana.includes(i) ? "var(--vinho)" : "var(--gray-line)",
                    }}
                    onClick={() => toggleDia(i)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tolerância de atraso (minutos)</Label>
              <Input
                type="number"
                min={0}
                max={480}
                value={configForm.toleranciaMinutos}
                onChange={e => setConfigForm(f => ({ ...f, toleranciaMinutos: parseInt(e.target.value) || 60 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(false)}>Cancelar</Button>
            <Button
              disabled={!configForm.nome || !configForm.horarioEsperado || upsertConfig.isPending}
              onClick={() => upsertConfig.mutate({
                id: editConfig?.id,
                storeId,
                ...configForm,
              })}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Condutor dialog */}
      <Dialog open={condutorDialog} onOpenChange={setCondutorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{condutorForm.id ? "Editar condutor" : "Novo condutor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="Nome do condutor"
                value={condutorForm.nome}
                onChange={e => setCondutorForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                className="w-6 h-6 rounded flex items-center justify-center border-2 transition-colors"
                style={{
                  background: condutorForm.podeConduzir ? "var(--vinho)" : "transparent",
                  borderColor: condutorForm.podeConduzir ? "var(--vinho)" : "var(--gray-line)",
                }}
                onClick={() => setCondutorForm(f => ({ ...f, podeConduzir: !f.podeConduzir }))}
              >
                {condutorForm.podeConduzir && <span style={{ color: "white", fontSize: 12 }}>✓</span>}
              </button>
              <Label>Pode conduzir pré-turno</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCondutorDialog(false)}>Cancelar</Button>
            <Button
              disabled={!condutorForm.nome || upsertCondutor.isPending}
              onClick={() => upsertCondutor.mutate({ ...condutorForm, storeId })}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PreturnoPage() {
  const { storeId } = useStore();

  if (!storeId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: "var(--stone)" }}>Selecione uma loja para continuar.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={20} style={{ color: "var(--vinho)" }} />
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
            Pré-turno
          </h1>
        </div>
        <p className="text-sm" style={{ color: "var(--stone)" }}>
          Registro das reuniões de pré-turno — alinhamento diário com a equipe.
        </p>
      </div>

      <Tabs defaultValue="hoje">
        <TabsList className="mb-6">
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="historico" data-tab="historico">Histórico</TabsTrigger>
          <TabsTrigger value="configurar" data-tab="configurar">Configurar</TabsTrigger>
        </TabsList>

        <TabsContent value="hoje">
          <HojeTab storeId={storeId} />
        </TabsContent>

        <TabsContent value="historico">
          <HistoricoTab storeId={storeId} />
        </TabsContent>

        <TabsContent value="configurar">
          <ConfigurarTab storeId={storeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
