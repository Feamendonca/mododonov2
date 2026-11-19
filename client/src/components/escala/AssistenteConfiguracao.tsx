/**
 * AssistenteConfiguracao.tsx — Assistente de configuração da escala (Task 6)
 *
 * Amarra os 4 passos que o gerente preenche SOZINHO, pelo app, sem depender
 * de admin — requisito central do dono do produto (o acesso é pelo app
 * para criar hábito de uso): **1.** horário de funcionamento · **2.**
 * blocos de turno · **3.** funções da loja · **4.** regras legais
 * vigentes.
 *
 * Componente FINO (ruling R19 do controlador, mesma régua da Task 5):
 * toda decisão de "completo/incompleto e por quê" vive em
 * `client/src/lib/escala-assistente.ts` (funções puras, testadas em
 * `environment: "node"` — sem jsdom/@testing-library/react neste repo).
 * Este arquivo só renderiza e chama essas funções. Sem teste próprio.
 *
 * REUSO, não recriação (brief da Task 6):
 * - Passo 2 embute `ConfigurarTurnos` (extraído de `PessoasPage.tsx` para
 *   `client/src/components/pessoas/ConfigurarTurnos.tsx` justamente para
 *   evitar duplicar o CRUD de blocos de turno e evitar import circular
 *   entre esta página e `PessoasPage.tsx`).
 * - Passo 3 embute `ConfiguracaoFuncoes` (Task 5) sem container novo — ele
 *   já foi entregue sem card/título próprio (ruling R1 da Task 5)
 *   exatamente para encaixar aqui.
 *
 * Passo 4 (regras): lista as regras legais vigentes (`escala.getRegrasVigentes`)
 * como SOMENTE-LEITURA — o gerente nunca edita o valor legal — e pede
 * confirmação explícita nas de tipo `DEPENDE_CCT`.
 *
 * 🔴 R24 (revisão da Task 6) — "confirmar" chama `escala.confirmarRegraLoja`,
 * NÃO `escala.salvarRegraLoja`. A primeira versão confirmava salvando uma
 * cópia da regra em escopo LOJA — por precedência (Task 2: loja > uf >
 * rede), essa cópia venceria PARA SEMPRE, inclusive depois que a regra de
 * rede mudasse (a EC 141/2026 tem duas viradas programadas: 16/12/2026 e
 * 16/12/2027). `confirmarRegraLoja` só grava "o gerente confirmou esta
 * chave" numa tabela separada (`confirmacoes_regra_loja`) que
 * `resolverRegras` nunca lê — o valor exibido continua vindo, sempre, da
 * resolução atual (`regrasQuery.data.regras`). Pendência vem de
 * `chavesConfirmadas` (devolvido junto de `getRegrasVigentes`), não mais
 * do `escopo` da regra resolvida.
 *
 * 🔴 R23 (revisão da Task 6) — o passo 1 só é completo quando
 * `pessoas.getConfig` devolve `configurado: true` (existe linha em
 * `store_people_config`). Os defaults do servidor (8h–23h) são valores
 * numericamente válidos mas NÃO significam que o gerente configurou nada
 * — sem este sinal, o passo apareceria "Completo" numa loja virgem.
 *
 * O aviso de UF ausente (`avisoUfAusente`) é mostrado SEMPRE que presente,
 * independente do passo estar completo — engolir esse aviso seria repetir
 * o pior defeito deste plano (R13).
 *
 * "Gerar escala" (Plano 3, ainda não existe): fica como um indicador
 * desabilitado, nunca clicável, com a razão agregada sempre visível —
 * decisão documentada no relatório da Task 6. Nenhuma versão deste botão
 * finge que a geração está disponível.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { ConfiguracaoFuncoes } from "@/components/escala/ConfiguracaoFuncoes";
import { ConfigurarTurnos } from "@/components/pessoas/ConfigurarTurnos";
import {
  avaliarPassos,
  escalasDisponiveis,
  podeGerarEscala,
  regrasPendentesDeConfirmacao,
  validarHorarioFuncionamento,
  type AvaliacaoPasso,
  type EstadoAssistente,
  type RegraResolvidaLike,
  type TipoRegra,
} from "@/lib/escala-assistente";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const TIPO_REGRA_LABEL: Record<TipoRegra, string> = {
  DURA: "Regra fixa (lei)",
  MOLE: "Política interna",
  DEPENDE_CCT: "Depende da convenção coletiva",
};

const TIPO_REGRA_BADGE: Record<TipoRegra, "default" | "secondary" | "outline"> = {
  DURA: "default",
  MOLE: "secondary",
  DEPENDE_CCT: "outline",
};

function formatarValorRegra(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

/** Badge + título de um passo — espelha exatamente `completo`/`titulo` de
 * `AvaliacaoPasso` (nunca decide nada sozinho: só exibe o que a função pura
 * já decidiu). */
