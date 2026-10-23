/**
 * DemoPlaceholderPage — Placeholder for demo routes not yet fully mocked.
 * Shows the page name and a brief description of what it contains.
 */
import { useLocation } from "wouter";
import { Construction, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_INFO: Record<string, { title: string; description: string }> = {
  "/demo/plano": {
    title: "Plano de Ação",
    description: "Cards de tarefas com sugestões automáticas, templates pré-preenchidos e histórico de ações. Limite configurável de ações simultâneas para manter o foco.",
  },
  "/demo/estoque": {
    title: "Estoque / CMV",
    description: "Contagem organizada por Curva ABC, cálculo de CMV semanal e sinalização visual de desvios. Importação da planilha Excel que sua equipe já usa.",
  },
  "/demo/pessoas": {
    title: "Pessoas",
    description: "Mapa de calor de produtividade, escala semanal inteligente, análise de custo por bloco e indicadores de % folha/receita em tempo real.",
  },
  "/demo/experiencia": {
    title: "Experiência do Cliente",
    description: "Registro de ocorrências, padrão de atendimento e ações vinculadas ao Plano. Monitoramento de NPS e avaliações Google.",
  },
  "/demo/ebitda": {
    title: "EBITDA",
    description: "Projeção vs. realizado, score composto e statement-bar narrativo que contextualiza o resultado do mês.",
  },
  "/demo/trilhas": {
    title: "Trilhas de Aprendizado",
    description: "9 módulos sequenciais com microlearning (vídeos curtos e textos), biblioteca de referência e progresso individual.",
  },
  "/demo/ranking": {
    title: "Ranking",
    description: "6 categorias de pontuação, placar consolidado entre lojas e badges de conquistas para engajamento das equipes.",
  },
  "/demo/compromisso": {
    title: "Compromisso Semanal",
    description: "5 blocos estruturados com campo de assinatura digital e integração com as demais abas do sistema.",
  },
  "/demo/rede": {
    title: "Rede",
    description: "Visão consolidada de todas as lojas, KPIs comparativos lado a lado e seletor de loja para navegação rápida. Exclusivo para admin/liderança.",
  },
};

export default function DemoPlaceholderPage() {
  const [location, navigate] = useLocation();
  const info = PAGE_INFO[location] ?? { title: "Página", description: "Esta seção estará disponível em breve." };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button
        onClick={() => navigate("/demo/hoje")}
        className="flex items-center gap-2 mb-6"
        style={{ fontSize: 13, color: "var(--stone)", cursor: "pointer" }}
      >
        <ArrowLeft size={14} /> Voltar ao Hoje
      </button>

      <div className="text-center py-16">
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--vinho-pale)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Construction size={28} style={{ color: "var(--vinho)" }} />
        </div>
        <div className="eyebrow mb-2">Demonstração</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>
          {info.title}<span style={{ color: "var(--vinho)" }}>.</span>
        </h1>
        <p style={{ color: "var(--stone)", fontSize: 15, lineHeight: 1.7, maxWidth: 480, margin: "0 auto 32px" }}>
          {info.description}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => navigate("/")}
            style={{ background: "var(--vinho)", color: "#fff" }}
          >
            Fazer login para acessar
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/demo/hoje")}
          >
            Ver demo do Hoje
          </Button>
        </div>
      </div>
    </div>
  );
}
