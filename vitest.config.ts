import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // client/**/*.test.ts (não .tsx) — funções puras só, sem componente:
    // o ambiente continua "node" (sem jsdom/@testing-library/react), ver
    // ruling R19 em .superpowers/sdd/2026-11-19-escala-configuracao/task-5-brief.md.
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "shared/**/*.test.ts",
      "shared/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.spec.ts",
    ],
  },
});
