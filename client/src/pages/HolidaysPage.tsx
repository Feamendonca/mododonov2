/**
 * HolidaysPage — Calendário de feriados com multiplicadores de meta
 *
 * Acesso:
 * - Admin: pode carregar feriados nacionais, ver e editar todas as lojas
 * - Gerente/Supervisor: vê e ajusta apenas a sua loja
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Calendar, RefreshCw, Edit2, Check, X, Info } from "lucide-react";

const CURRENT_YEAR = new Date().getFullYear();

const EVENT_TYPE_LABELS: Record<string, string> = {
  feriado: "Feriado",
  vespera: "Véspera",
  ponto_facultativo: "Ponto Facultativo",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  feriado: "#dc2626",
  vespera: "#d97706",
  ponto_facultativo: "#6b7280",
};

const OPERATION_TYPE_LABELS: Record<string, string> = {
  aeroporto: "Aeroporto",
  mall: "Shopping/Mall",
  rua: "Rua/Bairro",
  corporativo: "Centro Corporativo",
  universitario: "Campus Universitário",
};

function MultiplierBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ fontSize: 12, color: "var(--stone)" }}>—</span>;
  const pct = Math.round((value - 1) * 100);
  const color = value === 0 ? "#6b7280" : value < 1 ? "#dc2626" : value > 1 ? "#16a34a" : "var(--stone)";
  const label = value === 0 ? "Fechado" : `${pct >= 0 ? "+" : ""}${pct}%`;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
      background: color + "18", color,
    }}>
      {label} ({value.toFixed(2)}x)
    </span>
  );
}

type Suggestion = {
  date: string;
  eventType: "feriado" | "vespera" | "ponto_facultativo";
  multiplier: number;
  notes: string;
};

type HolidayWithRule = {
  id: number;
  holidayDate: string;
  name: string;
  eventType: "feriado" | "vespera" | "ponto_facultativo";
  scope: string;
  rule: {
    id: number;
    multiplier: number;
    source: "ia" | "manual";
    notes: string | null;
  } | null;
};

export default function HolidaysPage({ storeId }: { storeId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [year, setYear] = useState(CURRENT_YEAR);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; holiday?: HolidayWithRule } | null>(null);
  const [editMultiplier, setEditMultiplier] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: holidays = [], refetch: refetchHolidays, isLoading } = trpc.holidays.listWithRules.useQuery(
    { storeId, startDate, endDate },
    { enabled: !!storeId }
  );

  const seedMut = trpc.holidays.seedNationalHolidays.useMutation({
    onSuccess: (r) => { toast.success(r.message); refetchHolidays(); },
    onError: (e) => toast.error(e.message),
  });

  const suggestMut = trpc.holidays.suggestRules.useMutation({
    onSuccess: (r) => {
      setSuggestions(r.suggestions);
      setShowSuggestions(true);
      toast.success(`${r.suggestions.length} sugestões geradas pela IA para operação ${OPERATION_TYPE_LABELS[r.operationType] ?? r.operationType}.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkSaveMut = trpc.holidays.bulkSaveRules.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.count} regras salvas com sucesso.`);
      setShowSuggestions(false);
      setSuggestions([]);
      refetchHolidays();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveRuleMut = trpc.holidays.saveRule.useMutation({
    onSuccess: () => { toast.success("Regra salva."); setEditModal(null); refetchHolidays(); },
    onError: (e) => toast.error(e.message),
  });

  function openEdit(h: HolidayWithRule) {
    setEditMultiplier(h.rule ? String(h.rule.multiplier) : "1.0");
    setEditNotes(h.rule?.notes ?? "");
    setEditModal({ open: true, holiday: h });
  }

  function handleSaveEdit() {
    if (!editModal?.holiday) return;
    const mult = parseFloat(editMultiplier);
    if (isNaN(mult) || mult < 0 || mult > 2) {
      toast.error("Multiplicador deve ser entre 0 e 2.");
      return;
    }
    saveRuleMut.mutate({
      storeId,
      ruleDate: editModal.holiday.holidayDate,
      eventType: editModal.holiday.eventType,
      multiplier: mult,
      source: "manual",
      notes: editNotes || undefined,
    });
  }

  function handleAcceptSuggestions() {
    bulkSaveMut.mutate({
      storeId,
      rules: suggestions.map(s => ({
        ruleDate: s.date,
        eventType: s.eventType,
        multiplier: s.multiplier,
        source: "ia" as const,
        notes: s.notes,
      })),
    });
  }

  const holidayList = holidays as HolidayWithRule[];
  const withRules = holidayList.filter(h => h.rule !== null).length;
  const withoutRules = holidayList.length - withRules;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-display)" }}>
            Calendário de Feriados<span style={{ color: "var(--vinho)" }}>.</span>
          </h2>
          <p style={{ fontSize: 13, color: "var(--stone)", marginTop: 2 }}>
            Configure multiplicadores de meta para feriados e vésperas. A IA sugere valores base pelo tipo de operação.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-28" style={{ fontSize: 13 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button
              onClick={() => seedMut.mutate({ year })}
              disabled={seedMut.isPending}
              variant="outline"
              style={{ fontSize: 12 }}
            >
              <RefreshCw size={13} className="mr-1" />
              {seedMut.isPending ? "Carregando..." : "Carregar feriados nacionais"}
            </Button>
          )}
          <Button
            onClick={() => suggestMut.mutate({ storeId, year })}
            disabled={suggestMut.isPending || holidayList.length === 0}
            style={{ background: "var(--vinho)", color: "#fff", fontSize: 12 }}
          >
            <Sparkles size={13} className="mr-1" />
            {suggestMut.isPending ? "Gerando sugestões..." : "Sugerir com IA"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {holidayList.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          <div className="kpi-card" style={{ padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
            <Calendar size={16} style={{ color: "var(--vinho)" }} />
            <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>{holidayList.length}</span>
            <span style={{ fontSize: 12, color: "var(--stone)" }}>datas cadastradas</span>
          </div>
          <div className="kpi-card" style={{ padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
            <Check size={16} style={{ color: "#16a34a" }} />
            <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>{withRules}</span>
            <span style={{ fontSize: 12, color: "var(--stone)" }}>com regra configurada</span>
          </div>
          {withoutRules > 0 && (
            <div className="kpi-card" style={{ padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", borderColor: "#fca5a5" }}>
              <X size={16} style={{ color: "#dc2626" }} />
              <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>{withoutRules}</span>
              <span style={{ fontSize: 12, color: "var(--stone)" }}>sem regra (usa peso padrão)</span>
            </div>
          )}
        </div>
      )}

      {/* Painel de sugestões da IA */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="kpi-card space-y-3" style={{ borderColor: "var(--vinho)", borderWidth: 2 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} style={{ color: "var(--vinho)" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                {suggestions.length} sugestões geradas pela IA
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowSuggestions(false)} style={{ fontSize: 12 }}>
                Revisar depois
              </Button>
              <Button
                onClick={handleAcceptSuggestions}
                disabled={bulkSaveMut.isPending}
                style={{ background: "var(--vinho)", color: "#fff", fontSize: 12 }}
              >
                {bulkSaveMut.isPending ? "Salvando..." : "Aceitar todas as sugestões"}
              </Button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--stone)" }}>
            Revise abaixo e aceite todas, ou feche para ajustar individualmente depois.
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {suggestions.map(s => (
              <div key={s.date} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "var(--silk)" }}>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--stone)" }}>{s.date}</span>
                  <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>
                    {EVENT_TYPE_LABELS[s.eventType]}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--stone)" }}>{s.notes}</span>
                </div>
                <MultiplierBadge value={s.multiplier} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de feriados */}
      {isLoading ? (
        <div className="empty-state"><Calendar size={32} style={{ color: "var(--stone)", marginBottom: 8 }} /><p style={{ color: "var(--stone)" }}>Carregando...</p></div>
      ) : holidayList.length === 0 ? (
        <div className="empty-state">
          <Calendar size={32} style={{ color: "var(--stone)", marginBottom: 8 }} />
          <p style={{ color: "var(--stone)", fontWeight: 500 }}>Nenhum feriado cadastrado para {year}.</p>
          {isAdmin && (
            <Button onClick={() => seedMut.mutate({ year })} disabled={seedMut.isPending} style={{ marginTop: 12, background: "var(--vinho)", color: "#fff", fontSize: 13 }}>
              <RefreshCw size={13} className="mr-1" />
              Carregar feriados nacionais de {year}
            </Button>
          )}
          {!isAdmin && (
            <p style={{ fontSize: 12, color: "var(--stone)", marginTop: 8 }}>Solicite ao administrador que carregue os feriados nacionais.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Agrupa por mês */}
          {Array.from(new Set(holidayList.map(h => h.holidayDate.slice(0, 7)))).map(month => {
            const monthHolidays = holidayList.filter(h => h.holidayDate.startsWith(month));
            const [y, m] = month.split("-");
            const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString("pt-BR", { month: "long" });
            return (
              <div key={month} className="kpi-card space-y-2">
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {monthName} {y}
                </h3>
                {monthHolidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--silk)" }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--stone)", minWidth: 80 }}>
                        {new Date(h.holidayDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{h.name}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 10,
                        background: EVENT_TYPE_COLORS[h.eventType] + "18",
                        color: EVENT_TYPE_COLORS[h.eventType],
                      }}>
                        {EVENT_TYPE_LABELS[h.eventType]}
                      </span>
                      {h.rule?.source === "ia" && (
                        <Badge variant="secondary" style={{ fontSize: 10, padding: "1px 6px" }}>
                          <Sparkles size={9} className="mr-1" />IA
                        </Badge>
                      )}
                      {h.rule?.source === "manual" && (
                        <Badge variant="secondary" style={{ fontSize: 10, padding: "1px 6px", background: "#e0f2fe", color: "#0369a1" }}>
                          Manual
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <MultiplierBadge value={h.rule ? h.rule.multiplier : null} />
                      <button
                        onClick={() => openEdit(h)}
                        className="flex items-center gap-1 px-2 py-1 rounded"
                        style={{ fontSize: 11, color: "var(--stone)", cursor: "pointer" }}
                      >
                        <Edit2 size={12} /> Ajustar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <div className="kpi-card" style={{ background: "var(--silk)", padding: "12px 16px" }}>
        <div className="flex items-start gap-2">
          <Info size={14} style={{ color: "var(--stone)", marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: "var(--stone)", lineHeight: 1.6 }}>
            <strong>Como funciona:</strong> O multiplicador ajusta a meta diária de faturamento para datas especiais.
            {" "}<strong>1.0x</strong> = meta normal. <strong>0.6x</strong> = 40% abaixo (ex: feriado em aeroporto).
            {" "}<strong>1.3x</strong> = 30% acima (ex: véspera de feriado em aeroporto). <strong>0.0x</strong> = loja fechada.
            As metas são recalculadas automaticamente ao aprovar o orçamento.
          </div>
        </div>
      </div>

      {/* Modal de edição */}
      {editModal?.open && editModal.holiday && (
        <Dialog open onOpenChange={() => setEditModal(null)}>
          <DialogContent style={{ maxWidth: 420 }}>
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                Ajustar multiplicador
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg" style={{ background: "var(--silk)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{editModal.holiday.name}</div>
                <div style={{ fontSize: 12, color: "var(--stone)" }}>
                  {new Date(editModal.holiday.holidayDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  {" · "}{EVENT_TYPE_LABELS[editModal.holiday.eventType]}
                </div>
              </div>
              <div>
                <Label style={{ fontSize: 12 }}>Multiplicador de meta (0 = fechado, 1 = normal, 1.3 = 30% acima)</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="2"
                  value={editMultiplier}
                  onChange={e => setEditMultiplier(e.target.value)}
                  className="mt-1 h-9"
                  style={{ fontSize: 14 }}
                />
                {editMultiplier && !isNaN(parseFloat(editMultiplier)) && (
                  <div className="mt-1">
                    <MultiplierBadge value={parseFloat(editMultiplier)} />
                  </div>
                )}
              </div>
              <div>
                <Label style={{ fontSize: 12 }}>Observação (opcional)</Label>
                <Input
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Ex: Loja fecha às 14h neste feriado"
                  className="mt-1 h-9"
                  style={{ fontSize: 13 }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditModal(null)}>Cancelar</Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saveRuleMut.isPending}
                style={{ background: "var(--vinho)", color: "#fff" }}
              >
                {saveRuleMut.isPending ? "Salvando..." : "Salvar ajuste"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
