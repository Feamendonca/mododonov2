import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import HolidaysPage from "./HolidaysPage";
import {
  Store, Users, Target, Plus, Edit2, Link, Unlink,
  ShieldCheck, Eye, EyeOff, UserCheck, BookOpen, PlayCircle, RefreshCw,
  Building2, BarChart3, UserCog, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type StoreData = {
  id: number; name: string; slug: string; location: string | null;
  managerName: string | null; budgetRevenue: string | null; budgetCmvPct: string | null;
  budgetPackagingPct: string | null; budgetTaxesPct: string | null; budgetFixedCosts: string | null;
  operationType: string | null;
  googlePlaceId?: string | null;
  segmento?: string | null;
  faixaFaturamento?: string | null;
};
type UserData = {
  id: number; openId: string; name: string; email: string | null;
  role: string; createdAt: Date;
  storeIds: number[]; storeNames: string[];
  supervisorStoreIds: number[]; supervisorStoreNames: string[];
};

function StoreModal({ store, onClose, onSaved }: { store?: StoreData | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!store;
  const [form, setForm] = useState({
    name: store?.name ?? "", slug: store?.slug ?? "", location: store?.location ?? "",
    managerName: store?.managerName ?? "", budgetRevenue: store?.budgetRevenue ?? "",
    budgetCmvPct: store?.budgetCmvPct ?? "30", budgetPackagingPct: store?.budgetPackagingPct ?? "4",
    budgetTaxesPct: store?.budgetTaxesPct ?? "3", budgetFixedCosts: store?.budgetFixedCosts ?? "",
    operationType: store?.operationType ?? "rua",
    googlePlaceId: (store as any)?.googlePlaceId ?? "",
    segmento: (store as any)?.segmento ?? "",
  });
  const createMutation = trpc.admin.createStore.useMutation();
  const updateMutation = trpc.admin.updateStore.useMutation();
  const fetchRatingMutation = trpc.stores.fetchGoogleRating.useMutation();
  const { data: savedRating, refetch: refetchRating } = trpc.stores.getGoogleRating.useQuery(
    { storeId: store?.id ?? 0 },
    { enabled: !!store?.id }
  );
  const [loading, setLoading] = useState(false);
  const [ratingPreview, setRatingPreview] = useState<{ rating: number; totalRatings: number; nota: number } | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  async function handleFetchRating() {
    if (!form.googlePlaceId.trim()) { toast.error("Informe um Google Place ID antes de buscar."); return; }
    setRatingLoading(true);
    try {
      // Passa o placeId do campo diretamente — funciona mesmo antes de salvar a loja
      const result = await fetchRatingMutation.mutateAsync({ storeId: store?.id ?? 0, placeId: form.googlePlaceId.trim() });
      setRatingPreview(result);
      // Refetch da nota salva (se a loja já tem o place_id no banco, foi sincronizado)
      if (store?.id) { await refetchRating(); }
      toast.success("Nota sincronizada e aplicada ao placar do mês atual.");
    } catch (e: any) { toast.error(e.message ?? "Erro ao buscar rating."); }
    finally { setRatingLoading(false); }
  }
  function handleSlugify(name: string) {
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm(f => ({ ...f, name, slug }));
  }
  async function handleSave() {
    if (!form.name || !form.slug) { toast.error("Nome e slug são obrigatórios."); return; }
    setLoading(true);
    try {
      const opType = form.operationType as "aeroporto" | "mall" | "rua" | "corporativo" | "universitario";
      if (isEdit && store) { await updateMutation.mutateAsync({ id: store.id, ...form, operationType: opType }); toast.success("Loja atualizada."); }
      else { await createMutation.mutateAsync({ ...form, operationType: opType }); toast.success("Loja criada!"); }
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message ?? "Erro ao salvar."); }
    finally { setLoading(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 520 }}>
        <DialogHeader><DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{isEdit ? "Editar loja" : "Nova loja"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome da loja *</Label><Input value={form.name} onChange={e => handleSlugify(e.target.value)} placeholder="Ex: Giraffas Shopping Center" /></div>
            <div><Label>Slug (URL) *</Label><Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="giraffas-shopping" /></div>
            <div><Label>Localização</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="São Paulo - SP" /></div>
            <div className="col-span-2"><Label>Nome do gerente</Label><Input value={form.managerName} onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))} placeholder="Nome do gerente responsável" /></div>
            <div><Label>Receita orçada (R$)</Label><Input value={form.budgetRevenue} onChange={e => setForm(f => ({ ...f, budgetRevenue: e.target.value }))} type="number" /></div>
            <div><Label>CMV meta (%)</Label><Input value={form.budgetCmvPct} onChange={e => setForm(f => ({ ...f, budgetCmvPct: e.target.value }))} type="number" /></div>
            <div><Label>Impostos meta (%)</Label><Input value={form.budgetTaxesPct} onChange={e => setForm(f => ({ ...f, budgetTaxesPct: e.target.value }))} type="number" /></div>
            <div><Label>Embalagens meta (%)</Label><Input value={form.budgetPackagingPct} onChange={e => setForm(f => ({ ...f, budgetPackagingPct: e.target.value }))} type="number" /></div>
            <div className="col-span-2">
              <Label>Tipo de operação</Label>
              <select
                value={form.operationType}
                onChange={e => setForm(f => ({ ...f, operationType: e.target.value }))}
                className="w-full h-9 rounded-lg border px-3 mt-1"
                style={{ fontSize: 13, color: "var(--ink)", background: "var(--silk)", borderColor: "var(--border)" }}
              >
                <option value="rua">Rua / Bairro</option>
                <option value="mall">Shopping / Mall</option>
                <option value="aeroporto">Aeroporto</option>
                <option value="corporativo">Corporativo / Empresarial</option>
                <option value="universitario">Universitário / Campus</option>
              </select>
              <p style={{ fontSize: 11, color: "var(--stone)", marginTop: 4 }}>Define o comportamento base de feriados sugerido pela IA para esta loja.</p>
            </div>
            <div className="col-span-2">
              <Label>Google Place ID (opcional)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={form.googlePlaceId}
                  onChange={e => { setForm(f => ({ ...f, googlePlaceId: e.target.value })); setRatingPreview(null); }}
                  placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
                  style={{ flex: 1 }}
                />
                {isEdit && form.googlePlaceId && (
                  <button
                    type="button"
                    onClick={handleFetchRating}
                    disabled={ratingLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--vinho-pale)", color: "var(--vinho)", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {ratingLoading ? "Buscando..." : "Buscar avaliação agora"}
                  </button>
                )}
              </div>
              <p style={{ fontSize: 11, color: "var(--stone)", marginTop: 4 }}>
                Quando preenchido, a nota de qualidade Google é atualizada automaticamente pelo Places API (rating × 20). Sem Place ID, a nota vem das avaliações lançadas manualmente.
              </p>
            </div>
            <div className="col-span-2">
              <Label>Segmento operacional</Label>
              <input
                list="segmentos-list"
                value={form.segmento ?? ""}
                onChange={e => setForm(f => ({ ...f, segmento: e.target.value }))}
                placeholder="Ex: massas, hamburgueria, japonesa..."
                className="w-full h-9 rounded-lg border px-3 mt-1"
                style={{ fontSize: 13, color: "var(--ink)", background: "var(--silk)", borderColor: "var(--border)" }}
              />
              <datalist id="segmentos-list">
                <option value="massas" /><option value="hamburgueria" /><option value="japonesa" />
                <option value="pizza" /><option value="frango" /><option value="sanduiche" />
                <option value="saudavel" /><option value="cafeteria" /><option value="casual" />
              </datalist>
              <p style={{ fontSize: 11, color: "var(--stone)", marginTop: 4 }}>
                Usado para comparar benchmarks com lojas do mesmo tipo. Deixe em branco para comparar com toda a rede.
              </p>
              {savedRating && !ratingPreview && (
                <div className="mt-2 p-2 rounded-lg flex items-center gap-2" style={{ background: "var(--silk)", fontSize: 12, color: "var(--stone)" }}>
                  <span style={{ color: "var(--amber)" }}>★</span>
                  <span>Nota Google: <strong style={{ color: "var(--ink)" }}>★{savedRating.rating.toFixed(1)} → {savedRating.nota.toFixed(0)}/100</strong></span>
                  <span>· {savedRating.totalRatings.toLocaleString("pt-BR")} avaliações</span>
                  <span>· atualizada em {new Date(savedRating.fetchedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                </div>
              )}
              {ratingPreview && (
                <div className="mt-2 p-2 rounded-lg" style={{ background: "var(--silk)", fontSize: 13, color: "var(--ink)" }}>
                  ★ {ratingPreview.rating.toFixed(1)} ({ratingPreview.totalRatings.toLocaleString("pt-BR")} avaliações) → nota {ratingPreview.nota.toFixed(0)}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} style={{ background: "var(--vinho)", color: "#fff" }}>{loading ? "Salvando..." : isEdit ? "Salvar" : "Criar loja"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserModal({ stores, role, onClose, onSaved }: { stores: StoreData[]; role: "gerente" | "supervisor"; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ openId: "", displayName: "", storeIds: [] as number[] });
  const [loading, setLoading] = useState(false);
  const createMutation = trpc.admin.createUser.useMutation();
  function toggleStore(id: number) { setForm(f => ({ ...f, storeIds: f.storeIds.includes(id) ? f.storeIds.filter(s => s !== id) : [...f.storeIds, id] })); }
  async function handleSave() {
    if (!form.openId.trim() || !form.displayName.trim()) { toast.error("OpenID e nome são obrigatórios."); return; }
    setLoading(true);
    try {
      await createMutation.mutateAsync({ ...form, role });
      toast.success(`${role === "gerente" ? "Gerente" : "Supervisor"} cadastrado!`);
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message ?? "Erro ao cadastrar."); }
    finally { setLoading(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 500 }}>
        <DialogHeader><DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{role === "gerente" ? "Cadastrar gerente" : "Cadastrar supervisor"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Nome completo *</Label><Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Ex: João Silva" /></div>
          <div>
            <Label>OpenID Manus *</Label>
            <Input value={form.openId} onChange={e => setForm(f => ({ ...f, openId: e.target.value }))} placeholder="ID da conta Manus do usuário" />
            <p style={{ fontSize: 11, color: "var(--stone)", marginTop: 4 }}>O usuário encontra seu OpenID em Configurações → Conta no Manus.</p>
          </div>
          <div>
            <Label>{role === "gerente" ? "Loja(s) vinculada(s)" : "Lojas sob responsabilidade"}</Label>
            <div className="space-y-1 mt-2 max-h-48 overflow-y-auto">
              {stores.map(s => (
                <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer" style={{ background: form.storeIds.includes(s.id) ? "var(--vinho-pale)" : "var(--silk)" }}>
                  <input type="checkbox" checked={form.storeIds.includes(s.id)} onChange={() => toggleStore(s.id)} style={{ accentColor: "var(--vinho)" }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{s.name}</span>
                  {s.location && <span style={{ fontSize: 11, color: "var(--stone)" }}>{s.location}</span>}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} style={{ background: "var(--vinho)", color: "#fff" }}>{loading ? "Cadastrando..." : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkStoresModal({ stores, user, onClose, onSaved }: { stores: StoreData[]; user: UserData; onClose: () => void; onSaved: () => void }) {
  const isSupervisor = user.role === "supervisor";
  const linkedIds = isSupervisor ? (user.supervisorStoreIds ?? []) : (user.storeIds ?? []);
  const linkedNames = isSupervisor ? (user.supervisorStoreNames ?? []) : (user.storeNames ?? []);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const linkGMutation = trpc.admin.linkUserToStore.useMutation();
  const unlinkGMutation = trpc.admin.unlinkUserFromStore.useMutation();
  const linkSMutation = trpc.admin.linkSupervisorToStore.useMutation();
  const unlinkSMutation = trpc.admin.unlinkSupervisorFromStore.useMutation();
  async function handleLink() {
    if (!selectedStoreId) return;
    try {
      if (isSupervisor) await linkSMutation.mutateAsync({ userId: user.id, storeId: Number(selectedStoreId) });
      else await linkGMutation.mutateAsync({ userId: user.id, storeId: Number(selectedStoreId) });
      toast.success("Loja vinculada."); onSaved(); setSelectedStoreId("");
    } catch (e: any) { toast.error(e.message ?? "Erro ao vincular."); }
  }
  async function handleUnlink(storeId: number) {
    try {
      if (isSupervisor) await unlinkSMutation.mutateAsync({ userId: user.id, storeId });
      else await unlinkGMutation.mutateAsync({ userId: user.id, storeId });
      toast.success("Vínculo removido."); onSaved();
    } catch (e: any) { toast.error(e.message ?? "Erro ao desvincular."); }
  }
  const availableStores = stores.filter(s => !linkedIds.includes(s.id));
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogHeader><DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>Lojas — {user.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {linkedIds.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--stone)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Lojas vinculadas</p>
              <div className="space-y-2">
                {linkedIds.map((sid, i) => (
                  <div key={sid} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--silk)" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{linkedNames[i]}</span>
                    <button onClick={() => handleUnlink(sid)} className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--red)", cursor: "pointer" }}><Unlink size={13} /> Remover</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {availableStores.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--stone)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Adicionar loja</p>
              <div className="flex gap-2">
                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar loja..." /></SelectTrigger>
                  <SelectContent>{availableStores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button onClick={handleLink} disabled={!selectedStoreId} style={{ background: "var(--vinho)", color: "#fff" }}><Link size={14} className="mr-1" /> Vincular</Button>
              </div>
            </div>
          )}
          {linkedIds.length === 0 && availableStores.length === 0 && <p style={{ color: "var(--stone)", fontSize: 14 }}>Nenhuma loja disponível.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    admin: { label: "Admin", bg: "var(--vinho)", color: "#fff" },
    supervisor: { label: "Supervisor", bg: "#1e40af", color: "#fff" },
    gerente: { label: "Gerente", bg: "#065f46", color: "#fff" },
    user: { label: "Usuário", bg: "var(--silk)", color: "var(--stone)" },
  };
  const s = map[role] ?? map.user;
  return <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: s.bg, color: s.color, fontWeight: 600 }}>{s.label}</span>;
}

function UserCard({ u, stores, currentUserId, onLinkStores, onChangeRole }: {
  u: UserData; stores: StoreData[]; currentUserId?: number;
  onLinkStores: (u: UserData) => void; onChangeRole: (userId: number, role: string) => void;
}) {
  const linkedNames = u.role === "supervisor" ? (u.supervisorStoreNames ?? []) : (u.storeNames ?? []);
  return (
    <div className="kpi-card" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div className="flex items-start gap-4">
        <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: u.role === "admin" ? "var(--vinho)" : u.role === "supervisor" ? "#1e40af" : u.role === "gerente" ? "#065f46" : "var(--silk)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {u.role === "admin" ? <ShieldCheck size={18} style={{ color: "#fff" }} /> : u.role === "supervisor" ? <Eye size={18} style={{ color: "#fff" }} /> : <UserCheck size={18} style={{ color: u.role === "gerente" ? "#fff" : "var(--stone)" }} />}
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{u.name}</div>
          <div style={{ fontSize: 12, color: "var(--stone)" }}>{u.email ?? u.openId}</div>
          {linkedNames.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {linkedNames.map((sn, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--vinho-pale)", color: "var(--vinho)", fontWeight: 500 }}>{sn}</span>)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <RoleBadge role={u.role} />
        <button onClick={() => onLinkStores(u)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ fontSize: 12, color: "var(--vinho)", background: "var(--vinho-pale)", cursor: "pointer" }}>
          <Link size={13} /> Lojas
        </button>
        {u.id !== currentUserId && (
          <Select value={u.role} onValueChange={role => onChangeRole(u.id, role)}>
            <SelectTrigger className="h-8 text-xs px-2 gap-1" style={{ width: 130 }}><UserCog size={13} /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Usuário</SelectItem>
              <SelectItem value="gerente">Gerente</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function AdminHolidaysTab({ stores }: { stores: StoreData[] }) {
  const [selectedStoreId, setSelectedStoreId] = useState<number>(stores[0]?.id ?? 0);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ done: number; total: number } | null>(null);
  const seedMut = trpc.holidays.seedNationalHolidays.useMutation();
  const suggestMut = trpc.holidays.suggestRules.useMutation();
  const bulkSaveMut = trpc.holidays.bulkSaveRules.useMutation();
  const currentYear = new Date().getFullYear();

  async function handleConfigureAll() {
    if (!stores.length) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      // 1. Seed feriados nacionais
      await seedMut.mutateAsync({ year: currentYear });
      // 2. Para cada loja, sugerir e salvar regras da IA
      let done = 0;
      for (const store of stores) {
        try {
          const result = await suggestMut.mutateAsync({ storeId: store.id, year: currentYear });
          if (result.suggestions.length > 0) {
            await bulkSaveMut.mutateAsync({
              storeId: store.id,
              rules: result.suggestions.map(s => ({
                ruleDate: s.date,
                eventType: s.eventType,
                multiplier: s.multiplier,
                source: "ia" as const,
                notes: s.notes,
              })),
            });
          }
          done++;
        } catch {
          // Continua para próxima loja
        }
      }
      setBulkResult({ done, total: stores.length });
      toast.success(`Feriados configurados para ${done} de ${stores.length} lojas!`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao configurar feriados.");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Painel de configuração em lote */}
      <div className="kpi-card space-y-3">
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Configuração em lote com IA</h3>
          <p style={{ fontSize: 12, color: "var(--stone)", marginTop: 4 }}>
            Carrega os feriados nacionais de {currentYear} e aplica automaticamente os multiplicadores de meta sugeridos pela IA para <strong>todas as lojas</strong>, baseado no tipo de operação de cada uma.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleConfigureAll}
            disabled={bulkLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--vinho)", cursor: bulkLoading ? "not-allowed" : "pointer", opacity: bulkLoading ? 0.7 : 1 }}
          >
            <Calendar size={14} />
            {bulkLoading ? "Configurando..." : `Configurar todas as lojas com IA (${currentYear})`}
          </button>
          {bulkResult && (
            <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 500 }}>
              ✓ {bulkResult.done}/{bulkResult.total} lojas configuradas
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--stone)" }}>
          Dica: Configure o tipo de operação de cada loja em Admin → Lojas → Editar antes de usar esta função para obter sugestões mais precisas.
        </p>
      </div>

      {/* Ajuste fino por loja */}
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 13, color: "var(--stone)", fontWeight: 500 }}>Ajuste fino por loja:</span>
        <select
          value={selectedStoreId}
          onChange={e => setSelectedStoreId(Number(e.target.value))}
          className="h-9 rounded-lg border px-3"
          style={{ fontSize: 13, color: "var(--ink)", background: "var(--silk)", borderColor: "var(--border)" }}
        >
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {selectedStoreId > 0 && <HolidaysPage storeId={selectedStoreId} />}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"stores" | "gerentes" | "supervisores" | "trilhas" | "usuarios" | "premissas" | "dados" | "feriados">("stores");  const [confirmClear, setConfirmClear] = useState<{ type: "store"; storeId: number; storeName: string } | { type: "all" } | null>(null);
  const [storeModal, setStoreModal] = useState<{ open: boolean; store?: StoreData | null }>({ open: false });
  const [createUserModal, setCreateUserModal] = useState<{ open: boolean; role: "gerente" | "supervisor" } | null>(null);
  const [linkModal, setLinkModal] = useState<{ open: boolean; user?: UserData }>({ open: false });
  const [goalsStore, setGoalsStore] = useState<number | null>(null);
  const [goalsForm, setGoalsForm] = useState<Record<string, string>>({});

  if (user && user.role !== "admin") { navigate("/hoje"); return null; }

  const { data: stores = [], refetch: refetchStores } = trpc.admin.listStores.useQuery();
  const { data: users = [], refetch: refetchUsers } = trpc.admin.listUsers.useQuery();
  const { data: stats } = trpc.admin.getStats.useQuery();
  const setRoleMutation = trpc.admin.setUserRole.useMutation();
  const updateGoalsMutation = trpc.admin.updateStoreGoals.useMutation();
  const { data: trilhasAdmin = [], refetch: refetchTrilhas } = trpc.trilhas.listAdmin.useQuery();
  const seedTrilhasMutation = trpc.trilhas.seed.useMutation({ onSuccess: (r) => { toast.success(r.message); refetchTrilhas(); }, onError: () => toast.error("Erro no seed.") });
  const clearStoreDemoMut = trpc.admin.clearStoreDemoData.useMutation({
    onSuccess: (r) => { toast.success(r.message); setConfirmClear(null); refetchStores(); },
    onError: (e) => toast.error(e.message),
  });
  const clearAllDemoMut = trpc.admin.clearAllDemoData.useMutation({
    onSuccess: (r) => { toast.success(r.message); setConfirmClear(null); refetchStores(); },
    onError: (e) => toast.error(e.message),
  });
  const publishAulaMutation = trpc.trilhas.adminPublishAula.useMutation({ onSuccess: () => { toast.success("Aula publicada."); refetchTrilhas(); }, onError: () => toast.error("Erro.") });
  const unpublishAulaMutation = trpc.trilhas.adminUnpublishAula.useMutation({ onSuccess: () => { toast.success("Aula despublicada."); refetchTrilhas(); }, onError: () => toast.error("Erro.") });

  async function handleSetRole(userId: number, role: string) {
    try { await setRoleMutation.mutateAsync({ userId, role: role as any }); toast.success("Perfil atualizado."); refetchUsers(); }
    catch { toast.error("Erro ao alterar perfil."); }
  }
  function openGoals(store: StoreData) {
    setGoalsStore(store.id);
    setGoalsForm({ budgetRevenue: store.budgetRevenue ?? "", budgetCmvPct: store.budgetCmvPct ?? "30", budgetPackagingPct: store.budgetPackagingPct ?? "4", budgetTaxesPct: store.budgetTaxesPct ?? "3", budgetFixedCosts: store.budgetFixedCosts ?? "" });
  }
  async function handleSaveGoals() {
    if (!goalsStore) return;
    try { await updateGoalsMutation.mutateAsync({ storeId: goalsStore, ...goalsForm }); toast.success("Metas atualizadas."); setGoalsStore(null); refetchStores(); }
    catch { toast.error("Erro ao salvar metas."); }
  }

  const gerentes = (users as UserData[]).filter(u => u.role === "gerente" || u.role === "user");
  const supervisores = (users as UserData[]).filter(u => u.role === "supervisor");
  const { data: allUsers = [], refetch: refetchAllUsers } = trpc.admin.listAllUsers.useQuery();
  const { data: networkDefaults, refetch: refetchNetworkDefaults } = trpc.admin.getNetworkDefaults.useQuery();
  const promoteUserMut = trpc.admin.promoteUser.useMutation({
    onSuccess: () => { toast.success("Perfil atualizado!"); refetchAllUsers(); },
    onError: (e) => toast.error(e.message),
  });
  const setNetworkDefaultsMut = trpc.admin.setNetworkDefaults.useMutation({
    onSuccess: () => { toast.success("Premissas padrão salvas!"); refetchNetworkDefaults(); },
    onError: (e) => toast.error(e.message),
  });
  const [netForm, setNetForm] = useState({
    cmvMetaPct: 32, royaltiesPct: 5, fundoPromocaoPct: 1, diasOperacao: 26,
    ticketMedio: "", aluguelPct: "", headcount: "", energiaRs: "", aguaRs: "", gasRs: "", observacoes: "",
  });
  // Sync netForm with loaded data
  const netDefaultsLoaded = useRef(false);
  useEffect(() => {
    if (networkDefaults && !netDefaultsLoaded.current) {
      netDefaultsLoaded.current = true;
      setNetForm({
        cmvMetaPct: networkDefaults.cmvMetaPct,
        royaltiesPct: networkDefaults.royaltiesPct,
        fundoPromocaoPct: networkDefaults.fundoPromocaoPct,
        diasOperacao: networkDefaults.diasOperacao,
        ticketMedio: networkDefaults.ticketMedio != null ? String(networkDefaults.ticketMedio) : "",
        aluguelPct: networkDefaults.aluguelPct != null ? String(networkDefaults.aluguelPct) : "",
        headcount: networkDefaults.headcount != null ? String(networkDefaults.headcount) : "",
        energiaRs: networkDefaults.energiaRs != null ? String(networkDefaults.energiaRs) : "",
        aguaRs: networkDefaults.aguaRs != null ? String(networkDefaults.aguaRs) : "",
        gasRs: networkDefaults.gasRs != null ? String(networkDefaults.gasRs) : "",
        observacoes: networkDefaults.observacoes ?? "",
      });
    }
  }, [networkDefaults]);

  const ROLE_LABELS: Record<string, string> = { admin: "Admin", supervisor: "Supervisor", gerente: "Gerente", user: "Usuário" };
  const ROLE_COLORS: Record<string, string> = { admin: "#7c3aed", supervisor: "#1e40af", gerente: "var(--vinho)", user: "var(--stone)" };

  const tabs = [
    { id: "stores" as const, label: "Lojas", icon: Building2 },
    { id: "gerentes" as const, label: "Gerentes", icon: UserCheck },
    { id: "supervisores" as const, label: "Supervisores", icon: Eye },
    { id: "usuarios" as const, label: "Usuários", icon: Users },
    { id: "premissas" as const, label: "Premissas Padrão", icon: Target },
    { id: "trilhas" as const, label: "Trilhas", icon: BookOpen },
    { id: "dados" as const, label: "Dados", icon: BarChart3 },
    { id: "feriados" as const, label: "Feriados", icon: Calendar },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in">
      <div>
        <div className="eyebrow mb-1">Administração</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>Painel Admin<span className="dot">.</span></h1>
        <p style={{ color: "var(--stone)", fontSize: 14, marginTop: 4 }}>Gerencie lojas, equipe e conteúdo do programa Modo Dono.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[{ label: "Lojas cadastradas", value: stats.totalStores, icon: Building2 }, { label: "Usuários ativos", value: stats.totalUsers, icon: Users }, { label: "Ações no plano", value: stats.totalActions, icon: BarChart3 }].map(s => (
            <div key={s.label} className="kpi-card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--vinho-pale)", display: "flex", alignItems: "center", justifyContent: "center" }}><s.icon size={20} style={{ color: "var(--vinho)" }} /></div>
              <div><div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--ink)" }}>{s.value}</div><div style={{ fontSize: 12, color: "var(--stone)" }}>{s.label}</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--silk)", width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
            style={{ fontSize: 13, fontWeight: 500, cursor: "pointer", background: activeTab === t.id ? "#fff" : "transparent", color: activeTab === t.id ? "var(--vinho)" : "var(--stone)", boxShadow: activeTab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {/* Tab: Lojas */}
      {activeTab === "stores" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Lojas cadastradas</h2><p style={{ fontSize: 13, color: "var(--stone)" }}>Cada loja tem seu próprio conjunto de dados, orçamento e equipe.</p></div>
            <Button onClick={() => setStoreModal({ open: true })} style={{ background: "var(--vinho)", color: "#fff" }}><Plus size={15} className="mr-1" /> Nova loja</Button>
          </div>
          {stores.length === 0 ? (
            <div className="empty-state"><Building2 size={32} style={{ color: "var(--stone)", marginBottom: 8 }} /><p style={{ color: "var(--stone)" }}>Nenhuma loja cadastrada ainda.</p><Button onClick={() => setStoreModal({ open: true })} style={{ marginTop: 12, background: "var(--vinho)", color: "#fff" }}>Cadastrar primeira loja</Button></div>
          ) : (
            <div className="space-y-3">
              {stores.map((store: StoreData) => (
                <div key={store.id} className="kpi-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div className="flex items-center gap-4">
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--vinho-pale)", display: "flex", alignItems: "center", justifyContent: "center" }}><Store size={18} style={{ color: "var(--vinho)" }} /></div>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{store.name}</div>
                      <div style={{ fontSize: 12, color: "var(--stone)" }}>{store.managerName && <span className="mr-2">Gerente: {store.managerName}</span>}{store.location && <span>{store.location}</span>}{!store.managerName && !store.location && <span style={{ fontStyle: "italic" }}>Sem informações</span>}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {store.budgetRevenue && <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: "var(--stone)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Orçamento</div><div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>R$ {Number(store.budgetRevenue).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div></div>}
                    <div className="flex gap-2">
                      <button onClick={() => openGoals(store)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ fontSize: 12, color: "var(--vinho)", background: "var(--vinho-pale)", cursor: "pointer" }}><Target size={13} /> Metas</button>
                      <button onClick={() => setStoreModal({ open: true, store })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ fontSize: 12, color: "var(--stone)", background: "var(--silk)", cursor: "pointer" }}><Edit2 size={13} /> Editar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Gerentes */}
      {activeTab === "gerentes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Gerentes</h2><p style={{ fontSize: 13, color: "var(--stone)" }}>Gerentes acessam apenas a(s) loja(s) vinculada(s). Fazem lançamentos diários, pré-turno e acompanham o Conselho.</p></div>
            <Button onClick={() => setCreateUserModal({ open: true, role: "gerente" })} style={{ background: "var(--vinho)", color: "#fff" }}><Plus size={15} className="mr-1" /> Novo gerente</Button>
          </div>
          {gerentes.length === 0 ? (
            <div className="empty-state"><UserCheck size={32} style={{ color: "var(--stone)", marginBottom: 8 }} /><p style={{ color: "var(--stone)" }}>Nenhum gerente cadastrado. Usuários aparecem aqui após o primeiro login.</p><Button onClick={() => setCreateUserModal({ open: true, role: "gerente" })} style={{ marginTop: 12, background: "var(--vinho)", color: "#fff" }}>Cadastrar gerente</Button></div>
          ) : (
            <div className="space-y-3">{gerentes.map(u => <UserCard key={u.id} u={u} stores={stores as StoreData[]} currentUserId={user?.id} onLinkStores={u => setLinkModal({ open: true, user: u })} onChangeRole={handleSetRole} />)}</div>
          )}
        </div>
      )}

      {/* Tab: Supervisores */}
      {activeTab === "supervisores" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Supervisores</h2><p style={{ fontSize: 13, color: "var(--stone)" }}>Supervisores acompanham uma ou mais lojas. Podem lançar reclamações, planos de ação e monitorar KPIs.</p></div>
            <Button onClick={() => setCreateUserModal({ open: true, role: "supervisor" })} style={{ background: "#1e40af", color: "#fff" }}><Plus size={15} className="mr-1" /> Novo supervisor</Button>
          </div>
          {supervisores.length === 0 ? (
            <div className="empty-state"><Eye size={32} style={{ color: "var(--stone)", marginBottom: 8 }} /><p style={{ color: "var(--stone)" }}>Nenhum supervisor cadastrado ainda.</p><Button onClick={() => setCreateUserModal({ open: true, role: "supervisor" })} style={{ marginTop: 12, background: "#1e40af", color: "#fff" }}>Cadastrar supervisor</Button></div>
          ) : (
            <div className="space-y-3">{supervisores.map(u => <UserCard key={u.id} u={u} stores={stores as StoreData[]} currentUserId={user?.id} onLinkStores={u => setLinkModal({ open: true, user: u })} onChangeRole={handleSetRole} />)}</div>
          )}
        </div>
      )}

      {/* Tab: Usuários */}
      {activeTab === "usuarios" && (
        <div className="space-y-4">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Todos os usuários</h2>
            <p style={{ fontSize: 13, color: "var(--stone)" }}>Gerencie os perfis de acesso. Usuários que fizeram login aparecem aqui automaticamente.</p>
          </div>
          {(allUsers as any[]).length === 0 ? (
            <div className="empty-state"><Users size={32} style={{ color: "var(--stone)", marginBottom: 8 }} /><p style={{ color: "var(--stone)" }}>Nenhum usuário cadastrado ainda.</p></div>
          ) : (
            <div className="space-y-3">
              {(allUsers as any[]).map((u: any) => (
                <div key={u.id} className="kpi-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div className="flex items-center gap-3">
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: "var(--vinho-pale)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "var(--vinho)" }}>{(u.name || u.email || "?")[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{u.name || "(sem nome)"}</div>
                      <div style={{ fontSize: 12, color: "var(--stone)" }}>{u.email ?? u.openId}{u.storeNames && <span className="ml-2">· {u.storeNames}</span>}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: ROLE_COLORS[u.role] + "22", color: ROLE_COLORS[u.role] }}>{ROLE_LABELS[u.role] ?? u.role}</span>
                    <select
                      value={u.role}
                      onChange={e => promoteUserMut.mutate({ userId: u.id, role: e.target.value as any })}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      style={{ fontSize: 12 }}
                    >
                      <option value="user">Usuário</option>
                      <option value="gerente">Gerente</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Premissas Padrão */}
      {activeTab === "premissas" && (
        <div className="space-y-4">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Premissas padrão da rede</h2>
            <p style={{ fontSize: 13, color: "var(--stone)" }}>Esses valores são usados como ponto de partida no Orçamento Assistido por IA para todas as lojas. Cada loja pode ajustar individualmente.</p>
          </div>
          <div className="kpi-card space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "cmvMetaPct", label: "CMV meta (%)", placeholder: "32" },
                { key: "royaltiesPct", label: "Royalties (%)", placeholder: "5" },
                { key: "fundoPromocaoPct", label: "Fundo de promoção (%)", placeholder: "1" },
                { key: "diasOperacao", label: "Dias de operação/mês", placeholder: "26" },
                { key: "ticketMedio", label: "Ticket médio (R$)", placeholder: "Ex: 45" },
                { key: "aluguelPct", label: "Aluguel (% da receita)", placeholder: "Ex: 8" },
                { key: "headcount", label: "Headcount médio", placeholder: "Ex: 12" },
                { key: "energiaRs", label: "Energia elétrica (R$)", placeholder: "Ex: 3500" },
                { key: "aguaRs", label: "Água (R$)", placeholder: "Ex: 400" },
                { key: "gasRs", label: "Gás (R$)", placeholder: "Ex: 800" },
              ].map(f => (
                <div key={f.key}>
                  <Label style={{ fontSize: 12 }}>{f.label}</Label>
                  <Input
                    type="number"
                    placeholder={f.placeholder}
                    value={(netForm as any)[f.key]}
                    onChange={e => setNetForm(prev => ({ ...prev, [f.key]: e.target.value === "" ? "" : Number(e.target.value) }))}
                    className="mt-1 h-9"
                  />
                </div>
              ))}
            </div>
            <div>
              <Label style={{ fontSize: 12 }}>Observações</Label>
              <textarea
                value={netForm.observacoes}
                onChange={e => setNetForm(prev => ({ ...prev, observacoes: e.target.value }))}
                placeholder="Notas sobre as premissas da rede..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => setNetworkDefaultsMut.mutate({
                  cmvMetaPct: Number(netForm.cmvMetaPct),
                  royaltiesPct: Number(netForm.royaltiesPct),
                  fundoPromocaoPct: Number(netForm.fundoPromocaoPct),
                  diasOperacao: Number(netForm.diasOperacao),
                  ticketMedio: netForm.ticketMedio !== "" ? Number(netForm.ticketMedio) : null,
                  aluguelPct: netForm.aluguelPct !== "" ? Number(netForm.aluguelPct) : null,
                  headcount: netForm.headcount !== "" ? Number(netForm.headcount) : null,
                  energiaRs: netForm.energiaRs !== "" ? Number(netForm.energiaRs) : null,
                  aguaRs: netForm.aguaRs !== "" ? Number(netForm.aguaRs) : null,
                  gasRs: netForm.gasRs !== "" ? Number(netForm.gasRs) : null,
                  observacoes: netForm.observacoes || null,
                })}
                disabled={setNetworkDefaultsMut.isPending}
                style={{ background: "var(--vinho)", color: "#fff" }}
              >
                {setNetworkDefaultsMut.isPending ? "Salvando..." : "Salvar premissas padrão"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Trilhas */}
      {activeTab === "trilhas" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Conselho das Operações</h2><p style={{ fontSize: 13, color: "var(--stone)" }}>Gerencie as 12 semanas de treinamento. Publique ou despublique aulas individualmente.</p></div>
            <Button onClick={() => seedTrilhasMutation.mutate()} disabled={seedTrilhasMutation.isPending} variant="outline" style={{ fontSize: 13 }}><RefreshCw size={14} className="mr-1" />{seedTrilhasMutation.isPending ? "Atualizando..." : "Re-sincronizar conteúdo"}</Button>
          </div>
          {(trilhasAdmin as any[]).length === 0 ? (
            <div className="empty-state"><BookOpen size={32} style={{ color: "var(--stone)", marginBottom: 8 }} /><p style={{ color: "var(--stone)" }}>Nenhuma trilha. Clique em Re-sincronizar para carregar.</p></div>
          ) : (
            <div className="space-y-4">
              {(trilhasAdmin as any[]).map((trilha: any) => (
                <div key={trilha.id} className="kpi-card space-y-3">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: trilha.cor ?? "var(--vinho-pale)", display: "flex", alignItems: "center", justifyContent: "center" }}><BookOpen size={16} style={{ color: "var(--vinho)" }} /></div>
                    <div><div style={{ fontWeight: 600, color: "var(--ink)" }}>{trilha.titulo}</div><div style={{ fontSize: 12, color: "var(--stone)" }}>{trilha.aulas?.length ?? 0} aulas</div></div>
                  </div>
                  <div className="space-y-2">
                    {(trilha.aulas ?? []).map((aula: any) => (
                      <div key={aula.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--silk)" }}>
                        <div className="flex items-center gap-3">
                          <PlayCircle size={15} style={{ color: aula.status === "publicado" ? "var(--vinho)" : "var(--stone)" }} />
                          <div><div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{aula.titulo}</div><div style={{ fontSize: 11, color: "var(--stone)" }}>{aula.duracao_min} min</div></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={aula.status === "publicado" ? "default" : "secondary"} style={aula.status === "publicado" ? { background: "var(--vinho)", color: "#fff" } : {}}>{aula.status === "publicado" ? "Publicado" : "Rascunho"}</Badge>
                          {aula.status === "publicado"
                            ? <button onClick={() => unpublishAulaMutation.mutate({ id: aula.id })} className="flex items-center gap-1 px-2 py-1 rounded" style={{ fontSize: 11, color: "var(--stone)", cursor: "pointer" }}><EyeOff size={12} /> Despublicar</button>
                            : <button onClick={() => publishAulaMutation.mutate({ id: aula.id })} className="flex items-center gap-1 px-2 py-1 rounded" style={{ fontSize: 11, color: "var(--vinho)", background: "var(--vinho-pale)", cursor: "pointer" }}><Eye size={12} /> Publicar</button>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Dados */}
      {activeTab === "dados" && (
        <div className="space-y-4">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Gerenciamento de dados</h2>
            <p style={{ fontSize: 13, color: "var(--stone)" }}>Limpe os dados de demonstração inseridos automaticamente no sistema. Esta ação é irreversível.</p>
          </div>

          {/* Guia de próximos passos */}
          <div className="kpi-card" style={{ borderLeft: "4px solid var(--vinho)", background: "var(--vinho-pale)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--vinho)" }}>📍 Roteiro para começar com dados reais</h3>
            <div className="mt-3 space-y-2">
              {[
                { step: "1", label: "Configure o tipo de operação de cada loja", detail: "Admin → Lojas → Editar → campo \"Tipo de operação\"" },
                { step: "2", label: "Limpe os dados demo de cada loja", detail: "Use os botões abaixo. Dados de orçamento, estoque e lançamentos serão removidos." },
                { step: "3", label: "Configure os feriados com IA", detail: "Admin → Feriados → \"Configurar todas as lojas com IA\"" },
                { step: "4", label: "Crie o primeiro orçamento real", detail: "Selecione a loja → Orçamento → Construir → preencha o período e as premissas" },
                { step: "5", label: "Aprove o orçamento", detail: "Orçamento → Histórico → Propor aprovação → Aprovar. As metas diárias serão geradas automaticamente." },
                { step: "6", label: "Inicie os lançamentos diários", detail: "Aba Hoje → preencha receita, atendimentos e notas do dia" },
              ].map(({ step, label, detail }) => (
                <div key={step} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--vinho)", color: "#fff" }}>{step}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</p>
                    <p style={{ fontSize: 11, color: "var(--stone)" }}>{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Limpeza por loja */}
          <div className="kpi-card space-y-3">
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Limpar dados por loja</h3>
            <p style={{ fontSize: 12, color: "var(--stone)" }}>Remove: lançamentos diários, estoque, planos de ação, compromissos, ocorrências, qualidade mensal e orçamentos da loja selecionada.</p>
            <div className="space-y-2">
              {(stores as StoreData[]).map((store) => (
                <div key={store.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--silk)" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{store.name}</span>
                  <button
                    onClick={() => setConfirmClear({ type: "store", storeId: store.id, storeName: store.name })}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg"
                    style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", cursor: "pointer" }}
                  >
                    Limpar dados
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Limpeza geral */}
          <div className="kpi-card" style={{ borderColor: "#fca5a5", background: "#fff5f5" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#dc2626" }}>Limpar TODOS os dados de demonstração</h3>
            <p style={{ fontSize: 12, color: "var(--stone)", marginTop: 4, marginBottom: 12 }}>Remove todos os dados de demonstração de todas as lojas de uma vez. Use apenas se quiser começar do zero com dados reais.</p>
            <button
              onClick={() => setConfirmClear({ type: "all" })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#dc2626", cursor: "pointer" }}
            >
              Limpar todos os dados demo
            </button>
          </div>
        </div>
      )}

      {activeTab === "feriados" && (
        <AdminHolidaysTab stores={stores as StoreData[]} />
      )}

      {/* Modal de confirmação de limpeza */}
      {confirmClear && (
        <Dialog open onOpenChange={() => setConfirmClear(null)}>
          <DialogContent style={{ maxWidth: 440 }}>
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "#dc2626" }}>
                Confirmar limpeza
              </DialogTitle>
            </DialogHeader>
            <div className="py-3">
              {confirmClear.type === "store" ? (
                <p style={{ fontSize: 14, color: "var(--ink)" }}>
                  Tem certeza que deseja remover <strong>todos os dados de demonstração</strong> da loja <strong>{confirmClear.storeName}</strong>?
                  Esta ação não pode ser desfeita.
                </p>
              ) : (
                <p style={{ fontSize: 14, color: "var(--ink)" }}>
                  Tem certeza que deseja remover <strong>TODOS os dados de demonstração de todas as lojas</strong>?
                  Esta ação não pode ser desfeita e você precisará inserir dados reais manualmente.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmClear(null)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (confirmClear.type === "store") clearStoreDemoMut.mutate({ storeId: confirmClear.storeId });
                  else clearAllDemoMut.mutate();
                }}
                disabled={clearStoreDemoMut.isPending || clearAllDemoMut.isPending}
                style={{ background: "#dc2626", color: "#fff" }}
              >
                {(clearStoreDemoMut.isPending || clearAllDemoMut.isPending) ? "Limpando..." : "Confirmar limpeza"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modals */}
      {storeModal.open && <StoreModal store={storeModal.store} onClose={() => setStoreModal({ open: false })} onSaved={refetchStores} />}
      {createUserModal?.open && <CreateUserModal stores={stores as StoreData[]} role={createUserModal.role} onClose={() => setCreateUserModal(null)} onSaved={refetchUsers} />}
      {linkModal.open && linkModal.user && <LinkStoresModal stores={stores as StoreData[]} user={linkModal.user} onClose={() => setLinkModal({ open: false })} onSaved={refetchUsers} />}

      {goalsStore !== null && (
        <Dialog open onOpenChange={() => setGoalsStore(null)}>
          <DialogContent style={{ maxWidth: 440 }}>
            <DialogHeader><DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>Metas da loja</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              {[{ key: "budgetRevenue", label: "Receita orçada (R$)", placeholder: "150000" }, { key: "budgetCmvPct", label: "CMV meta (%)", placeholder: "30" }, { key: "budgetPackagingPct", label: "Embalagens meta (%)", placeholder: "4" }, { key: "budgetTaxesPct", label: "Impostos meta (%)", placeholder: "3" }, { key: "budgetFixedCosts", label: "Custos fixos orçados (R$)", placeholder: "20000" }].map(f => (
                <div key={f.key}><Label>{f.label}</Label><Input value={goalsForm[f.key] ?? ""} onChange={e => setGoalsForm(g => ({ ...g, [f.key]: e.target.value }))} placeholder={f.placeholder} type="number" /></div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGoalsStore(null)}>Cancelar</Button>
              <Button onClick={handleSaveGoals} disabled={updateGoalsMutation.isPending} style={{ background: "var(--vinho)", color: "#fff" }}>{updateGoalsMutation.isPending ? "Salvando..." : "Salvar metas"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
