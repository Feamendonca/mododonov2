import { useLocation } from "wouter";

/**
 * Placeholder amigável para módulos ocultos na Fase A (ver
 * client/src/config/hiddenModules.ts) e para qualquer link/rota "perdida"
 * que ainda aponte para um módulo desativado. O objetivo é que o gerente
 * NUNCA veja tela branca ou erro cru — sempre uma mensagem clara de
 * "em breve".
 */
export default function ModuloEmConstrucaoPage({ titulo }: { titulo?: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
        <h2
          style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)" }}
          className="mb-2"
        >
          {titulo ?? "Módulo em construção"}
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--stone)" }}>
          Esta área está sendo reconstruída e volta em breve. Enquanto isso,
          o restante do Modo Dono segue funcionando normalmente.
        </p>
        <button
          onClick={() => navigate("/hoje")}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "var(--vinho)", color: "var(--ivory)" }}
        >
          Voltar para Hoje
        </button>
      </div>
    </div>
  );
}
