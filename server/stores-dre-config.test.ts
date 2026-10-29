/**
 * stores-dre-config.test.ts
 * Task S2 do conector SharePoint (orçamento-sharepoint): valida que a tabela
 * `stores` expõe as novas colunas de config da DRE por loja — pasta no
 * SharePoint (`dreSharepointUrl`) e filtro de nome do arquivo
 * (`dreFileFilter`), usadas pra desambiguar sub-unidades (ex.: "Praça").
 *
 * Não toca banco de dados — só inspeciona a definição da tabela via
 * `getTableColumns` do drizzle-orm.
 */

import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { stores } from "../drizzle/schema";
import type { Store } from "../drizzle/schema";

describe("stores (schema) — config de DRE/SharePoint", () => {
  it("expõe as colunas dreSharepointUrl e dreFileFilter em camelCase", () => {
    const columnNames = Object.keys(getTableColumns(stores));

    expect(columnNames).toContain("dreSharepointUrl");
    expect(columnNames).toContain("dreFileFilter");
  });

  it("tipa o $inferSelect com as novas chaves (checagem em tempo de compilação)", () => {
    const row = {} as Store;
    // Se alguma destas chaves não existir no tipo, o build do TS falha.
    const _check: {
      dreSharepointUrl: string | null;
      dreFileFilter: string | null;
    } = row;
    expect(_check).toBeDefined();
  });
});
