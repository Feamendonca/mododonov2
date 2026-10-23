/**
 * Heartbeat handler: /api/scheduled/preturno-check
 *
 * Runs daily (configured via manus-heartbeat CLI after deploy).
 * Checks every active store to see if today's pré-turno was registered.
 * Sends a consolidated notification to the owner listing all stores that
 * did NOT register their pré-turno by the time this job runs.
 */

import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { notifyOwner, notifyManager } from "../_core/notification";
import { getAllStores } from "../db";
import { getPreturnoConfigs, getAtasToday } from "../db-preturno";

export async function preturnoCheckHandler(req: Request, res: Response) {
  try {
    // Authenticate — only cron calls are allowed
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const today = new Date();
    const todayDow = today.getDay(); // 0=sun … 6=sat
    const todayStr = today.toISOString().split("T")[0];

    // Get all active stores
    const allStores = await getAllStores();

    const pendingStores: { id: number; name: string; configs: string[] }[] = [];

    for (const store of allStores) {
      // Get configs that should run today
      const configs = await getPreturnoConfigs(store.id);
      const todayConfigs = configs.filter((c) => c.diasDaSemana.includes(todayDow));
      if (todayConfigs.length === 0) continue; // no pré-turno scheduled today

      // Get today's atas
      const atasEstado = await getAtasToday(store.id);

      // Find configs that have no ata OR have ata with status != realizada
      const pendingConfigs = todayConfigs.filter((config) => {
        const estado = atasEstado.find((a) => a.configId === config.id);
        return !estado || estado.estado === "pendente" || estado.estado === "atrasado";
      });

      if (pendingConfigs.length > 0) {
        pendingStores.push({
          id: store.id,
          name: store.name,
          configs: pendingConfigs.map((c) => `${c.nome} (${c.horarioEsperado})`),
        });
      }
    }

    if (pendingStores.length === 0) {
      // All stores are compliant — no notification needed
      return res.json({
        ok: true,
        date: todayStr,
        message: "Todas as lojas registraram o pré-turno hoje.",
        pendingCount: 0,
      });
    }

    // Build notification content
    // Notificar gerente de cada loja individualmente
    for (const store of pendingStores) {
      await notifyManager(store.id, {
        title: `⚠️ Pré-turno não registrado hoje — ${store.name}`,
        content: `A loja ${store.name} ainda não registrou o pré-turno de hoje:\n${store.configs.join(", ")}\n\nAcesse o sistema e registre agora.`,
      }).catch(() => {});
    }

    const lines = pendingStores.map(
      (s) => `• ${s.name}: ${s.configs.join(", ")}`
    );

    const content = [
      `📋 Verificação do pré-turno em ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}`,
      "",
      `${pendingStores.length} loja(s) ainda não registraram o pré-turno de hoje:`,
      "",
      ...lines,
      "",
      "Acesse o sistema para verificar ou registrar manualmente.",
    ].join("\n");

    await notifyOwner({
      title: `⚠️ ${pendingStores.length} loja(s) sem pré-turno hoje`,
      content,
    });

    return res.json({
      ok: true,
      date: todayStr,
      pendingCount: pendingStores.length,
      pendingStores: pendingStores.map((s) => s.name),
    });
  } catch (err: any) {
    console.error("[preturno-check] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
