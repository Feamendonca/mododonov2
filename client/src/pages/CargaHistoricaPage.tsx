import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useStore } from "@/components/AppLayout";

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtPct = (num: number | null | undefined, den: number | null | undefined) => {
  if (num == null || den == null || den === 0) return "—";
  return ((num / den) * 100).toFixed(1) + "%";
};

export default function CargaHistoricaPage() {
  const { storeId } = useStore();
  const utils = trpc.useUtils();

  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{
    meses: Array<{
      anoMes: string; faturamento: number | null; cmv: number | null; folha: number | null;
      custosFixos: number | null; custosVariaveis: number | null; impostos: number | null; ebitda: number | null;
    }>;
    abaSelecionada: string; ignorados: number; aviso?: string;
  } | null>(null);
  const [resultado, setResultado] = useState<{ importados: number; ignorados: number; mesesImportados: string[]; resumo: string } | null>(null);
  const [anoMesBench, setAnoMesBench] = useState(() => new Date().toISOString().slice(0, 7));
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: stores } = trpc.admin.listStores.useQuery();
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const lojaId = selectedStoreId ?? storeId;

  const previaMut = trpc.adminHistorico.previa.useMutation({
    onSuccess: (data) => { setPrevia(data); setResultado(null); },
    onError: (e) => toast.error("Erro ao analisar: " + e.message),
  });
  const importarMut = trpc.adminHistorico.importar.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setPrevia(null);
      toast.success(data.resumo);
      void utils.adminHistorico.listarHistorico.invalidate();
    },
    onError: (e) => toast.error("Erro ao importar: " + e.message),
  });
  const benchmarksMut = trpc.adminHistorico.gerarBenchmarks.useMutation({
    onSuccess: (data) => toast.success(`Benchmarks: ${data.gravados} gravados, ${data.ignorados} ignorados.`),
    onError: (e) => toast.error("Erro ao gerar benchmarks: " + e.message),
  });
  const { data: historico } = trpc.adminHistorico.listarHistorico.useQuery(
    { storeId: lojaId! },
    { enabled: !!lojaId }
  );

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPrevia(null);
    setResultado(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      setFileBase64(base64);
    };
    reader.readAsDataURL(f);
  }

  function handleAnalisar() {
    if (!lojaId) { toast.error("Selecione uma loja."); return; }
    if (!fileBase64 || !file) { toast.error("Selecione um arquivo."); return; }
    previaMut.mutate({ storeId: lojaId, fileBase64, fileName: file.name });
  }

  function handleImportar() {
    if (!lojaId || !fileBase64 || !file) return;
    importarMut.mutate({ storeId: lojaId, fileBase64, fileName: file.name });
  }

  const storeName = stores?.find(s => s.id === lojaId)?.name ?? "—";

  return (
    <div style={{ padding: "24px 32px", maxWidth: 960, fontFamily: "var(--font-body)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        Carga Histórica de DRE
      </h1>
      <p style={{ color: "var(--stone)", fontSize: 13, marginBottom: 24 }}>
        Importe planilhas de DRE (XLSB/XLSX/CSV) para popular o histórico de cada loja.
        Os dados ficam restritos à loja — nunca cruzam com outras lojas diretamente.
      </p>

      {/* Seleção de loja */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Loja</label>
          <select
            value={selectedStoreId ?? lojaId ?? ""}
            onChange={e => setSelectedStoreId(Number(e.target.value))}
            style={{ height: 36, borderRadius: 8, border: "1px solid var(--border)", padding: "0 12px", fontSize: 13, background: "var(--silk)", color: "var(--ink)", minWidth: 200 }}
          >
            {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Planilha DRE (.xlsx/.xlsb/.csv)</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsb,.xlsm,.xls,.csv"
            onChange={handleFile}
            style={{ fontSize: 13 }}
          />
        </div>
        <button
          onClick={handleAnalisar}
          disabled={!fileBase64 || previaMut.isPending}
          style={{ height: 36, padding: "0 16px", borderRadius: 8, background: "var(--vinho)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (!fileBase64 || previaMut.isPending) ? 0.5 : 1 }}
        >
          {previaMut.isPending ? "Analisando..." : "Analisar planilha"}
        </button>
      </div>

      {/* Prévia */}
      {previa && (
        <div style={{ background: "var(--silk)", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Prévia — {previa.meses.length} meses encontrados</span>
              <span style={{ fontSize: 12, color: "var(--stone)", marginLeft: 8 }}>aba: "{previa.abaSelecionada}" · {previa.ignorados} meses zerados ignorados</span>
            </div>
            <button
              onClick={handleImportar}
              disabled={importarMut.isPending || previa.meses.length === 0}
              style={{ height: 36, padding: "0 20px", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: (importarMut.isPending || previa.meses.length === 0) ? 0.5 : 1 }}
            >
              {importarMut.isPending ? "Importando..." : `✅ Confirmar importação (${previa.meses.length} meses)`}
            </button>
          </div>
          {previa.aviso && <p style={{ color: "#b45309", fontSize: 12, marginBottom: 8 }}>⚠ {previa.aviso}</p>}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--border)" }}>
                  {["Mês", "Faturamento", "CMV", "CMV%", "Folha", "Folha%", "Custos Fixos", "Impostos", "EBITDA", "EBITDA%"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.meses.map(m => (
                  <tr key={m.anoMes} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "5px 10px", fontWeight: 600 }}>{m.anoMes}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtBRL(m.faturamento)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtBRL(m.cmv)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtPct(m.cmv, m.faturamento)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtBRL(m.folha)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtPct(m.folha, m.faturamento)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtBRL(m.custosFixos)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtBRL(m.impostos)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: (m.ebitda ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(m.ebitda)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: (m.ebitda ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtPct(m.ebitda, m.faturamento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <p style={{ fontWeight: 700, color: "#15803d", marginBottom: 4 }}>✅ {resultado.resumo}</p>
          <p style={{ fontSize: 12, color: "#166534" }}>Meses importados: {resultado.mesesImportados.join(", ")}</p>
        </div>
      )}

      {/* Histórico salvo */}
      {historico && historico.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
            Histórico salvo — {storeName}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--border)" }}>
                  {["Mês", "Faturamento", "CMV%", "Folha%", "EBITDA%", "Fonte"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historico.map(m => (
                  <tr key={m.anoMes} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "5px 10px", fontWeight: 600 }}>{m.anoMes}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtBRL(m.faturamento)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtPct(m.cmv, m.faturamento)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtPct(m.folha, m.faturamento)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: (m.ebitda ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtPct(m.ebitda, m.faturamento)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: "var(--stone)" }}>{m.fonte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Job de benchmarks */}
      <div style={{ background: "var(--silk)", borderRadius: 12, padding: 20, border: "1px solid var(--border)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Gerar Benchmarks da Rede
        </h2>
        <p style={{ fontSize: 12, color: "var(--stone)", marginBottom: 12 }}>
          Calcula P25/mediana/P75 de CMV%, Folha%, EBITDA% e Custos Fixos% para o mês selecionado.
          Só grava se n ≥ 5 lojas no grupo (segmento ou rede).
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            type="month"
            value={anoMesBench}
            onChange={e => setAnoMesBench(e.target.value)}
            style={{ height: 36, borderRadius: 8, border: "1px solid var(--border)", padding: "0 12px", fontSize: 13, background: "var(--silk)", color: "var(--ink)" }}
          />
          <button
            onClick={() => benchmarksMut.mutate({ anoMes: anoMesBench })}
            disabled={benchmarksMut.isPending}
            style={{ height: 36, padding: "0 16px", borderRadius: 8, background: "var(--vinho)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: benchmarksMut.isPending ? 0.5 : 1 }}
          >
            {benchmarksMut.isPending ? "Gerando..." : "Gerar benchmarks"}
          </button>
        </div>
        {benchmarksMut.data && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--stone)" }}>
            {benchmarksMut.data.relatorio.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
