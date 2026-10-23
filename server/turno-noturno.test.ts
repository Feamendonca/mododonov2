/**
 * turno-noturno.test.ts
 * Testes unitários para suporte a turno noturno (virada de meia-noite) e meia-hora.
 *
 * Cobre:
 *  1. blockDurationHours: turno normal, turno noturno (18:00→02:00), meia-hora (08:00→08:30)
 *  2. blockHours: horas cobertas com e sem virada
 *  3. Receita cross-midnight: horas pós-meia-noite buscadas no dia seguinte
 *  4. Casos-limite: turno exato de meia-noite, turno de 30 min
 */

import { describe, it, expect } from "vitest";
import { blockDurationHours, blockHours, fmtMinutes } from "../server/db-pessoas";

describe("blockDurationHours — duração em horas", () => {
  it("turno normal 08:00→16:00 = 8h", () => {
    expect(blockDurationHours({ startMinute: 480, endMinute: 960 })).toBe(8);
  });

  it("turno noturno 18:00→02:00 = 8h (virada de meia-noite)", () => {
    // startMinute = 18*60 = 1080, endMinute = 2*60 = 120
    expect(blockDurationHours({ startMinute: 1080, endMinute: 120 })).toBe(8);
  });

  it("meia-hora 08:00→08:30 = 0.5h", () => {
    expect(blockDurationHours({ startMinute: 480, endMinute: 510 })).toBe(0.5);
  });

  it("turno noturno 22:00→06:00 = 8h", () => {
    expect(blockDurationHours({ startMinute: 1320, endMinute: 360 })).toBe(8);
  });

  it("turno de exatamente meia-noite a meia-noite (24h) = 24h", () => {
    // endMinute = startMinute = 0 → endMinute + 1440 - 0 = 1440 min = 24h
    expect(blockDurationHours({ startMinute: 0, endMinute: 0 })).toBe(24);
  });

  it("turno 00:00→08:00 = 8h (começa na meia-noite, sem virada)", () => {
    expect(blockDurationHours({ startMinute: 0, endMinute: 480 })).toBe(8);
  });
});

describe("blockHours — horas inteiras cobertas", () => {
  it("turno 08:00→16:00 cobre horas 8..15", () => {
    const hours = blockHours({ startMinute: 480, endMinute: 960 });
    expect(hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("turno noturno 18:00→02:00 cobre horas 18..23 e 0..1", () => {
    const hours = blockHours({ startMinute: 1080, endMinute: 120 });
    expect(hours).toEqual([18, 19, 20, 21, 22, 23, 0, 1]);
  });

  it("meia-hora 08:00→08:30 cobre apenas hora 8", () => {
    const hours = blockHours({ startMinute: 480, endMinute: 510 });
    expect(hours).toEqual([8]);
  });

  it("turno 22:00→06:00 cobre horas 22..23 e 0..5", () => {
    const hours = blockHours({ startMinute: 1320, endMinute: 360 });
    expect(hours).toEqual([22, 23, 0, 1, 2, 3, 4, 5]);
  });

  it("turno 00:00→08:00 cobre horas 0..7", () => {
    const hours = blockHours({ startMinute: 0, endMinute: 480 });
    expect(hours).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("fmtMinutes — formatação HH:MM", () => {
  it("480 → '08:00'", () => expect(fmtMinutes(480)).toBe("08:00"));
  it("510 → '08:30'", () => expect(fmtMinutes(510)).toBe("08:30"));
  it("1080 → '18:00'", () => expect(fmtMinutes(1080)).toBe("18:00"));
  it("120 → '02:00'", () => expect(fmtMinutes(120)).toBe("02:00"));
  it("0 → '00:00'", () => expect(fmtMinutes(0)).toBe("00:00"));
  it("1439 → '23:59'", () => expect(fmtMinutes(1439)).toBe("23:59"));
});

describe("Receita cross-midnight — lógica de seleção do dia", () => {
  // Simula a lógica de seleção do dia para receita cross-midnight
  function getRevDate(block: { startMinute: number; endMinute: number }, h: number, workDate: string): string {
    const isAfterMidnight = block.endMinute <= block.startMinute && h < Math.floor(block.startMinute / 60);
    if (!isAfterMidnight) return workDate;
    const nd = new Date(workDate);
    nd.setDate(nd.getDate() + 1);
    return nd.toISOString().split("T")[0];
  }

  const noturno = { startMinute: 1080, endMinute: 120 }; // 18:00→02:00
  const normal  = { startMinute: 480,  endMinute: 960  }; // 08:00→16:00

  it("turno normal: todas as horas no mesmo dia", () => {
    for (const h of [8, 12, 15]) {
      expect(getRevDate(normal, h, "2026-08-07")).toBe("2026-08-07");
    }
  });

  it("turno noturno: horas 18-23 no dia de trabalho", () => {
    for (const h of [18, 20, 23]) {
      expect(getRevDate(noturno, h, "2026-08-07")).toBe("2026-08-07");
    }
  });

  it("turno noturno: horas 0-1 (pós-meia-noite) no dia seguinte", () => {
    for (const h of [0, 1]) {
      expect(getRevDate(noturno, h, "2026-08-07")).toBe("2026-08-08");
    }
  });

  it("turno noturno: hora 2 NÃO está no bloco (endMinute=120=2h), não é pós-meia-noite", () => {
    // blockHours para 18:00→02:00 = [18..23, 0, 1] — hora 2 não está no bloco
    // Mas se estivesse, seria pós-meia-noite? Não — a condição é h < startHour (18)
    // Hora 2 < 18 → seria pós-meia-noite (dia seguinte)
    expect(getRevDate(noturno, 2, "2026-08-07")).toBe("2026-08-08");
  });

  it("virada em 31/12 → dia seguinte é 01/01 do ano seguinte", () => {
    expect(getRevDate(noturno, 0, "2026-12-31")).toBe("2027-01-01");
  });
});
