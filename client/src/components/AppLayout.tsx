import { useState, useEffect, createContext, useContext } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, Package, TrendingUp, CheckSquare,
  FileText, Star, BookOpen, Trophy, Network, Menu, X,
  LogOut, ChevronDown, Store, Settings, Users, ShieldCheck, Clock, PieChart, Wrench, Sparkles, Database,
  Target, DollarSign, ClipboardCheck
} from "lucide-react";
import { ClipboardList, Handshake } from "lucide-react";

// ─── Store Context ────────────────────────────────────────────────────────────
interface StoreCtx {
  storeId: number | null;
  setStoreId: (id: number) => void;
  stores: { id: number; name: string; slug: string; location: string | null }[];
}
export const StoreContext = createContext<StoreCtx>({ storeId: null, setStoreId: () => {}, stores: [] });
export const useStore = () => useContext(StoreContext);

// ─── Nav items ────────────────────────────────────────────────────────────────
// Estrutura de navegação em seções 4DX
type NavItem = { path: string; label: string; icon: React.ElementType; highlight?: boolean };
type NavSection = { section: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    section: "",
    items: [
      { path: "/hoje", label: "Hoje", icon: LayoutDashboard },
    ],
  },
  {
    section: "1. Planejar",
    items: [
      { path: "/orcamento", label: "Orçamento", icon: PieChart },
      { path: "/meta", label: "Meta do Mês", icon: Target, highlight: true },
    ],
  },
  {
    section: "2. Tocar a Loja",
    items: [
      { path: "/lancamentos", label: "Lançamentos", icon: ClipboardList },
      { path: "/pessoas", label: "Pessoas & Escala", icon: Users },
      { path: "/estoque", label: "Estoque / CMV", icon: Package },
      { path: "/experiencia", label: "Experiência do Cliente", icon: Star },
      { path: "/manutencoes", label: "Manutenções", icon: Wrench },
    ],
  },
  {
    section: "3. O Placar",
    items: [
      { path: "/dre-viva", label: "DRE Viva", icon: TrendingUp },
      { path: "/ebitda", label: "Resultado (EBITDA)", icon: TrendingUp },
      { path: "/ranking", label: "Ranking", icon: Trophy },
    ],
  },
  {
    section: "4. Cadência",
    items: [
      { path: "/preturno", label: "Pré-turno", icon: Clock },
      { path: "/checklist", label: "Checklist Diário", icon: ClipboardCheck },
      { path: "/plano", label: "Plano de Ação", icon: CheckSquare },
      { path: "/reuniao", label: "Reunião", icon: Handshake },
      { path: "/compromisso", label: "Compromisso", icon: FileText },
      { path: "/trilhas", label: "Trilhas", icon: BookOpen },
    ],
  },
  {
    section: "5. Recompensa",
    items: [
      { path: "/remuneracao", label: "Remuneração", icon: DollarSign },
    ],
  },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    section: "Admin",
    items: [
      { path: "/rede", label: "Rede", icon: Network },
      { path: "/admin", label: "Administração", icon: ShieldCheck },
      { path: "/admin/carga-historica", label: "Carga Histórica", icon: Database },
    ],
  },
];

