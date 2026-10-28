/**
 * OrcamentoPage.tsx
 * Tela de conferência editável do Orçamento (Task 9, Fase B) — REESCRITA.
 *
 * Fluxo: o gerente seleciona o mês do orçamento → sobe a DRE histórica →
 * `proporDaDre` lê a planilha e devolve um rascunho determinístico (NUNCA
 * grava) → o gerente confere/edita linha a linha em `DreEditavel` → pode
 * pedir uma sugestão da IA (aditiva, nunca sobrescreve o que ele já editou)
 * → salva o rascunho (`salvarRascunho`) → admin/supervisor aprova
 * (`aprovarRascunho`), o que gera as metas diárias automaticamente.
 *
 * O fluxo legado da Fase A (orçamento manual linha-a-linha + assistente de
 * IA "simularPorMeta"/OrcamentoAssistidoPage) foi aposentado nesta tarefa —
 * ver report da Task 9.
 */
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useStore } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, Sparkles, Loader2, CheckCircle2, AlertTriangle,
  FileSpreadsheet, ThumbsUp, XCircle, Target,
} from "lucide-react";
import DreEditavel, { type SugestaoIA, type CamposParaSalvar } from "@/components/orcamento/DreEditavel";
import type { RascunhoOrcamento, DreCalculada } from "../../../server/orcamento-proposta";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function pad2(n: number) { return String(n).padStart(2, "0"); }

/** Soma `rampaMeses` à data `periodoInicio` (YYYY-MM-DD), pura, em UTC.
 * Espelha `calcularPrazoDecisao` (server/orcamento-proposta.ts) sem importar
 * código de servidor (que arrasta `xlsx`) no bundle do client. */
