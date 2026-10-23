import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import HojePage from "./pages/HojePage";
import EstoquePage from "./pages/EstoquePage";
import EbitdaPage from "./pages/EbitdaPage";
import DreVivaPage from "./pages/DreVivaPage";
import LancamentosPage from "./pages/LancamentosPage";
import ReuniaoPage from "./pages/ReuniaoPage";
import PlanoPage from "./pages/PlanoPage";
import CompromissoPage from "./pages/CompromissoPage";
import ExperienciaPage from "@/pages/ExperienciaPage";
import PreturnoPage from "@/pages/PreturnoPage";
import TrilhasPage from "./pages/TrilhasPage";
import OrcamentoPage from "./pages/OrcamentoPage";
import ManutencoesPage from "./pages/ManutencoesPage";
import MetaPage from "./pages/MetaPage";
import RemuneracaoPage from "./pages/RemuneracaoPage";
import ChecklistPage from "./pages/ChecklistPage";
import RankingPage from "./pages/RankingPage";
import RedePage from "./pages/RedePage";
import PessoasPage from "./pages/PessoasPage";
import AdminPage from "./pages/AdminPage";
import CargaHistoricaPage from "./pages/CargaHistoricaPage";
import DemoLayout from "./components/DemoLayout";
import DemoHojePage from "./pages/demo/DemoHojePage";
import DemoPlaceholderPage from "./pages/demo/DemoPlaceholderPage";
import { useAuth } from "./_core/hooks/useAuth";
import { getLoginUrl } from "./const";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ivory)" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4" style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "var(--stone)" }}>Carregando...</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) {
    return <LoginPage loginUrl={getLoginUrl()} />;
  }
  return <>{children}</>;
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated, user } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ivory)" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4" style={{ borderColor: "var(--vinho)", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "var(--stone)" }}>Carregando...</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) {
    return <LoginPage loginUrl={getLoginUrl()} />;
  }
  if ((user as any)?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ivory)" }}>
        <div className="text-center">
          <p className="text-lg font-semibold mb-2" style={{ color: "var(--vinho)" }}>Acesso restrito</p>
          <p className="text-sm" style={{ color: "var(--stone)" }}>Esta área é exclusiva para administradores do programa.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => (
        <AuthGate>
          <AppLayout>
            <HojePage />
          </AppLayout>
        </AuthGate>
      )} />
      <Route path="/hoje" component={() => (
        <AuthGate><AppLayout><HojePage /></AppLayout></AuthGate>
      )} />
      <Route path="/estoque" component={() => (
        <AuthGate><AppLayout><EstoquePage /></AppLayout></AuthGate>
      )} />
      <Route path="/ebitda" component={() => (
        <AuthGate><AppLayout><EbitdaPage /></AppLayout></AuthGate>
      )}
      />
      <Route path="/dre-viva" component={() => (
        <AuthGate><AppLayout><DreVivaPage /></AppLayout></AuthGate>
      )} />
      <Route path="/lancamentos" component={() => (
        <AuthGate><AppLayout><LancamentosPage /></AppLayout></AuthGate>
      )} />
      <Route path="/reuniao" component={() => (
        <AuthGate><AppLayout><ReuniaoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/plano" component={() => (
        <AuthGate><AppLayout><PlanoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/compromisso" component={() => (
        <AuthGate><AppLayout><CompromissoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/experiencia" component={() => (
        <AuthGate><AppLayout><ExperienciaPage /></AppLayout></AuthGate>
      )} />
      <Route path="/preturno" component={() => (
        <AuthGate><AppLayout><PreturnoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/trilhas" component={() => (
        <AuthGate><AppLayout><TrilhasPage /></AppLayout></AuthGate>
      )} />
      <Route path="/orcamento/editar/:id" component={() => (
        <AuthGate><AppLayout><OrcamentoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/orcamento" component={() => (
        <AuthGate><AppLayout><OrcamentoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/orcamento-assistido" component={() => (
        <AuthGate><AppLayout><OrcamentoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/manutencoes" component={() => (
        <AuthGate><AppLayout><ManutencoesPage /></AppLayout></AuthGate>
      )} />
      <Route path="/meta" component={() => (
        <AuthGate><AppLayout><MetaPage /></AppLayout></AuthGate>
      )} />
      <Route path="/remuneracao" component={() => (
        <AuthGate><AppLayout><RemuneracaoPage /></AppLayout></AuthGate>
      )} />
      <Route path="/checklist" component={() => (
        <AuthGate><AppLayout><ChecklistPage /></AppLayout></AuthGate>
      )} />
      <Route path="/ranking" component={() => (
        <AuthGate><AppLayout><RankingPage /></AppLayout></AuthGate>
      )} />
      <Route path="/rede" component={() => (
        <AuthGate><AppLayout><RedePage /></AppLayout></AuthGate>
      )} />
      <Route path="/pessoas" component={() => (
        <AuthGate><AppLayout><PessoasPage /></AppLayout></AuthGate>
      )} />
      <Route path="/admin" component={() => (
        <AdminGate><AppLayout><AdminPage /></AppLayout></AdminGate>
      )} />
      <Route path="/admin/carga-historica" component={() => (
        <AdminGate><AppLayout><CargaHistoricaPage /></AppLayout></AdminGate>
      )} />
      {/* Demo routes — no auth required */}
      <Route path="/demo/hoje" component={() => (
        <DemoLayout><DemoHojePage /></DemoLayout>
      )} />
      <Route path="/demo/plano" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/estoque" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/pessoas" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/experiencia" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/ebitda" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/trilhas" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/ranking" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/compromisso" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/demo/rede" component={() => (
        <DemoLayout><DemoPlaceholderPage /></DemoLayout>
      )} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

import { useEffect } from "react";

function App() {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("MODO DONO BUILD:", typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev");
    // Unregister any stale service workers (none are intentionally registered in this project)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => reg.unregister());
      });
    }
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
