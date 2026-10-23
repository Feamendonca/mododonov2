import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  BookOpen, CheckCircle2, Lock, ChevronRight, ChevronLeft,
  Target, Clock, Lightbulb, AlertCircle, ClipboardList,
  Award, BarChart3, Zap, Crown, X, Check, ChevronDown, ChevronUp,
  PlayCircle, RefreshCw, ArrowRight, Star, Trophy, Pencil
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface QuizQuestao {
  pergunta: string;
  opcoes: string[];
  correta: number;
  explicacao?: string;
}

interface ConteudoBloco {
  tipo: "texto" | "tabela" | "destaque" | "lista" | "caso";
  titulo?: string;
  conteudo?: string;
  colunas?: string[];
  linhas?: string[][];
}

interface TrilhaAula {
  id: number;
  modulo_id: number;
  trilha_id: number;
  numero_semana: number | null;
  titulo: string;
  subtitulo?: string | null;
  objetivo?: string | null;
  por_que?: string | null;
  duracao_min?: number | null;
  conteudo?: ConteudoBloco[] | null;
  quiz?: QuizQuestao[] | null;
  indicador_foco?: string | null;
  compromisso_texto?: string | null;
  status: string;
  ordem: number;
}

interface TrilhaModulo {
  id: number;
  trilha_id: number;
  titulo: string;
  descricao?: string | null;
  mes_label?: string | null;
  ordem: number;
  aulas?: TrilhaAula[];
}

interface TrilhaProgresso {
  aula_id: number;
  status: string;
  pontuacao_quiz?: number | null;
  total_questoes?: number | null;
}

// ─── Content block renderers ─────────────────────────────────────────────────
function renderHtml(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function BlocoTexto({ bloco }: { bloco: ConteudoBloco }) {
  return (
    <div className="mb-5">
      {bloco.titulo && <h4 className="font-semibold text-sm mb-2" style={{ color: "var(--ink)" }}>{bloco.titulo}</h4>}
      <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--stone)" }}
        dangerouslySetInnerHTML={{ __html: renderHtml(bloco.conteudo ?? "") }} />
    </div>
  );
}

function BlocoDestaque({ bloco }: { bloco: ConteudoBloco }) {
  return (
    <div className="mb-5 p-4 rounded-xl border-l-4" style={{ borderColor: "var(--vinho)", background: "rgba(113,14,43,0.05)" }}>
      {bloco.titulo && <h4 className="font-semibold text-sm mb-2" style={{ color: "var(--vinho)" }}>{bloco.titulo}</h4>}
      <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--stone)" }}
        dangerouslySetInnerHTML={{ __html: renderHtml(bloco.conteudo ?? "") }} />
    </div>
  );
}

