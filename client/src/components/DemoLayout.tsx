/**
 * DemoLayout — wraps pages in demo mode without authentication.
 * Shows a banner indicating demo mode and provides navigation.
 * Uses the same AppLayout shell but with a mock store context.
 */
import { useState, createContext, useContext, useEffect } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Package, TrendingUp, CheckSquare,
  FileText, Star, BookOpen, Trophy, Network, Menu, X,
  LogIn, Users, ShieldCheck, Eye
} from "lucide-react";

// ─── Demo Store Context ───────────────────────────────────────────────────────
interface DemoStoreCtx {
  storeId: number;
  storeName: string;
}
export const DemoStoreContext = createContext<DemoStoreCtx>({ storeId: 1, storeName: "Pecorino Praia (Demo)" });
export const useDemoStore = () => useContext(DemoStoreContext);

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { path: "/demo/hoje", label: "Hoje", icon: LayoutDashboard },
  { path: "/demo/plano", label: "Plano de Ação", icon: CheckSquare },
  { path: "/demo/estoque", label: "Estoque / CMV", icon: Package },
  { path: "/demo/pessoas", label: "Pessoas", icon: Users },
  { path: "/demo/experiencia", label: "Experiência do Cliente", icon: Star },
  { path: "/demo/ebitda", label: "EBITDA", icon: TrendingUp },
  { path: "/demo/trilhas", label: "Trilhas", icon: BookOpen },
  { path: "/demo/ranking", label: "Ranking", icon: Trophy },
  { path: "/demo/compromisso", label: "Compromisso", icon: FileText },
  { path: "/demo/rede", label: "Rede", icon: Network },
];

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location]);

  const isActive = (path: string) => location === path || location.startsWith(path + "/");

  return (
    <DemoStoreContext.Provider value={{ storeId: 1, storeName: "Pecorino Praia (Demo)" }}>
      <div className="min-h-screen flex flex-col" style={{ background: "var(--ivory)" }}>
        {/* Demo banner */}
        <div style={{
          background: "linear-gradient(90deg, #7c3aed, var(--vinho))",
          color: "#fff",
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 500,
          zIndex: 100,
          position: "sticky",
          top: 0,
        }}>
          <div className="flex items-center gap-2">
            <Eye size={13} />
            <span>Modo Demonstração — dados ilustrativos, sem login necessário</span>
          </div>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", fontSize: 11 }}
          >
            <LogIn size={12} /> Fazer login
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar overlay (mobile) */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: "rgba(0,0,0,0.4)" }}
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside
            className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
            style={{ width: 240, background: "var(--ink)", paddingTop: sidebarOpen ? 0 : 40 }}
          >
            {/* Logo */}
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(250,247,242,0.4)", fontWeight: 600 }}>AMFoods</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--ivory)", lineHeight: 1.2 }}>
                  Modo Dono<span style={{ color: "var(--vinho)" }}>.</span>
                </div>
              </div>
              <button className="lg:hidden" onClick={() => setSidebarOpen(false)} style={{ color: "rgba(250,247,242,0.5)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            {/* Demo store badge */}
            <div className="mx-4 mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 10, color: "rgba(250,247,242,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Loja demo</div>
              <div style={{ fontSize: 13, color: "var(--ivory)", fontWeight: 500 }}>Pecorino Praia</div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.map(item => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
                    style={{
                      background: active ? "rgba(250,247,242,0.1)" : "transparent",
                      color: active ? "var(--ivory)" : "rgba(250,247,242,0.5)",
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                      borderLeft: active ? "2px solid var(--vinho)" : "2px solid transparent",
                    }}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Login CTA */}
            <div className="p-4">
              <button
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "var(--vinho)", color: "#fff", cursor: "pointer" }}
              >
                <LogIn size={14} /> Fazer login
              </button>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-auto">
            {/* Mobile header */}
            <header className="lg:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-30"
              style={{ background: "var(--ivory)", borderBottom: "1px solid var(--silk)" }}>
              <button onClick={() => setSidebarOpen(true)} style={{ cursor: "pointer", color: "var(--ink)" }}>
                <Menu size={22} />
              </button>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>
                Modo Dono<span style={{ color: "var(--vinho)" }}>.</span>
              </div>
              <div style={{ width: 22 }} />
            </header>

            {/* Page content */}
            <main className="flex-1">
              {children}
            </main>
          </div>
        </div>
      </div>
    </DemoStoreContext.Provider>
  );
}
