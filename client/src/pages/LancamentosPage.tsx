import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useStore } from "@/components/AppLayout";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Trash2, Loader2, Pencil, Copy, Plus } from "lucide-react";
import { useLocation } from "wouter";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FORMAS = [
  { key: "dinheiro", label: "Dinheiro" },
  { key: "debito", label: "Cartão Débito" },
  { key: "credito", label: "Cartão Crédito" },
  { key: "vale", label: "Vale/Ticket (VR/VA)" },
  { key: "pix", label: "PIX" },
  { key: "apps", label: "Apps/iFood" },
] as const;

type FormaKey = typeof FORMAS[number]["key"];

function parseMoeda(s: string): number {
  const raw = s.replace(/[^\d]/g, "");
  return raw ? parseInt(raw, 10) / 100 : 0;
}
function fmtMoeda(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA RECEITA (Fechamento de Caixa)
// ═══════════════════════════════════════════════════════════════════════════════
function AbaReceita({ storeId, period, mes, ano }: { storeId: number; period: string; mes: number; ano: number }) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const [data, setData] = useState(todayStr);
  const [valores, setValores] = useState<Record<FormaKey, string>>({ dinheiro: "", debito: "", credito: "", vale: "", pix: "", apps: "" });
  const [atendimentos, setAtendimentos] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: caixas = [], isLoading } = trpc.lancamentos.listarCaixas.useQuery({ storeId, period }, { enabled: !!storeId });
  const salvarMut = trpc.lancamentos.salvarCaixa.useMutation({
    onSuccess: (res) => {
      toast.success(`Caixa salvo: ${fmt(res.total)}`);
      setValores({ dinheiro: "", debito: "", credito: "", vale: "", pix: "", apps: "" });
      setAtendimentos("");
      setEditingDate(null);
      utils.lancamentos.listarCaixas.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const excluirMut = trpc.lancamentos.excluirCaixa.useMutation({
    onSuccess: () => { toast.success("Caixa excluído."); utils.lancamentos.listarCaixas.invalidate(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const total = FORMAS.reduce((sum, f) => sum + parseMoeda(valores[f.key]), 0);

  function handleSalvar() {
    const input: any = { storeId, data, atendimentos: parseInt(atendimentos) || 0 };
    FORMAS.forEach(f => { input[f.key] = parseMoeda(valores[f.key]); });
    salvarMut.mutate(input);
  }

  function handleEditar(cx: any) {
    setData(cx.data);
    setEditingDate(cx.data);
    const v: any = {};
    FORMAS.forEach(f => { v[f.key] = cx[f.key] > 0 ? fmtMoeda(Math.round(cx[f.key] * 100)) : ""; });
    setValores(v);
    setAtendimentos(cx.atendimentos > 0 ? String(cx.atendimentos) : "");
  }

  function handleRepetirOntem() {
    if (caixas.length === 0) return;
    const ontem = caixas[0]; // mais recente
    const v: any = {};
    FORMAS.forEach(f => { v[f.key] = ontem[f.key] > 0 ? fmtMoeda(Math.round(ontem[f.key] * 100)) : ""; });
    setValores(v);
    setAtendimentos(ontem.atendimentos > 0 ? String(ontem.atendimentos) : "");
  }

  return (
    <div className="space-y-4">
      {/* Formulário */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{editingDate ? `Editando caixa de ${editingDate}` : "Fechamento de caixa"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Data</label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            {caixas.length > 0 && !editingDate && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleRepetirOntem}>
                <Copy size={12} className="mr-1" /> Repetir último
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FORMAS.map(f => (
              <div key={f.key} className="flex flex-col gap-0.5">
                <label className="text-xs text-muted-foreground">{f.label}</label>
                <Input
                  type="text" inputMode="decimal" placeholder="0,00"
                  value={valores[f.key]}
                  onChange={e => {
                    let raw = e.target.value.replace(/[^\d]/g, "");
                    if (!raw) { setValores(v => ({ ...v, [f.key]: "" })); return; }
                    setValores(v => ({ ...v, [f.key]: fmtMoeda(parseInt(raw, 10)) }));
                  }}
                  onKeyDown={e => { if (e.key === "Enter") handleSalvar(); }}
                  className="h-8 text-sm tabular-nums"
                />
              </div>
            ))}
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Atendimentos</label>
              <Input type="number" min={0} value={atendimentos} onChange={e => setAtendimentos(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSalvar(); }}
                className="w-28 h-8 text-sm" />
            </div>
            <div className="flex-1" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Receita do dia</p>
              <p className="text-lg font-bold tabular-nums">{fmt(total)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSalvar} disabled={salvarMut.isPending || total === 0} className="h-8 text-sm">
              {salvarMut.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              {editingDate ? "Atualizar" : "Salvar caixa"}
            </Button>
            {editingDate && (
              <Button variant="ghost" className="h-8 text-sm" onClick={() => {
                setEditingDate(null);
                setValores({ dinheiro: "", debito: "", credito: "", vale: "", pix: "", apps: "" });
                setAtendimentos("");
                setData(todayStr);
              }}>Cancelar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de caixas do mês */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Caixas de {MESES[mes]}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> :
           caixas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum caixa lançado neste mês.</p> : (
            <div className="space-y-1">
              {caixas.map(cx => (
                <div key={cx.data} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-2">
                  <span className="tabular-nums font-medium">{cx.data.slice(8, 10)}/{pad2(mes)}</span>
                  <span className="tabular-nums">{fmt(cx.total)}</span>
                  <span className="text-xs text-muted-foreground">{cx.atendimentos} atend.</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleEditar(cx)} className="p-1 hover:text-blue-500 transition-colors"><Pencil size={12} /></button>
                    <button onClick={() => { if (confirm("Excluir caixa?")) excluirMut.mutate({ storeId, data: cx.data }); }}
                      className="p-1 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border mt-2 px-3">
                <span>Total do mês</span>
                <span className="tabular-nums">{fmt(caixas.reduce((s, c) => s + c.total, 0))}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA DESPESAS (Lista + Lote)
// ═══════════════════════════════════════════════════════════════════════════════
const CATEGORIAS_DRE = [
  { id: "folha", label: "Folha de Pagamento" },
  { id: "encargos", label: "Encargos" },
  { id: "pro_labore", label: "Pró-labore" },
  { id: "aluguel", label: "Aluguel" },
  { id: "condominio", label: "Condomínio" },
  { id: "energia", label: "Energia" },
  { id: "gas", label: "Gás" },
  { id: "agua", label: "Água" },
  { id: "contabilidade", label: "Contabilidade" },
  { id: "sistemas", label: "Sistemas" },
  { id: "sanitarismo", label: "Sanitarismo" },
  { id: "taxa_cartao", label: "Taxa de Cartão" },
  { id: "impostos", label: "Impostos" },
  { id: "marketing", label: "Marketing" },
  { id: "manutencao", label: "Manutenção" },
  { id: "outros", label: "Outros" },
];

function AbaDespesas({ storeId, period, mes, ano }: { storeId: number; period: string; mes: number; ano: number }) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const [modo, setModo] = useState<"fila" | "colar">("fila");
  const [form, setForm] = useState({ fornecedor: "", valor: "", data: todayStr, observacao: "", categoria: "aluguel" });
  const [fila, setFila] = useState<Array<{ fornecedor: string; valor: number; data: string; observacao: string; categoria: string; id: number }>>([]);
  const [nextId, setNextId] = useState(1);
  const [colText, setColText] = useState("");
  const [colParsed, setColParsed] = useState<Array<{ fornecedor: string; valor: number; data: string; categoria: string; observacao: string; erro?: string }>>([]);

  const utils = trpc.useUtils();
  const { data: despesas = [], isLoading } = trpc.despesas.list.useQuery({ storeId, period }, { enabled: !!storeId });
  const { data: fornecedoresLoja = [] } = trpc.despesas.fornecedoresLoja.useQuery({ storeId }, { enabled: !!storeId });

  const lancarLoteMut = trpc.despesas.lancarLote.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.inseridas} despesa${res.inseridas > 1 ? "s" : ""} lançada${res.inseridas > 1 ? "s" : ""}.`);
      setFila([]);
      setColText("");
      setColParsed([]);
      utils.despesas.list.invalidate();
      utils.despesas.resumoDreViva.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const excluirMut = trpc.despesas.excluir.useMutation({
    onSuccess: () => { toast.success("Removida."); utils.despesas.list.invalidate(); utils.despesas.resumoDreViva.invalidate(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  // Ao selecionar fornecedor conhecido, pré-preencher categoria
  function handleFornecedorBlur() {
    if (!form.fornecedor) return;
    const match = fornecedoresLoja.find(f => f.fornecedor.toLowerCase() === form.fornecedor.toLowerCase());
    if (match) setForm(f => ({ ...f, categoria: match.categoriaSugerida }));
  }

  function handleAdicionar() {
    const raw = form.valor.replace(/\./g, "").replace(",", ".");
    const valor = parseFloat(raw);
    if (!valor || valor <= 0) { toast.error("Informe um valor válido"); return; }
    setFila(f => [...f, { fornecedor: form.fornecedor, valor, data: form.data || todayStr, observacao: form.observacao, categoria: form.categoria, id: nextId }]);
    setNextId(n => n + 1);
    setForm(f => ({ ...f, valor: "", observacao: "" }));
  }

  function handleSalvarFila() {
    if (fila.length === 0) return;
    lancarLoteMut.mutate({
      storeId,
      itens: fila.map(i => ({
        categoria: i.categoria as any,
        valor: i.valor,
        data: i.data,
        fornecedor: i.fornecedor || undefined,
        observacao: i.observacao || undefined,
      })),
    });
  }

  // Parse colar planilha
  function parseColado(text: string) {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const lines = text.split("\n").filter(l => l.trim());
    const parsed = lines.map(line => {
      const parts = line.split(/\t|;/).map(s => s.trim());
      if (parts.length < 3) return { fornecedor: parts[0] ?? "", valor: 0, data: todayStr, categoria: "outros", observacao: "", erro: "Linha incompleta (mín: Fornecedor, Valor, Data)" };
      const fornecedor = parts[0];
      // Valor
      let valStr = parts[1].replace(/R\$\s*/g, "").trim();
      let valor: number;
      if (valStr.includes(",") && valStr.indexOf(",") > (valStr.lastIndexOf(".") || -1)) {
        valor = parseFloat(valStr.replace(/\./g, "").replace(",", "."));
      } else {
        valor = parseFloat(valStr.replace(/,/g, ""));
      }
      if (isNaN(valor) || valor <= 0) return { fornecedor, valor: 0, data: todayStr, categoria: "outros", observacao: "", erro: `Valor inválido: "${parts[1]}"` };
      // Data
      let data = todayStr;
      const dStr = parts[2];
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) { data = dStr; }
      else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dStr)) { const [d, m, y] = dStr.split("/"); data = `${y}-${m}-${d}`; }
      else if (/^\d{2}\/\d{2}$/.test(dStr)) { const [d, m] = dStr.split("/"); data = `${ano}-${m}-${d}`; }
      else { return { fornecedor, valor, data: todayStr, categoria: "outros", observacao: "", erro: `Data inválida: "${dStr}"` }; }
      // Categoria
      let categoria = "outros";
      let erro: string | undefined;
      if (parts[3]) {
        const catNorm = norm(parts[3]);
        const match = CATEGORIAS_DRE.find(c => norm(c.label) === catNorm || norm(c.id) === catNorm);
        if (match) categoria = match.id;
        else erro = `Categoria não reconhecida: "${parts[3]}"`;
      } else {
        // Tentar inferir do fornecedor
        const fMatch = fornecedoresLoja.find(f => f.fornecedor.toLowerCase() === fornecedor.toLowerCase());
        if (fMatch) categoria = fMatch.categoriaSugerida;
      }
      const observacao = parts[4] ?? "";
      return { fornecedor, valor, data, categoria, observacao, erro };
    });
    setColParsed(parsed);
  }

  function handleImportarColado() {
    const validos = colParsed.filter(p => !p.erro && p.valor > 0);
    if (validos.length === 0) { toast.error("Nenhuma linha válida para importar."); return; }
    lancarLoteMut.mutate({
      storeId,
      itens: validos.map(i => ({
        categoria: i.categoria as any,
        valor: i.valor,
        data: i.data,
        fornecedor: i.fornecedor || undefined,
        observacao: i.observacao || undefined,
      })),
    });
  }

  const totalFila = fila.reduce((s, i) => s + i.valor, 0);
  const totalMes = despesas.reduce((s, d) => s + d.valor, 0);

  return (
    <div className="space-y-4">
      {/* Toggle modo */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant={modo === "fila" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setModo("fila")}>Fila rápida</Button>
        <Button size="sm" variant={modo === "colar" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setModo("colar")}>Colar da planilha</Button>
        <span className="flex-1" />
        <p className="text-xs text-muted-foreground">{despesas.length} lançadas · {fmt(totalMes)}</p>
      </div>

      {/* MODO A — Fila rápida */}
      {modo === "fila" && (
        <>
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="flex flex-col gap-0.5 sm:col-span-1">
                  <label className="text-xs text-muted-foreground">Fornecedor</label>
                  <Input type="text" placeholder="Fornecedor" value={form.fornecedor}
                    onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                    onBlur={handleFornecedorBlur}
                    list="fornecedores-loja-list" className="h-8 text-sm" />
                  <datalist id="fornecedores-loja-list">
                    {fornecedoresLoja.map(f => <option key={f.fornecedor} value={f.fornecedor} />)}
                  </datalist>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">Valor (R$)</label>
                  <Input type="text" inputMode="decimal" placeholder="0,00" value={form.valor}
                    onChange={e => {
                      let raw = e.target.value.replace(/[^\d]/g, "");
                      if (!raw) { setForm(f => ({ ...f, valor: "" })); return; }
                      setForm(f => ({ ...f, valor: fmtMoeda(parseInt(raw, 10)) }));
                    }}
                    onKeyDown={e => { if (e.key === "Enter") handleAdicionar(); }}
                    className="h-8 text-sm tabular-nums" autoFocus />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">Data</label>
                  <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">Observação</label>
                  <Input type="text" placeholder="NF, parcela..." value={form.observacao}
                    onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") handleAdicionar(); }}
                    className="h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">Categoria</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="h-8 text-sm rounded border border-border px-2 bg-background">
                    {CATEGORIAS_DRE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <Button size="sm" onClick={handleAdicionar} disabled={!form.valor} className="h-8 text-xs">
                <Plus size={12} className="mr-1" /> Adicionar à fila
              </Button>
            </CardContent>
          </Card>

          {/* Fila editável */}
          {fila.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Fila ({fila.length}) · {fmt(totalFila)}</span>
                  <Button size="sm" onClick={handleSalvarFila} disabled={lancarLoteMut.isPending} className="h-8 text-xs">
                    {lancarLoteMut.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                    Salvar {fila.length} lançamento{fila.length > 1 ? "s" : ""}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {fila.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-1.5 gap-2">
                      <span className="text-xs w-16 shrink-0">{item.data.slice(8, 10)}/{pad2(mes)}</span>
                      <span className="text-xs font-medium w-24 shrink-0 truncate">{CATEGORIAS_DRE.find(c => c.id === item.categoria)?.label ?? item.categoria}</span>
                      <span className="text-xs truncate flex-1">{item.fornecedor || item.observacao || ""}</span>
                      <span className="tabular-nums font-medium text-right w-24 shrink-0">{fmt(item.valor)}</span>
                      <button onClick={() => setFila(f => f.filter(x => x.id !== item.id))}
                        className="p-1 hover:text-red-500 transition-colors shrink-0"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* MODO B — Colar da planilha */}
      {modo === "colar" && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Cole linhas no formato: <strong>Fornecedor; Valor; Data; Categoria; Observação</strong> (separador TAB ou ponto-e-vírgula)</p>
            <textarea
              value={colText}
              onChange={e => { setColText(e.target.value); parseColado(e.target.value); }}
              placeholder={"Copel\t3.200,00\t10/08/2026\tEnergia\tNF 1234\nÁgua Sanepar\t450,00\t10/08\tÁgua"}
              className="w-full h-32 text-xs font-mono border border-border rounded p-2 bg-background resize-y"
            />
            {colParsed.length > 0 && (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {colParsed.map((p, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs rounded px-3 py-1.5 ${p.erro ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/20"}`}>
                    <span className={`w-4 shrink-0 ${p.erro ? "text-red-500" : "text-green-500"}`}>{p.erro ? "✗" : "✓"}</span>
                    <span className="w-28 truncate">{p.fornecedor}</span>
                    <span className="w-20 tabular-nums text-right">{p.valor > 0 ? fmt(p.valor) : "—"}</span>
                    <span className="w-16">{p.data.slice(8, 10)}/{p.data.slice(5, 7)}</span>
                    <span className="w-24 truncate">{CATEGORIAS_DRE.find(c => c.id === p.categoria)?.label ?? p.categoria}</span>
                    {p.erro && (
                      <span className="text-red-500 text-[10px] flex-1 truncate">{p.erro}</span>
                    )}
                    {p.erro?.includes("Categoria") && (
                      <select className="h-6 text-[10px] border rounded px-1"
                        value={p.categoria}
                        onChange={e => {
                          const newParsed = [...colParsed];
                          newParsed[i] = { ...newParsed[i], categoria: e.target.value, erro: undefined };
                          setColParsed(newParsed);
                        }}>
                        {CATEGORIAS_DRE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
            {colParsed.length > 0 && (
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleImportarColado} disabled={lancarLoteMut.isPending || colParsed.filter(p => !p.erro && p.valor > 0).length === 0} className="h-8 text-xs">
                  {lancarLoteMut.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Importar {colParsed.filter(p => !p.erro && p.valor > 0).length} linha{colParsed.filter(p => !p.erro && p.valor > 0).length > 1 ? "s" : ""}
                </Button>
                <span className="text-xs text-muted-foreground">{colParsed.filter(p => p.erro).length} com erro</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista existente */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> :
           despesas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma despesa lançada neste mês.</p> : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {despesas.map(d => (
                <div key={d.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-1.5 gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{d.data?.slice(8, 10)}/{pad2(mes)}</span>
                  <span className="text-xs font-medium w-28 shrink-0 truncate">{CATEGORIAS_DRE.find(c => c.id === d.categoria)?.label ?? d.categoria}</span>
                  <span className="text-xs truncate flex-1">{d.fornecedor || d.descricao || ""}</span>
                  <span className="tabular-nums font-medium text-right w-24 shrink-0">{fmt(d.valor)}</span>
                  <button onClick={() => { if (confirm("Remover?")) excluirMut.mutate({ id: d.id, storeId }); }}
                    className="p-1 hover:text-red-500 transition-colors shrink-0"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA COMPRAS (Lote/import)
// ═══════════════════════════════════════════════════════════════════════════════
function AbaCompras({ storeId }: { storeId: number }) {
  const [, navigate] = useLocation();
  const now = new Date();
  const anoMes = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const [step, setStep] = useState<"inicio" | "confirmacao">("inicio");
  const [form, setForm] = useState({ fornecedor: "", data: todayStr, valorStr: "", categoriaId: null as number | null, invoiceNumber: "", observacao: "" });
  const [baixaConfianca, setBaixaConfianca] = useState(false);
  const [extraindo, setExtraindo] = useState(false);

  const { data: compras = [], refetch } = trpc.cmv.listarComprasMes.useQuery({ storeId, anoMes }, { enabled: !!storeId });
  const { data: categorias = [] } = trpc.cmv.categories.list.useQuery({ storeId }, { enabled: !!storeId });
  const extrairMut = trpc.cmv.extrairNotaCompra.useMutation();
  const lancarMut = trpc.cmv.lancarCompra.useMutation();

  const totalMes = compras.reduce((s, c) => s + c.totalValue, 0);

  function parseCurrencyCompra(str: string): number {
    const clean = str.replace(/\./g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  }
  function formatCurrencyCompra(val: string): string {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "";
    const num = parseInt(digits, 10) / 100;
    return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtraindo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await extrairMut.mutateAsync({ storeId, imageBase64: base64, mimeType: file.type });
      setForm(f => ({
        ...f,
        fornecedor: result.fornecedor ?? "",
        data: result.dataEmissao ?? todayStr,
        valorStr: result.valorTotal ? result.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
      }));
      setBaixaConfianca(result.baixaConfianca ?? false);
      setStep("confirmacao");
    } catch (err: any) {
      toast.error("Erro ao extrair nota: " + (err?.message ?? "tente novamente"));
    } finally {
      setExtraindo(false);
    }
    e.target.value = "";
  }

  function handleManual() {
    setForm({ fornecedor: "", data: todayStr, valorStr: "", categoriaId: null, invoiceNumber: "", observacao: "" });
    setBaixaConfianca(false);
    setStep("confirmacao");
  }

  async function handleConfirmar() {
    const valor = parseCurrencyCompra(form.valorStr);
    if (!valor || valor < 0.01) { toast.error("Informe o valor total."); return; }
    if (!form.data) { toast.error("Informe a data."); return; }
    try {
      await lancarMut.mutateAsync({
        storeId,
        data: form.data,
        fornecedor: form.fornecedor || undefined,
        categoriaId: form.categoriaId ?? undefined,
        invoiceNumber: form.invoiceNumber || undefined,
        valorTotal: valor,
        observacao: form.observacao || undefined,
      });
      toast.success(`Lançado: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${form.fornecedor ? " — " + form.fornecedor : ""}`);
      setStep("inicio");
      setForm({ fornecedor: "", data: todayStr, valorStr: "", categoriaId: null, invoiceNumber: "", observacao: "" });
      refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao lançar compra");
    }
  }

  if (step === "confirmacao") {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold text-sm">Confirmar lançamento de compra</h3>
            {baixaConfianca && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-800">
                Confiança baixa na extração. Confira os dados com atenção.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fornecedor</label>
                <Input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Valor total (R$)</label>
                <Input
                  value={form.valorStr}
                  onChange={e => setForm(f => ({ ...f, valorStr: formatCurrencyCompra(e.target.value) }))}
                  placeholder="0,00"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") handleConfirmar(); if (e.key === "Escape") setStep("inicio"); }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Grupo de insumo</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={form.categoriaId ?? ""}
                  onChange={e => setForm(f => ({ ...f, categoriaId: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">— Nenhum —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nº nota (opcional)</label>
                <Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="NF-e 12345" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Observação</label>
                <Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Ex.: pagamento parcial" onKeyDown={e => { if (e.key === "Enter") handleConfirmar(); }} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleConfirmar} disabled={lancarMut.isPending || !form.valorStr} className="h-9">
                {lancarMut.isPending ? "Salvando..." : "Confirmar e lançar"}
              </Button>
              <Button variant="outline" onClick={() => setStep("inicio")} className="h-9">Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Botões de entrada */}
      <Card className="border-dashed">
        <CardContent className="pt-6 flex flex-col sm:flex-row items-center gap-4 justify-center">
          <label className="cursor-pointer">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} disabled={extraindo} />
            <div className={`flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm border-2 border-primary/20 hover:border-primary/50 transition-all ${extraindo ? "opacity-60" : ""}`}>
              {extraindo ? <Loader2 size={14} className="animate-spin" /> : null}
              {extraindo ? "Extraindo..." : "📷 Tirar foto da nota"}
            </div>
          </label>
          <Button variant="outline" onClick={handleManual} className="h-11 px-5 font-semibold">
            ✏️ Lançar manual
          </Button>
        </CardContent>
      </Card>

      {/* Resumo do mês */}
      {compras.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-medium text-muted-foreground">{compras.length} compras em {MESES[now.getMonth() + 1]}</span>
          <span className="text-sm font-semibold tabular-nums">Total: {fmt(totalMes)}</span>
        </div>
      )}

      {/* Lista de compras do mês */}
      {compras.map(c => (
        <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{c.supplier || "Sem fornecedor"}</span>
              {c.categoryName && <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{c.categoryName}</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {c.invoiceDate.split("-").reverse().join("/")}
              {c.invoiceNumber && ` · NF ${c.invoiceNumber}`}
              {c.notes && ` · ${c.notes}`}
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums ml-3">{fmt(c.totalValue)}</span>
        </div>
      ))}

      {compras.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhuma compra lançada neste mês.</p>
      )}

      {/* Link para Estoque */}
      <p className="text-center">
        <button onClick={() => navigate("/estoque")} className="text-xs text-muted-foreground hover:underline">
          Gestão completa (produtos, contagem, CMV) no Estoque →
        </button>
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function LancamentosPage() {
  const { storeId } = useStore();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const period = `${ano}-${pad2(mes)}`;

  function navMes(delta: number) {
    let nm = mes + delta; let na = ano;
    if (nm < 1) { nm = 12; na--; }
    if (nm > 12) { nm = 1; na++; }
    setMes(nm); setAno(na);
  }

  if (!storeId) return <div className="p-8 text-center text-muted-foreground">Selecione uma loja.</div>;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">Central de lançamentos da operação</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navMes(-1)}><ChevronLeft size={14} /></Button>
          <span className="text-sm font-medium min-w-[120px] text-center">{MESES[mes]} {ano}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navMes(1)}><ChevronRight size={14} /></Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="receita" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="receita">Receita (Caixa)</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
        </TabsList>
        <TabsContent value="receita" className="mt-4">
          <AbaReceita storeId={storeId} period={period} mes={mes} ano={ano} />
        </TabsContent>
        <TabsContent value="despesas" className="mt-4">
          <AbaDespesas storeId={storeId} period={period} mes={mes} ano={ano} />
        </TabsContent>
        <TabsContent value="compras" className="mt-4">
          <AbaCompras storeId={storeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
