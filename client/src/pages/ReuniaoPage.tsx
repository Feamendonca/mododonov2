import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../_core/hooks/useAuth";
import { useStore } from "../components/AppLayout";
import { Link } from "wouter";
import { Plus, CheckCircle2, Circle, ArrowLeft, Calendar, Users, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ReuniaoPage() {
  const { user } = useAuth();
  const { storeId } = useStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [newParticipantes, setNewParticipantes] = useState("");

  const isAdmin = user?.role === "admin";
  const sid = storeId ?? 0;

  const { data: reunioes, refetch: refetchList } = trpc.reuniao.listar.useQuery(
    { storeId: sid }, { enabled: !!storeId }
  );
  const criarMut = trpc.reuniao.criar.useMutation({
    onSuccess: (r) => { refetchList(); setSelectedId(r.id); setShowNew(false); toast.success("Reunião criada"); },
  });
  const excluirReuniaoMut = trpc.reuniao.excluirReuniao.useMutation({
    onSuccess: () => { refetchList(); setSelectedId(null); toast.success("Reunião excluída"); },
  });

  if (!storeId) return <div className="p-6 text-center text-muted-foreground">Selecione uma loja.</div>;

  if (selectedId) {
    return <ReuniaoDetalhe storeId={sid} reuniaoId={selectedId} onBack={() => { setSelectedId(null); refetchList(); }} isAdmin={isAdmin} />;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reuniões</h1>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Nova reunião
        </button>
      </div>

      {showNew && (
        <div className="border rounded-lg p-4 space-y-3 bg-card">
          <h3 className="font-medium text-sm">Nova reunião</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Data</label>
              <input type="date" value={newData} onChange={e => setNewData(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-background" />
            </div>
            <div className="flex-[2]">
              <label className="text-xs text-muted-foreground">Participantes</label>
              <input value={newParticipantes} onChange={e => setNewParticipantes(e.target.value)}
                placeholder="Ex.: Fernando, João, Maria"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => criarMut.mutate({ storeId: sid, data: newData, participantes: newParticipantes || undefined })}
              disabled={criarMut.isPending}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50">
              {criarMut.isPending ? "Criando..." : "Criar"}
            </button>
            <button onClick={() => setShowNew(false)} className="px-3 py-1.5 border rounded text-sm">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {reunioes?.map(r => (
          <div key={r.id} className="border rounded-lg p-4 hover:bg-accent/50 cursor-pointer transition-colors flex items-center justify-between"
            onClick={() => setSelectedId(r.id)}>
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm">{formatDate(r.data)}</span>
                {r.participantes && <span className="text-xs text-muted-foreground">· {r.participantes}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {r.totalCombinados - r.abertos} de {r.totalCombinados} combinados feitos
                {r.abertos > 0 && <span className="text-amber-600 ml-1">({r.abertos} pendentes)</span>}
              </div>
            </div>
            {isAdmin && (
              <button onClick={(e) => { e.stopPropagation(); if(confirm("Excluir reunião e seus combinados?")) excluirReuniaoMut.mutate({ storeId: sid, id: r.id }); }}
                className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
        {reunioes?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma reunião registrada.</p>
            <p className="text-xs mt-1">Clique em "Nova reunião" para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detalhe da Reunião ────────────────────────────────────────────────────────
function ReuniaoDetalhe({ storeId, reuniaoId, onBack, isAdmin }: { storeId: number; reuniaoId: number; onBack: () => void; isAdmin: boolean }) {
  const { data, refetch } = trpc.reuniao.detalhe.useQuery({ storeId, reuniaoId });
  const { data: medidas } = trpc.reuniao.medidasDaLoja.useQuery({ storeId });
  const toggleMut = trpc.reuniao.toggleCombinado.useMutation({ onSuccess: () => refetch() });
  const addMut = trpc.reuniao.addCombinado.useMutation({ onSuccess: () => { refetch(); setDesc(""); setResp(""); setPrazo(""); setMedida(undefined); toast.success("Combinado adicionado"); } });
  const excluirMut = trpc.reuniao.excluirCombinado.useMutation({ onSuccess: () => { refetch(); toast.success("Combinado excluído"); } });
  const resumoMut = trpc.reuniao.salvarResumo.useMutation({ onSuccess: () => { refetch(); toast.success("Resumo salvo"); } });

  const [desc, setDesc] = useState("");
  const [resp, setResp] = useState("");
  const [prazo, setPrazo] = useState("");
  const [medida, setMedida] = useState<number | undefined>(undefined);
  const [resumo, setResumo] = useState("");
  const [resumoInit, setResumoInit] = useState(false);

  if (!data) return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;

  const { reuniao, combinados, pendenciasAnteriores } = data;
  if (!resumoInit) { setResumo(reuniao.observacao ?? ""); setResumoInit(true); }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div>
        <h1 className="text-lg font-semibold">Reunião de {formatDate(reuniao.data)}</h1>
        {reuniao.participantes && <p className="text-sm text-muted-foreground mt-0.5">{reuniao.participantes}</p>}
      </div>

      {/* Resumo da reunião */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Resumo da reunião</h3>
        <textarea
          value={resumo}
          onChange={e => setResumo(e.target.value)}
          placeholder="Ata livre da conversa — o que foi discutido, decisões tomadas..."
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background min-h-[80px] resize-y"
          rows={3}
        />
        {resumo !== (reuniao.observacao ?? "") && (
          <button
            onClick={() => resumoMut.mutate({ storeId, reuniaoId, observacao: resumo })}
            disabled={resumoMut.isPending}
            className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50"
          >
            {resumoMut.isPending ? "Salvando..." : "Salvar resumo"}
          </button>
        )}
      </div>

      {/* Pendências anteriores */}
      {pendenciasAnteriores.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">Pendências de reuniões anteriores ({pendenciasAnteriores.length})</h3>
          {pendenciasAnteriores.map(p => (
            <div key={p.id} className="flex items-start gap-2">
              <button onClick={() => toggleMut.mutate({ storeId, id: p.id, status: "feito" })}
                className="mt-0.5 text-amber-600 hover:text-green-600 shrink-0">
                <Circle className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-sm">{p.descricao}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.responsavel && <span className="text-xs text-muted-foreground">{p.responsavel}</span>}
                  {p.prazo && <span className="text-xs text-muted-foreground">até {formatDate(p.prazo)}</span>}
                  {p.medidaTitulo && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">→ {p.medidaTitulo}</span>}
                  <span className="text-xs text-muted-foreground">({formatDate(p.reuniaoData)})</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Combinados desta reunião */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Combinados desta reunião</h3>
        {combinados.map(c => (
          <div key={c.id} className="flex items-start gap-2 group">
            <button onClick={() => toggleMut.mutate({ storeId, id: c.id, status: c.status === "aberto" ? "feito" : "aberto" })}
              className={`mt-0.5 shrink-0 ${c.status === "feito" ? "text-green-600" : "text-muted-foreground hover:text-green-600"}`}>
              {c.status === "feito" ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            </button>
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${c.status === "feito" ? "line-through text-muted-foreground" : ""}`}>{c.descricao}</span>
              <div className="flex items-center gap-2 mt-0.5">
                {c.responsavel && <span className="text-xs text-muted-foreground">{c.responsavel}</span>}
                {c.prazo && <span className="text-xs text-muted-foreground">até {formatDate(c.prazo)}</span>}
                {c.medidaTitulo && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">→ {c.medidaTitulo}</span>}
              </div>
            </div>
            {isAdmin && (
              <button onClick={() => excluirMut.mutate({ storeId, id: c.id })}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {/* Form adicionar combinado */}
        <div className="border rounded-lg p-3 space-y-2 bg-card mt-4">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Novo combinado..."
            className="w-full border rounded px-2 py-1.5 text-sm bg-background"
            onKeyDown={e => { if (e.key === "Enter" && desc.trim()) addMut.mutate({ storeId, reuniaoId, descricao: desc.trim(), responsavel: resp || undefined, prazo: prazo || undefined, medidaId: medida }); }} />
          <div className="flex gap-2 flex-wrap">
            <input value={resp} onChange={e => setResp(e.target.value)} placeholder="Responsável"
              className="border rounded px-2 py-1 text-xs bg-background w-32" />
            <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)}
              className="border rounded px-2 py-1 text-xs bg-background" />
            <select value={medida ?? ""} onChange={e => setMedida(e.target.value ? Number(e.target.value) : undefined)}
              className="border rounded px-2 py-1 text-xs bg-background">
              <option value="">Medida (opcional)</option>
              {medidas?.map(m => <option key={m.id} value={m.id}>{m.titulo}</option>)}
            </select>
            <button onClick={() => { if (desc.trim()) addMut.mutate({ storeId, reuniaoId, descricao: desc.trim(), responsavel: resp || undefined, prazo: prazo || undefined, medidaId: medida }); }}
              disabled={!desc.trim() || addMut.isPending}
              className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50">
              {addMut.isPending ? "..." : "Adicionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
