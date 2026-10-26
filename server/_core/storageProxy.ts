import type { Express } from "express";
import { ENV } from "./env";
import { storageGetSignedUrl } from "../storage";

// Mantém a rota `/manus-storage/{key}` (nome herdado do Manus) para não
// quebrar os `url` já persistidos no banco (ex.: tabela de anexos) nem os
// chamadores no client que usam esse path como <img src> / <a href>.
// Por baixo, agora gera uma URL assinada do Supabase Storage na hora e
// redireciona (307) — o bucket é privado, então nunca existe URL pública
// permanente.
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const url = await storageGetSignedUrl(key);
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
