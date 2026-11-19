/**
 * ConfigurarTurnos.tsx — CRUD de blocos de turno da loja
 *
 * Extraído de `client/src/pages/PessoasPage.tsx` (onde já existia) para
 * poder ser REUSADO pelo assistente de configuração (Task 6,
 * `client/src/components/escala/AssistenteConfiguracao.tsx`) sem recriar o
 * CRUD nem criar import circular entre as duas páginas — o brief da Task 6
 * é explícito: "REUSE o CRUD que já existe (`pessoas.getShiftBlocks` /
 * `createShiftBlock` / `updateShiftBlock`). Não recrie."
 *
 * Lógica e JSX idênticos ao componente original — só mudou de arquivo.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit2, Trash2, Plus, X } from "lucide-react";

export function ConfigurarTurnos({ storeId, onClose }: { storeId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: blocks } = trpc.pessoas.getShiftBlocks.useQuery({ storeId });
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", startMinute: 480, endMinute: 960 }); // 08:00–16:00

  const createMut = trpc.pessoas.createShiftBlock.useMutation({
    onSuccess: () => { utils.pessoas.getShiftBlocks.invalidate(); setShowForm(false); setForm({ name: "", startMinute: 480, endMinute: 960 }); toast.success("Turno criado!"); },
  });
  const updateMut = trpc.pessoas.updateShiftBlock.useMutation({
    onSuccess: () => { utils.pessoas.getShiftBlocks.invalidate(); setEditingBlock(null); setShowForm(false); toast.success("Turno atualizado!"); },
  });
  const deleteMut = trpc.pessoas.deleteShiftBlock.useMutation({
    onSuccess: () => { utils.pessoas.getShiftBlocks.invalidate(); toast.success("Turno removido!"); },
  });

  function openEdit(block: any) {
    setEditingBlock(block);
    // Preferir startMinute/endMinute se disponíveis (novos blocos), senão converter de startHour
    const sm = block.startMinute ?? block.startHour * 60;
    const em = block.endMinute ?? block.endHour * 60;
    setForm({ name: block.name, startMinute: sm, endMinute: em });
    setShowForm(true);
  }

  function saveBlock() {
    if (!form.name.trim()) { toast.error("Informe o nome do turno"); return; }
    // Calcular duração (suporta virada de meia-noite: endMinute <= startMinute)
    const endM = form.endMinute <= form.startMinute ? form.endMinute + 1440 : form.endMinute;
    const durMin = endM - form.startMinute;
    if (durMin < 30) { toast.error("Duração mínima do turno: 30 minutos"); return; }
    const startHour = Math.floor(form.startMinute / 60);
    const endHour = Math.ceil((form.endMinute <= form.startMinute ? form.endMinute + 1440 : form.endMinute) / 60) % 25;
    if (editingBlock) {
      updateMut.mutate({ id: editingBlock.id, storeId, name: form.name, startHour, endHour, startMinute: form.startMinute, endMinute: form.endMinute });
    } else {
      createMut.mutate({ storeId, name: form.name, startHour, endHour, startMinute: form.startMinute, endMinute: form.endMinute });
    }
  }

  // Opções de horário: de 30 em 30 minutos (0..1410 minutos desde meia-noite)
  const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);
  const fmtTime = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Configurar Blocos de Turno</h3>
          <p className="text-sm text-muted-foreground">Defina os turnos de trabalho da sua loja (ex: Abertura, Almoço, Fechamento)</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      <div className="space-y-2">
        {(blocks ?? []).length === 0 && !showForm && (
          <div className="bg-muted/30 rounded-xl p-6 text-center text-muted-foreground text-sm">
            Nenhum turno cadastrado ainda. Clique em "Novo turno" para começar.
          </div>
        )}
        {(blocks ?? []).map(block => (
          <div key={block.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <div>
              <span className="font-medium text-sm">{block.name}</span>
              <span className="ml-3 text-xs text-muted-foreground font-mono">
                {block.startMinute != null ? fmtTime(block.startMinute) : `${block.startHour}:00`}–{block.endMinute != null ? fmtTime(block.endMinute) : `${block.endHour}:00`}
                {" "}({block.startMinute != null
                  ? (() => { const em = block.endMinute <= block.startMinute ? block.endMinute + 1440 : block.endMinute; const d = (em - block.startMinute) / 60; return d % 1 === 0 ? `${d}h` : `${d.toFixed(1)}h`; })()
                  : `${block.endHour - block.startHour}h`})
              </span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(block)}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => { if (confirm(`Remover o turno "${block.name}"? As escalas vinculadas a ele também serão removidas.`)) deleteMut.mutate({ id: block.id, storeId }); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
          <h4 className="text-sm font-medium">{editingBlock ? "Editar turno" : "Novo turno"}</h4>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Nome do turno</label>
            <Input
              placeholder="Ex: Abertura, Almoço, Fechamento..."
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") saveBlock(); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Início</label>
              <Select value={String(form.startMinute)} onValueChange={v => setForm(p => ({ ...p, startMinute: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder={fmtTime(form.startMinute)} /></SelectTrigger>
                <SelectContent>{TIME_OPTIONS.map(m => <SelectItem key={m} value={String(m)}>{fmtTime(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Fim</label>
              <Select value={String(form.endMinute)} onValueChange={v => setForm(p => ({ ...p, endMinute: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder={fmtTime(form.endMinute)} /></SelectTrigger>
                <SelectContent>{TIME_OPTIONS.map(m => <SelectItem key={m} value={String(m)}>{fmtTime(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={saveBlock} disabled={createMut.isPending || updateMut.isPending}>
              {editingBlock ? "Salvar" : "Criar turno"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingBlock(null); setForm({ name: "", startMinute: 480, endMinute: 960 }); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => { setEditingBlock(null); setForm({ name: "", startMinute: 480, endMinute: 960 }); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Novo turno
        </Button>
      )}
    </div>
  );
}
