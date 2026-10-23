import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, Circle, PenLine } from "lucide-react";

const BLOCKS = [
  {
    id: "experiencia",
    title: "Bloco 1 — Experiência do Cliente",
    color: "var(--vinho)",
    items: [
      { key: "reviewsTarget", type: "number", label: "Meta de avaliações no mês", placeholder: "30" },
      { key: "tableResponseHours", type: "number", label: "Prazo de resposta em mesa (horas)", placeholder: "24" },
      { key: "googleResponseHours", type: "number", label: "Prazo de resposta no Google (horas)", placeholder: "48" },
      { key: "trainTeam", type: "bool", label: "Treinarei a equipe no padrão de atendimento" },
      { key: "actOnStandard", type: "bool", label: "Agirei sobre desvios do padrão imediatamente" },
      { key: "joinCommunity", type: "bool", label: "Participarei ativamente da comunidade dos gestores" },
    ],
  },
  {
    id: "disciplina",
    title: "Bloco 2 — Disciplina Operacional",
    color: "var(--amber)",
    items: [
      { key: "doPreShift", type: "bool", label: "Farei a reunião de pré-turno todos os dias" },
      { key: "doAppEntry", type: "bool", label: "Lançarei os dados no app diariamente" },
      { key: "doWeeklyMeeting", type: "bool", label: "Realizarei a reunião semanal com a equipe" },
    ],
  },
  {
    id: "estoque",
    title: "Bloco 3 — Controle de Estoque",
    color: "var(--green)",
    items: [
      { key: "doInitialCount", type: "bool", label: "Farei a contagem inicial no dia 1 do mês" },
      { key: "doWeeklyCount", type: "bool", label: "Farei a contagem semanal toda terça-feira" },
      { key: "doMonthlyCount", type: "bool", label: "Farei a contagem mensal no último dia do mês" },
    ],
  },
  {
    id: "aprendizado",
    title: "Bloco 4 — Aprendizado",
    color: "#5B6AF0",
    items: [
      { key: "readTrails", type: "bool", label: "Avançarei nas trilhas de aprendizado toda semana" },
      { key: "joinCouncil", type: "bool", label: "Participarei das reuniões do Conselho de Gestores" },
      { key: "applyContent", type: "bool", label: "Aplicarei o conteúdo aprendido na minha loja" },
    ],
  },
];