const SUPERVISOR_SECTIONS: NavSection[] = [
  {
    section: "Admin",
    items: [
      { path: "/rede", label: "Rede", icon: Network },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeDropOpen, setStoreDropOpen] = useState(false);

  // Persiste a loja selecionada no localStorage para evitar reset ao navegar
  const [storeId, setStoreIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem("modo_dono_store_id");
    return saved ? parseInt(saved, 10) : null;
  });

  const { data: stores = [] } = trpc.stores.list.useQuery(undefined, { enabled: !!user });
  const seedMutation = trpc.seed.run.useMutation();

  useEffect(() => {
    if (stores.length > 0) {
      // Se a loja salva ainda existe na lista, usa ela; senão usa a primeira
      const savedId = storeId;
      const exists = savedId && stores.some((s) => s.id === savedId);
      if (!exists) {
        const firstId = stores[0].id;
        setStoreIdState(firstId);
        localStorage.setItem("modo_dono_store_id", String(firstId));
      }
    }
  }, [stores]);

  // Auto-seed on first load
  useEffect(() => {
    if (user && stores.length === 0) {
      seedMutation.mutate();
    }
  }, [user, stores.length]);

  const setStoreId = (id: number) => {
    setStoreIdState(id);
    localStorage.setItem("modo_dono_store_id", String(id));
    setStoreDropOpen(false);
  };
  const currentStore = stores.find((s) => s.id === storeId);
  const allSections: NavSection[] = user?.role === "admin"
    ? [...NAV_SECTIONS, ...ADMIN_SECTIONS]
    : user?.role === "supervisor"
    ? [...NAV_SECTIONS, ...SUPERVISOR_SECTIONS]
    : NAV_SECTIONS;

  return (
    <StoreContext.Provider value={{ storeId, setStoreId, stores }}>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--ivory)" }}>
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 ease-out lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ width: 240, background: "var(--ink)", flexShrink: 0 }}
        >
          {/* Logo */}
          <div className="flex items-center justify-between px-5 pt-6 pb-4" style={{ borderBottom: "1px solid rgba(250,247,242,0.08)" }}>
            <div>
              <div className="eyebrow" style={{ color: "rgba(250,247,242,0.4)", fontSize: 9 }}>AMFoods</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--ivory)", lineHeight: 1.2 }}>
                Modo Dono<span style={{ color: "var(--vinho)" }}>.</span>
              </div>
            </div>
            <button className="lg:hidden p-1 rounded" style={{ color: "rgba(250,247,242,0.5)" }} onClick={() => setSidebarOpen(false)}>
              <X size={18} />
            </button>
          </div>

          {/* Store selector */}
          {stores.length > 0 && (
            <div className="px-3 py-3" style={{ borderBottom: "1px solid rgba(250,247,242,0.08)" }}>
              {/* Gerente: apenas exibe o nome da loja sem dropdown */}
              {user?.role === "gerente" ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(250,247,242,0.07)", color: "var(--ivory)" }}>
                  <Store size={14} style={{ color: "rgba(250,247,242,0.5)", flexShrink: 0 }} />
                  <span className="flex-1 truncate text-sm font-medium">{currentStore?.name ?? "Minha loja"}</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setStoreDropOpen(!storeDropOpen)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                    style={{ background: "rgba(250,247,242,0.07)", color: "var(--ivory)" }}
                  >
                    <Store size={14} style={{ color: "rgba(250,247,242,0.5)", flexShrink: 0 }} />
                    <span className="flex-1 truncate text-sm font-medium">{currentStore?.name ?? "Selecionar loja"}</span>
                    <ChevronDown size={14} style={{ color: "rgba(250,247,242,0.4)", transform: storeDropOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </button>
                  {storeDropOpen && (
                    <div className="mt-1 rounded-lg overflow-hidden" style={{ background: "rgba(250,247,242,0.05)", border: "1px solid rgba(250,247,242,0.1)" }}>
                      {stores.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setStoreId(s.id)}
                          className="w-full text-left px-3 py-2 text-sm transition-colors"
                          style={{ color: s.id === storeId ? "var(--ivory)" : "rgba(250,247,242,0.6)", background: s.id === storeId ? "rgba(113,14,43,0.3)" : "transparent" }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {allSections.map(({ section, items }) => (
              <div key={section || "__top__"} className="mb-1">
                {section && (
                  <div className="px-3 pt-3 pb-1" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(250,247,242,0.3)" }}>
                    {section}
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map(({ path, label, icon: Icon, highlight }) => (
                    <button
                      key={path}
                      onClick={() => { navigate(path); setSidebarOpen(false); }}
                      className={`nav-item w-full ${location === path || (path === "/hoje" && location === "/") ? "active" : ""}`}
                      style={highlight && location !== path ? { color: "rgba(250,247,242,0.85)" } : undefined}
                    >
                      <Icon size={16} className="nav-icon flex-shrink-0" style={highlight ? { color: "var(--vinho)" } : undefined} />
                      <span style={highlight ? { fontWeight: 600 } : undefined}>{label}</span>
                      {highlight && location !== path && (
                        <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--vinho)", flexShrink: 0 }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* User footer */}
          <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(250,247,242,0.08)" }}>
            {/* Build stamp — versão visível do bundle em produção */}
            <div className="px-3 pb-2 text-center" style={{ fontSize: 10, color: "rgba(250,247,242,0.2)", letterSpacing: "0.05em", userSelect: "all" }}>
              build {typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev"}
            </div>
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(250,247,242,0.05)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: "var(--vinho)", color: "var(--ivory)" }}>
                {(user?.name ?? "U").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--ivory)" }}>{user?.name ?? "Usuário"}</div>
                <div className="text-xs" style={{ color: "rgba(250,247,242,0.4)" }}>{user?.role === "admin" ? "Administrador" : user?.role === "supervisor" ? "Supervisor" : user?.role === "gerente" ? "Gerente" : "Usuário"}</div>
              </div>
              <button onClick={logout} className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "rgba(250,247,242,0.4)" }} title="Sair">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" style={{ background: "rgba(26,20,17,0.5)" }} onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b" style={{ background: "var(--white)", borderColor: "var(--gray-line)" }}>
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg" style={{ color: "var(--ink)" }}>
              <Menu size={20} />
            </button>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>
              Modo Dono<span style={{ color: "var(--vinho)" }}>.</span>
            </div>
          </div>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            {storeId ? children : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center p-8">
                  <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
                    style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
                  <p style={{ color: "var(--stone)" }}>Carregando lojas...</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </StoreContext.Provider>
  );
}
