import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus, Save, Users, Star, Clock, BarChart3 } from "lucide-react";
import { SetupDoMes } from "@/components/SetupDoMes";

function fmt(n: number) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtPct(n: number) { return n.toFixed(1) + "%"; }
function fmtCurrency(n: number) { return "R$ " + fmt(n); }

function StatusIcon({ value, target, higherIsBetter = true }: { value: number; target: number; higherIsBetter?: boolean }) {
  const good = higherIsBetter ? value >= target : value <= target;
  const close = Math.abs(value - target) / Math.max(Math.abs(target), 1) < 0.05;
  if (good) return <TrendingUp size={14} style={{ color: "var(--green)" }} />;
  if (close) return <Minus size={14} style={{ color: "var(--amber)" }} />;
  return <TrendingDown size={14} style={{ color: "var(--red)" }} />;
}

export default function HojePage() {
  const { storeId } = useStore();
  const [, navigate] = useLocation();
  const today = new Date().toISOString().slice(0, 10);
  const [revenue, setRevenue] = useState("");
  const [extraLabor, setExtraLabor] = useState("");
  const [atendimentos, setAtendimentos] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = trpc.dashboard.today.useQuery(
    { storeId: storeId!, date: today },
    { enabled: !!storeId }
  );
  const { data: payroll } = trpc.pessoas.getPayrollSummary.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const { data: peopleConfig } = trpc.pessoas.getConfig.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  // Reclamações abertas: lê da tabela reviews (fonte única da voz-do-cliente)
  const { data: reviewStats } = trpc.experiencia.reviews.monthlyStats.useQuery(
    { storeId: storeId!, year: currentYear, month: currentMonth },
    { enabled: !!storeId }
  );
  const openComplaintsCount = reviewStats?.openComplaints ?? 0;
  const { data: metaDiaria } = trpc.orcamento.metaDiaria.useQuery(
    { storeId: storeId!, data: today },
    { enabled: !!storeId }
  );
  // Feriado do dia
  const todayYear = new Date().getFullYear();
  const todayMonth = String(new Date().getMonth() + 1).padStart(2, "0");
  const todayDay = String(new Date().getDate()).padStart(2, "0");
  const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
  const { data: holidayToday } = trpc.holidays.listWithRules.useQuery(
    { storeId: storeId!, startDate: todayStr, endDate: todayStr },
    { enabled: !!storeId }
  );
  const todayHoliday = holidayToday?.[0] ?? null;
  const { data: preturnoToday = [] } = trpc.preturno.atas.today.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const preturnoAtrasados = preturnoToday.filter((c: any) => c.estado === 'atrasado' || (c.estado === 'pendente' && (() => {
    const [h, m] = c.horarioEsperado.split(':').map(Number);
    const now = new Date();
    return (now.getHours() * 60 + now.getMinutes()) > (h * 60 + m + (c.toleranciaMinutos ?? 60));
  })()));
  const { data: reuniaoPendentes } = trpc.reuniao.pendentesCount.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const { data: combinadosReuniao = [], refetch: refetchCombinados } = trpc.reuniao.combinadosAbertos.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const toggleCombinadoMut = trpc.reuniao.toggleCombinado.useMutation({ onSuccess: () => refetchCombinados() });
  const saveMutation = trpc.dashboard.saveEntry.useMutation();

  // Projeção do mês — DEVE ficar antes de qualquer return condicional (regra dos hooks)
  const period = new Date().toISOString().slice(0, 7);
  const { data: projecao } = trpc.projecao.mes.useQuery(
    { storeId: storeId!, period },
    { enabled: !!storeId }
  );

  // Pre-fill form from existing entry
  const existingEntry = data?.todayEntry;
  const formRevenue = revenue || (existingEntry ? String(parseFloat(existingEntry.revenue ?? "0")) : "");
  const formInvoices = existingEntry ? String(parseFloat(existingEntry.invoices ?? "0")) : "0";
  const formExtraLabor = extraLabor || (existingEntry ? String(parseFloat(existingEntry.extraLabor ?? "0")) : "");
  const formAtendimentos = atendimentos || (existingEntry?.atendimentos ? String(existingEntry.atendimentos) : "");

  async function handleSave() {
    if (!storeId) return;
    setSaving(true);
    try {
      await saveMutation.mutateAsync({
        storeId, entryDate: today,
        revenue: revenue || formRevenue || "0",
        extraLabor: extraLabor || formExtraLabor || "0",
        atendimentos: atendimentos ? parseInt(atendimentos) : (existingEntry?.atendimentos ?? undefined),
      });
      toast.success("Lançamento salvo.");
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

  const { accumulated, budgetedToday, commitmentSigned, overdueActionsCount, last7Days, store } = data;

  const todayRevenue = parseFloat(existingEntry?.revenue ?? "0");
  const revenueVsToday = budgetedToday > 0 ? (todayRevenue / budgetedToday) * 100 : 0;
  // Atendimentos e ticket médio
  const todayAtendimentos = existingEntry?.atendimentos ?? 0;
  const ticketMedioReal = todayAtendimentos > 0 ? todayRevenue / todayAtendimentos : 0;
  const metaAtendimentosHoje = metaDiaria?.metaAtendimentos ?? null;
  const ticketMedioMeta = metaDiaria && metaDiaria.metaAtendimentos && metaDiaria.metaAtendimentos > 0
    ? metaDiaria.metaReceita / metaDiaria.metaAtendimentos
    : null;
  // cmvMetaPct: usa o CMV do orçamento aprovado; fallback para store.budgetCmvPct quando não há orçamento
  const cmvMeta = data.cmvMetaPct ?? parseFloat(store.budgetCmvPct ?? "30");
  const cmvColor = accumulated.cmvPct > cmvMeta + 1 ? "var(--red)" : accumulated.cmvPct > cmvMeta ? "var(--amber)" : "var(--green)";
  const ebitdaColor = accumulated.ebitda >= 0 ? "var(--green)" : "var(--red)";

  // Alertas de desvio
  const receitaAbaixoProRata = projecao?.receitaVsProRataPct != null && projecao.receitaVsProRataPct < 90;
  const cmvAcimaMeta = projecao?.cmvVsMeta != null && projecao.cmvVsMeta > 1;
  const ebitdaAbaixoOrcado = projecao?.ebitdaOrcadoPct != null && projecao.ebitdaPct != null && projecao.ebitdaPct < projecao.ebitdaOrcadoPct - 2;
  const temDesvio = receitaAbaixoProRata || cmvAcimaMeta || ebitdaAbaixoOrcado;

  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow mb-1">Dashboard diário</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
            Hoje<span className="dot">.</span>
          </h1>
          <p style={{ color: "var(--stone)", fontSize: 14, marginTop: 4 }}>{dateLabel} · {store.name}</p>
        </div>
      </div>

      {/* Banners */}
      <div className="space-y-2">
        {!commitmentSigned && (
          <div className="banner-alert banner-vinho cursor-pointer" onClick={() => navigate("/compromisso")}>
            <AlertCircle size={16} />
            <span>O Compromisso do trimestre ainda não foi assinado. <strong>Assinar agora →</strong></span>
          </div>
        )}
        {overdueActionsCount > 0 && (
          <div className="banner-alert banner-amber cursor-pointer" onClick={() => navigate("/plano")}>
            <AlertTriangle size={16} />
            <span>{overdueActionsCount} {overdueActionsCount === 1 ? "ação vencida" : "ações vencidas"} no Plano de Ação. <strong>Ver agora →</strong></span>
          </div>
        )}
        {openComplaintsCount > 0 && (
          <div className="banner-alert banner-amber cursor-pointer" onClick={() => navigate("/experiencia")}>
            <Star size={16} />
            <span>{openComplaintsCount} {openComplaintsCount === 1 ? "reclamação aberta" : "reclamações abertas"} sem tratamento. <strong>Ver Experiência do Cliente →</strong></span>
          </div>
        )}
        {payroll && payroll.payrollPercent != null && payroll.payrollPercent > (peopleConfig?.payrollTargetPercent ?? 20) && (
          <div className="banner-alert banner-amber cursor-pointer" onClick={() => navigate("/pessoas")}>
            <Users size={16} />
            <span>Folha de pagamento em <strong>{(payroll.payrollPercent as number).toFixed(1)}%</strong> da receita (meta: {(peopleConfig?.payrollTargetPercent ?? 20).toFixed(0)}%). <strong>Ver Pessoas →</strong></span>
          </div>
        )}
        {preturnoAtrasados.length > 0 && (
          <div className="banner-alert banner-amber cursor-pointer" onClick={() => navigate("/preturno")}>
            <Clock size={16} />
            <span>{preturnoAtrasados.length === 1 ? "Pré-turno pendente" : `${preturnoAtrasados.length} pré-turnos pendentes`} sem registro. <strong>Registrar agora →</strong></span>
          </div>
        )}
        {combinadosReuniao.length > 0 && (
          <div className="border rounded-lg p-4 space-y-2" style={{ background: "var(--ivory)", borderColor: "#e5e0d8" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--vinho)" }}>Combinados da Reunião ({combinadosReuniao.length})</h3>
              <button onClick={() => navigate("/reuniao")} className="text-xs underline" style={{ color: "var(--stone)" }}>Ver reuniões →</button>
            </div>
            {combinadosReuniao.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-start gap-2">
                <button
                  onClick={() => toggleCombinadoMut.mutate({ storeId: storeId!, id: c.id, status: "feito" })}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-600"
                >
                  <span className="inline-block w-4 h-4 border rounded-sm" />
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{c.descricao}</span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {c.responsavel && <span className="text-xs text-muted-foreground">{c.responsavel}</span>}
                    {c.prazo && <span className={`text-xs ${c.prazo < new Date().toISOString().slice(0,10) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>até {c.prazo.split("-").reverse().join("/")}</span>}
                    {c.medidaTitulo && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(128,0,32,0.1)", color: "var(--vinho)" }}>→ {c.medidaTitulo}</span>}
                  </div>
                </div>
              </div>
            ))}
            {combinadosReuniao.length > 5 && (
              <button onClick={() => navigate("/reuniao")} className="text-xs underline" style={{ color: "var(--stone)" }}>
                + {combinadosReuniao.length - 5} mais →
              </button>
            )}
          </div>
        )}
        {todayHoliday && (
          <div className="banner-alert" style={{ background: todayHoliday.eventType === "feriado" ? "#fef3c7" : "#eff6ff", borderColor: todayHoliday.eventType === "feriado" ? "#f59e0b" : "#3b82f6", color: todayHoliday.eventType === "feriado" ? "#92400e" : "#1e40af" }}>
            <span style={{ fontSize: 16 }}>{todayHoliday.eventType === "feriado" ? "🎌" : todayHoliday.eventType === "vespera" ? "📅" : "📋"}</span>
            <span>
              <strong>{todayHoliday.name}</strong>
              {todayHoliday.rule ? (
                <> — Meta ajustada para <strong>{Math.round(todayHoliday.rule.multiplier * 100)}%</strong> do dia normal
                {todayHoliday.rule.notes ? ` (${todayHoliday.rule.notes})` : ""}
                {todayHoliday.rule.source === "ia" ? " · sugestão IA" : " · ajuste manual"}</>
              ) : (
                <> — Sem regra configurada para esta data. Configure em Admin → Feriados.</>
              )}
            </span>
          </div>
        )}
        {commitmentSigned && overdueActionsCount === 0 && openComplaintsCount === 0 && preturnoAtrasados.length === 0 && !(payroll && payroll.payrollPercent != null && payroll.payrollPercent > (peopleConfig?.payrollTargetPercent ?? 20)) && (
          <div className="banner-alert banner-green">
            <CheckCircle2 size={16} />
            <span>Tudo em ordem. Bom trabalho hoje.</span>
          </div>
        )}

        {/* Banner de desvio */}
        {temDesvio && !data.semOrcamento && (
          <div className="banner-alert" style={{ background: "#fef3c7", borderColor: "#f59e0b", color: "#92400e" }}>
            <AlertTriangle size={16} />
            <span>
              <strong>Desvio detectado:</strong>{" "}
              {receitaAbaixoProRata && `Receita ${projecao!.receitaVsProRataPct!.toFixed(0)}% do pró-rata (meta ≥90%). `}
              {cmvAcimaMeta && `CMV ${projecao!.cmvVsMeta!.toFixed(1)}pp acima da meta. `}
              {ebitdaAbaixoOrcado && `EBITDA ${projecao!.ebitdaPct!.toFixed(1)}% vs orçado ${projecao!.ebitdaOrcadoPct!.toFixed(1)}%. `}
              <strong className="underline cursor-pointer ml-1" onClick={() => navigate("/meta")}>
                Ver medidas e ações →
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Setup do Mês */}
      {storeId && (
        <SetupDoMes
          storeId={storeId}
          mes={currentMonth}
          ano={currentYear}
          storeName={store?.name}
          colapsavel
        />
      )}

      {/* Statement bar */}
      <div className="statement-bar">
        <div>
          <div className="kicker">Resultado acumulado do mês</div>
          <div className="narrative">
            {accumulated.revenueVsBudgetPct >= 100
              ? `Receita ${fmtPct(accumulated.revenueVsBudgetPct - 100)} acima do orçado. CMV em ${fmtPct(accumulated.cmvPct)}.`
              : `Receita ${fmtPct(100 - accumulated.revenueVsBudgetPct)} abaixo do orçado. CMV em ${fmtPct(accumulated.cmvPct)}.`}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 11, color: "rgba(250,247,242,0.5)", marginBottom: 4, letterSpacing: "0.1em" }}>EBITDA</div>
          <div className="score-big" style={{ color: accumulated.ebitda >= 0 ? "#6FCF97" : "#EB5757" }}>
            {accumulated.ebitdaPct >= 0 ? "+" : ""}{fmtPct(accumulated.ebitdaPct)}
          </div>
        </div>
      </div>

      {/* KPI Board */}
      <div className="kpi-board">
        <div className="kpi-card">
          <div className="kpi-label">Receita hoje</div>
          <div className="kpi-value num" style={{ fontSize: 26 }}>{fmtCurrency(todayRevenue)}</div>
          <div className="kpi-sub flex items-center gap-1">
            <StatusIcon value={revenueVsToday} target={100} />
            <span>{fmtPct(revenueVsToday)} da meta diária</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Atendimentos hoje</div>
          <div className="kpi-value num" style={{ fontSize: 26 }}>{fmt(todayAtendimentos)}</div>
          <div className="kpi-sub flex items-center gap-1">
            {metaAtendimentosHoje != null ? (
              <>
                <StatusIcon value={todayAtendimentos} target={metaAtendimentosHoje} />
                <span>Meta: {fmt(metaAtendimentosHoje)}</span>
              </>
            ) : (
              <span style={{ color: "var(--stone-light)" }}>Defina o ticket médio no orçamento</span>
            )}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Ticket médio</div>
          <div className="kpi-value num" style={{ fontSize: 26 }}>{ticketMedioReal > 0 ? fmtCurrency(ticketMedioReal) : "—"}</div>
          <div className="kpi-sub flex items-center gap-1">
            {ticketMedioMeta != null && ticketMedioReal > 0 ? (
              <>
                <StatusIcon value={ticketMedioReal} target={ticketMedioMeta} />
                <span>Meta: {fmtCurrency(ticketMedioMeta)}</span>
              </>
            ) : (
              <span style={{ color: "var(--stone-light)" }}>{ticketMedioMeta != null ? fmtCurrency(ticketMedioMeta) + " meta" : "Lance atendimentos"}</span>
            )}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Receita do mês</div>
          <div className="kpi-value num" style={{ fontSize: 26 }}>{fmtCurrency(accumulated.revenue)}</div>
          <div className="kpi-sub flex items-center gap-1">
            <StatusIcon value={accumulated.revenueVsBudgetPct} target={100} />
            <span>{fmtPct(accumulated.revenueVsBudgetPct)} do orçado</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">CMV acumulado</div>
          <div className="kpi-value num" style={{ fontSize: 26, color: cmvColor }}>{fmtPct(accumulated.cmvPct)}</div>
          <div className="kpi-sub">Meta: {cmvMeta.toFixed(1)}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">EBITDA acumulado</div>
          <div className="kpi-value num" style={{ fontSize: 26, color: ebitdaColor }}>
            {accumulated.ebitdaPct >= 0 ? "+" : ""}{fmtPct(accumulated.ebitdaPct)}
          </div>
          <div className="kpi-sub">{fmtCurrency(accumulated.ebitda)}</div>
        </div>
      </div>

      {/* Card: Se o mês fechasse hoje */}
      {projecao && !projecao.semOrcamento && projecao.notas && (
        <div className="section-card" style={{ borderLeft: "3px solid var(--vinho)" }}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} style={{ color: "var(--vinho)" }} />
            <div className="eyebrow" style={{ margin: 0 }}>Projeção de fechamento no ritmo atual</div>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#f3e8ff", color: "#7c3aed" }}>
              Estimativa
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="kpi-label">EBITDA projetado</div>
              <div className="kpi-value num" style={{ fontSize: 22, color: (projecao.ebitdaPct ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                {(projecao.ebitdaPct ?? 0) >= 0 ? "+" : ""}{(projecao.ebitdaPct ?? 0).toFixed(1)}%
              </div>
              {projecao.ebitdaOrcadoPct != null && (
                <div className="kpi-sub">Meta: {projecao.ebitdaOrcadoPct.toFixed(1)}%</div>
              )}
            </div>
            <div>
              <div className="kpi-label">Nota composta</div>
              <div className="kpi-value num" style={{ fontSize: 22, color: (projecao.notas.total ?? 0) >= 80 ? "var(--green)" : (projecao.notas.total ?? 0) >= 50 ? "var(--amber)" : "var(--red)" }}>
                {projecao.notas.total != null ? projecao.notas.total.toFixed(0) : "—"}<span style={{ fontSize: 13, opacity: 0.6 }}>/100</span>
              </div>
              <div className="kpi-sub">
                R:{projecao.notas.result.toFixed(0)} · C:{projecao.notas.cmv.toFixed(0)} · Q:{projecao.notas.quality != null ? projecao.notas.quality.toFixed(0) : "—"}
              </div>
            </div>
            {projecao.variavelEstimada != null && (
              <div>
                <div className="kpi-label">Variável estimada</div>
                <div className="kpi-value num" style={{ fontSize: 22, color: "var(--vinho)" }}>
                  {fmtCurrency(projecao.variavelEstimada)}
                </div>
                <div className="kpi-sub">{projecao.papel === "gestor" ? "Gestor" : "Líder"} · gatilhos ok</div>
              </div>
            )}
            <div>
              <div className="kpi-label">Dias decorridos</div>
              <div className="kpi-value num" style={{ fontSize: 22 }}>
                {projecao.diasDecorridos}<span style={{ fontSize: 13, opacity: 0.6 }}>/{projecao.totalDias}</span>
              </div>
              <div className="kpi-sub">do mês</div>
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--stone)", fontStyle: "italic" }}>
            Projeção extrapolada do ritmo atual ({projecao.diasDecorridos}/{projecao.totalDias} dias). EBITDA e variável são estimativas — não é pagamento. A apuração real usa o fechamento do mês.
          </p>
        </div>
      )}

      {/* Launch form */}
      <div className="section-card">
        <div className="eyebrow mb-1">Lançamento do dia</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)", marginBottom: 20 }}>
          {existingEntry ? "Atualizar lançamento" : "Registrar o dia de hoje"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {[
            { label: "Receita do dia (R$)", value: revenue, setter: setRevenue, placeholder: formRevenue || "0,00", hint: `Meta: ${fmtCurrency(budgetedToday)}` },
            { label: "Atendimentos", value: atendimentos, setter: setAtendimentos, placeholder: formAtendimentos || "0", hint: metaAtendimentosHoje != null ? `Meta: ${fmt(metaAtendimentosHoje)} atend.` : "Número de clientes atendidos" },
            { label: "Mão de obra extra (R$)", value: extraLabor, setter: setExtraLabor, placeholder: formExtraLabor || "0,00", hint: "Horas extras, freelancers" },
          ].map(({ label, value, setter, placeholder, hint }) => (
            <div key={label}>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--ink)" }}>{label}</label>
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono transition-colors focus:outline-none"
                style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--vinho)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--gray-line)")}
              />
              <p className="text-xs mt-1" style={{ color: "var(--stone-light)" }}>{hint}</p>
            </div>
          ))}
        </div>
        {/* Compras do dia (somente leitura — derivado de purchase_entries) */}
        <div className="flex items-center justify-between px-1 py-2 rounded-lg" style={{ background: "var(--ivory)" }}>
          <div>
            <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>Compras do dia (notas lançadas): </span>
            <span className="text-sm font-semibold font-mono" style={{ color: "var(--ink)" }}>{fmtCurrency(parseFloat(formInvoices || "0"))}</span>
          </div>
          <a href="/lancamentos" className="text-xs font-medium hover:underline" style={{ color: "var(--vinho)" }}>Lançar nota → Central</a>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{ background: "var(--vinho)", color: "var(--white)" }}
          onMouseEnter={(e) => !saving && (e.currentTarget.style.background = "var(--vinho-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--vinho)")}
        >
          <Save size={15} />
          {saving ? "Salvando..." : "Salvar lançamento"}
        </button>
      </div>

      {/* Last 7 days */}
      {last7Days.length > 0 && (
        <div className="section-card">
          <div className="eyebrow mb-1">Histórico recente</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)", marginBottom: 16 }}>
            Últimos 7 dias
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--gray-line)" }}>
                  {["Data", "Receita", "Notas de entrada", "Relação NF/Receita"].map((h) => (
                    <th key={h} className="text-left pb-2 pr-4 font-semibold" style={{ color: "var(--stone-light)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...last7Days].reverse().map((d) => {
                  const ratio = d.revenue > 0 ? (d.invoices / d.revenue) * 100 : 0;
                  return (
                    <tr key={d.date} style={{ borderBottom: "1px solid var(--gray-line)" }}>
                      <td className="py-2.5 pr-4 font-medium">{new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</td>
                      <td className="py-2.5 pr-4 num">{fmtCurrency(d.revenue)}</td>
                      <td className="py-2.5 pr-4 num">{fmtCurrency(d.invoices)}</td>
                      <td className="py-2.5">
                        <span className={`badge-base ${ratio > 35 ? "badge-red" : ratio > 30 ? "badge-amber" : "badge-green"}`}>
                          {fmtPct(ratio)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