export default function CompromissoPage() {
  const { storeId } = useStore();
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const period = today.slice(0, 7);

  const [form, setForm] = useState<Record<string, any>>({
    reviewsTarget: 30, tableResponseHours: 24, googleResponseHours: 48,
    trainTeam: false, actOnStandard: false, joinCommunity: false,
    doPreShift: false, doAppEntry: false, doWeeklyMeeting: false,
    doInitialCount: false, doWeeklyCount: false, doMonthlyCount: false,
    readTrails: false, joinCouncil: false, applyContent: false,
  });
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signedBy, setSignedBy] = useState(user?.name ?? "");

  const { data: commitment, refetch } = trpc.commitment.get.useQuery(
    { storeId: storeId!, period },
    { enabled: !!storeId }
  );
  const saveMutation = trpc.commitment.save.useMutation();
  const signMutation = trpc.commitment.sign.useMutation();

  useEffect(() => {
    if (commitment) {
      setForm({
        reviewsTarget: commitment.reviewsTarget ?? 30,
        tableResponseHours: commitment.tableResponseHours ?? 24,
        googleResponseHours: commitment.googleResponseHours ?? 48,
        trainTeam: commitment.trainTeam ?? false,
        actOnStandard: commitment.actOnStandard ?? false,
        joinCommunity: commitment.joinCommunity ?? false,
        doPreShift: commitment.doPreShift ?? false,
        doAppEntry: commitment.doAppEntry ?? false,
        doWeeklyMeeting: commitment.doWeeklyMeeting ?? false,
        doInitialCount: commitment.doInitialCount ?? false,
        doWeeklyCount: commitment.doWeeklyCount ?? false,
        doMonthlyCount: commitment.doMonthlyCount ?? false,
        readTrails: commitment.readTrails ?? false,
        joinCouncil: commitment.joinCouncil ?? false,
        applyContent: commitment.applyContent ?? false,
      });
    }
  }, [commitment]);

  async function handleSave() {
    if (!storeId) return;
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ storeId, period, ...form });
      toast.success("Compromisso salvo.");
      refetch();
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSign() {
    if (!storeId || !signedBy.trim()) return;
    setSigning(true);
    try {
      await saveMutation.mutateAsync({ storeId, period, ...form });
      await signMutation.mutateAsync({ storeId, period, signedBy: signedBy.trim() });
      toast.success("Compromisso assinado com sucesso!");
      setShowSignModal(false);
      refetch();
    } catch {
      toast.error("Erro ao assinar.");
    } finally {
      setSigning(false);
    }
  }

  const isSigned = commitment?.signed ?? false;
  const boolItems = Object.entries(form).filter(([k, v]) => typeof v === "boolean");
  const checkedCount = boolItems.filter(([, v]) => v).length;
  const totalBool = boolItems.length;
  const progress = totalBool > 0 ? (checkedCount / totalBool) * 100 : 0;

  const periodLabel = new Date(period + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-1">Comprometimento trimestral</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
            Compromisso<span className="dot">.</span>
          </h1>
          <p style={{ color: "var(--stone)", fontSize: 14, marginTop: 4 }}>{periodLabel}</p>
        </div>
        {isSigned && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "var(--green-soft)", border: "1px solid rgba(31,111,61,0.2)" }}>
            <CheckCircle2 size={16} style={{ color: "var(--green)" }} />
            <div>
              <div className="text-xs font-bold" style={{ color: "var(--green)" }}>ASSINADO</div>
              <div className="text-xs" style={{ color: "var(--green)" }}>por {commitment?.signedBy}</div>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="section-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Itens confirmados</span>
          <span className="num text-sm font-bold" style={{ color: "var(--vinho)" }}>{checkedCount}/{totalBool}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%`, background: progress === 100 ? "var(--green)" : "var(--vinho)" }} />
        </div>
      </div>

      {/* Blocks */}
      {BLOCKS.map((block) => (
        <div key={block.id} className="section-card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full" style={{ background: block.color }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, color: "var(--ink)" }}>
              {block.title}
            </h2>
          </div>
          <div className="space-y-3">
            {block.items.map((item) => (
              <div key={item.key}>
                {item.type === "bool" ? (
                  <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg transition-colors ${isSigned ? "opacity-70 cursor-not-allowed" : "hover:bg-gray-50"}`}>
                    <div className="mt-0.5 flex-shrink-0" onClick={() => !isSigned && setForm((f) => ({ ...f, [item.key]: !f[item.key] }))}>
                      {form[item.key]
                        ? <CheckCircle2 size={20} style={{ color: block.color }} />
                        : <Circle size={20} style={{ color: "var(--gray-soft)" }} />}
                    </div>
                    <span className="text-sm" style={{ color: form[item.key] ? "var(--ink)" : "var(--stone)" }}>
                      {item.label}
                    </span>
                  </label>
                ) : (
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium flex-1" style={{ color: "var(--ink)" }}>{item.label}</label>
                    <input type="number" value={form[item.key] ?? ""} onChange={(e) => !isSigned && setForm((f) => ({ ...f, [item.key]: parseInt(e.target.value) || 0 }))}
                      disabled={isSigned}
                      className="w-24 px-3 py-2 rounded-lg border text-sm font-mono text-right"
                      style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Actions */}
      {!isSigned && (
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border"
            style={{ borderColor: "var(--gray-line)", color: "var(--stone)" }}>
            {saving ? "Salvando..." : "Salvar rascunho"}
          </button>
          <button onClick={() => setShowSignModal(true)}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: "var(--vinho)", color: "var(--white)" }}>
            <PenLine size={16} />
            Assinar compromisso
          </button>
        </div>
      )}

      {/* Sign modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(26,20,17,0.5)" }}>
          <div className="section-card w-full max-w-md text-center" style={{ padding: 32 }}>
            <PenLine size={32} className="mx-auto mb-4" style={{ color: "var(--vinho)" }} />
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
              Assinar Compromisso
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--stone)" }}>
              Ao assinar, você confirma que leu e se compromete com todos os itens acima para o período de <strong>{periodLabel}</strong>.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-left" style={{ color: "var(--ink)" }}>Seu nome completo</label>
              <input type="text" value={signedBy} onChange={(e) => setSignedBy(e.target.value)}
                placeholder="Nome do gerente"
                className="w-full px-4 py-3 rounded-xl border text-sm text-center font-medium"
                style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSignModal(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold border"
                style={{ borderColor: "var(--gray-line)", color: "var(--stone)" }}>
                Cancelar
              </button>
              <button onClick={handleSign} disabled={signing || !signedBy.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "var(--vinho)", color: "var(--white)", opacity: signing || !signedBy.trim() ? 0.6 : 1 }}>
                {signing ? "Assinando..." : "Confirmar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
