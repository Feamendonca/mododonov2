import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      // Último recurso (app inteiro) — nunca mostra stack trace/erro técnico
      // cru pro gerente. Detalhe fica só no console para debug.
      // eslint-disable-next-line no-console
      if (this.state.error) console.error("[ErrorBoundary]", this.state.error);
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-md p-8 text-center">
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
            <h2 className="text-xl mb-2">Módulo em construção — em breve</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Não conseguimos carregar o Modo Dono agora. Tente recarregar a página.
            </p>
            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
