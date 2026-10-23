import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { preturnoCheckHandler } from "../scheduled/preturno-check";
import { lancamentoCheckHandler } from "../scheduled/lancamento-check";
import { contagemCheckHandler } from "../scheduled/contagem-check";
import { ocorrenciaCheckHandler } from "../scheduled/ocorrencia-check";
import { cadenciaSemanalHandler } from "../scheduled/cadencia-semanal";
import { reuniaoMigHandler } from "../scheduled/reuniao-mig";
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
  // Trust the Manus reverse proxy so req.protocol reflects HTTPS correctly.
  // This is required for secure cookies to work behind the proxy.
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // ─── Scheduled / Heartbeat handlers ──────────────────────────────────────
  // MUST be registered before the Vite/static fallthrough
  app.post("/api/scheduled/preturno-check", preturnoCheckHandler);
  app.post("/api/scheduled/lancamento-check", lancamentoCheckHandler);
  app.post("/api/scheduled/contagem-check", contagemCheckHandler);
  app.post("/api/scheduled/ocorrencia-check", ocorrenciaCheckHandler);
  app.post("/api/scheduled/cadencia-semanal", cadenciaSemanalHandler);
  app.post("/api/scheduled/google-rating-sync", (req, res) => {
  import("../scheduled/google-rating-sync").then(m => m.googleRatingSyncHandler(req, res));
});
app.post("/api/scheduled/reuniao-mig", reuniaoMigHandler);

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

  // Setup crons — registers the 6 heartbeat jobs (idempotent: skips existing).
  // POST /api/internal/setup-crons — manual trigger / fallback.
  // The server also calls registerScheduledCrons() automatically on boot (see below).
  app.post("/api/internal/setup-crons", async (req, res) => {
    try {
      const { parse: parseCookies } = await import("cookie");
      const cookies = parseCookies(req.headers.cookie ?? "");
      const userSession = cookies["app_session_id"] ?? "";
      const results = await registerScheduledCrons(userSession);
      res.json({ ok: true, results });
    } catch (err: any) {
      console.error("[setup-crons] Error:", err);
      res.status(500).json({ error: err?.message ?? "Setup failed" });
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

  // ─── Auto-register crons on boot ────────────────────────────────────────
  // Non-blocking: errors are logged but never crash the server.
  // Uses empty session → falls back to project owner identity.
  registerScheduledCrons("").then((results) => {
    const created = results.filter(r => r.status === "created").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors  = results.filter(r => r.status === "error").length;
    console.log(`[crons] Boot registration: ${created} created, ${skipped} skipped, ${errors} errors`);
    if (errors > 0) {
      results.filter(r => r.status === "error").forEach(r =>
        console.warn(`[crons] ${r.name}: ${r.detail}`)
      );
    }
  }).catch((err) => {
    console.error("[crons] Boot registration failed (non-fatal):", err?.message ?? err);
  });
}

startServer().catch(console.error);
