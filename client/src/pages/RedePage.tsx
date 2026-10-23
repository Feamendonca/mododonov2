import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Store, Clock, XCircle, BarChart3 } from "lucide-react";

function fmt(n: number) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtPct(n: number) { return n.toFixed(1) + "%"; }
function fmtCurrency(n: number) { return "R$ " + fmt(n); }

function DeltaIcon({ value, target, higherIsBetter = true }: { value: number; target: number; higherIsBetter?: boolean }) {
  const good = higherIsBetter ? value >= target : value <= target;
  const close = Math.abs(value - target) / Math.max(Math.abs(target), 1) < 0.05;
  if (good) return <TrendingUp size={12} style={{ color: "var(--green)" }} />;
  if (close) return <Minus size={12} style={{ color: "var(--amber)" }} />;
  return <TrendingDown size={12} style={{ color: "var(--red)" }} />;
}

export default function RedePage() {
  const { user } = useAuth();
  const { setStoreId } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const period = today.slice(0, 7);

  const { data: networkData, isLoading } = trpc.network.overview.useQuery({ period });
  const { data: stores = [] } = trpc.stores.list.useQuery();
  const isAdmin = user?.role === "admin";
  const { data: disciplinaData } = trpc.preturno.disciplinaRanking.useQuery(undefined, { enabled: isAdmin });

  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="section-card text-center py-16">
          <AlertTriangle size={40} className="mx-auto mb-4 opacity-30" style={{ color: "var(--stone)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
            Acesso restrito
          </h2>
          <p className="text-sm" style={{ color: "var(--stone)" }}>
            A visão de rede é exclusiva para lideranças e administradores do programa.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !networkData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const { stores: storeMetrics, totals } = networkData;
  const periodLabel = new Date(period + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div>
        <div className="eyebrow mb-1">Visão consolidada</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
          Rede<span className="dot">.</span>
        </h1>
        <p style={{ color: "var(--stone)", fontSize: 14, marginTop: 4 }}>{periodLabel} · {storeMetrics.length} lojas no programa</p>
      </div>

      {/* Network totals */}
      <div className="statement-bar">
        <div>
          <div className="kicker">Resultado consolidado da rede</div>
          <div className="narrative">
            {totals.revenueVsBudgetPct >= 100
              ? `Rede ${fmtPct(totals.revenueVsBudgetPct - 100)} acima do orçado. EBITDA médio em ${fmtPct(totals.avgEbitdaPct)}.`
              : `Rede ${fmtPct(100 - totals.revenueVsBudgetPct)} abaixo do orçado. EBITDA médio em ${fmtPct(totals.avgEbitdaPct)}.`}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 11, color: "rgba(250,247,242,0.5)", marginBottom: 4, letterSpacing: "0.1em" }}>RECEITA TOTAL</div>
          <div className="score-big" style={{ color: "var(--ivory)" }}>{fmtCurrency(totals.totalRevenue)}</div>
        </div>
      </div>

      {/* Network KPIs */}
      <div className="kpi-board">
        <div className="kpi-card">
          <div className="kpi-label">Receita total</div>
          <div className="kpi-value num" style={{ fontSize: 24 }}>{fmtCurrency(totals.totalRevenue)}</div>
          <div className="kpi-sub">{fmtPct(totals.revenueVsBudgetPct)} do orçado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">EBITDA médio</div>
          <div className="kpi-value num" style={{ fontSize: 24, color: totals.avgEbitdaPct >= 0 ? "var(--green)" : "var(--red)" }}>
            {totals.avgEbitdaPct >= 0 ? "+" : ""}{fmtPct(totals.avgEbitdaPct)}
          </div>
          <div className="kpi-sub">Média da rede</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">CMV médio</div>
          <div className="kpi-value num" style={{ fontSize: 24, color: totals.avgCmvPct > 32 ? "var(--red)" : totals.avgCmvPct > 30 ? "var(--amber)" : "var(--green)" }}>
            {fmtPct(totals.avgCmvPct)}
          </div>
          <div className="kpi-sub">Meta: 30%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Lojas acima da meta</div>
          <div className="kpi-value num" style={{ fontSize: 24 }}>
            {storeMetrics.filter((s) => s.ebitdaPct >= s.budgetEbitdaPct).length}
            <span style={{ fontSize: 16, color: "var(--stone-light)" }}>/{storeMetrics.length}</span>
          </div>
          <div className="kpi-sub">No EBITDA</div>
        </div>
      </div>

      {/* Alerts */}
      {storeMetrics.filter((s) => s.overdueActionsCount > 0 || !s.commitmentSigned || s.cmvPct > 33).length > 0 && (
        <div className="section-card" style={{ borderColor: "rgba(200,134,43,0.3)", background: "rgba(200,134,43,0.02)" }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} style={{ color: "var(--amber)" }} />
            <span className="font-semibold text-sm" style={{ color: "var(--amber)" }}>Atenção requerida</span>
          </div>
          <div className="space-y-2">
            {storeMetrics.filter((s) => !s.commitmentSigned).map((s) => (
              <div key={`comm-${s.storeId}`} className="text-sm" style={{ color: "var(--stone)" }}>
                <strong style={{ color: "var(--ink)" }}>{s.storeName}</strong> — Compromisso não assinado
              </div>
            ))}
            {storeMetrics.filter((s) => s.overdueActionsCount > 0).map((s) => (
              <div key={`act-${s.storeId}`} className="text-sm" style={{ color: "var(--stone)" }}>
                <strong style={{ color: "var(--ink)" }}>{s.storeName}</strong> — {s.overdueActionsCount} ação(ões) vencida(s)
              </div>
            ))}
            {storeMetrics.filter((s) => s.cmvPct > 33).map((s) => (
              <div key={`cmv-${s.storeId}`} className="text-sm" style={{ color: "var(--stone)" }}>
                <strong style={{ color: "var(--ink)" }}>{s.storeName}</strong> — CMV crítico: {fmtPct(s.cmvPct)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disciplina de Pré-turno — Ranking */}
      {disciplinaData && disciplinaData.ranking.some((r) => r.hasConfig) && (
        <div className="section-card">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 size={18} style={{ color: "var(--vinho)" }} />
            <div>
              <div className="eyebrow">Disciplina de pré-turno</div>
              <p className="text-xs mt-0.5" style={{ color: "var(--stone)" }}>
                {new Date(disciplinaData.year, disciplinaData.month - 1, 15).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} · Média da rede: <strong style={{ color: disciplinaData.avgDisciplina >= 80 ? "var(--green)" : disciplinaData.avgDisciplina >= 60 ? "var(--amber)" : "var(--red)" }}>{disciplinaData.avgDisciplina}%</strong>
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--gray-line)" }}>
                  {["#", "Loja", "Hoje", "Disciplina no mês", "Realizadas", "Reivindicações", "Quem mais conduziu", ""].map((h) => (
                    <th key={h} className="text-left pb-3 pr-4 font-semibold whitespace-nowrap"
                      style={{ color: "var(--stone-light)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disciplinaData.ranking.filter((r) => r.hasConfig).map((store, idx) => {
                  const discColor = store.disciplinaPct >= 80 ? "var(--green)" : store.disciplinaPct >= 60 ? "var(--amber)" : "var(--red)";
                  const barWidth = `${Math.max(store.disciplinaPct, 2)}%`;
                  return (
                    <tr key={store.storeId} style={{ borderBottom: "1px solid var(--gray-line)" }}>
                      <td className="py-3 pr-3">
                        <span className="num text-xs font-bold" style={{ color: idx === 0 ? "var(--vinho)" : "var(--stone-light)" }}>#{idx + 1}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Store size={13} style={{ color: "var(--stone-light)", flexShrink: 0 }} />
                          <span className="font-semibold" style={{ color: "var(--ink)" }}>{store.storeName}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {store.todayStatus === "realizado" && (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 size={14} style={{ color: "var(--green)" }} />
                            <span className="text-xs" style={{ color: "var(--green)" }}>Realizado</span>
                          </div>
                        )}
                        {store.todayStatus === "pendente" && (
                          <div className="flex items-center gap-1">
                            <Clock size={14} style={{ color: "var(--amber)" }} />
                            <span className="text-xs" style={{ color: "var(--amber)" }}>Pendente</span>
                          </div>
                        )}
                        {store.todayStatus === "sem-config" && (
                          <span className="text-xs" style={{ color: "var(--stone-light)" }}>—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4" style={{ minWidth: 140 }}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--gray-line)", minWidth: 60 }}>
                            <div className="h-1.5 rounded-full transition-all" style={{ width: barWidth, background: discColor }} />
                          </div>
                          <span className="num text-xs font-bold" style={{ color: discColor, minWidth: 36 }}>{store.disciplinaPct}%</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="num text-xs" style={{ color: "var(--stone)" }}>{store.realizadasMes}/{store.esperadasMes}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {store.reivindicacoesAbertas > 0
                          ? <span className="badge-base badge-red">{store.reivindicacoesAbertas} aberta{store.reivindicacoesAbertas !== 1 ? "s" : ""}</span>
                          : <span className="badge-base badge-green">OK</span>}
                      </td>
                      <td className="py-3 pr-4">
                        {store.quemMaisConduziu
                          ? <span className="text-xs" style={{ color: "var(--stone)" }}>{store.quemMaisConduziu.nome} <span className="num">({store.quemMaisConduziu.count}x)</span></span>
                          : <span className="text-xs" style={{ color: "var(--stone-light)" }}>—</span>}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => setStoreId(store.storeId)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                          style={{ borderColor: "var(--vinho)", color: "var(--vinho)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vinho)"; e.currentTarget.style.color = "var(--white)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--vinho)"; }}>
                          Ver loja
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Store comparison table */}
      <div className="section-card">
        <div className="eyebrow mb-4">KPIs comparativos por loja</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--gray-line)" }}>
                {["Loja", "Receita", "vs Budget", "CMV %", "EBITDA %", "Score", "Compromisso", "Ações", ""].map((h) => (
                  <th key={h} className="text-left pb-3 pr-4 font-semibold whitespace-nowrap"
                    style={{ color: "var(--stone-light)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {storeMetrics.map((store) => {
                const cmvColor = store.cmvPct > store.budgetCmvPct + 1 ? "var(--red)" : store.cmvPct > store.budgetCmvPct ? "var(--amber)" : "var(--green)";
                const ebitdaColor = store.ebitdaPct >= store.budgetEbitdaPct ? "var(--green)" : store.ebitdaPct >= 0 ? "var(--amber)" : "var(--red)";
                const scoreColor = store.score == null ? "rgba(0,0,0,0.3)" : store.score >= 100 ? "var(--green)" : store.score >= 80 ? "var(--amber)" : "var(--red)";
                return (
                  <tr key={store.storeId} style={{ borderBottom: "1px solid var(--gray-line)" }}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Store size={14} style={{ color: "var(--stone-light)", flexShrink: 0 }} />
                        <span className="font-semibold" style={{ color: "var(--ink)" }}>{store.storeName}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 num">{fmtCurrency(store.revenue)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1">
                        <DeltaIcon value={store.revenueVsBudgetPct} target={100} />
                        <span className="num text-xs">{fmtPct(store.revenueVsBudgetPct)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="num font-semibold" style={{ color: cmvColor }}>{fmtPct(store.cmvPct)}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="num font-semibold" style={{ color: ebitdaColor }}>
                        {store.ebitdaPct >= 0 ? "+" : ""}{fmtPct(store.ebitdaPct)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="num font-bold" style={{ color: scoreColor }}>{store.score != null ? store.score.toFixed(0) : "—"}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {store.commitmentSigned
                        ? <CheckCircle2 size={16} style={{ color: "var(--green)" }} />
                        : <AlertTriangle size={16} style={{ color: "var(--amber)" }} />}
                    </td>
                    <td className="py-3 pr-4">
                      {store.overdueActionsCount > 0
                        ? <span className="badge-base badge-red">{store.overdueActionsCount} vencida{store.overdueActionsCount !== 1 ? "s" : ""}</span>
                        : <span className="badge-base badge-green">OK</span>}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => setStoreId(store.storeId)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                        style={{ borderColor: "var(--vinho)", color: "var(--vinho)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vinho)"; e.currentTarget.style.color = "var(--white)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--vinho)"; }}>
                        Ver loja
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