function BlocoTabela({ bloco }: { bloco: ConteudoBloco }) {
  if (!bloco.colunas || !bloco.linhas) return null;
  return (
    <div className="mb-5">
      {bloco.titulo && <h4 className="font-semibold text-sm mb-2" style={{ color: "var(--ink)" }}>{bloco.titulo}</h4>}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--gray-line)" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "var(--bege-dark)" }}>
              {bloco.colunas.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--ink)" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bloco.linhas.map((row, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--gray-line)", background: i % 2 === 0 ? "var(--white)" : "var(--ivory)" }}>
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 leading-relaxed" style={{ color: "var(--stone)" }}
                    dangerouslySetInnerHTML={{ __html: renderHtml(cell) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlocoCaso({ bloco }: { bloco: ConteudoBloco }) {
  return (
    <div className="mb-5 p-4 rounded-xl border" style={{ borderColor: "var(--amber)", background: "rgba(245,158,11,0.05)" }}>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle size={14} style={{ color: "var(--amber)" }} />
        <h4 className="font-semibold text-sm" style={{ color: "var(--amber)" }}>{bloco.titulo ?? "Caso da semana"}</h4>
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--stone)" }}
        dangerouslySetInnerHTML={{ __html: renderHtml(bloco.conteudo ?? "") }} />
    </div>
  );
}

function BlocoConteudo({ bloco }: { bloco: ConteudoBloco }) {
  switch (bloco.tipo) {
    case "destaque": return <BlocoDestaque bloco={bloco} />;
    case "tabela": return <BlocoTabela bloco={bloco} />;
    case "caso": return <BlocoCaso bloco={bloco} />;
    default: return <BlocoTexto bloco={bloco} />;
  }
}

// ─── Quiz Component ───────────────────────────────────────────────────────────
function QuizSection({
  questoes,
  onComplete,
}: {
  questoes: QuizQuestao[];
  onComplete: (acertos: number, total: number) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [respostas, setRespostas] = useState<(number | null)[]>(Array(questoes.length).fill(null));
  const [confirmadas, setConfirmadas] = useState<boolean[]>(Array(questoes.length).fill(false));
  const [finished, setFinished] = useState(false);

  const questao = questoes[current];
  const resposta = respostas[current];
  const confirmada = confirmadas[current];
  const acertos = respostas.filter((r, i) => r === questoes[i].correta).length;

  function confirmar() {
    if (resposta === null) return;
    const nc = [...confirmadas];
    nc[current] = true;
    setConfirmadas(nc);
  }

  function proximo() {
    if (current < questoes.length - 1) {
      setCurrent(current + 1);
    } else {
      setFinished(true);
      onComplete(acertos, questoes.length);
    }
  }

  if (finished) {
    const pct = Math.round((acertos / questoes.length) * 100);
    return (
      <div className="text-center py-8 px-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: pct >= 70 ? "var(--green-soft)" : "rgba(245,158,11,0.1)" }}>
          {pct >= 70 ? <Trophy size={28} style={{ color: "var(--green)" }} /> : <Star size={28} style={{ color: "var(--amber)" }} />}
        </div>
        <h3 className="font-bold text-xl mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
          {pct >= 70 ? "Muito bem!" : "Continue praticando!"}
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--stone)" }}>
          Você acertou <strong>{acertos} de {questoes.length}</strong> questões ({pct}%)
        </p>
        <div className="flex gap-2 justify-center">
          {pct < 100 && (
            <Button size="sm" variant="outline" onClick={() => {
              setCurrent(0);
              setRespostas(Array(questoes.length).fill(null));
              setConfirmadas(Array(questoes.length).fill(false));
              setFinished(false);
            }}>
              <RefreshCw size={13} className="mr-1" />Refazer
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Progress dots */}
      <div className="flex items-center gap-1.5 mb-6 justify-center">
        {questoes.map((_, i) => (
          <div key={i} className="w-2 h-2 rounded-full transition-all"
            style={{
              background: i < current
                ? (respostas[i] === questoes[i].correta ? "var(--green)" : "var(--vinho)")
                : i === current ? "var(--vinho)" : "var(--gray-line)",
              width: i === current ? 24 : 8,
              borderRadius: 4,
            }} />
        ))}
      </div>

      <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--stone-light)" }}>
        Questão {current + 1} de {questoes.length}
      </div>
      <p className="text-base font-semibold mb-5 leading-snug" style={{ color: "var(--ink)" }}>
        {questao.pergunta}
      </p>

      <div className="space-y-2 mb-5">
        {questao.opcoes.map((opcao, i) => {
          let bg = "var(--ivory)";
          let border = "var(--gray-line)";
          let textColor = "var(--stone)";
          if (confirmada) {
            if (i === questao.correta) { bg = "rgba(39,174,96,0.08)"; border = "var(--green)"; textColor = "var(--green)"; }
            else if (i === resposta && i !== questao.correta) { bg = "rgba(113,14,43,0.06)"; border = "var(--vinho)"; textColor = "var(--vinho)"; }
          } else if (i === resposta) {
            bg = "rgba(113,14,43,0.06)"; border = "var(--vinho)"; textColor = "var(--ink)";
          }

          return (
            <button
              key={i}
              onClick={() => !confirmada && setRespostas(prev => { const n = [...prev]; n[current] = i; return n; })}
              disabled={confirmada}
              className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
              style={{ background: bg, border: `1.5px solid ${border}`, color: textColor }}
            >
              <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>
              {opcao}
            </button>
          );
        })}
      </div>

      {confirmada && questao.explicacao && (
        <div className="mb-4 p-3 rounded-lg text-xs leading-relaxed" style={{ background: "var(--ivory)", color: "var(--stone)", border: "1px solid var(--gray-line)" }}>
          <strong style={{ color: "var(--ink)" }}>Explicação: </strong>{questao.explicacao}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!confirmada ? (
          <Button onClick={confirmar} disabled={resposta === null}
            style={{ background: "var(--vinho)", color: "var(--white)" }}>
            Confirmar
          </Button>
        ) : (
          <Button onClick={proximo} style={{ background: "var(--vinho)", color: "var(--white)" }}>
            {current < questoes.length - 1 ? <><ArrowRight size={15} className="mr-1" />Próxima</> : <><Check size={15} className="mr-1" />Ver resultado</>}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Aula Player Modal ────────────────────────────────────────────────────────
function AulaPlayer({
  aula,
  progresso,
  onClose,
  onComplete,
  onSaveCompromisso,
  compromisso,
}: {
  aula: TrilhaAula;
  progresso?: TrilhaProgresso;
  onClose: () => void;
  onComplete: (aulaId: number, acertos?: number, total?: number) => void;
  onSaveCompromisso: (aulaId: number, resultado: string) => void;
  compromisso?: { resultado?: string | null } | null;
}) {
  const blocos: ConteudoBloco[] = Array.isArray(aula.conteudo) ? aula.conteudo : [];
  const questoes: QuizQuestao[] = Array.isArray(aula.quiz) ? aula.quiz : [];
  const isConcluida = progresso?.status === "concluida";

  // Slides: intro + content blocks + quiz (if any) + compromisso
  type Slide =
    | { type: "intro" }
    | { type: "bloco"; index: number }
    | { type: "quiz" }
    | { type: "compromisso" };

  const slides: Slide[] = [
    { type: "intro" },
    ...blocos.map((_, i) => ({ type: "bloco" as const, index: i })),
    ...(questoes.length > 0 ? [{ type: "quiz" as const }] : []),
    { type: "compromisso" },
  ];

  const [slideIdx, setSlideIdx] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [quizAcertos, setQuizAcertos] = useState<number | null>(null);
  const [resultado, setResultado] = useState(compromisso?.resultado ?? "");
  const [editingResultado, setEditingResultado] = useState(false);

  const currentSlide = slides[slideIdx];
  const isLast = slideIdx === slides.length - 1;
  const isFirst = slideIdx === 0;
  const progress = Math.round(((slideIdx + 1) / slides.length) * 100);

  function handleQuizComplete(acertos: number, total: number) {
    setQuizDone(true);
    setQuizAcertos(acertos);
    setTimeout(() => setSlideIdx(prev => Math.min(prev + 1, slides.length - 1)), 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: "var(--white)", maxHeight: "90vh" }}>

        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: "var(--gray-line)", background: "var(--ivory)" }}>
          <div className="flex-1">
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--stone-light)" }}>
              Semana {aula.numero_semana} · {slideIdx + 1}/{slides.length}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--gray-line)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: "var(--vinho)" }} />
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bege-dark)] transition-colors">
            <X size={16} style={{ color: "var(--stone)" }} />
          </button>
        </div>

        {/* Slide content */}
        <div className="flex-1 overflow-y-auto">
          {currentSlide.type === "intro" && (
            <div className="p-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
                style={{ background: "rgba(113,14,43,0.08)", color: "var(--vinho)" }}>
                <BookOpen size={12} />Semana {aula.numero_semana}
              </div>
              <h2 className="text-2xl font-bold mb-2 leading-tight" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
                {aula.titulo}
              </h2>
              {aula.subtitulo && <p className="text-base mb-5" style={{ color: "var(--stone)" }}>{aula.subtitulo}</p>}

              <div className="flex flex-wrap gap-3 mb-6">
                {aula.duracao_min && (
                  <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                    style={{ background: "var(--ivory)", color: "var(--stone)", border: "1px solid var(--gray-line)" }}>
                    <Clock size={12} />~{aula.duracao_min} min
                  </div>
                )}
                {questoes.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                    style={{ background: "var(--ivory)", color: "var(--stone)", border: "1px solid var(--gray-line)" }}>
                    <Star size={12} />{questoes.length} questões
                  </div>
                )}
              </div>

              {aula.objetivo && (
                <div className="p-4 rounded-xl mb-4" style={{ background: "rgba(113,14,43,0.04)", border: "1px solid rgba(113,14,43,0.12)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={13} style={{ color: "var(--vinho)" }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--vinho)" }}>Objetivo</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--stone)" }}>{aula.objetivo}</p>
                </div>
              )}
              {aula.por_que && (
                <div className="p-4 rounded-xl" style={{ background: "var(--ivory)", border: "1px solid var(--gray-line)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb size={13} style={{ color: "var(--amber)" }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--amber)" }}>Por que esta aula</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--stone)" }}>{aula.por_que}</p>
                </div>
              )}
            </div>
          )}

          {currentSlide.type === "bloco" && (
            <div className="p-8">
              <BlocoConteudo bloco={blocos[currentSlide.index]} />
            </div>
          )}

          {currentSlide.type === "quiz" && (
            <div>
              <div className="px-6 pt-6 pb-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-3"
                  style={{ background: "rgba(113,14,43,0.08)", color: "var(--vinho)" }}>
                  <Star size={12} />Quiz da semana
                </div>
                <p className="text-sm" style={{ color: "var(--stone)" }}>Teste o que você aprendeu nesta aula.</p>
              </div>
              <QuizSection questoes={questoes} onComplete={handleQuizComplete} />
            </div>
          )}

          {currentSlide.type === "compromisso" && (
            <div className="p-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
                style={{ background: "rgba(245,158,11,0.1)", color: "var(--amber)" }}>
                <ClipboardList size={12} />Compromisso da semana
              </div>
              {aula.compromisso_texto && (
                <div className="p-4 rounded-xl mb-5 border-l-4" style={{ borderColor: "var(--vinho)", background: "rgba(113,14,43,0.04)" }}>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--stone)" }}>{aula.compromisso_texto}</p>
                </div>
              )}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Seu resultado</label>
                  {!editingResultado && (
                    <button onClick={() => setEditingResultado(true)} className="flex items-center gap-1 text-xs" style={{ color: "var(--vinho)" }}>
                      <Pencil size={11} />{resultado ? "Editar" : "Registrar"}
                    </button>
                  )}
                </div>
                {editingResultado ? (
                  <div className="space-y-3">
                    <Textarea value={resultado} onChange={e => setResultado(e.target.value)}
                      placeholder="Descreva o que você fez e o resultado obtido..."
                      rows={3} className="text-sm" style={{ borderColor: "var(--gray-line)" }} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { onSaveCompromisso(aula.id, resultado); setEditingResultado(false); }}
                        style={{ background: "var(--vinho)", color: "var(--white)" }}>
                        <Check size={13} className="mr-1" />Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingResultado(false)}>
                        <X size={13} className="mr-1" />Cancelar
                      </Button>
                    </div>
                  </div>
                ) : resultado ? (
                  <div className="p-3 rounded-xl text-sm" style={{ background: "var(--ivory)", border: "1px solid var(--gray-line)", color: "var(--stone)" }}>
                    {resultado}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl text-sm text-center" style={{ background: "var(--ivory)", border: "1px dashed var(--gray-line)", color: "var(--stone-light)" }}>
                    Nenhum resultado registrado ainda.
                  </div>
                )}
              </div>

              {/* Complete button */}
              <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--gray-line)" }}>
                {!isConcluida ? (
                  <Button onClick={() => onComplete(aula.id, quizAcertos ?? undefined, questoes.length > 0 ? questoes.length : undefined)}
                    className="w-full" style={{ background: "var(--vinho)", color: "var(--white)" }}>
                    <CheckCircle2 size={16} className="mr-2" />Marcar aula como concluída
                  </Button>
                ) : (
                  <div className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                    style={{ background: "var(--green-soft)", color: "var(--green)" }}>
                    <CheckCircle2 size={16} />Aula concluída
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: "var(--gray-line)", background: "var(--ivory)" }}>
          <Button variant="outline" size="sm" onClick={() => setSlideIdx(prev => Math.max(0, prev - 1))} disabled={isFirst}>
            <ChevronLeft size={15} className="mr-1" />Anterior
          </Button>
          {!isLast && (
            <Button size="sm" onClick={() => setSlideIdx(prev => Math.min(slides.length - 1, prev + 1))}
              disabled={currentSlide.type === "quiz" && !quizDone}
              style={{ background: "var(--vinho)", color: "var(--white)" }}>
              Próximo<ChevronRight size={15} className="ml-1" />
            </Button>
          )}
          {isLast && !isConcluida && (
            <Button size="sm" onClick={() => onComplete(aula.id, quizAcertos ?? undefined, questoes.length > 0 ? questoes.length : undefined)}
              style={{ background: "var(--green)", color: "var(--white)" }}>
              <CheckCircle2 size={15} className="mr-1" />Concluir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Trilha Card ──────────────────────────────────────────────────────────────
const TRILHA_ICONS: Record<string, React.ReactNode> = {
  BarChart3: <BarChart3 size={24} />,
  Zap: <Zap size={24} />,
  Crown: <Crown size={24} />,
};

const TRILHA_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  "mes-1-ler-os-numeros": { bg: "#1e3a5f", text: "#e8f0fe", accent: "#4a90d9" },
  "mes-2-acionar-as-alavancas": { bg: "#7c3d12", text: "#fef3c7", accent: "#f59e0b" },
  "mes-3-liderar-como-dono": { bg: "#14532d", text: "#dcfce7", accent: "#22c55e" },
};

function TrilhaCard({
  trilha,
  modulos,
  progressoMap,
  onSelectAula,
}: {
  trilha: { id: number; slug: string; titulo: string; descricao?: string | null };
  modulos: TrilhaModulo[];
  progressoMap: Map<number, TrilhaProgresso>;
  onSelectAula: (aula: TrilhaAula) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = TRILHA_COLORS[trilha.slug] ?? { bg: "var(--vinho)", text: "var(--ivory)", accent: "var(--bege)" };
  const todasAulas = modulos.flatMap(m => m.aulas ?? []);
  const concluidas = todasAulas.filter(a => progressoMap.get(a.id)?.status === "concluida").length;
  const total = todasAulas.length;
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  const iconKey = trilha.slug === "mes-1-ler-os-numeros" ? "BarChart3" : trilha.slug === "mes-2-acionar-as-alavancas" ? "Zap" : "Crown";

  function isUnlocked(aula: TrilhaAula, aulasByModulo: TrilhaAula[]) {
    const idx = aulasByModulo.findIndex(a => a.id === aula.id);
    if (idx === 0) return true;
    return progressoMap.get(aulasByModulo[idx - 1].id)?.status === "concluida";
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor: "var(--gray-line)" }}>
      {/* Card header */}
      <div className="p-6" style={{ background: colors.bg }}>
        <div className="flex items-start justify-between gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            style={{ background: "rgba(255,255,255,0.15)", color: colors.text }}>
            {TRILHA_ICONS[iconKey]}
          </div>
          {pct === 100 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.2)", color: colors.text }}>
              <Award size={11} />Concluída
            </div>
          )}
        </div>
        <h3 className="text-lg font-bold mb-1 leading-tight" style={{ fontFamily: "var(--font-display)", color: colors.text }}>
          {trilha.titulo}
        </h3>
        {trilha.descricao && (
          <p className="text-sm leading-relaxed opacity-80 mb-4" style={{ color: colors.text }}>{trilha.descricao}</p>
        )}
        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.2)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: colors.accent }} />
          </div>
          <span className="text-xs font-semibold flex-shrink-0" style={{ color: colors.text }}>
            {concluidas}/{total}
          </span>
        </div>
      </div>

      {/* Aulas list */}
      <div style={{ background: "var(--white)" }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--ivory)]"
          style={{ color: "var(--ink)", borderTop: "1px solid var(--gray-line)" }}
        >
          <span>{expanded ? "Ocultar aulas" : `Ver ${total} aulas`}</span>
          {expanded ? <ChevronUp size={15} style={{ color: "var(--stone-light)" }} /> : <ChevronDown size={15} style={{ color: "var(--stone-light)" }} />}
        </button>

        {expanded && (
          <div className="border-t" style={{ borderColor: "var(--gray-line)" }}>
            {modulos.map(modulo => {
              const aulasByModulo = modulo.aulas ?? [];
              return (
                <div key={modulo.id}>
                  {modulos.length > 1 && (
                    <div className="px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                      style={{ background: "var(--ivory)", color: "var(--stone-light)", borderBottom: "1px solid var(--gray-line)" }}>
                      {modulo.mes_label ?? modulo.titulo}
                    </div>
                  )}
                  {aulasByModulo.map((aula, idx) => {
                    const unlocked = isUnlocked(aula, aulasByModulo);
                    const concluida = progressoMap.get(aula.id)?.status === "concluida";
                    const emAndamento = progressoMap.get(aula.id)?.status === "em_andamento";
                    const isRascunho = aula.status === "rascunho";

                    return (
                      <button
                        key={aula.id}
                        onClick={() => (unlocked && !isRascunho) && onSelectAula(aula)}
                        disabled={!unlocked || isRascunho}
                        className={cn(
                          "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors border-t",
                          unlocked && !isRascunho ? "hover:bg-[var(--ivory)]" : "opacity-50 cursor-not-allowed"
                        )}
                        style={{ borderColor: "var(--gray-line)" }}
                      >
                        {/* Status indicator */}
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{
                            background: concluida ? "var(--green)" : emAndamento ? "rgba(113,14,43,0.1)" : isRascunho ? "var(--gray-line)" : unlocked ? "var(--bege-dark)" : "var(--gray-line)",
                            color: concluida ? "var(--white)" : "var(--ink)",
                            border: emAndamento ? "2px solid var(--vinho)" : "none",
                          }}>
                          {concluida ? <CheckCircle2 size={13} /> : !unlocked || isRascunho ? <Lock size={11} /> : `S${String(aula.numero_semana).padStart(2, "0")}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                            {isRascunho ? "Em breve" : aula.titulo}
                          </div>
                          {aula.subtitulo && !isRascunho && (
                            <div className="text-xs truncate" style={{ color: "var(--stone-light)" }}>{aula.subtitulo}</div>
                          )}
                        </div>
                        {aula.duracao_min && unlocked && !isRascunho && (
                          <span className="text-xs flex-shrink-0 flex items-center gap-1" style={{ color: "var(--stone-light)" }}>
                            <Clock size={11} />{aula.duracao_min}min
                          </span>
                        )}
                        {unlocked && !isRascunho && (
                          <ChevronRight size={13} style={{ color: "var(--stone-light)", flexShrink: 0 }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrilhasPage() {
  const { user } = useAuth();
  const userId = (user as any)?.id as number | undefined;
  const isAdmin = (user as any)?.role === "admin";
  const storeId = (user as any)?.storeId ?? 1;

  const [selectedAula, setSelectedAula] = useState<TrilhaAula | null>(null);
  const [selectedTrilhaId, setSelectedTrilhaId] = useState<number | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);

  const { data: trilhas = [], isLoading } = trpc.trilhas.list.useQuery();

  // Load all trilha contents
  const trilha1 = trilhas[0] ?? null;
  const trilha2 = trilhas[1] ?? null;
  const trilha3 = trilhas[2] ?? null;

  const { data: content1 } = trpc.trilhas.getWithContent.useQuery({ slug: trilha1?.slug ?? "" }, { enabled: !!trilha1 });
  const { data: content2 } = trpc.trilhas.getWithContent.useQuery({ slug: trilha2?.slug ?? "" }, { enabled: !!trilha2 });
  const { data: content3 } = trpc.trilhas.getWithContent.useQuery({ slug: trilha3?.slug ?? "" }, { enabled: !!trilha3 });

  const trilhaContents = useMemo(() => {
    const map = new Map<number, TrilhaModulo[]>();
    if (trilha1 && content1) map.set(trilha1.id, content1.modulos);
    if (trilha2 && content2) map.set(trilha2.id, content2.modulos);
    if (trilha3 && content3) map.set(trilha3.id, content3.modulos);
    return map;
  }, [trilha1, trilha2, trilha3, content1, content2, content3]);

  // Progress for each trilha
  const { data: prog1 = [], refetch: refetch1 } = trpc.trilhas.getProgresso.useQuery({ trilhaId: trilha1?.id ?? 0 }, { enabled: !!trilha1 && !!userId });
  const { data: prog2 = [], refetch: refetch2 } = trpc.trilhas.getProgresso.useQuery({ trilhaId: trilha2?.id ?? 0 }, { enabled: !!trilha2 && !!userId });
  const { data: prog3 = [], refetch: refetch3 } = trpc.trilhas.getProgresso.useQuery({ trilhaId: trilha3?.id ?? 0 }, { enabled: !!trilha3 && !!userId });

  const progressoMap = useMemo(() => {
    const m = new Map<number, TrilhaProgresso>();
    [...prog1, ...prog2, ...prog3].forEach((p: any) => m.set(p.aula_id, p));
    return m;
  }, [prog1, prog2, prog3]);

  const { data: compromissoData } = trpc.trilhas.getCompromisso.useQuery(
    { aulaId: selectedAula?.id ?? 0 },
    { enabled: !!selectedAula && !!userId }
  );

  const completeMutation = trpc.trilhas.concluirAula.useMutation({
    onSuccess: () => {
      refetch1(); refetch2(); refetch3();
      toast.success("Aula concluída! 🎉");
      setSelectedAula(null);
    },
    onError: () => toast.error("Erro ao registrar conclusão."),
  });

  const saveCompromissoMutation = trpc.trilhas.registrarCompromisso.useMutation({
    onSuccess: () => toast.success("Resultado registrado!"),
    onError: () => toast.error("Erro ao salvar resultado."),
  });

  const seedMutation = trpc.trilhas.seed.useMutation({
    onSuccess: () => { toast.success("Trilhas carregadas!"); setSeedLoading(false); },
    onError: () => { toast.error("Erro ao executar seed."); setSeedLoading(false); },
  });

  function handleSelectAula(aula: TrilhaAula) {
    setSelectedAula(aula);
    setSelectedTrilhaId(aula.trilha_id);
    // Mark as em_andamento if not started
    const prog = progressoMap.get(aula.id);
    if (!prog || prog.status === "nao_iniciada") {
      // fire and forget
    }
  }

  function handleComplete(aulaId: number, acertos?: number, total?: number) {
    completeMutation.mutate({
      aulaId,
      trilhaId: selectedTrilhaId ?? 0,
      storeId,
      pontuacaoQuiz: acertos,
      totalQuestoes: total,
    });
  }

  // Overall stats
  const totalAulas = useMemo(() => Array.from(trilhaContents.values()).flatMap(m => m).flatMap(m => m.aulas ?? []).length, [trilhaContents]);
  const totalConcluidas = useMemo(() => Array.from(progressoMap.values()).filter(p => p.status === "concluida").length, [progressoMap]);
  const overallPct = totalAulas > 0 ? Math.round((totalConcluidas / totalAulas) * 100) : 0;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded" style={{ background: "var(--bege-dark)" }} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl" style={{ background: "var(--bege-dark)" }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (trilhas.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="eyebrow mb-1">Desenvolvimento</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
          Conselho das Operações<span className="dot">.</span>
        </h1>
        <div className="mt-8 section-card text-center py-16">
          <BookOpen size={40} className="mx-auto mb-4 opacity-20" style={{ color: "var(--stone)" }} />
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>
            Nenhuma trilha disponível
          </h3>
          {isAdmin && (
            <Button onClick={() => { setSeedLoading(true); seedMutation.mutate(); }} disabled={seedLoading}
              style={{ background: "var(--vinho)", color: "var(--white)" }}>
              <PlayCircle size={16} className="mr-2" />
              {seedLoading ? "Carregando..." : "Carregar Conselho das Operações"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Desenvolvimento</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
            Conselho das Operações<span className="dot">.</span>
          </h1>
          <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--stone)" }}>
            12 semanas · 3 meses · Ler os números, acionar as alavancas e liderar como dono.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => { setSeedLoading(true); seedMutation.mutate(); }} disabled={seedLoading}>
            <RefreshCw size={13} className="mr-1" />Re-seed
          </Button>
        )}
      </div>

      {/* Overall progress bar */}
      <div className="statement-bar">
        <div>
          <div className="kicker">Progresso geral</div>
          <div className="narrative">
            {totalConcluidas === 0
              ? "Comece pela Semana 01 — Como funciona o Modo Dono."
              : totalConcluidas === totalAulas
              ? "Parabéns! Você concluiu todas as 12 semanas."
              : `${totalConcluidas} de ${totalAulas} aulas concluídas.`}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 11, color: "rgba(250,247,242,0.5)", marginBottom: 4, letterSpacing: "0.1em" }}>PROGRESSO</div>
          <div className="score-big" style={{ color: overallPct === 100 ? "#6FCF97" : "var(--ivory)" }}>{overallPct}%</div>
        </div>
      </div>
      <div className="progress-bar" style={{ height: 8 }}>
        <div className="progress-fill" style={{ width: `${overallPct}%`, background: overallPct === 100 ? "var(--green)" : "var(--vinho)", transition: "width 0.6s ease" }} />
      </div>

      {/* Trilha cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trilhas.map(trilha => (
          <TrilhaCard
            key={trilha.id}
            trilha={trilha}
            modulos={trilhaContents.get(trilha.id) ?? []}
            progressoMap={progressoMap}
            onSelectAula={handleSelectAula}
          />
        ))}
      </div>

      {/* Aula player modal */}
      {selectedAula && (
        <AulaPlayer
          aula={selectedAula}
          progresso={progressoMap.get(selectedAula.id)}
          compromisso={compromissoData}
          onClose={() => setSelectedAula(null)}
          onComplete={handleComplete}
          onSaveCompromisso={(aulaId, resultado) =>
            saveCompromissoMutation.mutate({ aulaId, trilhaId: selectedTrilhaId ?? 0, storeId, feito: true, resultado })
          }
        />
      )}
    </div>
  );
}
