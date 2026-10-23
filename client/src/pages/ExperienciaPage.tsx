import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Star, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle2,
  Plus, MessageSquare, BookOpen, Users, ExternalLink,
  Sparkles, TrendingUp, TrendingDown, Minus, Calendar, Target,
  Award, Flame, BookMarked, Lightbulb, Heart, HelpCircle, Zap
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  google: "Google", tripadvisor: "TripAdvisor", ifood: "iFood", manual: "Manual"
};
const PLATFORM_COLORS: Record<string, string> = {
  google: "bg-blue-100 text-blue-700", tripadvisor: "bg-green-100 text-green-700",
  ifood: "bg-red-100 text-red-700", manual: "bg-gray-100 text-gray-700"
};
const STATUS_LABELS: Record<string, string> = {
  registrada: "Registrada", "em-acao": "Em ação", respondida: "Respondida",
  fechada: "Fechada", ignorada: "Ignorada"
};
const STATUS_COLORS: Record<string, string> = {
  registrada: "bg-amber-100 text-amber-700", "em-acao": "bg-blue-100 text-blue-700",
  respondida: "bg-purple-100 text-purple-700", fechada: "bg-green-100 text-green-700",
  ignorada: "bg-gray-100 text-gray-500"
};
const CATEGORY_LABELS: Record<string, string> = {
  entrada: "Entrada", mesa: "Mesa", pedido: "Pedido", cozinha: "Cozinha",
  saida: "Saída", "pos-atendimento": "Pós-atendimento", digital: "Digital"
};
const COUNCIL_CATEGORY_LABELS: Record<string, string> = {
  "situacao-dificil": "Situação Difícil", inspiracao: "Inspiração",
  duvida: "Dúvida", aprendizado: "Aprendizado", outros: "Outros"
};
const COUNCIL_CATEGORY_COLORS: Record<string, string> = {
  "situacao-dificil": "bg-red-100 text-red-700",
  inspiracao: "bg-amber-100 text-amber-700",
  duvida: "bg-blue-100 text-blue-700",
  aprendizado: "bg-green-100 text-green-700",
  outros: "bg-gray-100 text-gray-600"
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StarRow({ stars, size = "sm" }: { stars: number; size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`${s} ${i <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      ))}
    </span>
  );
}

function StatCard({ label, value, sub, trend, color = "default" }: {
  label: string; value: string | number; sub?: string;
  trend?: "up" | "down" | "neutral"; color?: "default" | "green" | "red" | "amber";
}) {
  const colorMap = { default: "text-foreground", green: "text-green-600", red: "text-red-600", amber: "text-amber-600" };
  return (
    <div className="kpi-card flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <div className="flex items-end gap-2">
        <span className={`text-2xl font-bold font-display ${colorMap[color]}`}>{value}</span>
        {trend && (
          <span className="mb-1">
            {trend === "up" ? <TrendingUp className="w-4 h-4 text-green-500" /> :
             trend === "down" ? <TrendingDown className="w-4 h-4 text-red-500" /> :
             <Minus className="w-4 h-4 text-gray-400" />}
          </span>
        )}
      </div>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Sub-aba: Termômetro ──────────────────────────────────────────────────────
// stats fields from getMonthlyReviewStats:
//   positiveCount, negativeCount, openComplaints, googleAvg, tripAvg, ifoodAvg, trainingsCount, trainingsTarget

function TermometroTab({ storeId }: { storeId: number }) {
  const utils = trpc.useUtils();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: stats } = trpc.experiencia.reviews.monthlyStats.useQuery({ storeId, month, year });
  const { data: weekReviews = [] } = trpc.experiencia.reviews.weekList.useQuery({ storeId });
  const { data: suggestions = [] } = trpc.experiencia.suggestions.useQuery({ storeId });

  const createAction = trpc.actions.create.useMutation({
    onSuccess: () => {
      utils.actions.list.invalidate();
      toast.success("Ação criada no Plano de Ação!");
    }
  });

  const total = stats ? stats.positiveCount + stats.negativeCount : 0;
  const positiveRate = total > 0 ? Math.round((stats!.positiveCount / total) * 100) : 0;

  const getStatement = () => {
    if (!stats || total === 0)
      return "Nenhum registro este mês. Comece a registrar avaliações e ocorrências.";
    if (stats.openComplaints > 3)
      return `Atenção: ${stats.openComplaints} reclamações abertas precisam de ação imediata.`;
    if (positiveRate >= 80)
      return `Excelente mês! ${positiveRate}% das avaliações são positivas. Continue assim.`;
    if (positiveRate >= 60)
      return `Bom desempenho. ${stats.positiveCount} avaliações positivas. Foco em tratar as ${stats.negativeCount} reclamações.`;
    return `Mês desafiador. ${stats.negativeCount} reclamações registradas. Identifique os padrões e aja.`;
  };

  return (
    <div className="space-y-6">
      <div className="statement-bar">
        <span className="text-sm font-medium">{getStatement()}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Avaliações positivas"
          value={stats?.positiveCount ?? 0}
          sub={`${positiveRate}% do total`}
          color={positiveRate >= 80 ? "green" : positiveRate >= 60 ? "amber" : "red"}
          trend={positiveRate >= 70 ? "up" : "down"}
        />
        <StatCard
          label="Reclamações abertas"
          value={stats?.openComplaints ?? 0}
          sub="Aguardando tratamento"
          color={(stats?.openComplaints ?? 0) === 0 ? "green" : (stats?.openComplaints ?? 0) <= 2 ? "amber" : "red"}
        />
        <StatCard
          label="Nota Google (média)"
          value={stats?.googleAvg ? stats.googleAvg.toFixed(1) : "—"}
          sub="Avaliações Google"
          color={(stats?.googleAvg ?? 0) >= 4.5 ? "green" : (stats?.googleAvg ?? 0) >= 4 ? "amber" : (stats?.googleAvg ?? 0) > 0 ? "red" : "default"}
        />
        <StatCard
          label="Treinamentos no mês"
          value={stats?.trainingsCount ?? 0}
          sub={`Meta: ${stats?.trainingsTarget ?? 4}/mês`}
          color={(stats?.trainingsCount ?? 0) >= (stats?.trainingsTarget ?? 4) ? "green" : "amber"}
        />
      </div>

      {(stats?.openComplaints ?? 0) > 0 && (
        <div className="section-card border-l-4 border-l-red-400 bg-red-50/50 space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" /> {stats!.openComplaints} reclamação(ões) pendente(s)
          </h3>
          <p className="text-xs text-red-600 pl-6">Acesse a aba Avaliações para tratar cada uma.</p>
        </div>
      )}

      {(suggestions as any[]).length > 0 && (
        <div className="section-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Sugestões automáticas
          </h3>
          {(suggestions as any[]).slice(0, 3).map((s: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/50 border border-amber-100">
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">{s.title}</p>
                <p className="text-xs text-amber-700 mt-0.5">{s.description}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 gap-1"
                onClick={() => createAction.mutate({
                  storeId,
                  category: "experience",
                  description: s.title,
                  reason: s.description,
                  dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                  isSuggestion: true,
                })}>
                <Plus className="w-3 h-3" /> Plano
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="section-card">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" /> Avaliações desta semana
        </h3>
        {(weekReviews as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum registro esta semana.</p>
        ) : (
          <div className="space-y-2">
            {(weekReviews as any[]).slice(0, 6).map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[r.platform] ?? "bg-gray-100 text-gray-700"}`}>
                  {PLATFORM_LABELS[r.platform] ?? r.platform}
                </span>
                {r.stars && <StarRow stars={r.stars} />}
                {/* Review text field is `text` in the Review type */}
                <span className="text-sm text-muted-foreground flex-1 truncate">{r.text}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-aba: Avaliações ──────────────────────────────────────────────────────
// Review type fields: id, storeId, platform, stars, clientName, text, originalLink,
//   category, wentToTable, replied, replyText, actionTaken, status, reviewDate, ...

function AvaliacoesTab({ storeId }: { storeId: number }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [platform, setPlatform] = useState<"google" | "tripadvisor" | "ifood" | "manual">("manual");
  const [stars, setStars] = useState(3);
  const [reviewText, setReviewText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().split("T")[0]);

  const utils = trpc.useUtils();
  const { data: reviews = [], isLoading } = trpc.experiencia.reviews.list.useQuery({ storeId });

  const createMutation = trpc.experiencia.reviews.create.useMutation({
    onSuccess: () => {
      utils.experiencia.reviews.list.invalidate();
      utils.experiencia.reviews.weekList.invalidate();
      utils.experiencia.reviews.monthlyStats.invalidate();
      setShowCreate(false);
      setReviewText(""); setReplyText(""); setStars(3); setPlatform("manual");
      setReviewDate(new Date().toISOString().split("T")[0]);
      toast.success("Avaliação registrada!");
    }
  });

  const updateMutation = trpc.experiencia.reviews.update.useMutation({
    onSuccess: () => {
      utils.experiencia.reviews.list.invalidate();
      utils.experiencia.reviews.monthlyStats.invalidate();
      toast.success("Avaliação atualizada!");
    }
  });

  const filtered = useMemo(() => {
    const all = reviews as any[];
    if (filter === "all") return all;
    if (filter === "open") return all.filter((r: any) => r.status === "registrada" || r.status === "em-acao");
    if (filter === "negative") return all.filter((r: any) => r.stars !== null && r.stars <= 3);
    return all.filter((r: any) => r.platform === filter);
  }, [reviews, filter]);

  const selectedReview = selected ? (reviews as any[]).find((r: any) => r.id === selected) : null;

  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 p-1 rounded-xl bg-muted flex-wrap">
            {[
              { id: "all", label: "Todos" },
              { id: "open", label: "Pendentes" },
              { id: "negative", label: "Negativas" },
              { id: "google", label: "Google" },
              { id: "ifood", label: "iFood" },
              { id: "manual", label: "Manual" }
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto gap-1 h-8 text-xs">
            <Plus className="w-3 h-3" /> Registrar
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r: any) => (
              <div key={r.id} onClick={() => setSelected(r.id === selected ? null : r.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                  selected === r.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                } ${(r.status === "registrada" || r.status === "em-acao") && r.stars !== null && r.stars <= 3 ? "border-l-4 border-l-red-400" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[r.platform] ?? "bg-gray-100 text-gray-700"}`}>
                        {PLATFORM_LABELS[r.platform] ?? r.platform}
                      </span>
                      {r.stars && <StarRow stars={r.stars} />}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(r.reviewDate + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {/* text field (not reviewText) */}
                    <p className="text-sm text-muted-foreground truncate">{r.text}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs shrink-0 ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedReview && (
        <div className="w-72 shrink-0 section-card space-y-4 self-start sticky top-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Detalhes</h3>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelected(null)}>×</Button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[selectedReview.platform] ?? "bg-gray-100 text-gray-700"}`}>
                {PLATFORM_LABELS[selectedReview.platform] ?? selectedReview.platform}
              </span>
              {selectedReview.stars && <StarRow stars={selectedReview.stars} size="md" />}
            </div>
            <p className="text-sm">{selectedReview.text}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(selectedReview.reviewDate + "T12:00:00").toLocaleDateString("pt-BR")}
            </p>
            {/* replyText field (not responseText) */}
            {selectedReview.replyText && (
              <div className="bg-green-50 rounded p-2">
                <p className="text-xs text-green-700"><span className="font-medium">Resposta:</span> {selectedReview.replyText}</p>
              </div>
            )}
            {selectedReview.actionTaken && (
              <div className="bg-blue-50 rounded p-2">
                <p className="text-xs text-blue-700"><span className="font-medium">Ação:</span> {selectedReview.actionTaken}</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {selectedReview.status !== "fechada" && (
              <Button size="sm" className="w-full h-8 text-xs gap-1"
                onClick={() => updateMutation.mutate({ id: selectedReview.id, status: "fechada" })}
                disabled={updateMutation.isPending}>
                <CheckCircle2 className="w-3 h-3" /> Marcar como fechada
              </Button>
            )}
            {selectedReview.status === "registrada" && (
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1"
                onClick={() => updateMutation.mutate({ id: selectedReview.id, status: "em-acao" })}
                disabled={updateMutation.isPending}>
                Em ação
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar avaliação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Plataforma</label>
                {/* platform must be typed as the enum union */}
                <Select value={platform} onValueChange={v => setPlatform(v as "google" | "tripadvisor" | "ifood" | "manual")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                    <SelectItem value="ifood">iFood</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Data</label>
                <Input type="date" className="h-9" value={reviewDate}
                  onChange={e => setReviewDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Nota (estrelas)</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setStars(s)}
                    className={`p-2 rounded-lg transition-colors ${s <= stars ? "bg-amber-100" : "bg-muted"}`}>
                    <Star className={`w-5 h-5 ${s <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Texto da avaliação *</label>
              <Textarea className="min-h-[80px]" placeholder="O que o cliente disse ou o que aconteceu..."
                value={reviewText} onChange={e => setReviewText(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Resposta ao cliente (opcional)</label>
              <Input className="h-9" placeholder="Como respondemos?"
                value={replyText} onChange={e => setReplyText(e.target.value)} />
            </div>
            {/* create input: storeId, platform (enum), stars, clientName?, text?, originalLink?, reviewDate, tags? */}
            <Button className="w-full"
              onClick={() => createMutation.mutate({
                storeId,
                platform,
                stars,
                text: reviewText || undefined,
                reviewDate,
              })}
              disabled={!reviewText || createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-aba: Padrão ──────────────────────────────────────────────────────────
// ServiceStandard fields: id, storeId, layer, brand, category, text, whyText,
//   positiveExample, negativeExample, appliesTo, active

function PadraoTab({ storeId }: { storeId: number }) {
  const [, navigate] = useLocation();
  const [activeCategory, setActiveCategory] = useState("entrada");

  const { data: standards = [] } = trpc.experiencia.standards.list.useQuery({ storeId });
  const { data: observations = [] } = trpc.experiencia.observations.list.useQuery({ storeId });

  const DEFAULT_STANDARDS = [
    { id: -1, category: "entrada", layer: "base", text: "Cumprimentar o cliente em até 30 segundos após a entrada", whyText: "A primeira impressão define a experiência inteira.", positiveExample: "Garçom se levanta e vai ao encontro do cliente com sorriso", negativeExample: "Cliente espera 5 minutos sem ser notado" },
    { id: -2, category: "mesa", layer: "base", text: "Apresentar o cardápio e fazer uma recomendação personalizada", whyText: "Aumenta o ticket médio e cria conexão com o cliente.", positiveExample: "\"Hoje temos um especial de carne que está incrível\"", negativeExample: "Jogar o cardápio na mesa sem dizer nada" },
    { id: -3, category: "pedido", layer: "base", text: "Confirmar o pedido repetindo os itens ao cliente", whyText: "Evita erros e demonstra atenção.", positiveExample: "\"Então são dois filés ao ponto e uma água com gás, correto?\"", negativeExample: "Anotar sem confirmar e trazer o prato errado" },
    { id: -4, category: "cozinha", layer: "base", text: "Informar o cliente se o prato demorar mais de 20 minutos", whyText: "Gerencia a expectativa e evita reclamações.", positiveExample: "\"Seu prato está sendo preparado, deve demorar mais 10 minutos\"", negativeExample: "Deixar o cliente esperando sem nenhuma comunicação" },
    { id: -5, category: "saida", layer: "base", text: "Agradecer a visita e convidar para retornar", whyText: "Fidelização começa na despedida.", positiveExample: "\"Foi um prazer tê-lo aqui, esperamos vê-lo em breve!\"", negativeExample: "Cliente sai sem ser notado" },
    { id: -6, category: "pos-atendimento", layer: "base", text: "Responder avaliações negativas em até 48h com empatia e solução", whyText: "Demonstra responsabilidade e pode reverter a percepção negativa.", positiveExample: "Resposta personalizada com pedido de desculpas e compensação", negativeExample: "Ignorar ou responder de forma defensiva" }
  ];

  const filtered = (standards as any[]).filter((s: any) => s.category === activeCategory);
  const displayStandards = filtered.length > 0 ? filtered : DEFAULT_STANDARDS.filter(s => s.category === activeCategory);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Padrões de atendimento por etapa do serviço. Compartilhe com sua equipe regularmente.
        </p>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs"
          onClick={() => navigate("/plano")}>
          <ExternalLink className="w-3 h-3" /> Vincular ao Plano de Ação
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setActiveCategory(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}>
            {v}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {displayStandards.map((s: any, i: number) => (
          <div key={s.id ?? i} className="section-card space-y-3">
            <div className="flex items-start gap-3">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary shrink-0">
                {s.layer === "base" ? "Rede" : "Loja"}
              </span>
              <p className="text-sm font-medium flex-1">{s.text}</p>
            </div>
            {s.whyText && (
              <p className="text-xs text-muted-foreground pl-16">
                <span className="font-medium">Por quê:</span> {s.whyText}
              </p>
            )}
            {(s.positiveExample || s.negativeExample) && (
              <div className="grid grid-cols-2 gap-2 pl-16">
                {s.positiveExample && (
                  <div className="bg-green-50 rounded p-2">
                    <p className="text-xs text-green-700">
                      <ThumbsUp className="w-3 h-3 inline mr-1" />{s.positiveExample}
                    </p>
                  </div>
                )}
                {s.negativeExample && (
                  <div className="bg-red-50 rounded p-2">
                    <p className="text-xs text-red-700">
                      <ThumbsDown className="w-3 h-3 inline mr-1" />{s.negativeExample}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {(observations as any[]).length > 0 && (
        <div className="section-card">
          <h3 className="font-semibold text-sm mb-3">Observações recentes da equipe</h3>
          <div className="space-y-2">
            {(observations as any[]).slice(0, 5).map((o: any) => (
              <div key={o.id} className="flex items-start gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded shrink-0 ${
                  o.type === "positivo" ? "bg-green-100 text-green-700" :
                  o.type === "a-melhorar" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {o.type === "positivo" ? "✓" : o.type === "a-melhorar" ? "!" : "~"} Func. #{o.employeeId}
                </span>
                <span className="text-muted-foreground">{o.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-aba: Treinamento ─────────────────────────────────────────────────────
// TrainingSession fields: id, storeId, sessionDate (not scheduledDate), theme,
//   linkedStandardId, contentLink, contentText, participants (number[]), status, notes

function TreinamentoTab({ storeId }: { storeId: number }) {
  const now = new Date();
  const [showCreate, setShowCreate] = useState(false);
  const [theme, setTheme] = useState("");
  // sessionDate (not scheduledDate)
  const [sessionDate, setSessionDate] = useState(now.toISOString().split("T")[0]);
  const [status, setStatus] = useState<"planejada" | "realizada" | "cancelada" | "remarcada">("planejada");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: sessions = [], isLoading } = trpc.experiencia.training.list.useQuery({ storeId });
  const { data: weekCount } = trpc.experiencia.training.weekCount.useQuery({ storeId });

  const createMutation = trpc.experiencia.training.create.useMutation({
    onSuccess: () => {
      utils.experiencia.training.list.invalidate();
      utils.experiencia.training.weekCount.invalidate();
      utils.experiencia.reviews.monthlyStats.invalidate();
      setShowCreate(false);
      setTheme(""); setNotes("");
      setSessionDate(now.toISOString().split("T")[0]);
      setStatus("planejada");
      toast.success("Sessão registrada!");
    }
  });

  const updateMutation = trpc.experiencia.training.update.useMutation({
    onSuccess: () => {
      utils.experiencia.training.list.invalidate();
      utils.experiencia.training.weekCount.invalidate();
      toast.success("Sessão atualizada!");
    }
  });

  const SESSION_STATUS_COLORS: Record<string, string> = {
    planejada: "bg-blue-100 text-blue-700", realizada: "bg-green-100 text-green-700",
    cancelada: "bg-red-100 text-red-700", remarcada: "bg-amber-100 text-amber-700"
  };

  const SUGGESTED_THEMES = [
    "Como lidar com reclamações em mesa",
    "Técnicas de recomendação e venda",
    "Comunicação empática com o cliente",
    "Padrão de atendimento na entrada",
    "Como responder avaliações negativas",
    "Fidelização e experiência memorável"
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
          (weekCount ?? 0) >= 1 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
        }`}>
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-medium">
            {weekCount ?? 0} treinamento(s) essa semana
            {(weekCount ?? 0) === 0 ? " — meta: 1 por semana" : " ✓"}
          </span>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto gap-1">
          <Plus className="w-3 h-3" /> Registrar sessão
        </Button>
      </div>

      <div className="section-card bg-amber-50/50 border-amber-200">
        <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
          <Lightbulb className="w-4 h-4" /> Sugestões de temas para treinamento
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {SUGGESTED_THEMES.map((t, i) => (
            <button key={i} onClick={() => { setTheme(t); setShowCreate(true); }}
              className="text-left text-xs text-amber-700 hover:text-amber-900 p-2 rounded hover:bg-amber-100 transition-colors">
              → {t}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : (sessions as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookMarked className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma sessão registrada ainda.</p>
          <p className="text-xs mt-1">Registre ao menos 1 treinamento por semana.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(sessions as any[]).map((s: any) => (
            <div key={s.id} className="section-card">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${SESSION_STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                  <BookMarked className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{s.theme}</p>
                    <span className={`px-2 py-0.5 rounded text-xs ${SESSION_STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </span>
                    {s.participants && s.participants.length > 0 && (
                      <span className="text-xs text-muted-foreground">{s.participants.length} participante(s)</span>
                    )}
                  </div>
                  {/* sessionDate (not scheduledDate) */}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(s.sessionDate + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                  {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                </div>
                {s.status === "planejada" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => updateMutation.mutate({ id: s.id, status: "realizada" })}
                    disabled={updateMutation.isPending}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Realizada
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar sessão de treinamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Tema *</label>
              <Input className="h-9" placeholder="Ex: Atendimento na mesa, Reclamações difíceis..."
                value={theme} onChange={e => setTheme(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Data</label>
                <Input type="date" className="h-9" value={sessionDate}
                  onChange={e => setSessionDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Status</label>
                <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planejada">Planejada</SelectItem>
                    <SelectItem value="realizada">Realizada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="remarcada">Remarcada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Notas / observações</label>
              <Textarea className="min-h-[60px]" value={notes}
                onChange={e => setNotes(e.target.value)} />
            </div>
            {/* create input: storeId, sessionDate (required), theme, status?, notes? */}
            <Button className="w-full"
              onClick={() => createMutation.mutate({
                storeId,
                theme,
                sessionDate,
                status,
                notes: notes || undefined,
              })}
              disabled={!theme || createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Registrar sessão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-aba: Conselho ────────────────────────────────────────────────────────
// CouncilCase fields: id, storeId, authorUserId, caseDate, title, category, text,
//   learning, linkedReviewId, employeeName, shared, passedByStores, tookToTeamStores, status
// council.update accepts: id, status?, passedByStores?, tookToTeamStores?, consolidatedStandardId?
//   (NO readByManager or sharedWithTeam — use passedByStores/tookToTeamStores arrays instead)

function ConselhoTab({ storeId }: { storeId: number }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"situacao-dificil" | "inspiracao" | "duvida" | "aprendizado" | "outros">("situacao-dificil");
  const [text, setText] = useState("");
  const [learning, setLearning] = useState("");
  const [caseDate, setCaseDate] = useState(new Date().toISOString().split("T")[0]);

  const utils = trpc.useUtils();
  const { data: cases = [], isLoading } = trpc.experiencia.council.list.useQuery({ storeId });

  const createMutation = trpc.experiencia.council.create.useMutation({
    onSuccess: () => {
      utils.experiencia.council.list.invalidate();
      setShowCreate(false);
      setTitle(""); setText(""); setLearning("");
      setCaseDate(new Date().toISOString().split("T")[0]);
      setCategory("situacao-dificil");
      toast.success("Caso publicado no Conselho!");
    }
  });

  const updateMutation = trpc.experiencia.council.update.useMutation({
    onSuccess: () => utils.experiencia.council.list.invalidate()
  });

  const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    "situacao-dificil": <Flame className="w-4 h-4" />,
    inspiracao: <Sparkles className="w-4 h-4" />,
    duvida: <HelpCircle className="w-4 h-4" />,
    aprendizado: <Lightbulb className="w-4 h-4" />,
    outros: <MessageSquare className="w-4 h-4" />
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Compartilhe situações reais com outros gerentes da rede. Casos inspiradores, desafios e aprendizados.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="w-3 h-3" /> Publicar caso
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : (cases as any[]).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Nenhum caso publicado ainda.</p>
          <p className="text-xs mt-1">Seja o primeiro a compartilhar um aprendizado com a rede.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(cases as any[]).map((c: any) => {
            const alreadyPassed = (c.passedByStores ?? []).includes(storeId);
            const alreadyTook = (c.tookToTeamStores ?? []).includes(storeId);
            return (
              <div key={c.id} className="section-card space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${COUNCIL_CATEGORY_COLORS[c.category] ?? "bg-gray-100 text-gray-600"}`}>
                    {CATEGORY_ICONS[c.category] ?? <MessageSquare className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{c.title}</p>
                      <span className={`px-2 py-0.5 rounded text-xs ${COUNCIL_CATEGORY_COLORS[c.category] ?? "bg-gray-100 text-gray-600"}`}>
                        {COUNCIL_CATEGORY_LABELS[c.category] ?? c.category}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(c.caseDate + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{c.text}</p>

                {c.learning && (
                  <div className="bg-amber-50 rounded-lg p-3 flex gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      <span className="font-medium">Aprendizado:</span> {c.learning}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  {/* "Marcar como lido" uses passedByStores array */}
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => {
                      if (!alreadyPassed) {
                        updateMutation.mutate({
                          id: c.id,
                          passedByStores: [...(c.passedByStores ?? []), storeId]
                        });
                      }
                    }}
                    disabled={alreadyPassed || updateMutation.isPending}>
                    <CheckCircle2 className="w-3 h-3" />
                    {alreadyPassed ? "Já li ✓" : "Marcar como lido"}
                  </Button>
                  {/* "Levar para o time" uses tookToTeamStores array */}
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => {
                      if (!alreadyTook) {
                        updateMutation.mutate({
                          id: c.id,
                          tookToTeamStores: [...(c.tookToTeamStores ?? []), storeId]
                        });
                        toast.success("Marcado que levou para o time!");
                      }
                    }}
                    disabled={alreadyTook || updateMutation.isPending}>
                    <Heart className="w-3 h-3" />
                    {alreadyTook ? "Levei para o time ✓" : "Levar para o time"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Publicar caso no Conselho</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Categoria</label>
                <Select value={category} onValueChange={v => setCategory(v as typeof category)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COUNCIL_CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Data</label>
                <Input type="date" className="h-9" value={caseDate}
                  onChange={e => setCaseDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Título *</label>
              <Input className="h-9" placeholder="Resumo em uma linha..."
                value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">O que aconteceu? *</label>
              <Textarea className="min-h-[80px]" placeholder="Descreva a situação com detalhes..."
                value={text} onChange={e => setText(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Aprendizado / como resolvemos</label>
              <Textarea className="min-h-[60px]" placeholder="O que aprendemos com isso?"
                value={learning} onChange={e => setLearning(e.target.value)} />
            </div>
            {/* council.create: storeId, caseDate, title, category (enum), text, learning? */}
            <Button className="w-full"
              onClick={() => createMutation.mutate({
                storeId,
                title,
                category,
                text,
                learning: learning || undefined,
                caseDate,
              })}
              disabled={!title || !text || createMutation.isPending}>
              {createMutation.isPending ? "Publicando..." : "Publicar no Conselho"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExperienciaPage() {
  const { storeId } = useStore();
  const [activeTab, setActiveTab] = useState("termometro");

  if (!storeId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">Selecione uma loja para continuar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Experiência do Cliente</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Avaliações, padrões de atendimento, treinamento e conselho de gestores.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 h-10">
          <TabsTrigger value="termometro" className="text-xs gap-1">
            <Target className="w-3 h-3" /> Termômetro
          </TabsTrigger>
          <TabsTrigger value="avaliacoes" className="text-xs gap-1">
            <Star className="w-3 h-3" /> Avaliações
          </TabsTrigger>
          <TabsTrigger value="padrao" className="text-xs gap-1">
            <BookOpen className="w-3 h-3" /> Padrão
          </TabsTrigger>
          <TabsTrigger value="treinamento" className="text-xs gap-1">
            <Award className="w-3 h-3" /> Treinamento
          </TabsTrigger>
          <TabsTrigger value="conselho" className="text-xs gap-1">
            <Users className="w-3 h-3" /> Conselho
          </TabsTrigger>
        </TabsList>

        <TabsContent value="termometro" className="mt-6">
          <TermometroTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="avaliacoes" className="mt-6">
          <AvaliacoesTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="padrao" className="mt-6">
          <PadraoTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="treinamento" className="mt-6">
          <TreinamentoTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="conselho" className="mt-6">
          <ConselhoTab storeId={storeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
