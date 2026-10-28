/**
 * DreEditavel.tsx
 * Tabela de conferência editável do Orçamento (Task 9, Fase B) — o gerente
 * (leigo) confere a DRE linha a linha: o que o histórico diz, o que foi
 * proposto (determinístico + ajuste opcional da IA) e o valor final que ele
 * decide usar. Edição sempre controlada; campo sem base no histórico fica
 * em branco (placeholder "—") — NUNCA mostra 0 chutado.
 *
 * Fonte de verdade dos nomes de campo: `RascunhoOrcamento`
 * (server/orcamento-proposta.ts) — import type-only, sem puxar dependências
 * de servidor (xlsx) pro bundle do client.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { RascunhoOrcamento, DreCalculada } from "../../../../server/orcamento-proposta";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { AlertTriangle, Save, Loader2 } from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type CampoKey = Exclude<keyof RascunhoOrcamento, "emAtencao" | "rampaMeses">;
export type CamposNumericos = Record<CampoKey, number | null>;

export interface SugestaoIA {
  sugestoes: Record<string, number | null>;
  alavancasFracas: { campo: string; nota: string }[];
}

export interface CamposParaSalvar extends CamposNumericos {
  ticketMedio: number | null;
  diasOperacao: number;
  emAtencao: boolean;
  rampaMeses: number | null;
  /** Index signature — permite passar `CamposParaSalvar` direto pro
   * `campos: Record<string, number|string|boolean|null>` de `salvarRascunho`. */
  [key: string]: number | string | boolean | null;
}

interface DreEditavelProps {
  rascunho: RascunhoOrcamento;
  /** DRE calculada pela proposta inicial (informativa — a tela recalcula ao vivo). */
  dre: DreCalculada;
  sugestao?: SugestaoIA | null;
  onSalvar: (campos: CamposParaSalvar) => void;
  salvando?: boolean;
}

// ─── Grupos de linha da DRE ──────────────────────────────────────────────────

interface FieldDef { key: CampoKey; label: string; isPct: boolean }
interface FieldGroup { group: string; fields: FieldDef[] }

const FIELD_GROUPS: FieldGroup[] = [
  { group: "Receita", fields: [
    { key: "receitaBruta", label: "Receita Bruta", isPct: false },
  ]},
  { group: "CMV", fields: [
    { key: "cmvPct", label: "Custo de Mercadoria (CMV)", isPct: true },
  ]},
  { group: "Impostos", fields: [
    { key: "impostosPct", label: "Impostos sobre vendas", isPct: true },
  ]},
  { group: "Franquia / Royalties", fields: [
    { key: "royaltiesPct", label: "Royalties", isPct: true },
    { key: "fundoMarketingPct", label: "Fundo de marketing / promoção", isPct: true },
  ]},
  { group: "Folha", fields: [
    { key: "folha", label: "Folha (colaboradores)", isPct: false },
  ]},
  { group: "Ocupação", fields: [
    { key: "aluguel", label: "Aluguel", isPct: false },
    { key: "condominio", label: "Condomínio", isPct: false },
    { key: "energia", label: "Energia", isPct: false },
    { key: "gas", label: "Gás", isPct: false },
    { key: "agua", label: "Água", isPct: false },
    { key: "outrosOcupacao", label: "Outros (ocupação)", isPct: false },
  ]},
  { group: "Serviços de Terceiros", fields: [
    { key: "contabilidade", label: "Contabilidade", isPct: false },
    { key: "sistemas", label: "Sistemas", isPct: false },
    { key: "outrosServicos", label: "Outros serviços", isPct: false },
  ]},
  { group: "Despesas Financeiras", fields: [
    { key: "taxaCartaoPct", label: "Taxa cartão / maquininha", isPct: true },
    { key: "juros", label: "Juros", isPct: false },
    { key: "tarifasBancarias", label: "Tarifas bancárias", isPct: false },
  ]},
  { group: "Outras Despesas", fields: [
    { key: "marketing", label: "Marketing", isPct: false },
    { key: "outrasDespesas", label: "Outras despesas / terceiros eventuais", isPct: false },
  ]},
  { group: "Pró-labore", fields: [
    { key: "proLabore", label: "Pró-labore / distribuição", isPct: false },
  ]},
];

// ─── Helpers de formatação ───────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function fmtCell(v: number | null | undefined, isPct: boolean): string {
  if (v === null || v === undefined) return "—";
  return isPct ? `${(v * 100).toFixed(2)}%` : fmtBRL(v);
}

function extractCampos(r: RascunhoOrcamento): CamposNumericos {
  const { emAtencao: _ea, rampaMeses: _rm, ...rest } = r;
  return rest;
}