function CabecalhoPasso({ numero, avaliacao }: { numero: number; avaliacao: AvaliacaoPasso }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 ${
          avaliacao.completo ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {numero}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{avaliacao.titulo}</h3>
          {avaliacao.completo ? (
            <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Completo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
              <AlertTriangle className="w-3 h-3 mr-1" /> Pendente
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{avaliacao.razao}</p>
        {avaliacao.avisoExtra && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{avaliacao.avisoExtra}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AssistenteConfiguracao({ storeId }: { storeId: number }) {
  const utils = trpc.useUtils();
  const hoje = hojeIso();

  // ── Passo 1: horário de funcionamento ───────────────────────────────────
  const horarioQuery = trpc.pessoas.getConfig.useQuery({ storeId }, { enabled: storeId > 0 });
  const [startHour, setStartHour] = useState("8");
  const [endHour, setEndHour] = useState("23");
  const [horarioInicializado, setHorarioInicializado] = useState(false);

  useEffect(() => {
    if (horarioQuery.data && !horarioInicializado) {
      setStartHour(String(horarioQuery.data.operationStartHour));
      setEndHour(String(horarioQuery.data.operationEndHour));
      setHorarioInicializado(true);
    }
  }, [horarioQuery.data, horarioInicializado]);

  const salvarHorarioMut = trpc.pessoas.saveConfig.useMutation({
    onSuccess: () => {
      utils.pessoas.getConfig.invalidate({ storeId });
      toast.success("Horário de funcionamento salvo!");
    },
    onError: (e) => toast.error("Não foi possível salvar o horário de funcionamento: " + e.message),
  });

  function salvarHorario() {
    const s = Number(startHour);
    const e = Number(endHour);
    // I1 (revisão da Task 6): a validação — inclusive a checagem cruzada
    // "fechamento depois da abertura" — vive em `escala-assistente.ts`
    // (testada), espelhando o `.refine()` do servidor. Este componente só
    // chama a função pura e mostra os erros que ela encontrar.
    const erros = validarHorarioFuncionamento({ operationStartHour: s, operationEndHour: e });
    if (erros.length > 0) {
      erros.forEach((erro) => toast.error(erro));
      return;
    }
    salvarHorarioMut.mutate({ storeId, operationStartHour: s, operationEndHour: e });
  }

  // ── Passo 2: blocos de turno (reusa o CRUD existente) ───────────────────
  const blocosQuery = trpc.pessoas.getShiftBlocks.useQuery({ storeId }, { enabled: storeId > 0 });

  // ── Passo 3: funções da loja (embute a Task 5) ──────────────────────────
  const funcoesQuery = trpc.escala.getConfig.useQuery({ storeId }, { enabled: storeId > 0 });

  // ── Passo 4: regras legais vigentes ──────────────────────────────────────
  const regrasQuery = trpc.escala.getRegrasVigentes.useQuery({ storeId, data: hoje }, { enabled: storeId > 0 });

  // Informativo (não é um dos 4 passos): quais regimes do catálogo legal
  // (5x2, 6x1, 4x3...) estão vigentes hoje. `escala.getCatalogo` já filtra
  // por vigência no servidor — rodar `escalasDisponiveis` por cima é defesa
  // em profundidade (mesmo princípio de "nunca confiar em silêncio" do
  // resto do plano): se algum dia vier um item fora de vigência por algum
  // caminho inesperado, ele aparece aqui como indisponível, com a razão,
  // em vez de ser listado como se estivesse tudo bem.
  const catalogoQuery = trpc.escala.getCatalogo.useQuery({ storeId, data: hoje }, { enabled: storeId > 0 });
  const regimesHoje = catalogoQuery.data ? escalasDisponiveis(catalogoQuery.data, hoje) : [];
  const regimesIndisponiveis = regimesHoje.filter((r) => !r.disponivel);

  // R24: confirmar chama `confirmarRegraLoja` (tabela separada
  // `confirmacoes_regra_loja`, nunca lida por `resolverRegras`) — NÃO
  // `salvarRegraLoja`. Nenhum valor/tipo/vigência passa por aqui.
  const confirmarRegraMut = trpc.escala.confirmarRegraLoja.useMutation({
    onSuccess: () => {
      utils.escala.getRegrasVigentes.invalidate({ storeId, data: hoje });
      toast.success("Regra confirmada para esta loja.");
    },
    onError: (e) => toast.error("Não foi possível confirmar a regra: " + e.message),
  });

  function confirmarRegra(regra: RegraResolvidaLike) {
    confirmarRegraMut.mutate({ storeId, chave: regra.chave });
  }

  // ── Avaliação dos 4 passos (lógica pura, testada em escala-assistente.test.ts) ──
  const estado: EstadoAssistente = {
    horario: {
      isLoading: horarioQuery.isLoading,
      data: horarioQuery.data
        ? {
            operationStartHour: horarioQuery.data.operationStartHour,
            operationEndHour: horarioQuery.data.operationEndHour,
            // R23: só existe linha de verdade quando `configurado` vem
            // true — nunca inferir isso a partir dos valores numéricos.
            configurado: horarioQuery.data.configurado,
          }
        : undefined,
    },
    blocos: { isLoading: blocosQuery.isLoading, data: blocosQuery.data },
    funcoes: { isLoading: funcoesQuery.isLoading, data: funcoesQuery.data },
    regras: { isLoading: regrasQuery.isLoading, data: regrasQuery.data },
  };

  const passos = avaliarPassos(estado);
  const liberaGeracao = podeGerarEscala(passos);
  const pendentes = regrasQuery.data
    ? regrasPendentesDeConfirmacao(regrasQuery.data.regras, regrasQuery.data.chavesConfirmadas)
    : [];
  const concluidos = passos.filter((p) => p.completo).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-display">Assistente de configuração</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure a sua loja em 4 passos, direto pelo app — sem precisar de admin. {concluidos} de {passos.length} passos completos.
        </p>
      </div>

      {/* Passo 1 — Horário de funcionamento */}
      <section className="bg-card border border-border rounded-xl p-4 space-y-3">
        <CabecalhoPasso numero={1} avaliacao={passos[0]} />
        {horarioQuery.isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...</p>
        ) : (
          <div className="flex items-end gap-3 pl-10">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Hora de abertura</label>
              <Input type="number" min={0} max={23} className="w-24" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Hora de fechamento</label>
              <Input type="number" min={1} max={24} className="w-24" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
            </div>
            <Button size="sm" onClick={salvarHorario} disabled={salvarHorarioMut.isPending}>
              {salvarHorarioMut.isPending ? "Salvando..." : "Salvar horário"}
            </Button>
          </div>
        )}
      </section>

      {/* Passo 2 — Blocos de turno (reusa o CRUD existente) */}
      <section className="bg-card border border-border rounded-xl p-4 space-y-3">
        <CabecalhoPasso numero={2} avaliacao={passos[1]} />
        <div className="pl-10">
          <ConfigurarTurnos storeId={storeId} onClose={() => {}} />
        </div>
      </section>

      {/* Passo 3 — Funções da loja (embute a Task 5, sem container novo) */}
      <section className="bg-card border border-border rounded-xl p-4 space-y-3">
        <CabecalhoPasso numero={3} avaliacao={passos[2]} />
        <div className="pl-10">
          <ConfiguracaoFuncoes storeId={storeId} />
        </div>
      </section>

      {/* Passo 4 — Regras legais vigentes (somente-leitura + confirmação de DEPENDE_CCT) */}
      <section className="bg-card border border-border rounded-xl p-4 space-y-3">
        <CabecalhoPasso numero={4} avaliacao={passos[3]} />
        <div className="pl-10 space-y-2">
          {regrasQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...</p>
          )}
          {!regrasQuery.isLoading && regrasQuery.data && regrasQuery.data.regras.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma regra legal vigente encontrada.</p>
          )}
          {(regrasQuery.data?.regras ?? []).map((regra) => {
            const pendente = pendentes.some((p) => p.chave === regra.chave);
            return (
              <div key={regra.chave} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{regra.chave}</span>
                    <Badge variant={TIPO_REGRA_BADGE[regra.tipo]}>{TIPO_REGRA_LABEL[regra.tipo]}</Badge>
                    {regra.tipo === "DEPENDE_CCT" && !pendente && (
                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmada para esta loja
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Valor: {formatarValorRegra(regra.valor)} · Fonte: {regra.fonte}
                  </p>
                </div>
                {pendente && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => confirmarRegra(regra)}
                    disabled={confirmarRegraMut.isPending}
                  >
                    Confirmar para esta loja
                  </Button>
                )}
              </div>
            );
          })}
          {regimesHoje.length > 0 && (
            <div className="text-xs text-muted-foreground pt-1 border-t border-border/60 mt-2">
              <span className="font-medium">Regimes de escala vigentes hoje: </span>
              {regimesHoje
                .filter((r) => r.disponivel)
                .map((r) => r.nome)
                .join(" · ") || "nenhum"}
              {regimesIndisponiveis.length > 0 && (
                <div className="mt-1 flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {regimesIndisponiveis.map((r) => `${r.nome}: ${r.razao}`).join(" ")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* "Gerar escala" (Plano 3): indicador desabilitado, nunca clicável —
          decisão documentada no relatório da Task 6: este botão não existe
          de verdade ainda, então ele nunca finge que a geração está
          disponível, mesmo com os 4 passos completos. */}
      <section className="bg-muted/30 border border-dashed border-border rounded-xl p-4 space-y-2">
        <Button disabled className="pointer-events-none">
          Gerar escala
        </Button>
        <p className="text-sm text-muted-foreground">
          {liberaGeracao
            ? "Configuração completa. A geração de escala chega em um próximo módulo."
            : `Ainda faltam ${passos.filter((p) => !p.completo).length} passo(s): ${passos
                .filter((p) => !p.completo)
                .map((p) => p.titulo)
                .join(", ")}.`}
        </p>
      </section>
    </div>
  );
}
