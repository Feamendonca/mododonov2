import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Plus, Settings, TrendingUp, TrendingDown, AlertTriangle,
  ChevronLeft, ChevronRight, Copy, Trash2, Edit2, UserPlus,
  UserMinus, ArrowRight, BarChart3, Flame, Clock, DollarSign,
  CheckCircle2, Info, Lightbulb, Calendar, Printer, X,
  FileDown, Image as ImageIcon,
} from "lucide-react";
import { ClipboardPaste } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_NAMES_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const STATUS_LABELS: Record<string, string> = { active: "Ativo", probation: "Experiência", inactive: "Desligado" };
const MOVEMENT_LABELS: Record<string, string> = {
  hire: "Contratação", termination: "Desligamento",
  role_change: "Mudança de Cargo", salary_change: "Mudança de Salário"
};
const MOVEMENT_COLORS: Record<string, string> = {
  hire: "text-green-600", termination: "text-red-600",
  role_change: "text-blue-600", salary_change: "text-amber-600"
};

function getWeekDates(baseDate: Date): string[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd.toISOString().split("T")[0];
  });
}

function fmt(d: Date) { return d.toISOString().split("T")[0]; }

function fmtCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function calcMonthlyCost(emp: any, chargesPercent: number) {
  return emp.salaryBase * (1 + chargesPercent / 100) + emp.transportAllowance + emp.mealAllowance + emp.otherBenefits;
}

function calcHourlyRate(emp: any, chargesPercent: number) {
  return emp.hoursPerMonth > 0 ? calcMonthlyCost(emp, chargesPercent) / emp.hoursPerMonth : 0;
}

// ─── Sub-tab: Mapa de Calor ───────────────────────────────────────────────────

