import { getDb } from "./db";
import {
  stores, dailyEntries, stockItems, stockCounts,
  actionPlans, commitments, monthlyQuality
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DEMO_STORES = [
  { slug: "pecorino", name: "Pecorino Mkt Place", location: "São Paulo (SP)", managerName: "Carlos Mendes",
    budgetRevenue: "569000", budgetCmvPct: "28", budgetPackagingPct: "4", budgetTaxesPct: "3", budgetFixedCosts: "165000",
    qualityGoogle: "92", qualityAudit: "88", qualityChecklist: "85" },
  { slug: "executive", name: "Executive NVT", location: "Aero. Navegantes (SC)", managerName: "Ana Lima",
    budgetRevenue: "519000", budgetCmvPct: "30", budgetPackagingPct: "4", budgetTaxesPct: "3", budgetFixedCosts: "155000",
    qualityGoogle: "88", qualityAudit: "84", qualityChecklist: "82" },
  { slug: "bellagula", name: "Bella Gula (Praça)", location: "Aero. Salgado Filho (POA)", managerName: "Roberto Silva",
    budgetRevenue: "498000", budgetCmvPct: "30", budgetPackagingPct: "4", budgetTaxesPct: "3", budgetFixedCosts: "148000",
    qualityGoogle: "95", qualityAudit: "92", qualityChecklist: "90" },
  { slug: "confins", name: "Giraffas Confins", location: "Aero. Confins (MG)", managerName: "Fernanda Costa",
    budgetRevenue: "372000", budgetCmvPct: "34", budgetPackagingPct: "4", budgetTaxesPct: "3", budgetFixedCosts: "125000",
    qualityGoogle: "82", qualityAudit: "78", qualityChecklist: "80" },
  { slug: "foz", name: "Giraffas Foz", location: "Foz do Iguaçu (PR)", managerName: "Marcos Oliveira",
    budgetRevenue: "230000", budgetCmvPct: "33", budgetPackagingPct: "4", budgetTaxesPct: "3", budgetFixedCosts: "88000",
    qualityGoogle: "85", qualityAudit: "80", qualityChecklist: "78" },
  { slug: "cafecultura", name: "Café Cultura Paulista", location: "Av. Paulista (SP)", managerName: "Juliana Ramos",
    budgetRevenue: "206000", budgetCmvPct: "36", budgetPackagingPct: "4", budgetTaxesPct: "3", budgetFixedCosts: "95000",
    qualityGoogle: "78", qualityAudit: "75", qualityChecklist: "72" },
];

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function seedDatabase(): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn("[Seed] DB unavailable"); return; }

  // Check if already seeded
  const existing = await db.select().from(stores).limit(1);
  if (existing.length > 0) { console.log("[Seed] Already seeded, skipping."); return; }

  console.log("[Seed] Seeding demo data...");

  // Insert stores
  for (const s of DEMO_STORES) {
    await db.insert(stores).values({
      ...s,
      dayWeights: [110, 80, 90, 95, 100, 110, 115],
      sanitaryGate: true, gateAbsences: true, gateEvaluation: true, gateSanctions: true, active: true,
    });
  }

  const allStores = await db.select().from(stores);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;

  for (const store of allStores) {
    const budgetRev = parseFloat(store.budgetRevenue ?? "0");
    const dailyBudget = budgetRev / 30;

    // Daily entries for current month
    for (let d = 1; d < today.getDate(); d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const revenue = randomBetween(dailyBudget * 0.85, dailyBudget * 1.15);
      const invoices = randomBetween(revenue * 0.25, revenue * 0.35);
      const extraLabor = d % 7 === 0 ? randomBetween(200, 800) : 0;
      await db.insert(dailyEntries).values({
        storeId: store.id, entryDate: date,
        revenue: String(revenue), invoices: String(invoices), extraLabor: String(extraLabor),
      });
    }

    // Stock items (Curva ABC)
    const itemsA = [
      { name: "Filé de frango", unit: "kg", curve: "A" as const, avgCost: "18.50" },
      { name: "Carne bovina", unit: "kg", curve: "A" as const, avgCost: "42.00" },
      { name: "Queijo mussarela", unit: "kg", curve: "A" as const, avgCost: "28.00" },
    ];
    const itemsB = [
      { name: "Arroz", unit: "kg", curve: "B" as const, avgCost: "4.20" },
      { name: "Feijão", unit: "kg", curve: "B" as const, avgCost: "6.80" },
      { name: "Óleo de soja", unit: "L", curve: "B" as const, avgCost: "8.50" },
    ];
    const itemsC = [
      { name: "Sal", unit: "kg", curve: "C" as const, avgCost: "1.20" },
      { name: "Pimenta", unit: "kg", curve: "C" as const, avgCost: "15.00" },
      { name: "Embalagem kraft", unit: "un", curve: "C" as const, avgCost: "0.45" },
    ];
    for (const item of [...itemsA, ...itemsB, ...itemsC]) {
      await db.insert(stockItems).values({ storeId: store.id, ...item });
    }

    // Stock counts (dia 1 + terças)
    const stockBase = budgetRev * 0.20;
    await db.insert(stockCounts).values({
      storeId: store.id, countDate: `${year}-${String(month).padStart(2, "0")}-01`,
      totalValue: String(randomBetween(stockBase * 0.9, stockBase * 1.1)), countType: "initial",
    });
    const tuesdays = [];
    for (let d = 1; d < today.getDate(); d++) {
      const dt = new Date(year, month - 1, d);
      if (dt.getDay() === 2) tuesdays.push(d);
    }
    for (const d of tuesdays) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      await db.insert(stockCounts).values({
        storeId: store.id, countDate: date,
        totalValue: String(randomBetween(stockBase * 0.85, stockBase * 1.05)), countType: "weekly",
      });
    }

    // Action plans
    const categories = ["cmv", "experience", "revenue", "people", "discipline"] as const;
    const templates = [
      { category: "cmv" as const, description: "Revisar ficha técnica do filé de frango", reason: "CMV acima da meta na semana passada", responsible: "Chef" },
      { category: "experience" as const, description: "Treinamento de atendimento com equipe", reason: "Avaliação Google abaixo de 4,5", responsible: "Gerente" },
      { category: "revenue" as const, description: "Ação de vendas no horário de pico", reason: "Receita 8% abaixo do orçado", responsible: "Líder de turno" },
    ];
    for (const t of templates) {
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 7);
      await db.insert(actionPlans).values({
        storeId: store.id, ...t,
        dueDate: formatDate(dueDate),
        status: Math.random() > 0.5 ? "todo" : "doing",
      });
    }
    // One completed action
    await db.insert(actionPlans).values({
      storeId: store.id, category: "discipline",
      description: "Implementar reunião de pré-turno diária",
      reason: "Disciplina operacional", responsible: "Gerente",
      status: "done", result: "Equipe aderiu. Redução de 15 min no tempo de abertura.",
      completedAt: new Date(today.getTime() - 7 * 86400000),
    });

    // Commitment
    await db.insert(commitments).values({
      storeId: store.id, period,
      signed: store.slug !== "cafecultura",
      signedAt: store.slug !== "cafecultura" ? new Date(year, month - 1, 2) : null,
      signedBy: store.slug !== "cafecultura" ? store.managerName : null,
      reviewsTarget: 30, tableResponseHours: 24, googleResponseHours: 48,
      trainTeam: true, actOnStandard: true, joinCommunity: store.slug !== "cafecultura",
      doPreShift: true, doAppEntry: true, doWeeklyMeeting: true,
      doInitialCount: true, doWeeklyCount: true, doMonthlyCount: false,
      readTrails: true, joinCouncil: store.slug !== "cafecultura", applyContent: false,
    });

    // Trail completions
    const completedModules = ["m01-projeto", "m02-comunidade", "m03-orcamento"];
    if (store.slug === "bellagula") completedModules.push("m04-experiencia", "m05-salarios");
    for (const moduleId of completedModules) {
      // trailCompletions removido: o ranking agora lê trilha_progresso (fonte viva)
    }

    // Reviews (fonte única da voz-do-cliente — substitui customerOccurrences)
    // Semear na tabela reviews para que recalcularQualidadeGoogle tenha dados demo
    await (db as any).$client.promise().execute(
      `INSERT IGNORE INTO reviews (storeId, platform, stars, reviewText, reviewDate, status, createdAt)
       VALUES (?, 'google', 4, 'Ótimo atendimento e comida saborosa!', ?, 'registrada', NOW()),
              (?, 'google', 2, 'Demora no atendimento no horário de almoço.', ?, 'registrada', NOW()),
              (?, 'google', 5, 'Excelente! Equipe muito simpática e prato delicioso.', ?, 'fechada', NOW())`,
      [store.id, formatDate(new Date(today.getTime() - 1 * 86400000)),
       store.id, formatDate(new Date(today.getTime() - 10 * 86400000)),
       store.id, formatDate(new Date(today.getTime() - 5 * 86400000))]
    );

    // Monthly quality
    await db.insert(monthlyQuality).values({
      storeId: store.id, period,
      qualityGoogle: store.qualityGoogle ?? "85",
      qualityAudit: store.qualityAudit ?? "85",
      qualityChecklist: store.qualityChecklist ?? "85",
      sanitaryGate: true,
    });
  }

  console.log("[Seed] Demo data seeded successfully.");
}