// ─── Cálculo client-side (espelha server/orcamento-proposta.ts:calcularDre) ──

function calcularDreCliente(campos: CamposNumericos, diasOperacao: number): DreCalculada {
  const camposCriticos: (number | null)[] = Object.values(campos);
  const parcial = camposCriticos.some((c) => c === null);

  const rb = campos.receitaBruta ?? 0;
  const receitaLiquida = rb;

  const cmvRs = rb * (campos.cmvPct ?? 0);
  const impostosRs = rb * (campos.impostosPct ?? 0);
  const royaltiesRs = rb * (campos.royaltiesPct ?? 0);
  const fundoMarketingRs = rb * (campos.fundoMarketingPct ?? 0);
  const taxaCartaoRs = rb * (campos.taxaCartaoPct ?? 0);

  const folhaRs = campos.folha ?? 0;
  const ocupacaoRs =
    (campos.aluguel ?? 0) + (campos.condominio ?? 0) + (campos.energia ?? 0) +
    (campos.gas ?? 0) + (campos.agua ?? 0) + (campos.outrosOcupacao ?? 0);
  const servicosRs = (campos.contabilidade ?? 0) + (campos.sistemas ?? 0) + (campos.outrosServicos ?? 0);
  const financeirasRs = (campos.juros ?? 0) + (campos.tarifasBancarias ?? 0) + taxaCartaoRs;
  const outrasRs = (campos.marketing ?? 0) + (campos.outrasDespesas ?? 0);

  const totalCustos = cmvRs + impostosRs + royaltiesRs + fundoMarketingRs +
    folhaRs + ocupacaoRs + servicosRs + financeirasRs + outrasRs;

  const ebitda = receitaLiquida - totalCustos;
  const ebitdaPct = rb > 0 ? ebitda / rb : 0;

  const pctVariaveis =
    (campos.cmvPct ?? 0) + (campos.impostosPct ?? 0) + (campos.royaltiesPct ?? 0) +
    (campos.fundoMarketingPct ?? 0) + (campos.taxaCartaoPct ?? 0);
  const custosFixos = folhaRs + ocupacaoRs + servicosRs + (campos.juros ?? 0) + (campos.tarifasBancarias ?? 0) + outrasRs;
  const pontoEquilibrio = pctVariaveis < 1 ? custosFixos / (1 - pctVariaveis) : 0;

  const metaDiaria = diasOperacao > 0 ? rb / diasOperacao : 0;

  return { receitaLiquida, cmvRs, ebitda, ebitdaPct, pontoEquilibrio, metaDiaria, parcial };
}

// ─── KPI card (resumo vivo) ──────────────────────────────────────────────────

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" | "amber" }) {
  const color = tone === "green" ? "var(--green)" : tone === "red" ? "var(--red)" : tone === "amber" ? "var(--amber)" : "var(--ink)";
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color, fontSize: 24 }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ─── Campo de edição (texto livre, formata ao perder o foco) ─────────────────

