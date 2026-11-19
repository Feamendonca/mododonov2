/**
 * pessoas-saveconfig-horario.test.ts
 *
 * I1 (revisão da Task 6, módulo de Escala) — cobertura DEDICADA, no
 * servidor, da checagem cruzada "fechamento depois da abertura" em
 * `pessoas.saveConfig` (server/routers/pessoas.ts). Antes desta correção,
 * essa regra vivia só em `AssistenteConfiguracao.tsx` (sem teste — ruling
 * R19, sem jsdom/@testing-library/react neste repo) e sem tranca real no
 * servidor: qualquer caminho que não passasse por aquele componente podia
 * gravar um horário inválido.
 *
 * Escopo DELIBERADAMENTE mínimo: `pessoas.ts` é módulo de outra task, fora
 * do nosso — este arquivo testa SÓ o `.refine()` novo do schema de
 * `saveConfig`, chamando o router REAL (sem mockar `./db`/`./db-pessoas`):
 * `getDb()` devolve `null` neste ambiente sem banco, então a mutation em si
 * é um no-op que resolve com sucesso — o que importa aqui é que o zod
 * rejeita ANTES de chegar no handler. Nenhum outro teste de `pessoas` foi
 * tocado (ver `server/pessoas-auth.test.ts`, `server/pessoas.test.ts`,
 * `server/pessoas-bugs-ab.test.ts` — inalterados).
 */
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { pessoasRouter } from "./routers/pessoas";

function makeCtxAdmin(): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: {
      id: 1,
      openId: "open-1",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as TrpcContext["user"],
  };
}

describe("pessoas.saveConfig — I1: fechamento precisa ser depois da abertura", () => {
  it("rejeita operationEndHour <= operationStartHour quando os dois chegam juntos", async () => {
    const caller = pessoasRouter.createCaller(makeCtxAdmin());
    await expect(
      caller.saveConfig({ storeId: 1, operationStartHour: 23, operationEndHour: 8 })
    ).rejects.toThrow();
  });

  it("rejeita operationEndHour === operationStartHour (igual não é 'depois')", async () => {
    const caller = pessoasRouter.createCaller(makeCtxAdmin());
    await expect(
      caller.saveConfig({ storeId: 1, operationStartHour: 10, operationEndHour: 10 })
    ).rejects.toThrow();
  });

  it("aceita operationEndHour > operationStartHour", async () => {
    const caller = pessoasRouter.createCaller(makeCtxAdmin());
    await expect(
      caller.saveConfig({ storeId: 1, operationStartHour: 8, operationEndHour: 23 })
    ).resolves.toEqual({ success: true });
  });

  it("aceita atualização parcial que não toca nenhum dos dois campos de horário", async () => {
    const caller = pessoasRouter.createCaller(makeCtxAdmin());
    await expect(caller.saveConfig({ storeId: 1, chargesPercent: 65 })).resolves.toEqual({ success: true });
  });

  it("aceita atualização parcial que toca só operationStartHour, sem operationEndHour — não há o que comparar", async () => {
    const caller = pessoasRouter.createCaller(makeCtxAdmin());
    await expect(caller.saveConfig({ storeId: 1, operationStartHour: 9 })).resolves.toEqual({ success: true });
  });

  it("aceita atualização parcial que toca só operationEndHour, sem operationStartHour — não há o que comparar", async () => {
    const caller = pessoasRouter.createCaller(makeCtxAdmin());
    await expect(caller.saveConfig({ storeId: 1, operationEndHour: 20 })).resolves.toEqual({ success: true });
  });
});
