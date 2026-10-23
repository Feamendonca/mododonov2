import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

function fmt(n: number) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtPct(n: number) { return n.toFixed(1) + "%"; }
function fmtCurrency(n: number) { return "R$ " + fmt(n); }

function ScoreGauge({ label, value, max = 130, semApontamento = false }: { label: string; value: number; max?: number; semApontamento?: boolean }) {
  const pct = semApontamento ? 0 : Math.min(100, (value / max) * 100);
  const color = semApontamento ? "rgba(250,247,242,0.3)" : value >= 100 ? "var(--green)" : value >= 80 ? "var(--amber)" : "var(--red)";
  return (
    <div className="text-center">
      <div className="relative w-20 h-20 mx-auto mb-2">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="32" fill="none" stroke="var(--bege-dark)" strokeWidth="8" />
          <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 32 * pct / 100} ${2 * Math.PI * 32}`}
            strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="num font-bold text-sm" style={{ color }}>{semApontamento ? "—" : Math.round(value)}</span>
        </div>
      </div>
      <div className="text-xs font-semibold" style={{ color: "var(--stone)", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

export default function EbitdaPage() {
  const { storeId } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [editQuality, setEditQuality] = useState(false);
  const [qGoogle, setQGoogle] = useState("");
  const [qAudit, setQAudit] = useState("");
  const [qChecklist, setQChecklist] = useState("");
  const [sanitaryGate, setSanitaryGate] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = trpc.ebitda.monthly.useQuery(
    { storeId: storeId!, period },
    { enabled: !!storeId }
  );
  const updateQualityMutation = trpc.ebitda.updateQuality.useMutation();

  async function handleSaveQuality() {
    if (!storeId) return;
    setSaving(true);
    try {
      await updateQualityMutation.mutateAsync({
        storeId, period,
        // REGRA: nunca inventar default 85 — sem apontamento = null (não paga)
        qualityGoogle: qGoogle || (data?.quality.google != null ? String(data.quality.google) : ""),
        qualityAudit: qAudit || (data?.quality.audit != null ? String(data.quality.audit) : ""),
        qualityChecklist: qChecklist || (data?.quality.checklist != null ? String(data.quality.checklist) : ""),
        sanitaryGate,
      });
      toast.success("Indicadores de qualidade atualizados.");
      setEditQuality(false);
      refetch();
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const { accumulated: acc, scores, quality } = data;
  const ebitdaColor = acc.ebitda >= 0 ? "var(--green)" : "var(--red)";

  const dre = [
    { label: "Receita", value: acc.revenue, budget: acc.budgetRevenue, isPositive: true },
    { label: "CMV", value: -acc.cmvValue, budget: -(acc.budgetRevenue * (parseFloat("0") || 0.3)), isPositive: false },
    { label: "Embalagens", value: -acc.packagingValue, budget: 0, isPositive: false },
    { label: "Impostos", value: -acc.taxesValue, budget: 0, isPositive: false },
    { label: "M.O. Extra", value: -acc.extraLabor, budget: 0, isPositive: false },
    { label: "Custos Fixos", value: -acc.fixedCosts, budget: 0, isPositive: false },
    { label: "EBITDA", value: acc.ebitda, budget: 0, isPositive: acc.ebitda >= 0, isTotal: true },
  ];

  const chartData = [
    { name: "Orçado", value: acc.budgetEbitdaPct, fill: "var(--bege-dark)" },
    { name: "Realizado", value: acc.ebitdaPct, fill: acc.ebitdaPct >= acc.budgetEbitdaPct ? "var(--green)" : "var(--red)" },
  ];

  // Period selector: last 6 months
  const periods: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-1">Acompanhamento mensal</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
            EBITDA<span className="dot">.</span>
          </h1>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm font-medium"
          style={{ borderColor: "var(--gray-line)", background: "var(--white)", color: "var(--ink)" }}>
          {periods.map((p) => (
            <option key={p} value={p}>{new Date(p + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</option>
          ))}
        </select>
      </div>

      {/* Statement bar */}
      <div className="statement-bar">
        <div>
          <div className="kicker">Resultado do período</div>
          <div className="narrative">
            {acc.ebitdaPct >= acc.budgetEbitdaPct
              ? `EBITDA ${fmtPct(acc.ebitdaPct - acc.budgetEbitdaPct)} acima do orçado. Receita em ${fmtPct(acc.revenueVsBudgetPct)} do budget.`
              : `EBITDA ${fmtPct(acc.budgetEbitdaPct - acc.ebitdaPct)} abaixo do orçado. Receita em ${fmtPct(acc.revenueVsBudgetPct)} do budget.`}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 11, color: "rgba(250,247,242,0.5)", marginBottom: 4, letterSpacing: "0.1em" }}>SCORE TOTAL</div>
          <div className="score-big" style={{ color: scores.total == null ? "rgba(250,247,242,0.3)" : scores.total >= 100 ? "#6FCF97" : scores.total >= 80 ? "#F2C94C" : "#EB5757" }}>
            {scores.total != null ? Math.round(scores.total) : "—"}
          </div>
        </div>
      </div>

      {/* Score gauges */}
      <div className="section-card">
        <div className="eyebrow mb-1">Score composto</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)", marginBottom: 20 }}>
          Componentes do resultado
        </h2>
        <div className="flex justify-around flex-wrap gap-6">
          <ScoreGauge label="Resultado (40%)" value={scores.result} />
          <ScoreGauge label="CMV (35%)" value={scores.cmv} />
          <ScoreGauge label="Qualidade (25%)" value={scores.quality ?? 0} semApontamento={scores.quality == null} />
        </div>
        <div className="mt-4 text-center text-xs" style={{ color: "var(--stone-light)" }}>
          Score total = Resultado × 0,40 + CMV × 0,35 + Qualidade × 0,25
        </div>
      </div>

      {/* DRE + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DRE */}
        <div className="section-card">
          <div className="eyebrow mb-1">Demonstrativo</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)", marginBottom: 16 }}>
            DRE simplificado
          </h2>
          <div className="space-y-2">
            {dre.map((row) => (
              <div key={row.label}
                className={`flex items-center justify-between py-2 ${row.isTotal ? "border-t-2 mt-2 pt-3" : ""}`}
                style={{ borderColor: row.isTotal ? "var(--gray-line)" : undefined }}>
                <span className={`text-sm ${row.isTotal ? "font-bold" : "font-medium"}`} style={{ color: row.isTotal ? "var(--ink)" : "var(--stone)" }}>
                  {row.label}
                </span>
                <span className={`num text-sm ${row.isTotal ? "font-bold text-base" : ""}`}
                  style={{ color: row.isTotal ? ebitdaColor : row.value < 0 ? "var(--red)" : "var(--green)" }}>
                  {fmtCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="section-card">
          <div className="eyebrow mb-1">Comparativo</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)", marginBottom: 16 }}>
            EBITDA % — Orçado vs. Realizado
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={48}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-line)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--stone)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--stone-light)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v + "%"} />
              <Tooltip formatter={(v: number) => [fmtPct(v), "EBITDA"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--gray-line)", fontSize: 12 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quality indicators */}
      <div className="section-card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="eyebrow mb-1">Qualidade</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)" }}>
              Indicadores de qualidade
            </h2>
          </div>
          <button onClick={() => { setEditQuality(!editQuality); setQGoogle(String(quality.google)); setQAudit(String(quality.audit)); setQChecklist(String(quality.checklist)); setSanitaryGate(quality.sanitaryGate); }}
            className="text-sm font-semibold px-4 py-2 rounded-lg border"
            style={{ borderColor: "var(--vinho)", color: "var(--vinho)" }}>
            {editQuality ? "Cancelar" : "Atualizar"}
          </button>
        </div>
        {editQuality ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Nota Google (0-100)", value: qGoogle, setter: setQGoogle, placeholder: String(quality.google) },
                { label: "Auditoria interna (0-100)", value: qAudit, setter: setQAudit, placeholder: String(quality.audit) },
                { label: "Checklist operacional (0-100)", value: qChecklist, setter: setQChecklist, placeholder: String(quality.checklist) },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--ink)" }}>{label}</label>
                  <input type="number" value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono"
                    style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sanitaryGate} onChange={(e) => setSanitaryGate(e.target.checked)}
                  className="w-4 h-4 rounded" style={{ accentColor: "var(--vinho)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>Portaria sanitária aprovada</span>
              </label>
            </div>
            <button onClick={handleSaveQuality} disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: "var(--vinho)", color: "var(--white)" }}>
              {saving ? "Salvando..." : "Salvar indicadores"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Nota Google", value: quality.google, weight: "40%" },
              { label: "Auditoria interna", value: quality.audit, weight: "35%" },
              { label: "Checklist operacional", value: quality.checklist, weight: "25%" },
            ].map(({ label, value, weight }) => {
              const color = value == null ? "rgba(250,247,242,0.3)" : value >= 90 ? "var(--green)" : value >= 80 ? "var(--amber)" : "var(--red)";
              return (
                <div key={label} className="kpi-card">
                  <div className="kpi-label">{label}</div>
                  <div className="kpi-value num" style={{ color }}>{value != null ? `${value.toFixed(0)}/100` : "Sem apontamento"}</div>
                  <div className="kpi-sub">Peso: {weight}</div>
                </div>
              );
            })}
          </div>
        )}
        {!quality.sanitaryGate && (
          <div className="banner-alert banner-vinho mt-4">
            <span>⚠ Portaria sanitária pendente — score de qualidade zerado.</span>
          </div>
        )}
      </div>
    </div>
  );
}
