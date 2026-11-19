/**
 * ConfiguracaoFuncoes.tsx — aba "Configuração da Escala": funções da loja
 *
 * Componente FINO (Task 5): renderiza e delega toda a lógica de validação
 * e de texto para `client/src/lib/escala-config-ui.ts` (funções puras,
 * testadas em `escala-config-ui.test.ts`). Este arquivo não tem teste
 * próprio por ruling R19 do controlador — não há jsdom/@testing-library/react
 * neste repo e instalar essa infra está fora do escopo da feature. A
 * cobertura de tela fica só pelo `tsc` (`npm run check`) e verificação
 * manual (ver task-5-report.md).
 *
 * Entregue SEM container próprio (ruling R1): sem card externo, sem
 * título de página — recebe o espaço de quem o renderiza (hoje a aba
 * "Configuração da Escala" de `PessoasPage.tsx`; a Task 6 vai embutir
 * isto como passo 2 de um assistente).
 *
 * Fluxo de produtividade (requisito de produto — nunca aparece vazia sem
 * explicação):
 * - R20 (pós-revisão): assim que o diálogo abre — função nova OU
 *   existente — já busca `escala.sugerirProdutividade` com `{storeId,
 *   driver}` e pré-preenche o campo, com rótulo da origem. A sugestão
 *   deriva do HISTÓRICO DA LOJA por driver, não da identidade da função
 *   (`funcaoId` é só um refinamento opcional, enviado quando a função já
 *   existe) — por isso não precisa de um id pra sugerir nada, e o
 *   salvamento volta a ser UMA ação só (sem fase 2). Isto corrige o
 *   defeito de produto identificado na revisão: com a assinatura antiga
 *   (`funcaoId` obrigatório), TODA função nova nascia com o campo vazio —
 *   exatamente o caso mais comum (gestor cadastrando a loja do zero).
 * - Trocar o driver no formulário busca uma sugestão nova para aquele
 *   driver (query key muda) e a reaplica, desde que o gestor não tenha
 *   digitado um valor manualmente nesta sessão.
 * - Quando a sugestão vem `null`, mostra o motivo (vindo do servidor) e
 *   pede o número ao gestor.
 * - Qualquer edição manual do campo marca a origem como "definida por
 *   você" — o gestor sempre pode sobrescrever.
 * - 🔴 R32 (CC1 da review final): a sugestão NUNCA substitui uma
 *   produtividade já salva. Enquanto o campo está vazio (ou a função é
 *   nova), a sugestão preenche — isso é propor. Se já existe valor salvo e
 *   a sugestão é diferente, a tela mostra os DOIS e o gestor escolhe. A
 *   decisão é função pura testada (`decidirAplicacaoSugestao` /
 *   `devePermitirSobrescritaAutomatica`, em `escala-config-ui.ts`), não um
 *   `useEffect` decidindo sozinho: "a IA propõe, o humano confirma, a IA
 *   nunca grava sozinha" é o princípio-âncora do app, e era exatamente ele
 *   que esta tela estava violando.
 * - R22 (pós-revisão): o rótulo de origem (`rotuloOrigemProdutividade`,
 *   em `escala-config-ui.ts`) agora recebe o `driver` e embute uma
 *   ressalva quando a sugestão NÃO é específica da função — hoje o único
 *   número que o histórico sabe calcular é a partir de `atendimentos`
 *   genéricos, que é a própria unidade de demanda para `tickets`, mas só
 *   uma aproximação grosseira para `pratos`/`cobertos` (ex.: um atendimento
 *   pode cobrir uma mesa de 10 pessoas). A contagem segregada por driver é
 *   o trabalho do próximo plano (`demanda_bloco`); até lá, a tela não pode
 *   implicar uma precisão que o número não tem — mesmo rótulo teria
 *   deixado o gestor calibrar a escala do salão com régua de caixa, sem
 *   saber.
 *
 * Erros de mutation NUNCA são engolidos (aprendizado das tasks
 * anteriores): `onError` sempre dispara um toast visível, incluindo
 * `NOT_FOUND` do servidor quando o id da função não casa com a loja.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Ban } from "lucide-react";
import {
  decidirAplicacaoSugestao,
  deveExibirAvisoProdutividadeIndisponivel,
  formatarProdutividade,
  mensagemProdutividadeIndisponivel,
  origemParaSalvar,
  produtividadeParaInput,
  rotuloOrigemProdutividade,
  validarFuncao,
  type DriverFuncao,
  type EntradaValidarFuncao,
  type ProdutividadeOrigem,
} from "@/lib/escala-config-ui";

const DRIVER_LABELS: Record<DriverFuncao, string> = {
  tickets: "Tickets / atendimentos",
  pratos: "Pratos",
  cobertos: "Cobertos",
};

type FormState = {
  nome: string;
  driver: DriverFuncao;
  minPorBloco: string;
  maxPorBloco: string;
  produtividadeAlvo: string;
  produtividadeOrigem: ProdutividadeOrigem | null;
};

function formVazio(): FormState {
  return { nome: "", driver: "tickets", minPorBloco: "1", maxPorBloco: "", produtividadeAlvo: "", produtividadeOrigem: null };
}

type FuncaoRow = {
  id: number;
  nome: string;
  driver: DriverFuncao;
  produtividadeAlvo: number | null;
  produtividadeOrigem: ProdutividadeOrigem | null;
  minPorBloco: number;
  maxPorBloco: number | null;
};

export function ConfiguracaoFuncoes({ storeId }: { storeId: number }) {
  const utils = trpc.useUtils();
  const { data: funcoes, isLoading } = trpc.escala.getConfig.useQuery(
    { storeId },
    { enabled: storeId > 0 }
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(formVazio());
  // Impede que a sugestão automática sobrescreva um valor que o próprio
  // gestor já digitou/confirmou nesta sessão de edição.
  const [produtividadeTocada, setProdutividadeTocada] = useState(false);
  // 🔴 R32 (CC1): origem da produtividade COMO ESTÁ NO BANCO para a função
  // em edição (`null` em função nova). É ela — não a origem do formulário,
  // que muda enquanto o gestor mexe — que decide se a sugestão pode
  // preencher o campo sozinha. Ver `devePermitirSobrescritaAutomatica`.
  const [origemSalva, setOrigemSalva] = useState<ProdutividadeOrigem | null>(null);
  // O gestor já resolveu a divergência "valor salvo × sugestão nova" nesta
  // sessão (escolheu um dos dois) — não perguntar de novo.
  const [sugestaoDecidida, setSugestaoDecidida] = useState(false);

  // R20: busca a sugestão assim que o diálogo abre, para QUALQUER driver —
  // não depende mais de `editingId` existir. `funcaoId` vai como
  // refinamento opcional quando a função já existe (editando); fica
  // `undefined` para função nova.
  const sugestaoQuery = trpc.escala.sugerirProdutividade.useQuery(
    { storeId, driver: form.driver, funcaoId: editingId ?? undefined },
    { enabled: showForm && storeId > 0 }
  );

  // 🔴 R32 (CC1 da review final): a decisão sobre o que fazer com a
  // sugestão é FUNÇÃO PURA, testada em `escala-config-ui.test.ts`. Antes,
  // este efeito substituía o valor salvo pela sugestão nova sempre que a
  // origem salva não fosse `definida_gestor` — o caso mais comum —, com o
  // mesmo rótulo, sem o gestor pedir e sem ver. Agora:
  //   aplicar   → só quando não há produtividade salva (ou o campo está
  //               vazio): preencher é propor, não sobrescrever;
  //   perguntar → mostra os dois valores e deixa o gestor escolher;
  //   ignorar   → nada a fazer.
  const decisaoSugestao = decidirAplicacaoSugestao({
    origemSalva,
    valorAtualCampo: form.produtividadeAlvo,
    valorSugerido: sugestaoQuery.data?.valor,
    produtividadeTocada,
  });
  const valorParaAplicar = decisaoSugestao.acao === "aplicar" ? decisaoSugestao.valor : null;
  const divergencia = decisaoSugestao.acao === "perguntar" && !sugestaoDecidida ? decisaoSugestao : null;

  useEffect(() => {
    if (valorParaAplicar == null) return;
    setForm((p) => ({
      ...p,
      produtividadeAlvo: produtividadeParaInput(valorParaAplicar),
      produtividadeOrigem: "sugerida_historico",
    }));
  }, [valorParaAplicar]);

  function aceitarSugestao(valor: number) {
    setForm((p) => ({
      ...p,
      produtividadeAlvo: produtividadeParaInput(valor),
      produtividadeOrigem: "sugerida_historico",
    }));
    setSugestaoDecidida(true);
  }

  function manterValorSalvo() {
    setSugestaoDecidida(true);
  }

  // R20: salvar volta a ser uma ação só — a produtividade já chega
  // pré-preenchida (sugestão ou valor do gestor) antes do primeiro clique
  // em "Salvar", então não há mais necessidade de manter o diálogo aberto
  // numa segunda fase para "esperar" a sugestão depender de um id.
  const salvarMut = trpc.escala.salvarFuncao.useMutation({
    onSuccess: () => {
      utils.escala.getConfig.invalidate({ storeId });
      toast.success("Função salva!");
      closeForm();
    },
    onError: (e) => toast.error("Não foi possível salvar a função: " + e.message),
  });

  const desativarMut = trpc.escala.desativarFuncao.useMutation({
    onSuccess: () => {
      utils.escala.getConfig.invalidate({ storeId });
      toast.success("Função desativada.");
    },
    onError: (e) => toast.error("Não foi possível desativar a função: " + e.message),
  });

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(formVazio());
    setProdutividadeTocada(false);
    setOrigemSalva(null);
    setSugestaoDecidida(false);
  }

  function openNova() {
    setEditingId(null);
    setForm(formVazio());
    setProdutividadeTocada(false);
    setOrigemSalva(null);
    setSugestaoDecidida(false);
    setShowForm(true);
  }

  function openEdit(funcao: FuncaoRow) {
    setEditingId(funcao.id);
    setForm({
      nome: funcao.nome,
      driver: funcao.driver,
      minPorBloco: String(funcao.minPorBloco),
      maxPorBloco: funcao.maxPorBloco == null ? "" : String(funcao.maxPorBloco),
      produtividadeAlvo:
        funcao.produtividadeAlvo == null ? "" : produtividadeParaInput(funcao.produtividadeAlvo),
      produtividadeOrigem: funcao.produtividadeOrigem,
    });
    // 🔴 R32 (CC1): NENHUMA produtividade salva é sobrescrita pela sugestão
    // ao reabrir o formulário — nem a de origem `sugerida_*`, que era
    // justamente a que a versão anterior trocava em silêncio (ela nascia
    // com `produtividadeTocada = false`, a query já habilitada, e o
    // `useEffect` substituía o valor quando a resposta chegava). Quem
    // decide isso agora é `origemSalva` + `decidirAplicacaoSugestao`;
    // `produtividadeTocada` volta a significar só "digitou nesta sessão".
    setProdutividadeTocada(false);
    setOrigemSalva(funcao.produtividadeOrigem);
    setSugestaoDecidida(false);
    setShowForm(true);
  }

  function entradaAtual(): EntradaValidarFuncao {
    return {
      nome: form.nome,
      driver: form.driver,
      produtividadeAlvo: form.produtividadeAlvo === "" ? null : Number(form.produtividadeAlvo),
      minPorBloco: Number(form.minPorBloco),
      maxPorBloco: form.maxPorBloco === "" ? null : Number(form.maxPorBloco),
    };
  }

  function salvar() {
    const entrada = entradaAtual();
    const erros = validarFuncao(entrada);
    if (erros.length > 0) {
      erros.forEach((erro) => toast.error(erro));
      return;
    }
    salvarMut.mutate({
      storeId,
      id: editingId ?? undefined,
      nome: entrada.nome.trim(),
      driver: entrada.driver,
      produtividadeAlvo: entrada.produtividadeAlvo,
      // CC2: invariante origem ↔ valor agora é função pura testada
      // (`origemParaSalvar`), não um ternário solto aqui.
      produtividadeOrigem: origemParaSalvar(entrada.produtividadeAlvo, form.produtividadeOrigem),
      minPorBloco: entrada.minPorBloco,
      maxPorBloco: entrada.maxPorBloco,
    });
  }

  // I1 (pós-revisão): a lógica de quando mostrar o aviso vive em
  // `escala-config-ui.ts` (testada no módulo puro) — antes considerava só
  // `sugestaoQuery.data`, e podia mostrar "indisponível, informe o
  // número" ao MESMO TEMPO que "Origem: definida por você", quando o
  // campo já tinha um valor. Ver `deveExibirAvisoProdutividadeIndisponivel`.
  const sugestaoIndisponivel = deveExibirAvisoProdutividadeIndisponivel({
    carregandoSugestao: sugestaoQuery.isLoading,
    valorSugerido: sugestaoQuery.data?.valor,
    produtividadeTocada,
    produtividadeAtual: form.produtividadeAlvo,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Funções da loja</h3>
          <p className="text-sm text-muted-foreground">
            Cadastre as funções que entram na escala e a produtividade esperada de cada uma.
          </p>
        </div>
        <Button size="sm" onClick={openNova}>
          <Plus className="w-4 h-4 mr-1" /> Nova função
        </Button>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando funções...</p>}
        {!isLoading && (funcoes ?? []).length === 0 && (
          <div className="bg-muted/30 rounded-xl p-6 text-center text-muted-foreground text-sm">
            Nenhuma função cadastrada ainda. Clique em "Nova função" para começar.
          </div>
        )}
        {(funcoes ?? []).map((funcao) => (
          <div key={funcao.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{funcao.nome}</span>
                <Badge variant="outline">{DRIVER_LABELS[funcao.driver]}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {funcao.minPorBloco}{funcao.maxPorBloco != null ? `–${funcao.maxPorBloco}` : "+"} pessoa(s) por bloco
                {funcao.produtividadeAlvo != null && (
                  <>
                    {" · "}
                    {formatarProdutividade(funcao.produtividadeAlvo)} {DRIVER_LABELS[funcao.driver].toLowerCase()}/h
                    {funcao.produtividadeOrigem && ` (${rotuloOrigemProdutividade(funcao.produtividadeOrigem, funcao.driver)})`}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(funcao)}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Desativar a função "${funcao.nome}"?`)) {
                    desativarMut.mutate({ storeId, id: funcao.id });
                  }
                }}
              >
                <Ban className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) closeForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId != null ? "Editar função" : "Nova função"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da função</label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Atendente, Cozinheiro"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Indicador de demanda</label>
              <Select value={form.driver} onValueChange={(v) => setForm((p) => ({ ...p, driver: v as DriverFuncao }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DRIVER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Mínimo por bloco</label>
                <Input
                  type="number"
                  min={1}
                  value={form.minPorBloco}
                  onChange={(e) => setForm((p) => ({ ...p, minPorBloco: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Máximo por bloco</label>
                <Input
                  type="number"
                  min={1}
                  value={form.maxPorBloco}
                  onChange={(e) => setForm((p) => ({ ...p, maxPorBloco: e.target.value }))}
                  placeholder="Sem teto"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Produtividade alvo ({DRIVER_LABELS[form.driver].toLowerCase()}/hora)
              </label>
              {sugestaoQuery.isLoading && form.produtividadeAlvo === "" ? (
                <p className="text-xs text-muted-foreground">Buscando sugestão de produtividade...</p>
              ) : (
                <>
                  <Input
                    type="number"
                    min={0}
                    value={form.produtividadeAlvo}
                    onChange={(e) => {
                      setProdutividadeTocada(true);
                      setForm((p) => ({ ...p, produtividadeAlvo: e.target.value, produtividadeOrigem: "definida_gestor" }));
                    }}
                    placeholder="Ex: 12"
                  />
                  {form.produtividadeAlvo !== "" && form.produtividadeOrigem && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Origem: {rotuloOrigemProdutividade(form.produtividadeOrigem, form.driver)}
                    </p>
                  )}
                  {sugestaoIndisponivel && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
                      {mensagemProdutividadeIndisponivel(sugestaoQuery.data?.motivo)}
                    </p>
                  )}
                  {/* 🔴 R32 (CC1): a sugestão nova DIVERGE da produtividade já
                      salva. A tela mostra OS DOIS números e deixa o gestor
                      escolher — nunca troca por conta própria, que era o
                      defeito: ele abria para mudar o mínimo por bloco e
                      salvava uma produtividade que nunca viu. */}
                  {divergencia && (
                    <div className="text-xs mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 space-y-2">
                      <p className="text-sky-900">
                        O histórico da loja sugere{" "}
                        <strong>{formatarProdutividade(divergencia.valorSugerido)}</strong>{" "}
                        {DRIVER_LABELS[form.driver].toLowerCase()}/h, diferente da produtividade salva desta função (
                        <strong>{formatarProdutividade(divergencia.valorSalvo)}</strong>). Qual vale?
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={manterValorSalvo}>
                          Manter {formatarProdutividade(divergencia.valorSalvo)}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => aceitarSugestao(divergencia.valorSugerido)}>
                          Usar a sugestão ({formatarProdutividade(divergencia.valorSugerido)})
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvarMut.isPending}>
              {salvarMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
