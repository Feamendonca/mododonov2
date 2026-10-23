import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { Trophy, Medal, Star, TrendingUp, BookOpen, Target, Award } from "lucide-react";

function fmt(n: number) { return n.toFixed(0); }

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  ebitda: <TrendingUp size={14} />,
  cmv: <Target size={14} />,
  quality: <Star size={14} />,
  trails: <BookOpen size={14} />,
  actions: <Award size={14} />,
  commitment: <Medal size={14} />,
};

const CATEGORY_LABELS: Record<string, string> = {
  ebitda: "EBITDA",
  cmv: "CMV",
  quality: "Qualidade",
  trails: "Trilhas",
  actions: "Plano de Ação",
  commitment: "Compromisso",
};

const CATEGORY_COLORS: Record<string, string> = {
  ebitda: "var(--green)",
  cmv: "var(--amber)",
  quality: "var(--vinho)",
  trails: "#5B6AF0",
  actions: "#E67E22",
  commitment: "var(--stone)",
};

const BADGES = [
  { id: "first_entry", label: "Primeiro lançamento", icon: "🚀", desc: "Registrou o primeiro dia no app" },
  { id: "week_streak", label: "7 dias seguidos", icon: "🔥", desc: "Lançamentos por 7 dias consecutivos" },
  { id: "cmv_hero", label: "Mestre do CMV", icon: "🏆", desc: "CMV abaixo da meta por 4 semanas" },
  { id: "trail_complete", label: "Trilha concluída", icon: "📚", desc: "Completou todos os 9 módulos" },
  { id: "commitment_signed", label: "Comprometido", icon: "✍️", desc: "Assinou o compromisso do trimestre" },
  { id: "top_score", label: "Top da rede", icon: "👑", desc: "Ficou em 1º lugar no ranking mensal" },
];

function computeBadges(storeId: number | null, ranking: Array<{storeId: number; totalScore: number; scores: Record<string, number | null>}>) {
  const myStore = ranking.find((r: {storeId: number}) => r.storeId === storeId);
  const myPosition = myStore ? ranking.indexOf(myStore) + 1 : null;
  return {
    first_entry: true, // always earned once user has data
    week_streak: (myStore?.scores?.commitment ?? 0) >= 50, // proxy: commitment score
    cmv_hero: (myStore?.scores?.cmv ?? 0) >= 100,
    trail_complete: (myStore?.scores?.trails ?? 0) >= 100,
    commitment_signed: (myStore?.scores?.commitment ?? 0) >= 100,
    top_score: myPosition === 1,
  };
}

function MedalIcon({ position }: { position: number }) {
  if (position === 1) return <Trophy size={20} style={{ color: "#FFD700" }} />;
  if (position === 2) return <Medal size={20} style={{ color: "#C0C0C0" }} />;
  if (position === 3) return <Medal size={20} style={{ color: "#CD7F32" }} />;
  return <span className="num font-bold text-sm" style={{ color: "var(--stone-light)" }}>{position}</span>;
}

