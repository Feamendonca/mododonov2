import { useLocation } from "wouter";
import { Eye } from "lucide-react";

export default function LoginPage({ loginUrl }: { loginUrl: string }) {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex" style={{ background: "var(--ivory)" }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: "var(--ink)" }}>
        <div>
          <div className="eyebrow" style={{ color: "rgba(250,247,242,0.4)", fontSize: 9 }}>AMFoods</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, color: "var(--ivory)", marginTop: 4 }}>
            Modo Dono<span style={{ color: "var(--vinho)" }}>.</span>
          </div>
        </div>
        <div>
          <blockquote style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, color: "var(--ivory)", lineHeight: 1.4, marginBottom: 24 }}>
            "Gestores que pensam como donos constroem operações que funcionam."
          </blockquote>
          <div className="flex gap-6">
            {[
              { label: "Lojas no piloto", value: "6" },
              { label: "Módulos de aprendizado", value: "9" },
              { label: "Indicadores monitorados", value: "12" },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--ivory)" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "rgba(250,247,242,0.5)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "rgba(250,247,242,0.3)" }}>© 2026 AMFoods. Programa piloto.</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 text-center">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--ink)" }}>
              Modo Dono<span style={{ color: "var(--vinho)" }}>.</span>
            </div>
          </div>
          <div className="eyebrow mb-2" style={{ color: "var(--stone-light)" }}>Acesso ao sistema</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
            Bem-vindo<span className="dot">.</span>
          </h1>
          <p style={{ color: "var(--stone)", fontSize: 15, marginBottom: 32, lineHeight: 1.5 }}>
            Faça login para acessar o painel de gestão da sua loja.
          </p>

          {/* Primary login button */}
          <a
            href={loginUrl}
            className="flex items-center justify-center gap-3 w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all"
            style={{ background: "var(--vinho)", color: "var(--white)", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vinho-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--vinho)")}
          >
            Entrar com Manus
          </a>

          {/* Demo mode separator */}
          <div className="flex items-center gap-3 my-5">
            <div style={{ flex: 1, height: 1, background: "var(--silk)" }} />
            <span style={{ fontSize: 11, color: "var(--stone-light)", letterSpacing: "0.08em", textTransform: "uppercase" }}>ou</span>
            <div style={{ flex: 1, height: 1, background: "var(--silk)" }} />
          </div>

          {/* Demo mode button */}
          <button
            onClick={() => navigate("/demo/hoje")}
            className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl font-medium text-sm transition-all"
            style={{
              background: "transparent",
              color: "var(--stone)",
              border: "1.5px solid var(--silk)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--silk)";
              e.currentTarget.style.color = "var(--ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--stone)";
            }}
          >
            <Eye size={15} />
            Ver demonstração (sem login)
          </button>

          <p className="text-center mt-6 text-xs" style={{ color: "var(--stone-light)" }}>
            Acesso restrito aos gestores e lideranças do programa Modo Dono.
          </p>
        </div>
      </div>
    </div>
  );
}