function CampoInput({
  value, isPct, highlight, onChange,
}: { value: number | null; isPct: boolean; highlight?: boolean; onChange: (v: number | null) => void }) {
  const formatLocal = (v: number | null) => (v === null ? "" : isPct ? (v * 100).toFixed(2) : String(Math.round(v)));
  const [local, setLocal] = useState(() => formatLocal(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(formatLocal(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isPct, focused]);

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={local}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          setLocal(raw);
          if (raw.trim() === "") { onChange(null); return; }
          const num = parseFloat(raw.replace(",", "."));
          if (!isNaN(num)) onChange(isPct ? num / 100 : num);
        }}
        onBlur={() => { setFocused(false); setLocal(formatLocal(value)); }}
        className={`h-8 text-sm text-right font-mono ${isPct ? "pr-6" : ""} ${highlight ? "border-amber-400 bg-amber-50/60" : ""}`}
      />
      {isPct && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function DreEditavel({ rascunho, dre: _dreInicial, sugestao, onSalvar, salvando }: DreEditavelProps) {
  const [campos, setCampos] = useState<CamposNumericos>(() => extractCampos(rascunho));
  const [diasOperacao, setDiasOperacao] = useState(26);
  const [ticketMedio, setTicketMedio] = useState<number | null>(null);
  const touchedRef = useRef<Set<string>>(new Set());

  // Aplica a sugestão da IA SOMENTE nos campos que o gerente ainda não editou.
  useEffect(() => {
    if (!sugestao) return;
    setCampos((prev) => {
      const next = { ...prev };
      for (const [campo, sug] of Object.entries(sugestao.sugestoes)) {
        if (touchedRef.current.has(campo)) continue;
        if (sug !== null && campo in next) (next as any)[campo] = sug;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestao]);

  const proposto: CamposNumericos = useMemo(() => {
    const base = extractCampos(rascunho);
    if (sugestao) {
      for (const [campo, sug] of Object.entries(sugestao.sugestoes)) {
        if (sug !== null && campo in base) (base as any)[campo] = sug;
      }
    }
    return base;
  }, [rascunho, sugestao]);

  const alavancas = useMemo(
    () => Object.fromEntries((sugestao?.alavancasFracas ?? []).map((a) => [a.campo, a.nota])),
    [sugestao]
  );

  const resumo = useMemo(() => calcularDreCliente(campos, diasOperacao), [campos, diasOperacao]);
  const metaAtend = ticketMedio && ticketMedio > 0 ? Math.ceil(resumo.metaDiaria / ticketMedio) : null;

  function handleChange(campo: CampoKey, valor: number | null) {
    touchedRef.current.add(campo);
    setCampos((prev) => ({ ...prev, [campo]: valor }));
  }

  function handleSalvarClick() {
    onSalvar({
      ...campos,
      ticketMedio,
      diasOperacao,
      emAtencao: rascunho.emAtencao,
      rampaMeses: rascunho.rampaMeses,
    });
  }

  return (
    <div className="space-y-4">
      {/* Parâmetros do mês */}
      <div className="section-card">
        <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--ink)" }}>Parâmetros do mês</h3>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <Label className="text-xs">Dias de operação</Label>
            <Input
              type="number" min={1} max={31} value={diasOperacao}
              onChange={(e) => setDiasOperacao(parseInt(e.target.value, 10) || 26)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Ticket médio (opcional)</Label>
            <Input
              type="text" inputMode="decimal" placeholder="—"
              defaultValue={ticketMedio ?? ""}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                setTicketMedio(raw === "" ? null : (parseFloat(raw.replace(",", ".")) || null));
              }}
              className="h-8 text-sm text-right font-mono"
            />
          </div>
        </div>
      </div>

      {/* Resumo vivo */}
      <div className="kpi-board">
        <KpiCard
          label="EBITDA do mês"
          value={fmtBRL(resumo.ebitda)}
          sub={fmtPct(resumo.ebitdaPct)}
          tone={resumo.ebitda >= 0 ? "green" : "red"}
        />
        <KpiCard label="Ponto de equilíbrio" value={fmtBRL(resumo.pontoEquilibrio)} />
        <KpiCard
          label="Meta diária"
          value={fmtBRL(resumo.metaDiaria)}
          sub={metaAtend ? `~${metaAtend} atendimentos/dia` : undefined}
        />
        <KpiCard
          label="Status da estimativa"
          value={resumo.parcial ? "Parcial" : "Completa"}
          tone={resumo.parcial ? "amber" : "green"}
          sub={resumo.parcial ? "Há campos sem base no histórico" : "Todos os campos preenchidos"}
        />
      </div>

      {/* Tabela DRE */}
      <div className="section-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linha</TableHead>
              <TableHead className="text-right">Histórico (média lida)</TableHead>
              <TableHead className="text-right">Proposto</TableHead>
              <TableHead className="text-right w-40">Seu valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FIELD_GROUPS.map((grp) => (
              <Fragment key={grp.group}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={4} className="text-[11px] font-semibold uppercase tracking-wide py-2" style={{ color: "var(--stone)" }}>
                    {grp.group}
                  </TableCell>
                </TableRow>
                {grp.fields.map((f) => {
                  const nota = alavancas[f.key];
                  return (
                    <Fragment key={f.key}>
                      <TableRow>
                        <TableCell className="text-sm">
                          <span>{f.label}</span>
                          {nota && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                              Alavanca fraca
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono text-muted-foreground">
                          {fmtCell(rascunho[f.key], f.isPct)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {fmtCell(proposto[f.key], f.isPct)}
                        </TableCell>
                        <TableCell>
                          <CampoInput
                            value={campos[f.key]}
                            isPct={f.isPct}
                            highlight={!!nota}
                            onChange={(v) => handleChange(f.key, v)}
                          />
                        </TableCell>
                      </TableRow>
                      {nota && (
                        <TableRow className="bg-amber-50/50 hover:bg-amber-50/50">
                          <TableCell colSpan={4} className="py-1.5 text-xs text-amber-700">
                            <span className="flex items-start gap-1.5">
                              <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                              {nota}
                            </span>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSalvarClick} disabled={!!salvando}>
          {salvando ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
          Salvar rascunho
        </Button>
      </div>
    </div>
  );
}
