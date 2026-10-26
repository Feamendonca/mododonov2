import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerScheduledCrons } from "./register-crons";
import { seedTrilhasData } from "../seed-trilhas-data";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Trust the reverse proxy (Vercel/Supabase) so req.protocol reflects HTTPS correctly.
  // This is required for secure cookies to work behind the proxy.
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  // ─── Scheduled tasks ──────────────────────────────────────────────────────
  // Os handlers em server/scheduled/* não são mais expostos como rotas HTTP
  // (isso dependia do callback assinado do Forge/heartbeat). Agora são
  // chamados internamente pelo node-cron — ver registerScheduledCrons() logo
  // abaixo, no boot do servidor.

  // One-time seed endpoint for trilhas (idempotent — skips if already seeded)
  app.post("/api/internal/seed-trilhas", async (_req, res) => {
    try {
      const result = await seedTrilhasData();
      res.json(result);
    } catch (err: any) {
      console.error("[seed-trilhas] Error:", err);
      res.status(500).json({ error: err?.message ?? "Seed failed", stack: err?.stack });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // ─── Scheduled tasks (node-cron) ────────────────────────────────────────
  // Gated por CRONS_ENABLED (default false — Fase A). Nunca derruba o boot:
  // se CRONS_ENABLED != "true", apenas loga e não agenda nada.
  try {
    registerScheduledCrons();
  } catch (err: any) {
    console.error("[crons] Falha ao registrar crons (não-fatal):", err?.message ?? err);
  }
}

startServer().catch(console.error);