function MapaCalor({ storeId, config }: { storeId: number; config: any }) {
  const [selectedDate, setSelectedDate] = useState(fmt(new Date(Date.now() - 86400000)));
  const [showRevModal, setShowRevModal] = useState(false);
  const [revEntries, setRevEntries] = useState<Record<number, string>>({});

  const [showPdvModal, setShowPdvModal] = useState(false);
  const [pdvText, setPdvText] = useState("");
  const [showEstimarModal, setShowEstimarModal] = useState(false);
  const [estimarTotal, setEstimarTotal] = useState("");

  const { data: heatmap, refetch } = trpc.pessoas.getHeatmap.useQuery({ storeId, date: selectedDate });
  const { data: hourlyRev } = trpc.pessoas.getHourlyRevenue.useQuery({ storeId, date: selectedDate });
  const saveRevMut = trpc.pessoas.saveHourlyRevenue.useMutation({
    onSuccess: () => { toast.success("Receita salva!"); setShowRevModal(false); refetch(); },
  });
  const estimarMut = trpc.pessoas.estimarPorCurva.useMutation({
    onSuccess: (data) => {
      // Preencher a grade com os valores estimados para edição
      const init: Record<number, string> = {};
      data.entries.forEach((e: any) => { init[e.hour] = String(e.revenue); });
      setRevEntries(init);
      setShowEstimarModal(false);
      setShowRevModal(true);
      toast.success("Grade preenchida com estimativa — revise e salve!");
    },
  });
  const parsePdvMut = trpc.pessoas.parsePdvPaste.useMutation({
    onSuccess: (data) => {
      if (data.saved === 0) { toast.error("Nenhuma linha reconhecida. Verifique o formato."); return; }
      // Preencher a grade com os valores do PDV para edição
      const init: Record<number, string> = {};
      data.entries.forEach((e: any) => { init[e.hour] = String(e.revenue); });
      setRevEntries(init);
      setShowPdvModal(false);
      setShowRevModal(true);
      toast.success(`${data.saved} hora(s) importadas do PDV — revise e salve!`);
    },
  });
  const copyDayMut = trpc.pessoas.copyDayToWeek.useMutation({
    onSuccess: (data) => { toast.success(`Padrão copiado para ${data.copied} dia(s)!`); refetch(); },
  });

  const productivityTarget = config?.productivityTarget ?? 200;
  const totalRevenue = heatmap?.reduce((s, h) => s + h.revenue, 0) ?? 0;
  const totalPersonHours = heatmap?.reduce((s, h) => s + h.personCount, 0) ?? 0;
  const starHour = heatmap?.reduce((best, h) => h.productivity > (best?.productivity ?? 0) ? h : best, null as any);
  const deadHour = heatmap?.filter(h => h.status === "red" && h.personCount > 0)
    .reduce((worst, h) => h.productivity < (worst?.productivity ?? Infinity) ? h : worst, null as any);
  const deadHoursCount = heatmap?.filter(h => h.status === "red" && h.personCount > 0).length ?? 0;

  function openRevModal() {
    const init: Record<number, string> = {};
    (hourlyRev ?? []).forEach(r => { init[r.hour] = String(r.revenue); });
    setRevEntries(init);
    setShowRevModal(true);
  }

  function saveRevenue() {
    const entries = Object.entries(revEntries)
      .map(([h, v]) => ({ hour: Number(h), revenue: Number(v) || 0 }))
      // Não filtrar zeros: R$ 0 deve sobrescrever valor anterior via upsert (UNIQUE storeId+revenueDate+hour)
    saveRevMut.mutate({ storeId, date: selectedDate, entries });
  }

  const startH = config?.operationStartHour ?? 8;
  const endH = config?.operationEndHour ?? 23;
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);

  const statusColor: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-400",
    red: "bg-red-500",
    idle: "bg-stone-200",
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(fmt(d));
          }}><ChevronLeft className="w-4 h-4" /></Button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="border border-border rounded-md px-3 py-1.5 text-sm bg-background" />
          <Button variant="outline" size="sm" onClick={() => {
            const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(fmt(d));
          }}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowEstimarModal(true)}>
            <TrendingUp className="w-4 h-4 mr-1" /> Estimar por Curva
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setPdvText(""); setShowPdvModal(true); }}>
            <ClipboardPaste className="w-4 h-4 mr-1" /> Colar do PDV
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            // Copiar o dia selecionado para os outros 6 dias da semana
            const d = new Date(selectedDate);
            const dow = d.getDay();
            const targets: string[] = [];
            for (let i = 0; i < 7; i++) {
              if (i === dow) continue;
              const nd = new Date(d);
              nd.setDate(d.getDate() - dow + i);
              targets.push(nd.toISOString().split("T")[0]);
            }
            if (targets.length === 0) { toast.error("Nenhum dia alvo"); return; }
            copyDayMut.mutate({ storeId, sourceDate: selectedDate, targetDates: targets });
          }} disabled={copyDayMut.isPending}>
            <Copy className="w-4 h-4 mr-1" /> Repetir na semana
          </Button>
          <Button variant="outline" size="sm" onClick={openRevModal}>
            <DollarSign className="w-4 h-4 mr-1" /> Lançar Manual
          </Button>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wider">
          Produtividade R$/h-pessoa · {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </h3>
        <div className="flex gap-1 items-end">
          {(heatmap ?? hours.map(h => ({ hour: h, revenue: 0, personCount: 0, productivity: 0, status: "idle" as const }))).map(h => (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className={`w-full rounded-t transition-all ${statusColor[h.status]} cursor-pointer`}
                style={{ height: `${Math.max(20, Math.min(80, (h.productivity / productivityTarget) * 60))}px` }}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg p-2 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-md">
                  <div className="font-semibold">{h.hour}h–{h.hour + 1}h</div>
                  <div>Receita: {fmtCurrency(h.revenue)}</div>
                  <div>Pessoas: {h.personCount}</div>
                  <div>Produtividade: {fmtCurrency(h.productivity)}/h-pessoa</div>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">{h.hour}h</span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Acima da meta</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Em torno da meta</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Abaixo da meta</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-stone-200 inline-block" /> Sem dados</span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Receita do dia", value: fmtCurrency(totalRevenue), icon: DollarSign, color: "text-emerald-600" },
          { label: "Hora estrela", value: starHour ? `${starHour.hour}h · ${fmtCurrency(starHour.productivity)}/h-p` : "—", icon: Flame, color: "text-amber-500" },
          { label: "Hora morta", value: deadHour ? `${deadHour.hour}h · ${fmtCurrency(deadHour.productivity)}/h-p` : "—", icon: TrendingDown, color: "text-red-500" },
          { label: "Horas no vermelho", value: `${deadHoursCount}h`, icon: AlertTriangle, color: deadHoursCount > 2 ? "text-red-600" : "text-muted-foreground" },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <div className="text-lg font-semibold font-mono">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Modal: Estimar por Curva */}
      <Dialog open={showEstimarModal} onOpenChange={setShowEstimarModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Estimar Receita por Curva</DialogTitle>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
              ⚠️ Estimativa para análise de staffing — não substitui a venda real do dia.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Receita total do dia (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 8500"
                value={estimarTotal}
                onChange={e => setEstimarTotal(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                O sistema distribui pela curva-padrão (picos almoço/jantar). Você pode editar antes de salvar.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEstimarModal(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const total = Number(estimarTotal);
                if (!total || total <= 0) { toast.error("Informe a receita total"); return; }
                estimarMut.mutate({ storeId, date: selectedDate, totalRevenue: total });
              }}
              disabled={estimarMut.isPending}
            >
              {estimarMut.isPending ? "Estimando..." : "Preencher grade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Colar do PDV */}
      <Dialog open={showPdvModal} onOpenChange={setShowPdvModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Colar Receita do PDV</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Cole as linhas do relatório do PDV/ERP. Formatos aceitos:<br />
              <code className="bg-muted px-1 rounded text-[11px]">12:00;350</code>{" "}
              <code className="bg-muted px-1 rounded text-[11px]">12h 350</code>{" "}
              <code className="bg-muted px-1 rounded text-[11px]">12:00;R$ 1.250,50</code>
            </p>
          </DialogHeader>
          <Textarea
            placeholder={"08:00;420\n09:00;380\n10:00;510\n..."}
            value={pdvText}
            onChange={e => setPdvText(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPdvModal(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!pdvText.trim()) { toast.error("Cole o texto do PDV"); return; }
                parsePdvMut.mutate({ storeId, date: selectedDate, pasteText: pdvText });
              }}
              disabled={parsePdvMut.isPending}
            >
              {parsePdvMut.isPending ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revenue modal */}
      <Dialog open={showRevModal} onOpenChange={setShowRevModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar Receita por Hora</DialogTitle>
            <p className="text-sm text-muted-foreground">{new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {hours.map(h => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-sm font-mono w-10 text-muted-foreground">{h}h</span>
                <Input
                  type="number"
                  placeholder="R$ 0"
                  value={revEntries[h] ?? ""}
                  onChange={e => setRevEntries(prev => ({ ...prev, [h]: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevModal(false)}>Cancelar</Button>
            <Button onClick={saveRevenue} disabled={saveRevMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-tab: Quadro ──────────────────────────────────────────────────────────

function Quadro({ storeId, config }: { storeId: number; config: any }) {
  const chargesPercent = config?.chargesPercent ?? 70;
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", role: "", salaryBase: "", transportAllowance: "0",
    mealAllowance: "0", otherBenefits: "0", hoursPerMonth: "220",
    hireDate: fmt(new Date()), status: "active" as const,
  });

  const utils = trpc.useUtils();
  const { data: employees } = trpc.pessoas.getEmployees.useQuery({ storeId });
  const createMut = trpc.pessoas.createEmployee.useMutation({
    onSuccess: () => { toast.success("Funcionário cadastrado!"); utils.pessoas.getEmployees.invalidate(); setShowModal(false); resetForm(); },
  });
  const updateMut = trpc.pessoas.updateEmployee.useMutation({
    onSuccess: () => { toast.success("Atualizado!"); utils.pessoas.getEmployees.invalidate(); setShowModal(false); },
  });
  const deleteMut = trpc.pessoas.deleteEmployee.useMutation({
    onSuccess: () => { toast.success("Funcionário desligado."); utils.pessoas.getEmployees.invalidate(); },
  });

  function resetForm() {
    setForm({ name: "", role: "", salaryBase: "", transportAllowance: "0", mealAllowance: "0", otherBenefits: "0", hoursPerMonth: "220", hireDate: fmt(new Date()), status: "active" });
    setEditing(null);
  }

  function openEdit(emp: any) {
    setEditing(emp);
    setForm({
      name: emp.name, role: emp.role,
      salaryBase: String(emp.salaryBase),
      transportAllowance: String(emp.transportAllowance),
      mealAllowance: String(emp.mealAllowance),
      otherBenefits: String(emp.otherBenefits),
      hoursPerMonth: String(emp.hoursPerMonth),
      hireDate: emp.hireDate?.split("T")[0] ?? fmt(new Date()),
      status: emp.status,
    });
    setShowModal(true);
  }

  function submit() {
    const data = {
      name: form.name, role: form.role,
      salaryBase: Number(form.salaryBase),
      transportAllowance: Number(form.transportAllowance),
      mealAllowance: Number(form.mealAllowance),
      otherBenefits: Number(form.otherBenefits),
      hoursPerMonth: Number(form.hoursPerMonth),
      hireDate: form.hireDate, status: form.status,
    };
    if (editing) updateMut.mutate({ id: editing.id, storeId, ...data });
    else createMut.mutate({ storeId, ...data });
  }

  const active = (employees ?? []).filter(e => e.status !== "inactive");
  const totalPayroll = active.reduce((s, e) => s + calcMonthlyCost(e, chargesPercent), 0);
  const budgetedPayroll = config?.payrollTargetPercent ? 0 : 0; // placeholder

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Quadro ativo", value: `${active.length} pessoas`, icon: Users },
          { label: "Folha estimada", value: fmtCurrency(totalPayroll), icon: DollarSign },
          { label: "Encargos aplicados", value: `${chargesPercent}%`, icon: TrendingUp },
          { label: "Custo médio/hora", value: active.length > 0 ? fmtCurrency(active.reduce((s, e) => s + calcHourlyRate(e, chargesPercent), 0) / active.length) : "—", icon: Clock },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <div className="text-xl font-semibold font-mono">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Equipe</h3>
          <Button size="sm" onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Nome", "Cargo", "Status", "Salário Base", "Custo Total/mês", "Custo/hora", "Admissão", ""].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(employees ?? []).map(emp => {
                const monthly = calcMonthlyCost(emp, chargesPercent);
                const hourly = calcHourlyRate(emp, chargesPercent);
                return (
                  <tr key={emp.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{emp.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.role}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        emp.status === "active" ? "border-emerald-300 text-emerald-700" :
                        emp.status === "probation" ? "border-amber-300 text-amber-700" :
                        "border-stone-300 text-stone-500"
                      }>{STATUS_LABELS[emp.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono">{fmtCurrency(emp.salaryBase)}</td>
                    <td className="px-4 py-3 font-mono font-semibold">{fmtCurrency(monthly)}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{fmtCurrency(hourly)}/h</td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.hireDate ? new Date(emp.hireDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(emp)}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Desligar ${emp.name}?`)) deleteMut.mutate({ id: emp.id, storeId }); }}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(employees ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhum funcionário cadastrado. Clique em "Adicionar" para começar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={v => { setShowModal(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome completo</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome do funcionário" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Cargo</label>
              <Input value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Ex: Cozinheiro, Garçom" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="probation">Experiência</SelectItem>
                  <SelectItem value="inactive">Desligado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Salário base (R$)</label>
              <Input type="number" value={form.salaryBase} onChange={e => setForm(p => ({ ...p, salaryBase: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Horas/mês</label>
              <Input type="number" value={form.hoursPerMonth} onChange={e => setForm(p => ({ ...p, hoursPerMonth: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Vale transporte (R$)</label>
              <Input type="number" value={form.transportAllowance} onChange={e => setForm(p => ({ ...p, transportAllowance: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Vale refeição (R$)</label>
              <Input type="number" value={form.mealAllowance} onChange={e => setForm(p => ({ ...p, mealAllowance: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Outros benefícios (R$)</label>
              <Input type="number" value={form.otherBenefits} onChange={e => setForm(p => ({ ...p, otherBenefits: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data de admissão</label>
              <Input type="date" value={form.hireDate} onChange={e => setForm(p => ({ ...p, hireDate: e.target.value }))} />
            </div>
          </div>
          {form.salaryBase && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">Custo total estimado: </span>
              <span className="font-semibold font-mono">
                {fmtCurrency(Number(form.salaryBase) * (1 + chargesPercent / 100) + Number(form.transportAllowance) + Number(form.mealAllowance) + Number(form.otherBenefits))}/mês
              </span>
              <span className="text-muted-foreground ml-2 text-xs">(inclui {chargesPercent}% encargos)</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={submit} disabled={!form.name || !form.role || !form.salaryBase || createMut.isPending || updateMut.isPending}>
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-tab: Escala ──────────────────────────────────────────────────────────

// ─── Configuração de Blocos de Turno ─────────────────────────────────────────
function ConfigurarTurnos({ storeId, onClose }: { storeId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: blocks } = trpc.pessoas.getShiftBlocks.useQuery({ storeId });
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", startMinute: 480, endMinute: 960 }); // 08:00–16:00

  const createMut = trpc.pessoas.createShiftBlock.useMutation({
    onSuccess: () => { utils.pessoas.getShiftBlocks.invalidate(); setShowForm(false); setForm({ name: "", startMinute: 480, endMinute: 960 }); toast.success("Turno criado!"); },
  });
  const updateMut = trpc.pessoas.updateShiftBlock.useMutation({
    onSuccess: () => { utils.pessoas.getShiftBlocks.invalidate(); setEditingBlock(null); setShowForm(false); toast.success("Turno atualizado!"); },
  });
  const deleteMut = trpc.pessoas.deleteShiftBlock.useMutation({
    onSuccess: () => { utils.pessoas.getShiftBlocks.invalidate(); toast.success("Turno removido!"); },
  });

  function openEdit(block: any) {
    setEditingBlock(block);
    // Preferir startMinute/endMinute se disponíveis (novos blocos), senão converter de startHour
    const sm = block.startMinute ?? block.startHour * 60;
    const em = block.endMinute ?? block.endHour * 60;
    setForm({ name: block.name, startMinute: sm, endMinute: em });
    setShowForm(true);
  }

  function saveBlock() {
    if (!form.name.trim()) { toast.error("Informe o nome do turno"); return; }
    // Calcular duração (suporta virada de meia-noite: endMinute <= startMinute)
    const endM = form.endMinute <= form.startMinute ? form.endMinute + 1440 : form.endMinute;
    const durMin = endM - form.startMinute;
    if (durMin < 30) { toast.error("Duração mínima do turno: 30 minutos"); return; }
    const startHour = Math.floor(form.startMinute / 60);
    const endHour = Math.ceil((form.endMinute <= form.startMinute ? form.endMinute + 1440 : form.endMinute) / 60) % 25;
    if (editingBlock) {
      updateMut.mutate({ id: editingBlock.id, storeId, name: form.name, startHour, endHour, startMinute: form.startMinute, endMinute: form.endMinute });
    } else {
      createMut.mutate({ storeId, name: form.name, startHour, endHour, startMinute: form.startMinute, endMinute: form.endMinute });
    }
  }

  // Opções de horário: de 30 em 30 minutos (0..1410 minutos desde meia-noite)
  const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);
  const fmtTime = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Configurar Blocos de Turno</h3>
          <p className="text-sm text-muted-foreground">Defina os turnos de trabalho da sua loja (ex: Abertura, Almoço, Fechamento)</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      <div className="space-y-2">
        {(blocks ?? []).length === 0 && !showForm && (
          <div className="bg-muted/30 rounded-xl p-6 text-center text-muted-foreground text-sm">
            Nenhum turno cadastrado ainda. Clique em "Novo turno" para começar.
          </div>
        )}
        {(blocks ?? []).map(block => (
          <div key={block.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <div>
              <span className="font-medium text-sm">{block.name}</span>
              <span className="ml-3 text-xs text-muted-foreground font-mono">
                {block.startMinute != null ? fmtTime(block.startMinute) : `${block.startHour}:00`}–{block.endMinute != null ? fmtTime(block.endMinute) : `${block.endHour}:00`}
                {" "}({block.startMinute != null
                  ? (() => { const em = block.endMinute <= block.startMinute ? block.endMinute + 1440 : block.endMinute; const d = (em - block.startMinute) / 60; return d % 1 === 0 ? `${d}h` : `${d.toFixed(1)}h`; })()
                  : `${block.endHour - block.startHour}h`})
              </span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(block)}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => { if (confirm(`Remover o turno "${block.name}"? As escalas vinculadas a ele também serão removidas.`)) deleteMut.mutate({ id: block.id, storeId }); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
          <h4 className="text-sm font-medium">{editingBlock ? "Editar turno" : "Novo turno"}</h4>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Nome do turno</label>
            <Input
              placeholder="Ex: Abertura, Almoço, Fechamento..."
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") saveBlock(); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Início</label>
              <Select value={String(form.startMinute)} onValueChange={v => setForm(p => ({ ...p, startMinute: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder={fmtTime(form.startMinute)} /></SelectTrigger>
                <SelectContent>{TIME_OPTIONS.map(m => <SelectItem key={m} value={String(m)}>{fmtTime(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Fim</label>
              <Select value={String(form.endMinute)} onValueChange={v => setForm(p => ({ ...p, endMinute: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder={fmtTime(form.endMinute)} /></SelectTrigger>
                <SelectContent>{TIME_OPTIONS.map(m => <SelectItem key={m} value={String(m)}>{fmtTime(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={saveBlock} disabled={createMut.isPending || updateMut.isPending}>
              {editingBlock ? "Salvar" : "Criar turno"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingBlock(null); setForm({ name: "", startMinute: 480, endMinute: 960 }); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => { setEditingBlock(null); setForm({ name: "", startMinute: 480, endMinute: 960 }); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Novo turno
        </Button>
      )}
    </div>
  );
}

function Escala({ storeId, config }: { storeId: number; config: any }) {
  const [weekBase, setWeekBase] = useState(() => new Date());
  const [editingCell, setEditingCell] = useState<{ blockId: number; date: string } | null>(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>([]);
  const [showConfig, setShowConfig] = useState(false);

  const weekDates = useMemo(() => getWeekDates(weekBase), [weekBase]);
  const startDate = weekDates[0];
  const endDate = weekDates[6];

  const utils = trpc.useUtils();
  const { data: blocks } = trpc.pessoas.getShiftBlocks.useQuery({ storeId });
  const { data: employees } = trpc.pessoas.getEmployees.useQuery({ storeId });
  const { data: scheduleEntries } = trpc.pessoas.getScheduleForWeek.useQuery({ storeId, startDate, endDate });

  const setScheduleMut = trpc.pessoas.setScheduleForBlock.useMutation({
    onSuccess: () => { utils.pessoas.getScheduleForWeek.invalidate(); setEditingCell(null); toast.success("Escala salva!"); },
  });
  const copyWeekMut = trpc.pessoas.copyFromPreviousWeek.useMutation({
    onSuccess: (data) => { utils.pessoas.getScheduleForWeek.invalidate(); toast.success(`${data.copied} escalas copiadas da semana anterior!`); },
  });

  // Build schedule map: date -> blockId -> employeeIds
  const schedMap = useMemo(() => {
    const m = new Map<string, Map<number, number[]>>();
    for (const s of (scheduleEntries ?? [])) {
      if (!m.has(s.workDate)) m.set(s.workDate, new Map());
      const dm = m.get(s.workDate)!;
      if (!dm.has(s.shiftBlockId)) dm.set(s.shiftBlockId, []);
      dm.get(s.shiftBlockId)!.push(s.employeeId);
    }
    return m;
  }, [scheduleEntries]);

  const empMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const e of (employees ?? [])) m.set(e.id, e);
    return m;
  }, [employees]);

  function openCell(blockId: number, date: string) {
    const current = schedMap.get(date)?.get(blockId) ?? [];
    setSelectedEmpIds([...current]);
    setEditingCell({ blockId, date });
  }

  function saveCell() {
    if (!editingCell) return;
    setScheduleMut.mutate({ storeId, shiftBlockId: editingCell.blockId, workDate: editingCell.date, employeeIds: selectedEmpIds });
  }

  const chargesPercent = config?.chargesPercent ?? 70;

  // Week cost
  const weekCost = useMemo(() => {
    let total = 0;
    for (const [, dateMap] of Array.from(schedMap)) {
      for (const [blockId, empIds] of Array.from(dateMap)) {
        const block = (blocks ?? []).find(b => b.id === blockId);
        if (!block) continue;
        const endM1 = block.endHour * 60 <= block.startHour * 60 ? block.endHour * 60 + 1440 : block.endHour * 60;
        const duration = (endM1 - block.startHour * 60) / 60;
        for (const eid of empIds) {
          const emp = empMap.get(eid);
          if (!emp) continue;
          total += calcHourlyRate(emp, chargesPercent) * duration;
        }
      }
    }
    return total;
  }, [schedMap, blocks, empMap, chargesPercent]);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);

  async function exportPNG() {
    const el = printRef.current;
    if (!el) return;
    setExporting("png");
    try {
      // Tornar visível off-screen para captura
      const prev = el.style.cssText;
      el.style.cssText = "position:absolute;left:-99999px;top:0;display:block;width:1100px;background:white;padding:16px;font-family:Arial,sans-serif;font-size:11px;";
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
      el.style.cssText = prev;
      const a = document.createElement("a");
      const storeName = (document.querySelector("[data-store-name]") as HTMLElement)?.dataset.storeName ?? "loja";
      a.download = `Escala_${storeName}_${startDate}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error("exportPNG error", e);
    } finally {
      setExporting(null);
    }
  }

  async function exportPDF() {
    const el = printRef.current;
    if (!el) return;
    setExporting("pdf");
    try {
      const prev = el.style.cssText;
      el.style.cssText = "position:absolute;left:-99999px;top:0;display:block;width:1100px;background:white;padding:16px;font-family:Arial,sans-serif;font-size:11px;";
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
      el.style.cssText = prev;
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (imgProps.height * pdfW) / imgProps.width;
      pdf.addImage(dataUrl, "PNG", 0, 0, pdfW, pdfH);
      const storeName = (document.querySelector("[data-store-name]") as HTMLElement)?.dataset.storeName ?? "loja";
      pdf.save(`Escala_${storeName}_${startDate}.pdf`);
    } catch (e) {
      console.error("exportPDF error", e);
    } finally {
      setExporting(null);
    }
  }

  function handlePrint() {
    const printArea = printRef.current;
    if (!printArea) return;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) { window.print(); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Escala de Trabalho</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 16px; }
        h2 { font-size: 14px; margin: 0 0 4px 0; }
        p { margin: 0 0 12px 0; color: #666; font-size: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #bbb; padding: 5px 7px; vertical-align: top; }
        th { background: #f0f0f0; font-weight: bold; text-align: center; font-size: 10px; }
        td.turno-col { font-weight: bold; white-space: nowrap; min-width: 90px; }
        td.turno-hora { font-size: 9px; color: #666; }
        .emp-name { display: block; font-size: 10px; line-height: 1.4; }
        .folga { color: #aaa; font-style: italic; font-size: 9px; }
        @page { size: A4 landscape; margin: 1cm; }
      </style>
    </head><body>${printArea.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 400);
  }

  return (
    <div className="space-y-5">
      {/* Week nav */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">
            {new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} –{" "}
            {new Date(endDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => copyWeekMut.mutate({ storeId, targetStartDate: startDate })} disabled={copyWeekMut.isPending}>
            <Copy className="w-4 h-4 mr-1" /> Copiar semana anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowConfig(v => !v)}>
            <Settings className="w-4 h-4 mr-1" /> Configurar turnos
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir escala
          </Button>
          <Button variant="outline" size="sm" onClick={exportPNG} disabled={exporting === "png"}>
            <ImageIcon className="w-4 h-4 mr-1" /> {exporting === "png" ? "Gerando..." : "Exportar PNG"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting === "pdf"}>
            <FileDown className="w-4 h-4 mr-1" /> {exporting === "pdf" ? "Gerando..." : "Exportar PDF"}
          </Button>
        </div>
      </div>
      {/* Área de impressão oculta — renderizada mas invisível na tela */}
      <div ref={printRef} style={{ display: "none" }}>
        <h2>Escala de Trabalho</h2>
        <p>
          {new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
          {" – "}
          {new Date(endDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left", width: "100px" }}>Turno</th>
              {weekDates.map(d => (
                <th key={d}>
                  {DAY_NAMES_FULL[new Date(d + "T12:00:00").getDay()]}<br />
                  <span style={{ fontWeight: "normal", fontSize: "9px" }}>
                    {new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(blocks ?? []).map(block => (
              <tr key={block.id}>
                <td className="turno-col">
                  {block.name}<br />
                  <span className="turno-hora">{block.startHour}h–{block.endHour}h</span>
                </td>
                {weekDates.map(date => {
                  const empIds = schedMap.get(date)?.get(block.id) ?? [];
                  return (
                    <td key={date} style={{ minWidth: "90px", minHeight: "50px" }}>
                      {empIds.length > 0
                        ? empIds.map(eid => (
                            <span key={eid} className="emp-name">{empMap.get(eid)?.name ?? `#${eid}`}</span>
                          ))
                        : <span className="folga">— folga —</span>
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>


      {/* Painel de configuração de blocos */}
      {showConfig && (
        <div className="bg-card border border-border rounded-xl p-5">
          <ConfigurarTurnos storeId={storeId} onClose={() => setShowConfig(false)} />
        </div>
      )}

      {/* Week summary */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-6">
        <div><span className="text-xs text-muted-foreground block">Custo da semana</span><span className="text-lg font-semibold font-mono">{fmtCurrency(weekCost)}</span></div>
        <div><span className="text-xs text-muted-foreground block">Turnos escalados</span><span className="text-lg font-semibold font-mono">{scheduleEntries?.length ?? 0}</span></div>
      </div>

      {/* Grid */}
      {(blocks ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Settings className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">Nenhum bloco de turno configurado</p>
          <p className="text-sm mt-1 mb-4">Crie os turnos da sua loja para montar a escala semanal</p>
          <Button size="sm" onClick={() => setShowConfig(true)}>
            <Plus className="w-4 h-4 mr-1" /> Configurar turnos agora
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-28">Turno</th>
                  {weekDates.map((d, i) => (
                    <th key={d} className="text-center px-2 py-3 text-xs font-medium text-muted-foreground">
                      <div>{DAY_NAMES[new Date(d + "T12:00:00").getDay()]}</div>
                      <div className="font-normal">{new Date(d + "T12:00:00").getDate()}/{new Date(d + "T12:00:00").getMonth() + 1}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(blocks ?? []).map(block => (
                  <tr key={block.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{block.name}</div>
                      <div className="text-xs text-muted-foreground">{block.startHour}h–{block.endHour}h</div>
                    </td>
                    {weekDates.map(date => {
                      const empIds = schedMap.get(date)?.get(block.id) ?? [];
                      const endM2 = block.endHour * 60 <= block.startHour * 60 ? block.endHour * 60 + 1440 : block.endHour * 60;
                      const blockDuration = (endM2 - block.startHour * 60) / 60;
                      const blockCost = empIds.reduce((s, eid) => {
                        const emp = empMap.get(eid);
                        return s + (emp ? calcHourlyRate(emp, chargesPercent) * blockDuration : 0);
                      }, 0);
                      return (
                        <td key={date} className="px-2 py-2 text-center">
                          <button
                            onClick={() => openCell(block.id, date)}
                            className="w-full min-h-[64px] rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all p-2 text-left"
                          >
                            {empIds.length > 0 ? (
                              <>
                                <div className="text-xs font-semibold text-foreground">{empIds.length} pessoa{empIds.length > 1 ? "s" : ""}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{fmtCurrency(blockCost)}</div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {empIds.slice(0, 2).map(eid => empMap.get(eid)?.name?.split(" ")[0]).join(", ")}
                                  {empIds.length > 2 ? ` +${empIds.length - 2}` : ""}
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">+ Escalar</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cell editor */}
      <Dialog open={!!editingCell} onOpenChange={v => { if (!v) setEditingCell(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingCell && (blocks ?? []).find(b => b.id === editingCell.blockId)?.name} —{" "}
              {editingCell && new Date(editingCell.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-64 overflow-y-auto">
            {(employees ?? []).map(emp => (
              <label key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEmpIds.includes(emp.id)}
                  onChange={e => {
                    if (e.target.checked) setSelectedEmpIds(p => [...p, emp.id]);
                    else setSelectedEmpIds(p => p.filter(id => id !== emp.id));
                  }}
                  className="w-4 h-4"
                />
                <div>
                  <div className="text-sm font-medium">{emp.name}</div>
                  <div className="text-xs text-muted-foreground">{emp.role}</div>
                </div>
              </label>
            ))}
            {(employees ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum funcionário cadastrado.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCell(null)}>Cancelar</Button>
            <Button onClick={saveCell} disabled={setScheduleMut.isPending}>Salvar escala</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-tab: Análise ─────────────────────────────────────────────────────────

function Analise({ storeId, config }: { storeId: number; config: any }) {
  const [weekBase, setWeekBase] = useState(() => new Date());
  const weekDates = useMemo(() => getWeekDates(weekBase), [weekBase]);
  const startDate = weekDates[0];
  const endDate = weekDates[6];

  const { data: blockData } = trpc.pessoas.getBlockProductivity.useQuery({ storeId, startDate, endDate });
  const { data: payroll } = trpc.pessoas.getPayrollSummary.useQuery({ storeId });
  const { data: suggestions } = trpc.pessoas.getSuggestions.useQuery({ storeId });
  const { data: personProd } = trpc.pessoas.personProductivity.useQuery({ storeId, startDate, endDate });
  const utils = trpc.useUtils();

  const createActionMut = trpc.actions.create.useMutation({
    onSuccess: () => { toast.success("Ação criada no Plano!"); utils.actions.list.invalidate(); },
  });

  const productivityTarget = config?.productivityTarget ?? 200;

  const statusColor = { green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" };
  const statusBg = { green: "bg-emerald-50 border-emerald-200", amber: "bg-amber-50 border-amber-200", red: "bg-red-50 border-red-200" };
  const statusDot = { green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-red-500" };

  return (
    <div className="space-y-6">
      {/* Week nav */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); }}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">
          {new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} –{" "}
          {new Date(endDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <Button variant="outline" size="sm" onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Macro indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Folha mensal estimada", value: fmtCurrency(payroll?.estimatedMonthlyPayroll ?? 0), icon: DollarSign },
          { label: "Quadro ativo", value: `${payroll?.activeCount ?? 0} pessoas`, icon: Users },
          { label: "% Folha/receita", value: payroll?.payrollPercent != null ? `${payroll.payrollPercent.toFixed(1)}%` : "—", icon: BarChart3 },
          { label: "Meta folha/receita", value: `${config?.payrollTargetPercent ?? 18}%`, icon: TrendingUp },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <div className="text-xl font-semibold font-mono">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Block productivity table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Produtividade por Turno</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Meta: R$ {productivityTarget}/h-pessoa</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Turno", "Dia", "Receita", "H-pessoa", "Custo", "R$/h-pessoa", "Status"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(blockData ?? []).filter(b => b.personHours > 0 || b.revenue > 0).map((b, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{b.blockName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{DAY_NAMES[new Date(b.date + "T12:00:00").getDay()]} {new Date(b.date + "T12:00:00").getDate()}</td>
                  <td className="px-4 py-3 font-mono">{fmtCurrency(b.revenue)}</td>
                  <td className="px-4 py-3 font-mono">{b.personHours.toFixed(0)}h</td>
                  <td className="px-4 py-3 font-mono">{fmtCurrency(b.blockCost)}</td>
                  <td className={`px-4 py-3 font-mono font-semibold ${statusColor[b.status]}`}>{fmtCurrency(b.productivity)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${statusBg[b.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot[b.status]}`} />
                      {b.status === "green" ? "Acima" : b.status === "amber" ? "Em torno" : "Abaixo"}
                    </span>
                  </td>
                </tr>
              ))}
              {(blockData ?? []).filter(b => b.personHours > 0 || b.revenue > 0).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sem dados de escala ou receita para este período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Person productivity table */}
      {(personProd ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">Produtividade por Pessoa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receita coberta = soma da venda dos turnos escalados (compartilhada com colegas do mesmo turno). Meta: R$ {productivityTarget}/h.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["#", "Funcionário", "Cargo", "Horas", "Receita coberta", "R$/h", "Custo/h", "Receita/Custo", "Status"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(personProd ?? []).map((p, i) => (
                  <tr key={p.employeeId} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-3 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-3 py-3 font-medium">{p.name}</td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">{p.role}</td>
                    <td className="px-3 py-3 font-mono text-xs">{p.horasTrabalhadas.toFixed(0)}h</td>
                    <td className="px-3 py-3 font-mono text-xs">{fmtCurrency(p.receitaCoberta)}</td>
                    <td className={`px-3 py-3 font-mono font-semibold text-sm ${statusColor[p.status]}`}>{fmtCurrency(p.produtividadeRH)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{fmtCurrency(p.custoHora)}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <span className={p.razaoReceitaCusto >= 1 ? "text-emerald-600" : "text-red-600"}>
                        {p.razaoReceitaCusto.toFixed(1)}×
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${statusBg[p.status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot[p.status]}`} />
                        {p.status === "green" ? "Acima" : p.status === "amber" ? "Em torno" : "Abaixo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suggestions */}
      {(suggestions ?? []).length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Sugestões do Sistema</h3>
          {/* Realocações pico×morto: destaque especial no topo */}
          {(suggestions ?? []).filter(s => s.trigger === "reallocation_peak_dead").map((s, i) => (
            <div key={`realloc-${i}`} className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-emerald-600 text-white border-0">
                      ↔ Realocação
                    </Badge>
                    <span className="font-semibold text-sm text-emerald-900">{s.title}</span>
                  </div>
                  <p className="text-sm text-emerald-800">{s.description}</p>
                  {s.estimatedSaving && (
                    <p className="text-xs text-emerald-700 mt-1 font-medium">Ganho potencial estimado: {fmtCurrency(s.estimatedSaving)}/mês</p>
                  )}
                </div>
                <Button size="sm" className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                  createActionMut.mutate({
                    storeId,
                    description: s.actionTitle,
                    category: "people",
                    dueDate: fmt(new Date(Date.now() + 7 * 86400000)),
                  });
                }}>
                  <ArrowRight className="w-3.5 h-3.5 mr-1" /> Criar ação
                </Button>
              </div>
            </div>
          ))}
          {/* Demais sugestões */}
          {(suggestions ?? []).filter(s => s.trigger !== "reallocation_peak_dead").map((s, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={
                      s.type === "structural" ? "border-red-200 text-red-700" :
                      s.type === "opportunity" ? "border-emerald-200 text-emerald-700" :
                      "border-blue-200 text-blue-700"
                    }>
                      {s.type === "structural" ? "Estrutural" : s.type === "opportunity" ? "Oportunidade" : "Individual"}
                    </Badge>
                    <span className="font-medium text-sm">{s.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  {s.estimatedSaving && (
                    <p className="text-xs text-emerald-600 mt-1 font-medium">Economia estimada: {fmtCurrency(s.estimatedSaving)}/mês</p>
                  )}
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => {
                  createActionMut.mutate({
                    storeId,
                    description: s.actionTitle,
                    category: "people",
                    dueDate: fmt(new Date(Date.now() + 7 * 86400000)),
                  });
                }}>
                  <ArrowRight className="w-3.5 h-3.5 mr-1" /> Criar ação
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-tab: Movimentações ───────────────────────────────────────────────────

function Movimentacoes({ storeId, config }: { storeId: number; config: any }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    employeeId: "", movementType: "hire" as any,
    movementDate: fmt(new Date()), reason: "", previousValue: "", newValue: "",
  });

  const utils = trpc.useUtils();
  const { data: movements } = trpc.pessoas.getMovements.useQuery({ storeId });
  const { data: employees } = trpc.pessoas.getEmployees.useQuery({ storeId, includeInactive: true });
  const { data: turnover } = trpc.pessoas.getTurnoverStats.useQuery({ storeId });
  const createMut = trpc.pessoas.createMovement.useMutation({
    onSuccess: () => { toast.success("Movimentação registrada!"); utils.pessoas.getMovements.invalidate(); setShowModal(false); },
  });

  const hiringCost = config?.hiringCost ?? 1500;
  const invisibleCost = (turnover?.hiresThisMonth ?? 0) * hiringCost;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Contratações no mês", value: turnover?.hiresThisMonth ?? 0, icon: UserPlus, color: "text-emerald-600" },
          { label: "Desligamentos no mês", value: turnover?.terminationsThisMonth ?? 0, icon: UserMinus, color: "text-red-600" },
          { label: "Turnover", value: `${(turnover?.turnoverRate ?? 0).toFixed(1)}%`, icon: TrendingDown, color: (turnover?.turnoverRate ?? 0) > 15 ? "text-red-600" : "text-muted-foreground" },
          { label: "Tempo médio de casa", value: `${Math.floor((turnover?.avgTenureDays ?? 0) / 30)}m`, icon: Calendar, color: "text-muted-foreground" },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <div className="text-xl font-semibold font-mono">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Invisible cost banner */}
      {(turnover?.hiresThisMonth ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{turnover?.hiresThisMonth} contratação{(turnover?.hiresThisMonth ?? 0) > 1 ? "ões" : ""} esse mês</strong> = {fmtCurrency(invisibleCost)} de custo invisível além da folha (exames, uniforme, treinamento, ineficiência dos primeiros 30 dias).
          </p>
        </div>
      )}

      {/* History */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Histórico de Movimentações</h3>
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4 mr-1" /> Registrar
          </Button>
        </div>
        <div className="divide-y divide-border">
          {(movements ?? []).map(m => (
            <div key={m.id} className="px-4 py-3 flex items-center gap-4">
              <div className={`text-sm font-medium ${MOVEMENT_COLORS[m.movementType]}`}>
                {MOVEMENT_LABELS[m.movementType]}
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium">{m.employeeName}</span>
                {m.reason && <span className="text-xs text-muted-foreground ml-2">· {m.reason}</span>}
                {m.previousValue && m.newValue && (
                  <span className="text-xs text-muted-foreground ml-2">· {m.previousValue} → {m.newValue}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(m.movementDate + "T12:00:00").toLocaleDateString("pt-BR")}
              </div>
            </div>
          ))}
          {(movements ?? []).length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">Nenhuma movimentação registrada.</div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Funcionário</label>
              <Select value={form.employeeId} onValueChange={v => setForm(p => ({ ...p, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
              <Select value={form.movementType} onValueChange={v => setForm(p => ({ ...p, movementType: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MOVEMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data</label>
              <Input type="date" value={form.movementDate} onChange={e => setForm(p => ({ ...p, movementDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Motivo</label>
              <Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Descreva o motivo..." />
            </div>
            {(form.movementType === "role_change" || form.movementType === "salary_change") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor anterior</label>
                  <Input value={form.previousValue} onChange={e => setForm(p => ({ ...p, previousValue: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor novo</label>
                  <Input value={form.newValue} onChange={e => setForm(p => ({ ...p, newValue: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ storeId, employeeId: Number(form.employeeId), movementType: form.movementType, movementDate: form.movementDate, reason: form.reason || undefined, previousValue: form.previousValue || undefined, newValue: form.newValue || undefined })} disabled={!form.employeeId || createMut.isPending}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main PessoasPage ─────────────────────────────────────────────────────────

type SubTab = "mapa" | "quadro" | "escala" | "analise" | "movimentacoes";

export default function PessoasPage() {
  const { storeId: ctxStoreId } = useStore();
  const storeId = ctxStoreId ?? 0;
  const [activeTab, setActiveTab] = useState<SubTab>("mapa");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({
    chargesPercent: "70", productivityTarget: "200", payrollTargetPercent: "18",
    hiringCost: "1500", operationStartHour: "8", operationEndHour: "23",
  });

  const utils = trpc.useUtils();
  const { data: config } = trpc.pessoas.getConfig.useQuery({ storeId }, { enabled: storeId > 0 });
  const saveConfigMut = trpc.pessoas.saveConfig.useMutation({
    onSuccess: () => { toast.success("Configurações salvas!"); utils.pessoas.getConfig.invalidate(); setShowConfigModal(false); },
  });

  function openConfig() {
    if (config) {
      setConfigForm({
        chargesPercent: String(config.chargesPercent),
        productivityTarget: String(config.productivityTarget),
        payrollTargetPercent: String(config.payrollTargetPercent),
        hiringCost: String(config.hiringCost),
        operationStartHour: String(config.operationStartHour),
        operationEndHour: String(config.operationEndHour),
      });
    }
    setShowConfigModal(true);
  }

  const TABS: { id: SubTab; label: string }[] = [
    { id: "mapa", label: "Mapa de Calor" },
    { id: "quadro", label: "Quadro" },
    { id: "escala", label: "Escala" },
    { id: "analise", label: "Análise" },
    { id: "movimentacoes", label: "Movimentações" },
  ];

  if (!storeId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Selecione uma loja para gerenciar pessoas.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Pessoas<span className="text-primary">.</span></h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestão inteligente de equipe e folha de pagamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={openConfig}>
          <Settings className="w-4 h-4 mr-1" /> Configurações
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "mapa" && <MapaCalor storeId={storeId} config={config} />}
      {activeTab === "quadro" && <Quadro storeId={storeId} config={config} />}
      {activeTab === "escala" && <Escala storeId={storeId} config={config} />}
      {activeTab === "analise" && <Analise storeId={storeId} config={config} />}
      {activeTab === "movimentacoes" && <Movimentacoes storeId={storeId} config={config} />}

      {/* Config modal */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Configurações de Pessoas</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { key: "chargesPercent", label: "Encargos sobre salário (%)", hint: "INSS, FGTS, férias, 13º, provisões. Padrão: 70%" },
              { key: "productivityTarget", label: "Meta de produtividade (R$/h-pessoa)", hint: "Padrão: R$ 200/h-pessoa" },
              { key: "payrollTargetPercent", label: "Meta folha/receita (%)", hint: "Padrão: 18%" },
              { key: "hiringCost", label: "Custo estimado por contratação (R$)", hint: "Exame, uniforme, treinamento. Padrão: R$ 1.500" },
              { key: "operationStartHour", label: "Hora de abertura da loja", hint: "Ex: 8 para 8h" },
              { key: "operationEndHour", label: "Hora de fechamento da loja", hint: "Ex: 23 para 23h" },
            ].map(field => (
              <div key={field.key}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{field.label}</label>
                <Input
                  type="number"
                  value={(configForm as any)[field.key]}
                  onChange={e => setConfigForm(p => ({ ...p, [field.key]: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-0.5">{field.hint}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigModal(false)}>Cancelar</Button>
            <Button onClick={() => saveConfigMut.mutate({
              storeId,
              chargesPercent: Number(configForm.chargesPercent),
              productivityTarget: Number(configForm.productivityTarget),
              payrollTargetPercent: Number(configForm.payrollTargetPercent),
              hiringCost: Number(configForm.hiringCost),
              operationStartHour: Number(configForm.operationStartHour),
              operationEndHour: Number(configForm.operationEndHour),
            })} disabled={saveConfigMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
