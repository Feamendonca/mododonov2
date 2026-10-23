import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MESES_PT = [
  "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

interface SetupDoMesProps {
  storeId: number;
  mes: number;
  ano: number;
  storeName?: string;
  /** Se true, mostra como bloco colapsável (HojePage). Se false, mostra expandido (OrcamentoPage). */
  colapsavel?: boolean;
}

export function SetupDoMes({ storeId, mes, ano, storeName, colapsavel = true }: SetupDoMesProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandido, setExpandido] = useState(!colapsavel);
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  const isAdminOrSup = isAdmin || isSupervisor;

  const utils = trpc.useUtils();

  const { data: status, isLoading, refetch } = trpc.setup.statusDoMes.useQuery(
    { storeId, mes, ano },
    { enabled: !!storeId }
  );

  const seedChecklist = trpc.checklist.seedItensPadrao.useMutation({
    onSuccess: () => {
      toast.success("Checklist padrão carregado!");
      refetch();
    },
    onError: (e) => toast.error("Erro ao carregar checklist: " + e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl border border-border bg-card text-muted-foreground text-sm">
        <Loader2 size={14} className="animate-spin" />
        Verificando configuração do mês...
      </div>
    );
  }

  if (!status) return null;

  const itens = status.itens;
  const total = itens.length;
  const feitos = itens.filter(i => i.feito).length;
  const pct = Math.round((feitos / total) * 100);
  const completo = feitos === total;

  // Se 100% completo e colapsável, mostrar só o selo
  if (completo && colapsavel) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium">
        <CheckCircle2 size={16} className="text-emerald-600" />
        Mês de {MESES_PT[mes]} configurado — tudo pronto!
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => colapsavel && setExpandido(e => !e)}
        className={`w-full flex items-center justify-between gap-3 px-5 py-4 ${colapsavel ? "cursor-pointer hover:bg-amber-100/60 transition-colors" : "cursor-default"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">📋</span>
          <div className="text-left min-w-0">
            <div className="font-semibold text-sm text-amber-900">
              Configurar o mês de {MESES_PT[mes]}{storeName ? ` — ${storeName}` : ""}
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              {feitos} de {total} passos concluídos · {pct}% configurado
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Barra de progresso */}
          <div className="hidden sm:block w-24 h-2 bg-amber-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {colapsavel && (
            expandido ? <ChevronUp size={16} className="text-amber-600" /> : <ChevronDown size={16} className="text-amber-600" />
          )}
        </div>
      </button>

      {/* Lista de itens */}
      {expandido && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {itens.map((item) => {
            // Itens admin-only: gerente vê como ✅ ou "peça ao supervisor"
            const podeExecutar = !item.adminOnly || isAdminOrSup;

            return (
              <div key={item.id} className={`flex items-center justify-between gap-3 px-5 py-3 ${item.feito ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {item.feito ? (
                    <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Circle size={18} className="text-amber-400 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${item.feito ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.titulo}
                  </span>
                </div>

                {!item.feito && (
                  <div className="flex-shrink-0">
                    {!podeExecutar ? (
                      <span className="text-xs text-muted-foreground italic">Peça ao supervisor</span>
                    ) : item.acaoId === "seed_checklist" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                        disabled={seedChecklist.isPending}
                        onClick={() => seedChecklist.mutate({ lojaId: storeId })}
                      >
                        {seedChecklist.isPending ? <Loader2 size={12} className="animate-spin" /> : item.acaoLabel}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                        onClick={() => navigate(item.link)}
                      >
                        {item.acaoLabel} →
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