export default function RankingPage() {
  const { storeId } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const period = today.slice(0, 7);

  const { data: ranking = [], isLoading } = trpc.ranking.monthly.useQuery({ period }, { enabled: true });

  const myStore = ranking.find((r) => r.storeId === storeId);
  const myPosition = myStore ? ranking.indexOf(myStore) + 1 : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div>
        <div className="eyebrow mb-1">Competição saudável</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
          Ranking<span className="dot">.</span>
        </h1>
        <p style={{ color: "var(--stone)", fontSize: 14, marginTop: 4 }}>
          {new Date(period + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </p>
      </div>

      {/* My position */}
      {myStore && (
        <div className="statement-bar">
          <div>
            <div className="kicker">Sua posição</div>
            <div className="narrative">
              {myStore.storeName} — {myPosition === 1 ? "Líder da rede este mês!" : `${myPosition}º lugar na rede.`}
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 11, color: "rgba(250,247,242,0.5)", marginBottom: 4, letterSpacing: "0.1em" }}>SCORE TOTAL</div>
            <div className="score-big">{fmt(myStore.totalScore)}</div>
          </div>
        </div>
      )}

      {/* Podium */}
      {ranking.length >= 3 && (
        <div className="section-card">
          <div className="eyebrow mb-4">Pódio do mês</div>
          <div className="flex items-end justify-center gap-4">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ background: "var(--bege-dark)", color: "var(--stone)" }}>
                {ranking[1].storeName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{ranking[1].storeName}</div>
                <div className="num text-xs" style={{ color: "var(--stone-light)" }}>{fmt(ranking[1].totalScore)} pts</div>
              </div>
              <div className="w-full rounded-t-lg flex items-center justify-center py-4 text-lg"
                style={{ background: "var(--bege-dark)", height: 80 }}>
                <Medal size={24} style={{ color: "#C0C0C0" }} />
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                style={{ background: "var(--vinho)", color: "var(--white)" }}>
                {ranking[0].storeName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-center">
                <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{ranking[0].storeName}</div>
                <div className="num text-sm font-bold" style={{ color: "var(--vinho)" }}>{fmt(ranking[0].totalScore)} pts</div>
              </div>
              <div className="w-full rounded-t-lg flex items-center justify-center py-4"
                style={{ background: "rgba(113,14,43,0.1)", height: 110 }}>
                <Trophy size={32} style={{ color: "#FFD700" }} />
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ background: "var(--bege-dark)", color: "var(--stone)" }}>
                {ranking[2].storeName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{ranking[2].storeName}</div>
                <div className="num text-xs" style={{ color: "var(--stone-light)" }}>{fmt(ranking[2].totalScore)} pts</div>
              </div>
              <div className="w-full rounded-t-lg flex items-center justify-center py-4"
                style={{ background: "var(--bege-dark)", height: 60 }}>
                <Medal size={22} style={{ color: "#CD7F32" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full ranking table */}
      <div className="section-card">
        <div className="eyebrow mb-4">Placar completo</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--gray-line)" }}>
                <th className="text-left pb-2 pr-3 font-semibold" style={{ color: "var(--stone-light)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", width: 40 }}>#</th>
                <th className="text-left pb-2 pr-3 font-semibold" style={{ color: "var(--stone-light)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>Loja</th>
                {Object.keys(CATEGORY_LABELS).map((cat) => (
                  <th key={cat} className="text-center pb-2 px-2 font-semibold" style={{ color: "var(--stone-light)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    <div className="flex flex-col items-center gap-1">
                      <span style={{ color: CATEGORY_COLORS[cat] }}>{CATEGORY_ICONS[cat]}</span>
                      <span>{CATEGORY_LABELS[cat]}</span>
                    </div>
                  </th>
                ))}
                <th className="text-right pb-2 font-semibold" style={{ color: "var(--stone-light)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((store, i) => {
                const isMe = store.storeId === storeId;
                return (
                  <tr key={store.storeId}
                    style={{
                      borderBottom: "1px solid var(--gray-line)",
                      background: isMe ? "rgba(113,14,43,0.03)" : undefined,
                    }}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center justify-center w-7 h-7">
                        <MedalIcon position={i + 1} />
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-semibold" style={{ color: isMe ? "var(--vinho)" : "var(--ink)" }}>
                        {store.storeName}
                        {isMe && <span className="ml-2 text-xs font-normal" style={{ color: "var(--vinho)" }}>(você)</span>}
                      </div>
                    </td>
                    {Object.keys(CATEGORY_LABELS).map((cat) => {
                      const score = (store.scores as any)[cat] ?? 0;
                      return (
                        <td key={cat} className="py-3 px-2 text-center">
                          <span className="num text-sm font-medium" style={{ color: score >= 80 ? "var(--green)" : score >= 50 ? "var(--amber)" : "var(--red)" }}>
                            {fmt(score)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="py-3 text-right">
                      <span className="num font-bold" style={{ color: isMe ? "var(--vinho)" : "var(--ink)" }}>
                        {fmt(store.totalScore)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Badges */}
      <div className="section-card">
        <div className="eyebrow mb-4">Conquistas e badges</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {BADGES.map((badge) => {
            const earned = computeBadges(storeId, ranking)[badge.id as keyof ReturnType<typeof computeBadges>];
            const isEarned = !!earned;
            return (
              <div key={badge.id} className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                style={{
                  borderColor: isEarned ? "rgba(113,14,43,0.3)" : "var(--gray-line)",
                  background: isEarned ? "rgba(113,14,43,0.04)" : "var(--white)",
                  opacity: isEarned ? 1 : 0.45,
                }}>
                <div className="text-2xl flex-shrink-0">{badge.icon}</div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{badge.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--stone-light)" }}>{badge.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
