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
 * - Ao editar uma função existente, busca `escala.sugerirProdutividade`
 *   imediatamente e pré-preenche o campo, com rótulo da origem.
 * - Ao criar uma função nova, não há `funcaoId` ainda para sugerir nada —
 *   o diálogo permanece aberto após o primeiro "Salvar" (que cria a
 *   função) e, uma vez que o id existe, a sugestão chega e preenche o
 *   campo automaticamente, sem exigir uma ida e volta manual do gestor.
 * - Quando a sugestão vem `null`, mostra o motivo (vindo do servidor) e
 *   pede o número ao gestor.
 * - Qualquer edição manual do campo marca a origem como "definida por
 *   você" — o gestor sempre pode sobrescrever.
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
  mensagemProdutividadeIndisponivel,
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

  const sugestaoQuery = trpc.escala.sugerirProdutividade.useQuery(
    { storeId, funcaoId: editingId ?? 0 },
    { enabled: showForm && editingId != null && storeId > 0 }
  );

  useEffect(() => {
    if (!sugestaoQuery.data || produtividadeTocada) return;
    const { valor } = sugestaoQuery.data;
    if (valor != null) {
      setForm((p) => ({ ...p, produtividadeAlvo: String(valor), produtividadeOrigem: "sugerida_historico" }));
    }
  }, [sugestaoQuery.data, produtividadeTocada]);

  const salvarMut = trpc.escala.salvarFuncao.useMutation({
    onSuccess: (data) => {
      utils.escala.getConfig.invalidate({ storeId });
      if (editingId == null) {
        // Função recém-criada: mantém o diálogo aberto para a sugestão de
        // produtividade (que depende do id) chegar e o gestor confirmar
        // ou ajustar antes de sair — nunca fecha com o campo em branco
        // sem o gestor ver.
        toast.success("Função criada! Buscando a produtividade sugerida...");
        setEditingId(data.id);
      } else {
        toast.success("Função salva!");
        closeForm();
      }
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
  }

  function openNova() {
    setEditingId(null);
    setForm(formVazio());
    setProdutividadeTocada(false);
    setShowForm(true);
  }

  function openEdit(funcao: FuncaoRow) {
    setEditingId(funcao.id);
    setForm({
      nome: funcao.nome,
      driver: funcao.driver,
      minPorBloco: String(funcao.minPorBloco),
      maxPorBloco: funcao.maxPorBloco == null ? "" : String(funcao.maxPorBloco),
      produtividadeAlvo: funcao.produtividadeAlvo == null ? "" : String(funcao.produtividadeAlvo),
      produtividadeOrigem: funcao.produtividadeOrigem,
    });
    // Um valor que o gestor já definiu manualmente antes não é
    // sobrescrito pela sugestão automática ao reabrir o formulário.
    setProdutividadeTocada(funcao.produtividadeOrigem === "definida_gestor");
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
      produtividadeOrigem: entrada.produtividadeAlvo == null ? null : form.produtividadeOrigem,
      minPorBloco: entrada.minPorBloco,
      maxPorBloco: entrada.maxPorBloco,
    });
  }

  const sugestaoIndisponivel =
    editingId != null && !sugestaoQuery.isLoading && (sugestaoQuery.data?.valor ?? null) == null;

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
                    {funcao.produtividadeAlvo} {DRIVER_LABELS[funcao.driver].toLowerCase()}/h
                    {funcao.produtividadeOrigem && ` (${rotuloOrigemProdutividade(funcao.produtividadeOrigem)})`}
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
              {editingId == null ? (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  Salve os dados acima para ver a produtividade sugerida com base no histórico da loja.
                </p>
              ) : sugestaoQuery.isLoading && form.produtividadeAlvo === "" ? (
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
                      Origem: {rotuloOrigemProdutividade(form.produtividadeOrigem)}
                    </p>
                  )}
                  {sugestaoIndisponivel && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
                      {mensagemProdutividadeIndisponivel(sugestaoQuery.data?.motivo)}
                    </p>
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
