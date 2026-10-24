import { useState } from "react";
import { useLocation } from "wouter";
import { Eye, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("E-mail ou senha incorretos.");
        return;
      }
      // Re-busca auth.me agora que o access_token do Supabase está disponível
      // (o header Authorization é montado a partir da sessão do Supabase — ver main.tsx).
      await utils.auth.me.invalidate();
    } catch (err: any) {
      setError(err?.message ?? "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  }

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

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="login-email" className="block mb-1" style={{ fontSize: 12, color: "var(--stone)" }}>E-mail</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@amfoods.com.br"
                className="w-full py-2.5 px-3 rounded-lg text-sm outline-none"
                style={{ border: "1.5px solid var(--silk)", background: "var(--white)", color: "var(--ink)" }}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block mb-1" style={{ fontSize: 12, color: "var(--stone)" }}>Senha</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full py-2.5 px-3 rounded-lg text-sm outline-none"
                style={{ border: "1.5px solid var(--silk)", background: "var(--white)", color: "var(--ink)" }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 13, color: "var(--vinho)" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-3 w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "var(--vinho)", color: "var(--white)", opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer" }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "var(--vinho-hover)"; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "var(--vinho)"; }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              Entrar
            </button>
          </form>

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
