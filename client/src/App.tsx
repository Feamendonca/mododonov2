import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
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
import ModuloEmConstrucaoPage from "./pages/ModuloEmConstrucaoPage";
import DemoLayout from "./components/DemoLayout";
import DemoHojePage from "./pages/demo/DemoHojePage";
import DemoPlaceholderPage from "./pages/demo/DemoPlaceholderPage";
import { useAuth } from "./_core/hooks/useAuth";
import { isModuleHidden } from "./config/hiddenModules";
import type { ComponentType } from "react";

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
    return <LoginPage />;
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
    return <LoginPage />;
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

/**
 * Renderiza a página de uma rota "núcleo" (AuthGate + AppLayout), já
 * protegida por um RouteErrorBoundary próprio — uma falha de renderização
 * aqui não derruba o app inteiro, só mostra o placeholder amigável.
 *
 * Se `path` estiver em HIDDEN_MODULES (Fase A — ver
 * client/src/config/hiddenModules.ts), renderiza o placeholder
 * "em construção" no lugar da página real, SEM precisar comentar a rota ou
 * o import — basta tirar o path do Set pra reativar na Fase B.
 */
function PageRoute({ path, component: PageComponent, titulo }: { path: string; component: ComponentType; titulo?: string }) {
  return (
    <AuthGate>
      <AppLayout>
        <RouteErrorBoundary>
          {isModuleHidden(path) ? <ModuloEmConstrucaoPage titulo={titulo} /> : <PageComponent />}
        </RouteErrorBoundary>
      </AppLayout>
    </AuthGate>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <PageRoute path="/hoje" component={HojePage} />} />
      <Route path="/hoje" component={() => <PageRoute path="/hoje" component={HojePage} />} />
      <Route path="/estoque" component={() => <PageRoute path="/estoque" component={EstoquePage} titulo="Estoque / CMV" />} />
      <Route path="/ebitda" component={() => <PageRoute path="/ebitda" component={EbitdaPage} />} />
      <Route path="/dre-viva" component={() => <PageRoute path="/dre-viva" component={DreVivaPage} />} />
      <Route path="/lancamentos" component={() => <PageRoute path="/lancamentos" component={LancamentosPage} />} />
      <Route path="/reuniao" component={() => <PageRoute path="/reuniao" component={ReuniaoPage} />} />
      <Route path="/plano" component={() => <PageRoute path="/plano" component={PlanoPage} />} />
      <Route path="/compromisso" component={() => <PageRoute path="/compromisso" component={CompromissoPage} />} />
      <Route path="/experiencia" component={() => <PageRoute path="/experiencia" component={ExperienciaPage} titulo="Experiência do Cliente" />} />
      <Route path="/preturno" component={() => <PageRoute path="/preturno" component={PreturnoPage} titulo="Pré-turno" />} />
      <Route path="/trilhas" component={() => <PageRoute path="/trilhas" component={TrilhasPage} titulo="Trilhas" />} />
      <Route path="/orcamento/editar/:id" component={() => <PageRoute path="/orcamento/editar/:id" component={OrcamentoPage} titulo="Orçamento" />} />
      <Route path="/orcamento" component={() => <PageRoute path="/orcamento" component={OrcamentoPage} titulo="Orçamento" />} />
      <Route path="/orcamento-assistido" component={() => <PageRoute path="/orcamento-assistido" component={OrcamentoPage} titulo="Orçamento Assistido" />} />
      <Route path="/manutencoes" component={() => <PageRoute path="/manutencoes" component={ManutencoesPage} titulo="Manutenções" />} />
      <Route path="/meta" component={() => <PageRoute path="/meta" component={MetaPage} />} />
      <Route path="/remuneracao" component={() => <PageRoute path="/remuneracao" component={RemuneracaoPage} />} />
      <Route path="/checklist" component={() => <PageRoute path="/checklist" component={ChecklistPage} titulo="Checklist Diário" />} />
      <Route path="/ranking" component={() => <PageRoute path="/ranking" component={RankingPage} />} />
      <Route path="/rede" component={() => <PageRoute path="/rede" component={RedePage} />} />
      <Route path="/pessoas" component={() => <PageRoute path="/pessoas" component={PessoasPage} />} />
      <Route path="/admin" component={() => (
        <AdminGate><AppLayout><RouteErrorBoundary><AdminPage /></RouteErrorBoundary></AppLayout></AdminGate>
      )} />
      <Route path="/admin/carga-historica" component={() => (
        <AdminGate><AppLayout><RouteErrorBoundary><CargaHistoricaPage /></RouteErrorBoundary></AppLayout></AdminGate>
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
