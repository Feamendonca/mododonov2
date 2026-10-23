/**
 * DemoHojePage — Demo version of the Hoje dashboard with mock data.
 * Shows all UI elements without requiring authentication or real data.
 */
import { useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, DollarSign, Package, Users, Star, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DEMO_DATE = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

const DEMO_ALERTS = [
  { type: "warning", icon: AlertTriangle, message: "CMV desta semana em 33,2% — acima da meta de 30%. Revise as compras de carnes." },
  { type: "info", icon: Clock, message: "Compromisso semanal pendente. Prazo: domingo." },
];

const DEMO_ENTRIES = [
  { label: "Receita do dia", value: "R$ 8.420", trend: +12, icon: DollarSign, color: "var(--green)" },
  { label: "Notas de entrada", value: "R$ 1.840", trend: 0, icon: Package, color: "var(--vinho)" },
  { label: "Mão de obra extra", value: "R$ 320", trend: -5, icon: Users, color: "var(--amber)" },
];

const DEMO_WEEK = [
  { day: "Seg", revenue: 6200, target: 7000 },
  { day: "Ter", revenue: 7100, target: 7000 },
  { day: "Qua", revenue: 8900, target: 7000 },
  { day: "Qui", revenue: 7400, target: 7000 },
  { day: "Sex", revenue: 9200, target: 7000 },
  { day: "Sáb", revenue: 10800, target: 9000 },
  { day: "Dom", revenue: 8420, target: 9000, today: true },
];

const DEMO_ACTIONS = [
  { title: "Revisar escala de segunda-feira", priority: "alta", status: "em_andamento", due: "Amanhã" },
  { title: "Contagem de estoque de carnes", priority: "alta", status: "pendente", due: "Quarta" },
  { title: "Treinamento de atendimento — Módulo 3", priority: "media", status: "pendente", due: "Sexta" },
];

export default function DemoHojePage() {
  const [revenueInput, setRevenueInput] = useState("8420");
  const [notasInput, setNotasInput] = useState("1840");
  const [moInput, setMoInput] = useState("320");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    toast.success("Lançamento salvo! (modo demo — dados não persistidos)");
    setTimeout(() => setSaved(false), 3000);
  }

  const maxRevenue = Math.max(...DEMO_WEEK.map(d => d.revenue));

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-1">Pecorino Praia · {DEMO_DATE}</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
            Hoje<span className="dot">.</span>
          </h1>
          <p style={{ color: "var(--stone)", fontSize: 14, marginTop: 4 }}>Lançamento diário e visão do dia.</p>
        </div>
        <div style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(124,58,237,0.1)", color: "#7c3aed", fontSize: 12, fontWeight: 600 }}>
          ✦ Modo Demo
        </div>
      </div>

      {/* Alerts */}
      {DEMO_ALERTS.map((alert, i) => (
        <div key={i} className="flex items-start gap-3 p-4 rounded-xl"
          style={{ background: alert.type === "warning" ? "rgba(245,158,11,0.08)" : "rgba(59,130,246,0.06)", border: `1px solid ${alert.type === "warning" ? "rgba(245,158,11,0.2)" : "rgba(59,130,246,0.15)"}` }}>
          <alert.icon size={16} style={{ color: alert.type === "warning" ? "var(--amber)" : "var(--blue)", marginTop: 1, flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{alert.message}</p>
        </div>
      ))}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {DEMO_ENTRIES.map(entry => (
          <div key={entry.label} className="kpi-card">
            <div className="flex items-center justify-between mb-3">
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--silk)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <entry.icon size={16} style={{ color: entry.color }} />
              </div>
              {entry.trend !== 0 && (
                <div className="flex items-center gap-1" style={{ fontSize: 12, color: entry.trend > 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                  {entry.trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(entry.trend)}%
                </div>
              )}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--ink)" }}>{entry.value}</div>
            <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>{entry.label}</div>
          </div>
        ))}
      </div>

      {/* Daily entry form */}
      <div className="kpi-card">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Lançamento do dia</h2>
          {saved && (
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Salvo
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {[
            { label: "Receita (R$)", value: revenueInput, setter: setRevenueInput, placeholder: "0,00" },
            { label: "Notas de entrada (R$)", value: notasInput, setter: setNotasInput, placeholder: "0,00" },
            { label: "Mão de obra extra (R$)", value: moInput, setter: setMoInput, placeholder: "0,00" },
          ].map(field => (
            <div key={field.label}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--stone)", display: "block", marginBottom: 6 }}>{field.label}</label>
              <input
                type="number"
                value={field.value}
                onChange={e => field.setter(e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ border: "1.5px solid var(--silk)", background: "#fff", color: "var(--ink)", outline: "none" }}
              />
            </div>
          ))}
        </div>
        <Button onClick={handleSave} style={{ background: "var(--vinho)", color: "#fff" }}>
          Salvar lançamento
        </Button>
      </div>

      {/* Week chart */}
      <div className="kpi-card">
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 16 }}>Receita da semana</h2>
        <div className="flex items-end gap-2" style={{ height: 100 }}>
          {DEMO_WEEK.map(d => {
            const pct = (d.revenue / maxRevenue) * 100;
            const targetPct = (d.target / maxRevenue) * 100;
            const aboveTarget = d.revenue >= d.target;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div style={{ fontSize: 10, color: "var(--stone)", fontWeight: d.today ? 700 : 400 }}>
                  {d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue}
                </div>
                <div style={{ width: "100%", height: 70, display: "flex", alignItems: "flex-end", position: "relative" }}>
                  {/* Target line */}
                  <div style={{
                    position: "absolute",
                    bottom: `${targetPct}%`,
                    left: 0, right: 0,
                    height: 1,
                    background: "var(--stone-light)",
                    borderTop: "1px dashed var(--stone-light)",
                  }} />
                  {/* Bar */}
                  <div style={{
                    width: "100%",
                    height: `${pct}%`,
                    borderRadius: "4px 4px 0 0",
                    background: d.today ? "var(--vinho)" : aboveTarget ? "var(--green)" : "var(--amber)",
                    opacity: d.today ? 1 : 0.7,
                    transition: "height 0.5s ease",
                  }} />
                </div>
                <div style={{ fontSize: 10, color: d.today ? "var(--vinho)" : "var(--stone)", fontWeight: d.today ? 700 : 400 }}>{d.day}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3" style={{ fontSize: 11, color: "var(--stone)" }}>
          <div className="flex items-center gap-1.5"><div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--green)", opacity: 0.7 }} /> Acima da meta</div>
          <div className="flex items-center gap-1.5"><div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--amber)", opacity: 0.7 }} /> Abaixo da meta</div>
          <div className="flex items-center gap-1.5"><div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--vinho)" }} /> Hoje</div>
        </div>
      </div>

      {/* Pending actions */}
      <div className="kpi-card">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Ações em aberto</h2>
          <span style={{ fontSize: 12, color: "var(--stone)" }}>{DEMO_ACTIONS.length} pendentes</span>
        </div>
        <div className="space-y-3">
          {DEMO_ACTIONS.map((action, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--silk)" }}>
              <div className="flex items-center gap-3">
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: action.priority === "alta" ? "var(--red)" : "var(--amber)",
                  flexShrink: 0
                }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{action.title}</div>
                  <div style={{ fontSize: 11, color: "var(--stone)" }}>Prazo: {action.due}</div>
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "var(--stone-light)" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Quick insights */}
      <div className="kpi-card" style={{ background: "var(--ink)", color: "var(--ivory)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} style={{ color: "var(--vinho)" }} />
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Insight do dia</h2>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(250,247,242,0.8)" }}>
          Sua receita de hoje está <strong style={{ color: "var(--ivory)" }}>6,4% acima</strong> da média dos últimos 7 domingos. O ticket médio subiu para <strong style={{ color: "var(--ivory)" }}>R$ 48,20</strong>. Continue monitorando o CMV — ele está 3,2pp acima da meta esta semana.
        </p>
      </div>
    </div>
  );
}
