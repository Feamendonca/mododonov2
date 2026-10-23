import React, { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from "xlsx";
import {
  Package, Plus, Upload, AlertTriangle, CheckCircle2, ChevronRight,
  ChevronDown, Edit2, Trash2, BarChart3, ShoppingCart, Archive,
  TrendingDown, Info, ArrowRight, FileSpreadsheet, AlertCircle, Layers,
  TrendingUp, Activity, ToggleLeft, ToggleRight
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type AlertFlag = "negative_stock" | "unnecessary_purchase" | "anomalous_consumption" | "zero_consumption" | "high_cmv";

const ALERT_META: Record<AlertFlag, { label: string; color: string }> = {
  negative_stock:        { label: "Estoque Negativo",    color: "text-red-600" },
  unnecessary_purchase:  { label: "Compra Desnecessária",color: "text-orange-600" },
  anomalous_consumption: { label: "Consumo Anômalo",     color: "text-yellow-600" },
  zero_consumption:      { label: "Consumo Zero",        color: "text-blue-600" },
  high_cmv:              { label: "CMV Alto",            color: "text-red-600" },
};

const CURVE_BADGE: Record<string, string> = {
  A: "bg-red-100 text-red-700 border-red-200",
  B: "bg-yellow-100 text-yellow-700 border-yellow-200",
  C: "bg-green-100 text-green-700 border-green-200",
};

const UNIT_OPTIONS = ["KG","L","UND","CX","PCT","G","ML","DZ","SC","FD"];
const WIZARD_STEPS = ["opening","purchases","closing","review"] as const;
type WizardStep = typeof WIZARD_STEPS[number];
const WIZARD_LABELS: Record<WizardStep, string> = {
  opening: "Estoque Inicial",
  purchases: "Entradas/Compras",
  closing: "Estoque Final",
  review: "Revisão",
};

// ─── Excel Parser ─────────────────────────────────────────────────────────────
type ParsedCategory = { name: string; products: { name: string; unit: string }[] };

function parseExcelForProducts(file: File): Promise<{ categories: ParsedCategory[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName =
          wb.SheetNames.find(n => n.toLowerCase().includes("compras")) ??
          wb.SheetNames[1] ??
          wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows: (string | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        const CAT_KEYWORDS = ["CARNES","HORTI","BEBIDAS","FRIOS","SECOS","LIMPEZA",
          "DESCART","REFEIÇÃO","REFEICAO","MASSAS","LATICÍNIOS","LATICINIOS","PADARIA","MERCEARIA"];
        const categories: ParsedCategory[] = [];
        let current: ParsedCategory | null = null;

        for (const row of rows) {
          const cell = row[0];
          if (!cell || typeof cell !== "string") continue;
          const up = cell.trim().toUpperCase();
          const isHeader = CAT_KEYWORDS.some(k => up.includes(k)) || row[1] === "ITEM" || row[1] === "PRODUTO";
          if (isHeader) {
            if (current && current.products.length > 0) categories.push(current);
            current = { name: cell.trim(), products: [] };
            continue;
          }
          if (current && cell.trim().length > 2 && !up.includes("TOTAL") && !up.includes("RESUMO")) {
            const unit = (row[2] && typeof row[2] === "string" && row[2].trim()) ? row[2].trim() : "KG";
            current.products.push({ name: cell.trim(), unit });
          }
        }
        if (current && current.products.length > 0) categories.push(current);
        resolve({ categories });
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EstoquePage() {
  const { storeId } = useStore();
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<"overview"|"wizard"|"products"|"history">("overview");
  const [wizardStep, setWizardStep] = useState<WizardStep>("opening");
  const [wizardData, setWizardData] = useState<Record<number, { opening?: number; purchases?: number; closing?: number; purchasesCost?: number }>>({});
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [showNewCat, setShowNewCat] = useState(false);
  const [showNewProd, setShowNewProd] = useState(false);
  const [editingProd, setEditingProd] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<{ categories: ParsedCategory[] } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // CMV Teórico
  const [cmvTeoricoInput, setCmvTeoricoInput] = useState("");
  const [cmvTeoricoReceitaInput, setCmvTeoricoReceitaInput] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: categories = [] } = trpc.cmv.categories.list.useQuery({ storeId: storeId ?? 0 }, { enabled: !!storeId });
  const { data: products = [] }   = trpc.cmv.products.list.useQuery({ storeId: storeId ?? 0 }, { enabled: !!storeId });
  const { data: currentPeriod }   = trpc.cmv.periods.current.useQuery({ storeId: storeId ?? 0 }, { enabled: !!storeId });
  const { data: periods = [] }    = trpc.cmv.periods.list.useQuery({ storeId: storeId ?? 0 }, { enabled: !!storeId });
  const { data: summary }         = trpc.cmv.summary.useQuery(
    { periodId: currentPeriod?.id ?? 0, storeId: storeId ?? 0 },
    { enabled: !!currentPeriod?.id && !!storeId }
  );
  const { data: detail }          = trpc.cmv.periodDetail.useQuery(
    { periodId: currentPeriod?.id ?? 0, storeId: storeId ?? 0 },
    { enabled: !!currentPeriod?.id && !!storeId }
  );
  const { data: modoCmv, refetch: refetchModoCmv } = trpc.cmv.getModoCmv.useQuery(
    { storeId: storeId ?? 0 }, { enabled: !!storeId }
  );
  const { data: historicoCmv = [] } = trpc.cmv.historicoCmv.useQuery(
    { storeId: storeId ?? 0, limit: 16 }, { enabled: !!storeId }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const openPeriod    = trpc.cmv.periods.open.useMutation({ onSuccess: () => { utils.cmv.periods.current.invalidate(); utils.cmv.periods.list.invalidate(); toast.success("Período aberto!"); }, onError: e => toast.error(e.message) });
  const closePeriod   = trpc.cmv.periods.close.useMutation({ onSuccess: () => { utils.cmv.periods.current.invalidate(); utils.cmv.periods.list.invalidate(); utils.cmv.summary.invalidate(); toast.success("Período fechado!"); } });
  const createCat     = trpc.cmv.categories.create.useMutation({ onSuccess: () => { utils.cmv.categories.list.invalidate(); setShowNewCat(false); toast.success("Categoria criada!"); } });
  const createProd    = trpc.cmv.products.create.useMutation({ onSuccess: () => { utils.cmv.products.list.invalidate(); setShowNewProd(false); toast.success("Produto cadastrado!"); } });
  const updateProd    = trpc.cmv.products.update.useMutation({ onSuccess: () => { utils.cmv.products.list.invalidate(); setEditingProd(null); toast.success("Produto atualizado!"); } });
  const deleteProd    = trpc.cmv.products.delete.useMutation({ onSuccess: () => { utils.cmv.products.list.invalidate(); toast.success("Produto removido!"); } });
  const bulkSave      = trpc.cmv.movements.bulkSave.useMutation({
    onSuccess: (d) => { utils.cmv.summary.invalidate(); utils.cmv.periodDetail.invalidate(); toast.success(`Contagem salva! ${d.alertsTotal > 0 ? `${d.alertsTotal} alerta(s) detectado(s).` : "Sem desvios."}`); setTab("overview"); setWizardStep("opening"); setWizardData({}); },
    onError: e => toast.error(e.message),
  });
  const bulkImport    = trpc.cmv.products.bulkImport.useMutation({
    onSuccess: (d) => { utils.cmv.categories.list.invalidate(); utils.cmv.products.list.invalidate(); setShowImport(false); setImportPreview(null); toast.success(`Importado: ${d.categoriesCreated} categorias e ${d.productsCreated} produtos!`); },
    onError: e => toast.error(e.message),
  });
  const parseProductSheet = trpc.cmv.parseProductSheet.useMutation({
    onSuccess: (d) => { setNewImportPreview(d); setImportLoading(false); },
    onError: (e) => { toast.error(e.message); setImportLoading(false); },
  });
  const importProducts = trpc.cmv.importProducts.useMutation({
    onSuccess: (d) => { utils.cmv.categories.list.invalidate(); utils.cmv.products.list.invalidate(); setShowImport(false); setNewImportPreview(null); toast.success(`Importado: ${d.categoriesCreated} categorias e ${d.productsCreated} produtos!`); },
    onError: e => toast.error(e.message),
  });
  const downloadProductTemplate = trpc.cmv.downloadProductTemplate.useQuery(undefined, { enabled: false });
  const [newImportPreview, setNewImportPreview] = useState<{ rows: any[]; validCount: number; errorCount: number; sheetName: string } | null>(null);
  const setModoCmv = trpc.cmv.setModoCmv.useMutation({ onSuccess: () => { refetchModoCmv(); toast.success("Configuração salva!"); } });
  const salvarCmvTeorico = trpc.cmv.salvarCmvTeorico.useMutation({
    onSuccess: () => { utils.cmv.historicoCmv.invalidate(); toast.success("CMV teórico salvo!"); },
    onError: e => toast.error(e.message),
  });

  // ── Derived ───────────────────────────────────────────────────────────────────
  const productsByCategory = useMemo(() => {
    const map = new Map<number | null, typeof products>();
    for (const p of products) {
      const k = p.categoryId ?? null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [products]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const toggleCat = (id: number) => setExpandedCats(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const setWizardField = (productId: number, field: "opening"|"purchases"|"closing"|"purchasesCost", raw: string) => {
    const v = parseFloat(raw);
    setWizardData(prev => ({ ...prev, [productId]: { ...prev[productId], [field]: isNaN(v) ? undefined : v } }));
  };

  const getWizardField = (productId: number, step: WizardStep): string => {
    const d = wizardData[productId];
    if (!d) return "";
    const v = step === "opening" ? d.opening : step === "purchases" ? d.purchases : d.closing;
    return v === undefined ? "" : String(v);
  };

  const submitWizard = () => {
    if (!currentPeriod) return;
    const movements = products.map(p => ({
      productId: p.id,
      openingStock: wizardData[p.id]?.opening ?? 0,
      purchases: wizardData[p.id]?.purchases ?? 0,
      closingStock: wizardData[p.id]?.closing ?? 0,
      purchasesCost: wizardData[p.id]?.purchasesCost ?? 0,
    }));
    bulkSave.mutate({ periodId: currentPeriod.id, storeId: storeId ?? 0, movements });
    // Se modo CMV teórico ativo e valores preenchidos, salvar
    if (modoCmv?.usaCmvTeorico) {
      const rs = parseFloat(cmvTeoricoInput);
      const rec = parseFloat(cmvTeoricoReceitaInput);
      if (!isNaN(rs) && !isNaN(rec) && rs > 0 && rec > 0) {
        salvarCmvTeorico.mutate({ periodId: currentPeriod.id, storeId: storeId ?? 0, cmvTeoricoRs: rs, cmvTeoricoReceita: rec });
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setNewImportPreview(null);
    setImportPreview(null);
    try {
      // Converter para base64 e enviar ao backend parser
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target!.result as string;
        const base64 = result.split(",")[1];
        parseProductSheet.mutate({ base64 });
      };
      reader.readAsDataURL(file);
    } catch { toast.error("Erro ao ler o arquivo. Verifique o formato."); setImportLoading(false); }
  };

  const handleDownloadTemplate = async () => {
    const result = await downloadProductTemplate.refetch();
    if (result.data) {
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data.base64}`;
      link.download = result.data.filename;
      link.click();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!storeId) return <div className="p-8 text-muted-foreground">Selecione uma loja para continuar.</div>;

  const cmvPct    = summary?.cmvPct ?? 0;
  const totalCmv  = summary?.totalCmv ?? 0;
  const totalRev  = summary?.totalRevenue ?? 0;
  const alerts    = summary?.totalAlerts ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Controle semanal</div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:36, fontWeight:600, color:"var(--ink)", lineHeight:1.1 }}>
            Estoque & CMV<span className="dot">.</span>
          </h1>
          <p className="text-sm mt-1" style={{ color:"var(--stone-light)" }}>
            {products.length} produtos · {categories.length} categorias
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {products.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />Importar Planilha
            </Button>
          )}
          {!currentPeriod ? (
            <Button size="sm" onClick={() => openPeriod.mutate({ storeId: storeId!, startDate: new Date().toISOString().slice(0,10) })} disabled={openPeriod.isPending}
              className="gap-2" style={{ background:"var(--vinho)", color:"var(--white)" }}>
              <Plus className="w-4 h-4" />Abrir Período
            </Button>
          ) : (
            <Button size="sm" onClick={() => setTab("wizard")} className="gap-2" style={{ background:"var(--vinho)", color:"var(--white)" }}>
              <Archive className="w-4 h-4" />Fazer Contagem
            </Button>
          )}
        </div>
      </div>

      {/* Period Banner */}
      {currentPeriod && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Período Aberto — Semana {currentPeriod.weekNumber}/{currentPeriod.year}</p>
              <p className="text-xs text-amber-700">{currentPeriod.startDate} a {currentPeriod.endDate}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => closePeriod.mutate({ periodId: currentPeriod.id, storeId: storeId! })} className="text-amber-700 border-amber-300 hover:bg-amber-100">
            Fechar Período
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={v => setTab(v as any)}>
        <TabsList className="grid grid-cols-5 w-full max-w-xl">
          <TabsTrigger value="overview">Resumo</TabsTrigger>
          <TabsTrigger value="wizard">Contagem</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="purchases">Compras</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="kpi-board">
            <div className="kpi-card">
              <div className="kpi-label">CMV Semana</div>
              <div className="kpi-value num" style={{ fontSize:28, color: cmvPct > 0 ? (cmvPct > 35 ? "var(--red)" : cmvPct > 30 ? "var(--amber)" : "var(--green)") : "var(--stone-light)" }}>
                {cmvPct > 0 ? `${cmvPct.toFixed(1)}%` : "—"}
              </div>
              <div className="kpi-sub">R$ {totalCmv.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Receita Período</div>
              <div className="kpi-value num" style={{ fontSize:28 }}>
                {totalRev > 0 ? `R$ ${(totalRev/1000).toFixed(1)}k` : "—"}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Alertas</div>
              <div className="kpi-value num" style={{ fontSize:28, color: alerts > 0 ? "var(--red)" : "var(--green)" }}>{alerts}</div>
              <div className="kpi-sub">{alerts > 0 ? "desvios detectados" : "sem desvios"}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Produtos</div>
              <div className="kpi-value num" style={{ fontSize:28 }}>{products.length}</div>
              <div className="kpi-sub">{categories.length} categorias</div>
            </div>
          </div>

          {/* Card de Dispersão CMV Teórico vs. Real */}
          {modoCmv?.usaCmvTeorico && (() => {
            const last = (historicoCmv as any[])[0];
            if (!last || last.cmvTeoricoRs == null) return null;
            const disp = last.dispersaoRs ?? 0;
            const dispPct = last.dispersaoPct ?? 0;
            const semaforo = Math.abs(dispPct) < 1 ? "var(--green)" : Math.abs(dispPct) < 3 ? "var(--amber)" : "var(--red)";
            return (
              <div className="kpi-card" style={{ borderLeft: `4px solid ${semaforo}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={16} style={{ color: semaforo }} />
                  <span className="kpi-label" style={{ marginBottom: 0 }}>CMV Teórico vs. Real</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div style={{ fontSize: 11, color: "var(--stone-light)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Real</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{last.cmvRealPct.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: "var(--stone-light)" }}>R$ {last.cmvRealRs.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--stone-light)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Teórico</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{last.cmvTeoricoPct?.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: "var(--stone-light)" }}>R$ {last.cmvTeoricoRs?.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--stone-light)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Dispersão</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: semaforo }}>{disp > 0 ? "+" : ""}{dispPct.toFixed(2)}pp</div>
                    <div style={{ fontSize: 11, color: semaforo }}>R$ {disp > 0 ? "+" : ""}{disp.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {summary && summary.byCategory.length > 0 ? (
            <div className="section-card">
              <h3 className="text-sm font-semibold mb-4" style={{ color:"var(--ink)" }}>CMV por Categoria</h3>
              <div className="space-y-4">
                {summary.byCategory.map(cat => {
                  const over = cat.cmvPct > cat.targetPct;
                  return (
                    <div key={cat.categoryId ?? "none"} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium" style={{ color:"var(--ink)" }}>{cat.categoryName}</span>
                        <div className="flex items-center gap-3">
                          {cat.alertCount > 0 && <span className="text-xs text-orange-600 font-medium">{cat.alertCount} alerta{cat.alertCount>1?"s":""}</span>}
                          <span className="font-semibold" style={{ color: over ? "var(--red)" : "var(--green)" }}>{cat.cmvPct.toFixed(1)}%</span>
                          <span className="text-xs" style={{ color:"var(--stone-light)" }}>meta {cat.targetPct}%</span>
                        </div>
                      </div>
                      <div className="relative h-2 rounded-full overflow-hidden" style={{ background:"var(--gray-line)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width:`${Math.min(cat.cmvPct/(cat.targetPct*1.5)*100,100)}%`, background: over ? "var(--red)" : "var(--green)" }} />
                        <div className="absolute top-0 h-full w-0.5 bg-foreground/30" style={{ left:`${Math.min(cat.targetPct/(cat.targetPct*1.5)*100,100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs" style={{ color:"var(--stone-light)" }}>
                        <span>R$ {cat.totalCmv.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>
                        <span>{cat.productCount} produtos</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="section-card flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="w-10 h-10 mb-3" style={{ color:"var(--stone-light)", opacity:0.5 }} />
              <p className="text-sm font-medium" style={{ color:"var(--stone-light)" }}>Nenhuma contagem registrada</p>
              <p className="text-xs mt-1" style={{ color:"var(--stone-light)" }}>
                {!currentPeriod ? "Abra um período e faça a contagem." : "Clique em 'Fazer Contagem' para registrar."}
              </p>
            </div>
          )}

          {/* Alerts Detail */}
          {detail && detail.products.some(p => p.alertFlags.length > 0) && (
            <div className="section-card">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color:"var(--ink)" }}>
                <AlertTriangle className="w-4 h-4 text-orange-500" />Produtos com Alertas
              </h3>
              <div className="space-y-3">
                {detail.products.filter(p => p.alertFlags.length > 0).map(p => (
                  <div key={p.id} className="p-3 rounded-lg border border-orange-100 bg-orange-50/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color:"var(--ink)" }}>{p.name}</p>
                        <p className="text-xs" style={{ color:"var(--stone-light)" }}>{p.categoryName} · {p.unit}</p>
                        <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-xs" style={{ color:"var(--stone)" }}>
                          <span>Inicial: <strong>{p.openingStock}</strong></span>
                          <span>Compras: <strong>{p.purchases}</strong></span>
                          <span>Final: <strong>{p.closingStock}</strong></span>
                          <span>Consumo: <strong>{p.consumption}</strong></span>
                          <span>CMV: <strong>R$ {p.cmvValue.toFixed(2)}</strong></span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(p.alertFlags as AlertFlag[]).map(f => {
                            const m = ALERT_META[f];
                            if (!m) return null;
                            return <span key={f} className={`text-xs font-medium px-1.5 py-0.5 rounded border ${m.color} bg-white border-current/20`}>{m.label}</span>;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── WIZARD ───────────────────────────────────────────────────────── */}
        <TabsContent value="wizard" className="space-y-4 mt-4">
          {!currentPeriod ? (
            <div className="section-card flex flex-col items-center justify-center py-12 text-center">
              <Archive className="w-10 h-10 mb-3" style={{ color:"var(--stone-light)", opacity:0.5 }} />
              <p className="text-sm font-medium" style={{ color:"var(--stone-light)" }}>Nenhum período aberto</p>
              <p className="text-xs mt-1 mb-4" style={{ color:"var(--stone-light)" }}>Abra um período semanal para iniciar a contagem.</p>
              <Button size="sm" onClick={() => openPeriod.mutate({ storeId: storeId!, startDate: new Date().toISOString().slice(0,10) })} style={{ background:"var(--vinho)", color:"var(--white)" }}>
                Abrir Período
              </Button>
            </div>
          ) : products.length === 0 ? (
            <div className="section-card flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-10 h-10 mb-3" style={{ color:"var(--stone-light)", opacity:0.5 }} />
              <p className="text-sm font-medium" style={{ color:"var(--stone-light)" }}>Nenhum produto cadastrado</p>
              <p className="text-xs mt-1 mb-4" style={{ color:"var(--stone-light)" }}>Importe sua planilha ou cadastre produtos manualmente.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>Importar Planilha</Button>
                <Button size="sm" onClick={() => setTab("products")} style={{ background:"var(--vinho)", color:"var(--white)" }}>Cadastrar Produtos</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Step Indicator */}
              <div className="flex items-center gap-2 flex-wrap">
                {WIZARD_STEPS.map((step, i) => {
                  const isActive = wizardStep === step;
                  const isDone = WIZARD_STEPS.indexOf(wizardStep) > i;
                  return (
                    <div key={step} className="flex items-center gap-2">
                      <button onClick={() => setWizardStep(step)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isActive ? "text-white" : isDone ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}
                        style={isActive ? { background:"var(--vinho)" } : {}}>
                        {isDone && <CheckCircle2 className="w-3 h-3" />}
                        {i+1}. {WIZARD_LABELS[step]}
                      </button>
                      {i < 3 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                    </div>
                  );
                })}
              </div>

              {/* Product Tables */}
              {wizardStep !== "review" && (
                <div className="space-y-3">
                  {categories.map(cat => {
                    const catProds = productsByCategory.get(cat.id) ?? [];
                    const isOpen = expandedCats.has(cat.id) || expandedCats.size === 0;
                    return (
                      <div key={cat.id} className="section-card overflow-hidden">
                        <button onClick={() => toggleCat(cat.id)} className="w-full flex items-center justify-between py-1 text-sm font-semibold" style={{ color:"var(--ink)" }}>
                          <span className="flex items-center gap-2">
                            <Layers className="w-4 h-4" style={{ color:"var(--vinho)" }} />
                            {cat.name}
                            <span className="text-xs font-normal" style={{ color:"var(--stone-light)" }}>({catProds.length} produtos)</span>
                          </span>
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        {isOpen && (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr style={{ borderBottom:"1px solid var(--gray-line)" }}>
                                  <th className="text-left pb-2 text-xs font-semibold uppercase tracking-wide" style={{ color:"var(--stone-light)" }}>Produto</th>
                                  <th className="text-center pb-2 text-xs font-semibold uppercase tracking-wide w-16" style={{ color:"var(--stone-light)" }}>Un.</th>
                                  <th className="text-center pb-2 text-xs font-semibold uppercase tracking-wide w-28" style={{ color:"var(--stone-light)" }}>
                                    {wizardStep === "opening" ? "Qtd. Inicial" : wizardStep === "purchases" ? "Qtd. Comprada" : "Qtd. Final"}
                                  </th>
                                  {wizardStep === "purchases" && (
                                    <th className="text-center pb-2 text-xs font-semibold uppercase tracking-wide w-32" style={{ color:"var(--stone-light)" }}>Valor (R$)</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {catProds.map(p => (
                                  <tr key={p.id} style={{ borderBottom:"1px solid var(--gray-line)" }} className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2 pr-4">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${CURVE_BADGE[p.curveABC]}`}>{p.curveABC}</span>
                                        <span className="font-medium" style={{ color:"var(--ink)" }}>{p.name}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 text-center" style={{ color:"var(--stone-light)" }}>{p.unit}</td>
                                    <td className="py-2 px-2">
                                      <input type="number" min="0" step="0.001" placeholder="0"
                                        className="w-full h-8 text-center text-sm rounded-lg border px-2 focus:outline-none focus:ring-1"
                                        style={{ borderColor:"var(--gray-line)", background:"var(--ivory)", color:"var(--ink)" }}
                                        value={getWizardField(p.id, wizardStep)}
                                        onChange={e => setWizardField(p.id, wizardStep === "opening" ? "opening" : wizardStep === "purchases" ? "purchases" : "closing", e.target.value)}
                                      />
                                    </td>
                                    {wizardStep === "purchases" && (
                                      <td className="py-2 pl-2">
                                        <input type="number" min="0" step="0.01" placeholder="0,00"
                                          className="w-full h-8 text-center text-sm rounded-lg border px-2 focus:outline-none focus:ring-1"
                                          style={{ borderColor:"var(--gray-line)", background:"var(--ivory)", color:"var(--ink)" }}
                                          value={wizardData[p.id]?.purchasesCost ?? ""}
                                          onChange={e => setWizardField(p.id, "purchasesCost", e.target.value)}
                                        />
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uncategorized */}
                  {(productsByCategory.get(null) ?? []).length > 0 && (
                    <div className="section-card">
                      <p className="text-sm font-semibold mb-3" style={{ color:"var(--stone-light)" }}>Sem Categoria</p>
                      <div className="space-y-2">
                        {(productsByCategory.get(null) ?? []).map(p => (
                          <div key={p.id} className="flex items-center gap-3">
                            <span className="flex-1 text-sm" style={{ color:"var(--ink)" }}>{p.name}</span>
                            <span className="text-xs w-12 text-center" style={{ color:"var(--stone-light)" }}>{p.unit}</span>
                            <input type="number" min="0" step="0.001" placeholder="0"
                              className="h-8 w-24 text-center text-sm rounded-lg border px-2 focus:outline-none focus:ring-1"
                              style={{ borderColor:"var(--gray-line)", background:"var(--ivory)", color:"var(--ink)" }}
                              value={getWizardField(p.id, wizardStep)}
                              onChange={e => setWizardField(p.id, wizardStep === "opening" ? "opening" : wizardStep === "purchases" ? "purchases" : "closing", e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-2">
                    {wizardStep !== "opening" && (
                      <Button variant="outline" onClick={() => setWizardStep(wizardStep === "purchases" ? "opening" : "purchases")}>Voltar</Button>
                    )}
                    <Button className="ml-auto gap-2" style={{ background:"var(--vinho)", color:"var(--white)" }}
                      onClick={() => {
                        if (wizardStep === "opening") setWizardStep("purchases");
                        else if (wizardStep === "purchases") setWizardStep("closing");
                        else setWizardStep("review");
                      }}>
                      Próximo <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Review */}
              {wizardStep === "review" && (
                <div className="section-card space-y-4">
                  <h3 className="text-sm font-semibold" style={{ color:"var(--ink)" }}>Revisão da Contagem</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom:"1px solid var(--gray-line)" }}>
                          {["Produto","Inicial","Compras","Final","Consumo"].map(h => (
                            <th key={h} className={`pb-2 text-xs font-semibold uppercase tracking-wide ${h==="Produto"?"text-left":"text-center"}`} style={{ color:"var(--stone-light)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {products.filter(p => {
                          const d = wizardData[p.id];
                          return d && Object.values(d).some(v => v !== undefined && v !== 0);
                        }).map(p => {
                          const d = wizardData[p.id] ?? {};
                          const opening = d.opening ?? 0;
                          const purchases = d.purchases ?? 0;
                          const closing = d.closing ?? 0;
                          const consumption = opening + purchases - closing;
                          return (
                            <tr key={p.id} style={{ borderBottom:"1px solid var(--gray-line)" }} className={closing < 0 ? "bg-red-50" : ""}>
                              <td className="py-2 font-medium" style={{ color:"var(--ink)" }}>{p.name}</td>
                              <td className="py-2 text-center">{opening}</td>
                              <td className="py-2 text-center">{purchases}</td>
                              <td className={`py-2 text-center ${closing < 0 ? "text-red-600 font-bold" : ""}`}>{closing}</td>
                              <td className="py-2 text-center font-semibold">{consumption.toFixed(3)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Campo CMV Teórico (só se modo ativo) */}
                  {modoCmv?.usaCmvTeorico && (
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: "var(--gray-line)", background: "var(--ivory)" }}>
                      <div className="flex items-center gap-2">
                        <Activity size={14} style={{ color: "var(--vinho)" }} />
                        <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>CMV Teórico (Ficha Técnica)</p>
                      </div>
                      <p className="text-xs" style={{ color: "var(--stone-light)" }}>Informe o CMV calculado pela ficha técnica para comparar com o real e medir a dispersão.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: "var(--stone)" }}>CMV Teórico (R$)</label>
                          <input type="number" min="0" step="0.01" placeholder="Ex: 12500.00"
                            className="w-full h-9 text-sm rounded-lg border px-3 focus:outline-none focus:ring-1"
                            style={{ borderColor: "var(--gray-line)", background: "var(--white)", color: "var(--ink)" }}
                            value={cmvTeoricoInput}
                            onChange={e => setCmvTeoricoInput(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: "var(--stone)" }}>Receita do Período (R$)</label>
                          <input type="number" min="0" step="0.01" placeholder="Ex: 45000.00"
                            className="w-full h-9 text-sm rounded-lg border px-3 focus:outline-none focus:ring-1"
                            style={{ borderColor: "var(--gray-line)", background: "var(--white)", color: "var(--ink)" }}
                            value={cmvTeoricoReceitaInput}
                            onChange={e => setCmvTeoricoReceitaInput(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setWizardStep("closing")}>Voltar</Button>
                    <Button onClick={submitWizard} disabled={bulkSave.isPending} style={{ background:"var(--vinho)", color:"var(--white)" }}>
                      {bulkSave.isPending ? "Salvando..." : "Confirmar Contagem"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── PRODUCTS ─────────────────────────────────────────────────────── */}
        <TabsContent value="products" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color:"var(--stone-light)" }}>{products.length} produtos · {categories.length} categorias</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-2">
                <Upload className="w-3.5 h-3.5" />Importar Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowNewCat(true)} className="gap-2">
                <Plus className="w-3.5 h-3.5" />Categoria
              </Button>
              <Button size="sm" onClick={() => setShowNewProd(true)} className="gap-2" style={{ background:"var(--vinho)", color:"var(--white)" }}>
                <Plus className="w-3.5 h-3.5" />Produto
              </Button>
            </div>
          </div>

          {categories.length === 0 && products.length === 0 ? (
            <div className="section-card flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-12 h-12 mb-4" style={{ color:"var(--stone-light)", opacity:0.4 }} />
              <p className="text-base font-semibold mb-1" style={{ color:"var(--ink)" }}>Nenhum produto cadastrado</p>
              <p className="text-sm mb-6 max-w-sm" style={{ color:"var(--stone-light)" }}>
                Importe sua planilha de controle de compras ou cadastre os produtos manualmente por categoria.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2">
                  <FileSpreadsheet className="w-4 h-4" />Importar Planilha Excel
                </Button>
                <Button onClick={() => setShowNewCat(true)} className="gap-2" style={{ background:"var(--vinho)", color:"var(--white)" }}>
                  <Plus className="w-4 h-4" />Criar Categoria
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => {
                const catProds = productsByCategory.get(cat.id) ?? [];
                const isOpen = expandedCats.has(cat.id) || expandedCats.size === 0;
                return (
                  <div key={cat.id} className="section-card overflow-hidden">
                    <button onClick={() => toggleCat(cat.id)} className="w-full flex items-center justify-between py-1">
                      <div className="flex items-center gap-3">
                        <Layers className="w-4 h-4" style={{ color:"var(--vinho)" }} />
                        <span className="text-sm font-semibold" style={{ color:"var(--ink)" }}>{cat.name}</span>
                        <span className="text-xs" style={{ color:"var(--stone-light)" }}>{catProds.length} produtos</span>
                        <span className="text-xs" style={{ color:"var(--stone-light)" }}>Meta CMV: {cat.cmvTargetPct}%</span>
                      </div>
                      {isOpen ? <ChevronDown className="w-4 h-4" style={{ color:"var(--stone-light)" }} /> : <ChevronRight className="w-4 h-4" style={{ color:"var(--stone-light)" }} />}
                    </button>
                    {isOpen && catProds.length > 0 && (
                      <div className="mt-3 border-t pt-3" style={{ borderColor:"var(--gray-line)" }}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ borderBottom:"1px solid var(--gray-line)" }}>
                              {["Produto","Un.","Curva","Custo Unit.",""].map((h,i) => (
                                <th key={i} className={`pb-1.5 text-xs font-semibold uppercase tracking-wide ${i===0?"text-left":"text-center"} ${i===4?"w-20":""}`} style={{ color:"var(--stone-light)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {catProds.map(p => (
                              <tr key={p.id} style={{ borderBottom:"1px solid var(--gray-line)" }} className="hover:bg-muted/20 transition-colors">
                                <td className="py-2 font-medium" style={{ color:"var(--ink)" }}>{p.name}</td>
                                <td className="py-2 text-center" style={{ color:"var(--stone-light)" }}>{p.unit}</td>
                                <td className="py-2 text-center">
                                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${CURVE_BADGE[p.curveABC]}`}>{p.curveABC}</span>
                                </td>
                                <td className="py-2 text-center" style={{ color:"var(--stone-light)" }}>
                                  {p.unitCost > 0 ? `R$ ${p.unitCost.toFixed(4)}` : "—"}
                                </td>
                                <td className="py-2">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => setEditingProd(p)} className="p-1 hover:bg-muted rounded transition-colors">
                                      <Edit2 className="w-3.5 h-3.5" style={{ color:"var(--stone-light)" }} />
                                    </button>
                                    <button onClick={() => deleteProd.mutate({ id: p.id, storeId: storeId! })} className="p-1 hover:bg-red-50 rounded transition-colors">
                                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── HISTORY ────────────────────────────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Toggle CMV Teórico */}
          <div className="section-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Modo CMV Teórico</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--stone-light)" }}>Ative para comparar o CMV real com o CMV teórico (calculado pela ficha técnica) e medir a dispersão.</p>
              </div>
              <button
                onClick={() => setModoCmv.mutate({ storeId: storeId!, ativo: !modoCmv?.usaCmvTeorico })}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: modoCmv?.usaCmvTeorico ? "var(--vinho-pale)" : "var(--silk)", color: modoCmv?.usaCmvTeorico ? "var(--vinho)" : "var(--stone)" }}
              >
                {modoCmv?.usaCmvTeorico ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                <span className="text-sm font-medium">{modoCmv?.usaCmvTeorico ? "Ativo" : "Inativo"}</span>
              </button>
            </div>
          </div>

          {/* Gráfico histórico CMV */}
          {(historicoCmv as any[]).length > 0 && (() => {
            const chartData = [...(historicoCmv as any[])].reverse().map((p: any) => ({
              label: `S${p.weekNumber}/${String(p.year).slice(2)}`,
              real: p.cmvRealPct > 0 ? parseFloat(p.cmvRealPct.toFixed(2)) : null,
              teorico: p.cmvTeoricoPct != null ? parseFloat(p.cmvTeoricoPct.toFixed(2)) : null,
              dispersao: p.dispersaoPct != null ? parseFloat(p.dispersaoPct.toFixed(2)) : null,
            }));
            const hasTeorico = chartData.some(d => d.teorico != null);
            return (
              <div className="section-card">
                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ink)" }}>Evolução CMV Semanal</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-line)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--stone-light)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--stone-light)" }} unit="%" domain={["auto", "auto"]} />
                    <Tooltip formatter={(v: any) => [`${v}%`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={30} stroke="var(--stone-light)" strokeDasharray="4 4" label={{ value: "Meta", position: "right", fontSize: 10, fill: "var(--stone-light)" }} />
                    <Line type="monotone" dataKey="real" name="CMV Real" stroke="var(--vinho)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    {hasTeorico && <Line type="monotone" dataKey="teorico" name="CMV Teórico" stroke="#1e40af" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />}
                    {hasTeorico && <Line type="monotone" dataKey="dispersao" name="Dispersão" stroke="#d97706" strokeWidth={1.5} strokeDasharray="2 2" dot={false} connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Lista de períodos */}
          {periods.length === 0 ? (
            <div className="section-card flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="w-10 h-10 mb-3" style={{ color:"var(--stone-light)", opacity:0.5 }} />
              <p className="text-sm" style={{ color:"var(--stone-light)" }}>Nenhum período registrado ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(historicoCmv as any[]).length > 0 ? (historicoCmv as any[]).map((p: any) => (
                <div key={p.periodId} className="section-card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color:"var(--ink)" }}>Semana {p.weekNumber}/{p.year}</p>
                    <p className="text-xs" style={{ color:"var(--stone-light)" }}>{p.startDate} a {p.endDate}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold" style={{ color: p.cmvRealPct > 35 ? "var(--red)" : p.cmvRealPct > 30 ? "var(--amber)" : "var(--green)" }}>
                        {p.cmvRealPct > 0 ? `${p.cmvRealPct.toFixed(1)}%` : "—"}
                      </div>
                      {p.cmvTeoricoPct != null && (
                        <div className="text-xs" style={{ color: "var(--stone-light)" }}>Teórico: {p.cmvTeoricoPct.toFixed(1)}%</div>
                      )}
                    </div>
                    <Badge variant={p.status === "open" ? "default" : "secondary"}>
                      {p.status === "open" ? "Aberto" : "Fechado"}
                    </Badge>
                    {p.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => closePeriod.mutate({ periodId: p.periodId, storeId: storeId! })}>Fechar</Button>
                    )}
                  </div>
                </div>
              )) : periods.map(p => (
                <div key={p.id} className="section-card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color:"var(--ink)" }}>Semana {p.weekNumber}/{p.year}</p>
                    <p className="text-xs" style={{ color:"var(--stone-light)" }}>{p.startDate} a {p.endDate}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={p.status === "open" ? "default" : "secondary"}>
                      {p.status === "open" ? "Aberto" : "Fechado"}
                    </Badge>
                    {p.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => closePeriod.mutate({ periodId: p.id, storeId: storeId! })}>Fechar</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── COMPRAS ──────────────────────────────────────────────────────────── */}
        <TabsContent value="purchases" className="space-y-4 mt-4">
          <ComprasTab storeId={storeId!} periodId={currentPeriod?.id ?? null} products={products} />
        </TabsContent>

      </Tabs>

      {/* ── DIALOGS ──────────────────────────────────────────────────────────── */}

      {/* New Category */}
      <NewCategoryDialog open={showNewCat} onClose={() => setShowNewCat(false)}
        onSave={d => createCat.mutate({ storeId: storeId!, ...d })} loading={createCat.isPending} />

      {/* New / Edit Product */}
      <ProductDialog open={showNewProd || !!editingProd} product={editingProd} categories={categories}
        onClose={() => { setShowNewProd(false); setEditingProd(null); }}
        onSave={d => editingProd ? updateProd.mutate({ id: editingProd.id, storeId: storeId!, ...d }) : createProd.mutate({ storeId: storeId!, ...d })}
        loading={createProd.isPending || updateProd.isPending} />

      {/* Import Excel */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" style={{ color:"var(--vinho)" }} />
              Importar Planilha de Produtos
            </DialogTitle>
          </DialogHeader>
          {!newImportPreview ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg text-sm space-y-2" style={{ background:"var(--ivory)", border:"1px solid var(--gray-line)" }}>
                <p className="font-medium" style={{ color:"var(--ink)" }}>Como funciona a importação:</p>
                <ul className="space-y-1 list-disc list-inside text-xs" style={{ color:"var(--stone)" }}>
                  <li>Use o template abaixo ou sua planilha de compras existente</li>
                  <li>Colunas: Categoria, Produto, Unidade, Curva ABC (A/B/C), Custo Unitário</li>
                  <li>O sistema cria as categorias e produtos automaticamente</li>
                </ul>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-2 mt-2">
                  <FileSpreadsheet className="w-3.5 h-3.5" />Baixar Template Excel
                </Button>
              </div>
              <div className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-primary/50"
                style={{ borderColor:"var(--gray-line)" }}
                onClick={() => fileRef.current?.click()}>
                <Upload className="w-8 h-8 mx-auto mb-3" style={{ color:"var(--stone-light)" }} />
                <p className="text-sm font-medium" style={{ color:"var(--ink)" }}>Clique para selecionar o arquivo Excel</p>
                <p className="text-xs mt-1" style={{ color:"var(--stone-light)" }}>Formatos aceitos: .xlsx, .xls, .csv</p>
                {importLoading && <p className="text-xs mt-2 animate-pulse" style={{ color:"var(--vinho)" }}>Analisando planilha com IA...</p>}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-700">
                  <strong>{newImportPreview.validCount} produtos válidos</strong> encontrados
                  {newImportPreview.errorCount > 0 && <span className="text-red-600 ml-2">· {newImportPreview.errorCount} com erro</span>}
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border" style={{ borderColor:"var(--gray-line)" }}>
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {["Produto","Categoria","Un.","Curva","Custo"].map((h,i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {newImportPreview.rows.filter((r: any) => r.errors.length === 0).slice(0, 20).map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium" style={{ color:"var(--ink)" }}>{row.nome}</td>
                        <td className="px-3 py-2" style={{ color:"var(--stone-light)" }}>{row.categoria}</td>
                        <td className="px-3 py-2" style={{ color:"var(--stone-light)" }}>{row.unidade}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${CURVE_BADGE[row.curvaABC] ?? ""}`}>{row.curvaABC}</span>
                        </td>
                        <td className="px-3 py-2" style={{ color:"var(--stone-light)" }}>
                          {row.custoUnitario > 0 ? `R$ ${row.custoUnitario.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {newImportPreview.validCount > 20 && (
                  <div className="px-3 py-2 text-xs text-center" style={{ color:"var(--stone-light)" }}>+ {newImportPreview.validCount - 20} produtos adicionais</div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => { setNewImportPreview(null); setImportPreview(null); }} className="flex-1">Cancelar</Button>
                <Button
                  onClick={() => importProducts.mutate({ storeId: storeId!, rows: newImportPreview.rows.filter((r: any) => r.errors.length === 0) })}
                  disabled={importProducts.isPending} className="flex-1" style={{ background:"var(--vinho)", color:"var(--white)" }}>
                  {importProducts.isPending ? "Importando..." : `Importar ${newImportPreview.validCount} produtos`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-dialogs ──────────────────────────────────────────────────────────────

function NewCategoryDialog({ open, onClose, onSave, loading }: {
  open: boolean; onClose: () => void;
  onSave: (d: { name: string; cmvTargetPct: number }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("30");
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" style={{ color:"var(--ink)" }}>Nome da Categoria</label>
            <Input className="mt-1" placeholder="Ex: Carnes, Bebidas, Horti-Fruti..." value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium" style={{ color:"var(--ink)" }}>Meta de CMV (%)</label>
            <Input className="mt-1" type="number" min="0" max="100" placeholder="30" value={target} onChange={e => setTarget(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave({ name, cmvTargetPct: parseFloat(target) || 30 })} disabled={!name || loading}
            style={{ background:"var(--vinho)", color:"var(--white)" }}>
            {loading ? "Criando..." : "Criar Categoria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductDialog({ open, product, categories, onClose, onSave, loading }: {
  open: boolean; product: any; categories: any[];
  onClose: () => void;
  onSave: (d: { name: string; unit: string; categoryId: number | null; unitCost: number; curveABC: "A"|"B"|"C" }) => void;
  loading: boolean;
}) {
  const [name, setName]           = useState(product?.name ?? "");
  const [unit, setUnit]           = useState(product?.unit ?? "KG");
  const [catId, setCatId]         = useState<number | null>(product?.categoryId ?? null);
  const [unitCost, setUnitCost]   = useState(product?.unitCost?.toString() ?? "0");
  const [curve, setCurve]         = useState<"A"|"B"|"C">(product?.curveABC ?? "B");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{product ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" style={{ color:"var(--ink)" }}>Nome do Produto / Fornecedor</label>
            <Input className="mt-1" placeholder="Ex: JKF Carnes, Spal Coca-Cola..." value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" style={{ color:"var(--ink)" }}>Unidade de Medida</label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color:"var(--ink)" }}>Curva ABC</label>
              <Select value={curve} onValueChange={v => setCurve(v as "A"|"B"|"C")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Alto impacto</SelectItem>
                  <SelectItem value="B">B — Médio impacto</SelectItem>
                  <SelectItem value="C">C — Baixo impacto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" style={{ color:"var(--ink)" }}>Categoria</label>
              <Select value={catId?.toString() ?? "none"} onValueChange={v => setCatId(v === "none" ? null : parseInt(v))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color:"var(--ink)" }}>Custo Unitário (R$)</label>
              <Input className="mt-1" type="number" min="0" step="0.0001" placeholder="0,0000" value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave({ name, unit, categoryId: catId, unitCost: parseFloat(unitCost)||0, curveABC: curve })}
            disabled={!name || loading} style={{ background:"var(--vinho)", color:"var(--white)" }}>
            {loading ? "Salvando..." : product ? "Salvar Alterações" : "Cadastrar Produto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Aba Compras ──────────────────────────────────────────────────────────────
type ComprasProduct = { id: number; name: string; unit: string; unitCost: number };

function ComprasTab({ storeId, periodId, products }: {
  storeId: number;
  periodId: number | null;
  products: ComprasProduct[];
}) {
  const utils = trpc.useUtils();
  const [mode, setMode] = React.useState<"manual" | "import">("manual");
  const [selProduct, setSelProduct] = React.useState<string>("");
  const [qty, setQty] = React.useState("");
  const [totalCost, setTotalCost] = React.useState("");
  const [addModeManual, setAddModeManual] = React.useState<"add" | "set">("add");
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Array<{ nome: string; qty: number; totalCost: number; errors: string[] }> | null>(null);
  const [importWarnings, setImportWarnings] = React.useState<string[]>([]);
  const [addModeImport, setAddModeImport] = React.useState<"add" | "set">("add");

  const addPurchase = trpc.cmv.addProductPurchase.useMutation({
    onSuccess: () => {
      toast.success("Compra registrada!");
      utils.cmv.summary.invalidate();
      utils.cmv.periodDetail.invalidate();
      setSelProduct(""); setQty(""); setTotalCost("");
    },
    onError: (e) => toast.error(e.message),
  });
  const setPurchaseMut = trpc.cmv.setProductPurchase.useMutation({
    onSuccess: () => {
      toast.success("Compra corrigida!");
      utils.cmv.summary.invalidate();
      utils.cmv.periodDetail.invalidate();
      setSelProduct(""); setQty(""); setTotalCost("");
    },
    onError: (e) => toast.error(e.message),
  });
  const parseSheet = trpc.cmv.parsePurchaseSheet.useMutation({
    onSuccess: (d) => { setPreview(d.rows); setImportWarnings(d.warnings); },
    onError: (e) => toast.error(e.message),
  });
  const importSheet = trpc.cmv.importPurchaseSheet.useMutation({
    onSuccess: (d) => {
      toast.success(`Importado: ${d.matched} casados, ${d.created} criados, ${d.skipped} ignorados.`);
      utils.cmv.summary.invalidate();
      utils.cmv.periodDetail.invalidate();
      setPreview(null); setImportFile(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      parseSheet.mutate({ base64, fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleManualSave = () => {
    if (!periodId) return toast.error("Nenhum período aberto");
    if (!selProduct) return toast.error("Selecione um produto");
    const q = parseFloat(qty.replace(",", "."));
    const c = parseFloat(totalCost.replace(",", "."));
    if (isNaN(q) || q < 0) return toast.error("Quantidade inválida");
    if (isNaN(c) || c < 0) return toast.error("Custo inválido");
    if (addModeManual === "set") {
      setPurchaseMut.mutate({ periodId, productId: parseInt(selProduct), storeId, qty: q, totalCost: c });
    } else {
      addPurchase.mutate({ periodId, productId: parseInt(selProduct), storeId, qty: q, totalCost: c });
    }
  };

  const handleImportConfirm = () => {
    if (!periodId || !preview) return;
    const validRows = preview.filter(r => r.errors.length === 0);
    importSheet.mutate({ periodId, storeId, rows: validRows, addMode: addModeImport });
  };

  if (!periodId) {
    return (
      <div className="text-center py-12">
        <ShoppingCart className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--stone-light)" }} />
        <p className="text-sm" style={{ color: "var(--stone-light)" }}>Abra um período de estoque para registrar compras.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Button size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}>
          <Plus className="w-4 h-4 mr-1" />Lançar manual
        </Button>
        <Button size="sm" variant={mode === "import" ? "default" : "outline"} onClick={() => setMode("import")}>
          <Upload className="w-4 h-4 mr-1" />Importar planilha
        </Button>
      </div>

      {mode === "manual" && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Lançar compra por produto</h3>
          <p className="text-xs" style={{ color: "var(--stone-light)" }}>
            Os valores são somados ao período atual. Use "Corrigir" para substituir.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--stone)" }}>Produto</label>
              <Select value={selProduct} onValueChange={setSelProduct}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--stone)" }}>Quantidade</label>
              <Input value={qty} onChange={e => setQty(e.target.value)} placeholder="0,000" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--stone)" }}>Custo total (R$)</label>
              <Input value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Select value={addModeManual} onValueChange={v => setAddModeManual(v as "add" | "set")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Somar ao período</SelectItem>
                <SelectItem value="set">Corrigir (substituir)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleManualSave} disabled={addPurchase.isPending || setPurchaseMut.isPending}
              style={{ background: "var(--vinho)", color: "var(--white)" }}>
              {addModeManual === "set" ? "Corrigir" : "Registrar compra"}
            </Button>
          </div>
        </div>
      )}

      {mode === "import" && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Importar planilha de compras</h3>
          <p className="text-xs" style={{ color: "var(--stone-light)" }}>
            Colunas esperadas: <strong>Produto/Nome</strong>, <strong>Qtd/Quantidade</strong>, <strong>Custo/Valor Total</strong>.
            Produtos não encontrados são criados automaticamente.
          </p>
          <input type="file" accept=".xlsx,.xls,.xlsb,.csv" onChange={handleFileChange} className="text-sm" />
          {parseSheet.isPending && <p className="text-xs text-blue-600">Analisando planilha...</p>}
          {importWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              {importWarnings.map((w, i) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
            </div>
          )}
          {preview && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: "var(--stone)" }}>
                Prévia: {preview.length} linha(s) — {preview.filter(r => r.errors.length === 0).length} válidas
              </p>
              <div className="overflow-auto max-h-64 border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2">Produto</th>
                      <th className="text-right p-2">Qtd</th>
                      <th className="text-right p-2">Custo (R$)</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className={r.errors.length > 0 ? "bg-red-50" : ""}>
                        <td className="p-2">{r.nome}</td>
                        <td className="text-right p-2">{r.qty.toFixed(3)}</td>
                        <td className="text-right p-2">{r.totalCost.toFixed(2)}</td>
                        <td className="p-2">
                          {r.errors.length > 0
                            ? <span className="text-red-600">{r.errors.join(", ")}</span>
                            : <span className="text-green-600">✓</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 items-center">
                <Select value={addModeImport} onValueChange={v => setAddModeImport(v as "add" | "set")}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Somar ao período</SelectItem>
                    <SelectItem value="set">Corrigir (substituir)</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleImportConfirm} disabled={importSheet.isPending}
                  style={{ background: "var(--vinho)", color: "var(--white)" }}>
                  {importSheet.isPending ? "Importando..." : `Confirmar (${preview.filter(r => r.errors.length === 0).length} linhas)`}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