function calcularPrazo(periodoInicio: string, rampaMeses: number): string {
  const [anoStr, mesStr, diaStr] = periodoInicio.split("-");
  const d = new Date(Date.UTC(Number(anoStr), Number(mesStr) - 1 + rampaMeses, Number(diaStr)));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const CT_MAP: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ─── Página ──────────────────────────────────────────────────────────────────

export default function OrcamentoPage() {
  const { user } = useAuth();
  const { storeId: storeIdRaw, stores } = useStore();
  const storeId = storeIdRaw ?? 0;
  const podeAprovar = user?.role === "admin" || user?.role === "supervisor";
  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";

  const now = new Date();
  const proximoMes = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
  const anoDoProximoMes = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear();
  const [mes, setMes] = useState(proximoMes);
  const [ano, setAno] = useState(anoDoProximoMes);
  const periodoInicio = `${ano}-${pad2(mes)}-01`;

  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rascunho, setRascunho] = useState<RascunhoOrcamento | null>(null);
  const [dreInicial, setDreInicial] = useState<DreCalculada | null>(null);
  const [sugestao, setSugestao] = useState<SugestaoIA | null>(null);
  const [orcamentoId, setOrcamentoId] = useState<number | null>(null);
  const [aprovado, setAprovado] = useState(false);

  function resetRascunho() {
    setRascunho(null);
    setDreInicial(null);
    setSugestao(null);
    setOrcamentoId(null);
    setAprovado(false);
    setFileName(null);
  }

  function handleChangePeriodo(novoMes: number, novoAno: number) {
    setMes(novoMes);
    setAno(novoAno);
    resetRascunho();
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  const getUploadUrlMut = trpc.orcamento.getUploadUrl.useMutation();

  const proporMut = trpc.orcamento.proporDaDre.useMutation({
    onSuccess: (data) => {
      setRascunho(data.rascunho);
      setDreInicial(data.dre);
      setSugestao(null);
      setOrcamentoId(null);
      setAprovado(false);
      toast.success("Proposta gerada a partir da DRE. Confira os valores abaixo.");
    },
    onError: (e) => toast.error("Erro ao ler a DRE: " + e.message),
  });

  const sugestaoMut = trpc.orcamento.sugestaoIA.useMutation({
    onSuccess: (data) => {
      setSugestao(data);
      toast.success("Sugestão da IA aplicada nos campos ainda não editados.");
    },
    onError: () => toast.error("Não foi possível gerar a sugestão da IA agora."),
  });

  const salvarMut = trpc.orcamento.salvarRascunho.useMutation({
    onSuccess: (data) => {
      setOrcamentoId(data.id);
      toast.success("Rascunho salvo.");
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  const aprovarMut = trpc.orcamento.aprovarRascunho.useMutation({
    onSuccess: () => {
      setAprovado(true);
      toast.success("Orçamento aprovado! As metas diárias foram geradas.");
    },
    onError: (e) => toast.error("Erro ao aprovar: " + e.message),
  });

  const decisaoMut = trpc.orcamento.registrarDecisao.useMutation({
    onSuccess: (_data, vars) => {
      toast.success(vars.decisao === "seguir" ? "Decisão registrada: seguir mais um ciclo." : "Decisão registrada: encerrar.");
    },
    onError: (e) => toast.error("Erro ao registrar decisão: " + e.message),
  });

  const metasDiariasQ = trpc.orcamento.getMetasDiarias.useQuery(
    { storeId, anoMes: `${ano}-${pad2(mes)}` },
    { enabled: storeId > 0 && aprovado }
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!storeId) { toast.error("Selecione uma loja antes de subir a DRE."); return; }

    setFileName(file.name);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const contentType = CT_MAP[ext] ?? "application/octet-stream";
      const { uploadUrl, storageKey } = await getUploadUrlMut.mutateAsync({ fileName: file.name, contentType });
      const resp = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!resp.ok) throw new Error(`Upload falhou (${resp.status})`);
      setUploading(false);
      proporMut.mutate({ storeId, storageKey, fileName: file.name });
    } catch (err) {
      setUploading(false);
      setFileName(null);
      toast.error("Erro no upload: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSugestaoIA() {
    if (!rascunho) return;
    sugestaoMut.mutate({ storeId, historico: [], rascunho });
  }

  function handleSalvar(campos: CamposParaSalvar) {
    if (!storeId) { toast.error("Selecione uma loja."); return; }
    salvarMut.mutate({ storeId, periodoInicio, campos });
  }

  function handleAprovar() {
    if (!orcamentoId) { toast.error("Salve o rascunho antes de aprovar."); return; }
    aprovarMut.mutate({ orcamentoId });
  }

  function handleDecisao(decisao: "seguir" | "encerrar") {
    if (!orcamentoId) { toast.error("Salve o rascunho antes de registrar a decisão."); return; }
    if (decisao === "encerrar" && !window.confirm("Confirma a decisão de ENCERRAR esta loja? Essa é uma decisão séria.")) return;
    decisaoMut.mutate({ orcamentoId, decisao });
  }

  const carregandoProposta = proporMut.isPending || uploading;
  const prazoDecisao = rascunho?.emAtencao && rascunho.rampaMeses ? calcularPrazo(periodoInicio, rascunho.rampaMeses) : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Header 4DX */}
      <div>
        <div className="eyebrow mb-1" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--stone)" }}>1. Planejar</div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--ink)" }}>
          Orçamento<span style={{ color: "var(--vinho)" }}>.</span>
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--stone)" }}>
          Suba a DRE do mês de referência, confira linha a linha e aprove — é daqui que nasce a Meta do Mês.
        </p>
      </div>

      {/* Loja + Período */}
      <div className="section-card">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--stone)" }}>Loja</div>
            <div className="h-9 flex items-center px-3 rounded-md border text-sm font-medium" style={{ borderColor: "var(--gray-line)", background: "var(--bege)", color: "var(--ink)" }}>
              {storeName || "Selecione no menu lateral"}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--stone)" }}>Mês do orçamento</div>
            <select
              value={mes}
              onChange={(e) => handleChangePeriodo(Number(e.target.value), ano)}
              className="h-9 text-sm border rounded-md px-2 bg-background"
              style={{ borderColor: "var(--gray-line)" }}
            >
              {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--stone)" }}>Ano</div>
            <input
              type="number"
              value={ano}
              onChange={(e) => handleChangePeriodo(mes, Number(e.target.value) || ano)}
              className="h-9 w-24 text-sm border rounded-md px-2 bg-background"
              style={{ borderColor: "var(--gray-line)" }}
            />
          </div>
        </div>
      </div>

      {/* Upload da DRE */}
      <div className="section-card">
        <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--ink)" }}>DRE histórica</h3>
        <p className="text-xs mb-3" style={{ color: "var(--stone)" }}>
          Suba a DRE da loja (Excel ou CSV) — a tela lê os últimos meses e já propõe os valores do orçamento.
        </p>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xlsb,.xls,.csv" className="hidden" onChange={handleFileChange} />
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!storeId || carregandoProposta}
          >
            {carregandoProposta ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Upload size={14} className="mr-2" />}
            {uploading ? "Enviando arquivo..." : proporMut.isPending ? "Lendo a DRE..." : rascunho ? "Trocar DRE" : "Escolher arquivo"}
          </Button>
          {fileName && !carregandoProposta && (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--green)" }}>
              <FileSpreadsheet size={14} /> {fileName}
            </span>
          )}
        </div>
      </div>

      {/* Loja em atenção */}
      {rascunho?.emAtencao && (
        <div className="banner-alert banner-amber items-start flex-wrap">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Loja em atenção</div>
            <div>
              O resultado operacional médio do histórico é negativo. Rampa de recuperação: {rascunho.rampaMeses} mês(es)
              {prazoDecisao && <> — prazo para decisão: <strong>{prazoDecisao}</strong></>}.
            </div>
          </div>
          {podeAprovar && (
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => handleDecisao("seguir")} disabled={decisaoMut.isPending || !orcamentoId}>
                <ThumbsUp size={13} className="mr-1.5" /> Seguir
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDecisao("encerrar")} disabled={decisaoMut.isPending || !orcamentoId}>
                <XCircle size={13} className="mr-1.5" /> Encerrar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Sugestão da IA */}
      {rascunho && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleSugestaoIA} disabled={sugestaoMut.isPending}>
            {sugestaoMut.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
            Sugestão da IA
          </Button>
        </div>
      )}

      {/* Tabela editável */}
      {rascunho && dreInicial && (
        <DreEditavel
          rascunho={rascunho}
          dre={dreInicial}
          sugestao={sugestao}
          onSalvar={handleSalvar}
          salvando={salvarMut.isPending}
        />
      )}

      {/* Aprovação */}
      {rascunho && (
        <div className="section-card flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {orcamentoId ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                <CheckCircle2 size={11} className="mr-1" /> Rascunho salvo (#{orcamentoId})
              </Badge>
            ) : (
              <span className="text-xs" style={{ color: "var(--stone)" }}>Salve o rascunho para poder aprovar.</span>
            )}
            {aprovado && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                <CheckCircle2 size={11} className="mr-1" /> Aprovado
              </Badge>
            )}
          </div>
          {podeAprovar && (
            <Button onClick={handleAprovar} disabled={!orcamentoId || aprovarMut.isPending || aprovado}>
              {aprovarMut.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <CheckCircle2 size={14} className="mr-2" />}
              Aprovar orçamento
            </Button>
          )}
        </div>
      )}

      {/* Metas diárias geradas */}
      {aprovado && metasDiariasQ.data && metasDiariasQ.data.length > 0 && (
        <div className="section-card">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
            <Target size={14} /> Metas diárias do mês
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
            {metasDiariasQ.data.map((m) => (
              <div key={m.id} className="rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: "var(--gray-line)" }}>
                <div style={{ color: "var(--stone)" }}>{m.data.slice(8, 10)}/{m.data.slice(5, 7)}</div>
                <div className="font-mono font-medium" style={{ color: "var(--ink)" }}>{m.metaReceita != null ? fmtBRL(m.metaReceita) : "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
