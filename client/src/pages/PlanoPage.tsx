import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Plus, Lightbulb, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
  Trash2, Paperclip, Upload, FileText, FileSpreadsheet, Image, Film,
  Download, X, Loader2,
} from "lucide-react";
import { Circle } from "lucide-react";
import { ACTION_CATEGORIES, ACTION_STATUS_LABELS, ACTION_TEMPLATES } from "../../../shared/constants";

const MAX_ACTIVE = 5;
const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
  "video/mp4",
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <Image size={16} />;
  if (mimeType === "video/mp4") return <Film size={16} />;
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return <FileSpreadsheet size={16} />;
  return <FileText size={16} />;
}

// ─── Anexos Component ────────────────────────────────────────────────────────
function AnexosSection({ acaoId, lojaId, isAdmin }: { acaoId: number; lojaId: number; isAdmin: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: anexos = [], refetch } = trpc.actions.listAnexos.useQuery({ acaoId }, { enabled: !!acaoId });
  const uploadMut = trpc.actions.uploadAnexo.useMutation();
  const deleteMut = trpc.actions.deleteAnexo.useMutation();

  const handleFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) { toast.error("Arquivo muito grande. Limite: 16MB"); return; }
    if (!ALLOWED_TYPES.includes(file.type)) { toast.error("Tipo não permitido. Use PDF, Excel, Word, imagem ou MP4."); return; }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await uploadMut.mutateAsync({ acaoId, lojaId, nome: file.name, mimeType: file.type, tamanho: file.size, base64 });
      toast.success("Arquivo anexado!");
      refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao fazer upload");
    } finally {
      setUploading(false);
    }
  }, [acaoId, lojaId, uploadMut, refetch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este anexo?")) return;
    try { await deleteMut.mutateAsync({ id }); toast.success("Anexo removido"); refetch(); }
    catch { toast.error("Erro ao remover anexo"); }
  };

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--gray-line)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--stone)" }}>
          <Paperclip size={13} />
          Materiais de apoio
          {anexos.length > 0 && <span className="badge-base" style={{ fontSize: 10, padding: "1px 6px" }}>{anexos.length}</span>}
        </span>
        {isAdmin && (
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "var(--vinho)", color: "var(--white)", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? "Enviando..." : "Anexar"}
          </button>
        )}
        <input ref={fileInputRef} type="file" className="hidden"
          accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp,.mp4"
          onChange={handleInputChange} />
      </div>
      {isAdmin && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border-2 border-dashed p-3 text-center cursor-pointer transition-all mb-3"
          style={{ borderColor: dragOver ? "var(--vinho)" : "var(--gray-line)", background: dragOver ? "rgba(109,40,40,0.04)" : "transparent" }}>
          <Upload size={16} className="mx-auto mb-1" style={{ color: dragOver ? "var(--vinho)" : "var(--stone-light)" }} />
          <p className="text-xs" style={{ color: "var(--stone-light)" }}>
            Arraste um arquivo ou <span style={{ color: "var(--vinho)", fontWeight: 600 }}>clique para selecionar</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--stone-light)", opacity: 0.7 }}>PDF, Excel, Word, imagem ou MP4 · Máx. 16MB</p>
        </div>
      )}
      {anexos.length === 0 && !isAdmin && (
        <p className="text-xs text-center py-2" style={{ color: "var(--stone-light)" }}>Nenhum material anexado.</p>
      )}
      {anexos.length > 0 && (
        <div className="space-y-2">
          {anexos.map((anexo) => (
            <div key={anexo.id} className="flex items-center gap-3 p-2.5 rounded-lg"
              style={{ background: "var(--ivory)", border: "1px solid var(--gray-line)" }}>
              <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(109,40,40,0.08)", color: "var(--vinho)" }}>
                {getFileIcon(anexo.mimeType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: "var(--ink)" }}>{anexo.nome}</div>
                <div className="text-xs" style={{ color: "var(--stone-light)" }}>
                  {formatBytes(anexo.tamanho)} · {new Date(anexo.criadoEm).toLocaleDateString("pt-BR")}
                  {anexo.criadoPor && ` · ${anexo.criadoPor}`}
                </div>
              </div>
              {anexo.mimeType.startsWith("image/") && (
                <a href={anexo.url} target="_blank" rel="noopener noreferrer">
                  <img src={anexo.url} alt={anexo.nome} className="w-9 h-9 object-cover rounded" />
                </a>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                <a href={anexo.url} download={anexo.nome} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg transition-colors hover:bg-gray-100" title="Baixar">
                  <Download size={13} style={{ color: "var(--stone)" }} />
                </a>
                {isAdmin && (
                  <button onClick={() => handleDelete(anexo.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-50" title="Remover">
                    <X size={13} style={{ color: "var(--stone-light)" }} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function catColor(cat: string) {
  return ACTION_CATEGORIES.find((c) => c.id === cat)?.color ?? "var(--stone)";
}
function catLabel(cat: string) {
  return ACTION_CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    todo: { cls: "badge-amber", icon: <Clock size={11} /> },
    doing: { cls: "badge-base", icon: <Clock size={11} /> },
    done: { cls: "badge-green", icon: <CheckCircle2 size={11} /> },
    failed: { cls: "badge-red", icon: <XCircle size={11} /> },
    cancelled: { cls: "badge-base", icon: <XCircle size={11} /> },
  };
  const { cls, icon } = map[status] ?? map.todo;
  return (
    <span className={`badge-base ${cls}`} style={status === "doing" ? { background: "rgba(91,106,240,0.1)", color: "#5B6AF0", borderColor: "rgba(91,106,240,0.2)" } : {}}>
      {icon}
      {ACTION_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function PlanoPage() {
  const { storeId } = useStore();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filter, setFilter] = useState<string>("active");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form state
  const [category, setCategory] = useState("cmv");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [responsible, setResponsible] = useState("");
  const [saving, setSaving] = useState(false);

  // Result form
  const [resultText, setResultText] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const { data: actions = [], refetch } = trpc.actions.list.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: suggestions = [] } = trpc.actions.suggestions.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: combinadosReuniao = [], refetch: refetchCombinados } = trpc.reuniao.combinadosAbertos.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const toggleCombinadoMut = trpc.reuniao.toggleCombinado.useMutation({ onSuccess: () => refetchCombinados() });
  const createMutation = trpc.actions.create.useMutation();
  const updateMutation = trpc.actions.update.useMutation();
  const deleteMutation = trpc.actions.delete.useMutation();

  const activeActions = actions.filter((a) => a.status === "todo" || a.status === "doing");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = filter === "active"
    ? activeActions
    : filter === "done"
    ? actions.filter((a) => a.status === "done")
    : actions;

  async function handleCreate(fromTemplate?: { category: string; description: string; reason: string }) {
    if (!storeId) return;
    if (activeActions.length >= MAX_ACTIVE && !fromTemplate) {
      toast.error(`Limite de ${MAX_ACTIVE} ações ativas atingido. Conclua uma antes de criar outra.`);
      return;
    }
    setSaving(true);
    try {
      const cat = (fromTemplate?.category ?? category) as any;
      const desc = fromTemplate?.description ?? description;
      const rsn = fromTemplate?.reason ?? reason;
      if (!desc) { toast.error("Descreva a ação."); setSaving(false); return; }
      await createMutation.mutateAsync({ storeId, category: cat, description: desc, reason: rsn || undefined, dueDate: dueDate || undefined, responsible: responsible || undefined });
      toast.success("Ação criada.");
      setShowForm(false);
      setDescription(""); setReason(""); setDueDate(""); setResponsible("");
      refetch();
    } catch {
      toast.error("Erro ao criar ação.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number, status: string, result?: string) {
    setUpdatingId(id);
    try {
      await updateMutation.mutateAsync({ id, status: status as any, result: result || undefined });
      toast.success("Ação atualizada.");
      setExpandedId(null);
      setResultText("");
      refetch();
    } catch {
      toast.error("Erro ao atualizar.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir esta ação?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Ação excluída.");
      refetch();
    } catch {
      toast.error("Erro ao excluir.");
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-1">Gestão de melhorias</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
            Plano de Ação<span className="dot">.</span>
          </h1>
          <p style={{ color: "var(--stone)", fontSize: 14, marginTop: 4 }}>
            {activeActions.length}/{MAX_ACTIVE} ações ativas
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border"
            style={{ borderColor: "var(--vinho)", color: "var(--vinho)" }}>
            <Lightbulb size={15} />
            Templates
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: "var(--vinho)", color: "var(--white)" }}>
            <Plus size={15} />
            Nova ação
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="section-card" style={{ borderColor: "rgba(113,14,43,0.2)", background: "rgba(113,14,43,0.02)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={16} style={{ color: "var(--vinho)" }} />
            <span className="font-semibold text-sm" style={{ color: "var(--vinho)" }}>Sugestões do sistema</span>
          </div>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--white)", border: "1px solid var(--gray-line)" }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>{s.description}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--stone-light)" }}>{s.reason}</div>
                </div>
                <button onClick={() => handleCreate({ category: s.category, description: s.description, reason: s.reason })}
                  className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "var(--vinho)", color: "var(--white)" }}>
                  Criar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates drawer */}
      {showTemplates && (
        <div className="section-card">
          <div className="eyebrow mb-3">Templates prontos</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTION_TEMPLATES.map((t, i) => (
              <div key={i} className="action-card" style={{ borderLeftColor: catColor(t.category) }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold mb-1" style={{ color: catColor(t.category) }}>{catLabel(t.category).toUpperCase()}</div>
                    <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>{t.description}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--stone-light)" }}>{t.reason}</div>
                  </div>
                  <button onClick={() => handleCreate(t)} className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "var(--vinho)", color: "var(--white)" }}>
                    Usar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bege)", width: "fit-content" }}>
        {[{ id: "active", label: "Ativas" }, { id: "done", label: "Concluídas" }, { id: "all", label: "Todas" }, { id: "reuniao", label: `Reunião (${combinadosReuniao.length})` }].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{ background: filter === f.id ? "var(--white)" : "transparent", color: filter === f.id ? "var(--ink)" : "var(--stone)", boxShadow: filter === f.id ? "0 1px 4px rgba(26,20,17,0.08)" : "none" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Combinados da Reunião — seção separada */}
      {(filter === "reuniao" || (filter === "active" && combinadosReuniao.length > 0)) && (
        <div className="border rounded-lg p-4 space-y-3" style={{ background: "var(--ivory)", borderColor: "#e5e0d8" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--vinho)" }}>Combinados da Reunião ({combinadosReuniao.length})</h3>
          {combinadosReuniao.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum combinado aberto.</p>
          )}
          {combinadosReuniao.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <button
                onClick={() => toggleCombinadoMut.mutate({ storeId: storeId!, id: c.id, status: "feito" })}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-600"
              >
                <Circle className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-sm">{c.descricao}</span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {c.responsavel && <span className="text-xs text-muted-foreground">{c.responsavel}</span>}
                  {c.prazo && <span className={`text-xs ${c.prazo < new Date().toISOString().slice(0,10) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>até {c.prazo.split("-").reverse().join("/")}</span>}
                  {c.medidaTitulo && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(128,0,32,0.1)", color: "var(--vinho)" }}>→ {c.medidaTitulo}</span>}
                  <span className="text-xs text-muted-foreground">reunião {c.reuniaoData.split("-").reverse().join("/")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--stone-light)" }}>
            <CheckCircle2 size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma ação {filter === "active" ? "ativa" : filter === "done" ? "concluída" : ""} encontrada.</p>
          </div>
        )}
        {filtered.map((action) => {
          const isExpanded = expandedId === action.id;
          const isOverdue = action.dueDate && action.dueDate < today && (action.status === "todo" || action.status === "doing");
          return (
            <div key={action.id} className={`action-card cat-${action.category}`} style={{ borderLeftColor: catColor(action.category) }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold" style={{ color: catColor(action.category) }}>{catLabel(action.category).toUpperCase()}</span>
                    <StatusBadge status={action.status ?? "todo"} />
                    {isOverdue && <span className="badge-base badge-red text-xs">Vencida</span>}
                  </div>
                  <div className="font-medium text-sm" style={{ color: "var(--ink)" }}>{action.description}</div>
                  {action.reason && <div className="text-xs mt-1" style={{ color: "var(--stone-light)" }}>{action.reason}</div>}
                  <div className="flex gap-3 mt-2 text-xs" style={{ color: "var(--stone-light)" }}>
                    {action.dueDate && <span>Prazo: {new Date(action.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                    {action.responsible && <span>Resp.: {action.responsible}</span>}
                  </div>
                  {action.result && (
                    <div className="mt-2 p-2 rounded-lg text-xs" style={{ background: "var(--green-soft)", color: "var(--green)" }}>
                      Resultado: {action.result}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(action.status === "todo" || action.status === "doing") && (
                    <button onClick={() => setExpandedId(isExpanded ? null : action.id)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-gray-100">
                      {isExpanded ? <ChevronUp size={16} style={{ color: "var(--stone)" }} /> : <ChevronDown size={16} style={{ color: "var(--stone)" }} />}
                    </button>
                  )}
                  <button onClick={() => handleDelete(action.id)} className="p-1.5 rounded-lg transition-colors hover:bg-red-50">
                    <Trash2 size={14} style={{ color: "var(--stone-light)" }} />
                  </button>
                </div>
              </div>

              {/* Expand: update status + attachments */}
              {isExpanded && (
                <div>
                  {(action.status === "todo" || action.status === "doing") && (
                    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--gray-line)" }}>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--stone)" }}>Resultado / observação</label>
                          <textarea value={resultText} onChange={(e) => setResultText(e.target.value)} rows={2}
                            placeholder="Descreva o resultado ou o que foi feito..."
                            className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
                            style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {action.status === "todo" && (
                            <button onClick={() => handleUpdate(action.id, "doing")} disabled={updatingId === action.id}
                              className="px-4 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: "rgba(91,106,240,0.1)", color: "#5B6AF0", border: "1px solid rgba(91,106,240,0.2)" }}>
                              Iniciar
                            </button>
                          )}
                          <button onClick={() => handleUpdate(action.id, "done", resultText)} disabled={updatingId === action.id}
                            className="px-4 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: "var(--green-soft)", color: "var(--green)", border: "1px solid rgba(31,111,61,0.2)" }}>
                            Concluir
                          </button>
                          <button onClick={() => handleUpdate(action.id, "failed", resultText)} disabled={updatingId === action.id}
                            className="px-4 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: "var(--red-soft)", color: "var(--red)", border: "1px solid rgba(183,61,47,0.2)" }}>
                            Não foi
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Attachments — visible to all, upload only for admins */}
                  <AnexosSection acaoId={action.id} lojaId={storeId!} isAdmin={isAdmin} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(26,20,17,0.5)" }}>
          <div className="section-card w-full max-w-lg" style={{ padding: 28 }}>
            <div className="eyebrow mb-1">Nova ação</div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 500, color: "var(--ink)", marginBottom: 20 }}>
              Criar plano de ação
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--ink)" }}>Categoria</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }}>
                  {ACTION_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--ink)" }}>O que fazer?</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  placeholder="Descreva a ação de forma clara e objetiva..."
                  className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none"
                  style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--ink)" }}>Por que? (causa raiz)</label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Qual problema essa ação resolve?"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--ink)" }}>Prazo</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm"
                    style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--ink)" }}>Responsável</label>
                  <input type="text" value={responsible} onChange={(e) => setResponsible(e.target.value)}
                    placeholder="Nome ou cargo"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm"
                    style={{ borderColor: "var(--gray-line)", background: "var(--ivory)", color: "var(--ink)" }} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                style={{ borderColor: "var(--gray-line)", color: "var(--stone)" }}>
                Cancelar
              </button>
              <button onClick={() => handleCreate()} disabled={saving || !description}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: "var(--vinho)", color: "var(--white)", opacity: saving || !description ? 0.6 : 1 }}>
                {saving ? "Criando..." : "Criar ação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
