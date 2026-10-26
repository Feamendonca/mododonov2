import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * ErrorBoundary por rota — isola uma falha de renderização num módulo
 * específico sem derrubar o app inteiro (diferente do ErrorBoundary global em
 * App.tsx, que é o último recurso). Mostra sempre uma mensagem amigável:
 * o gerente nunca vê stack trace ou mensagem técnica crua. Serve tanto para
 * módulos ocultos na Fase A quanto como rede de segurança para qualquer
 * módulo "núcleo" que venha a falhar de forma inesperada.
 */
class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary] Falha ao renderizar módulo:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center max-w-md">
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
            <h2
              style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)" }}
              className="mb-2"
            >
              Módulo em construção — em breve
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--stone)" }}>
              Não conseguimos carregar esta área agora. O restante do Modo Dono
              segue funcionando — tente recarregar a página.
            </p>
            <button
              onClick={() => window.location.href = "/hoje"}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "var(--vinho)", color: "var(--ivory)" }}
            >
              Voltar para Hoje
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default RouteErrorBoundary;
