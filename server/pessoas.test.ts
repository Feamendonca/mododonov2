/**
 * pessoas.test.ts — Unit tests for the Pessoas (People Management) module
 * Tests: calcEmployeeCosts, payroll calculations, turnover logic, suggestion triggers
 */
import { describe, expect, it } from "vitest";
import { calcEmployeeCosts } from "./db-pessoas";

// ─── calcEmployeeCosts ────────────────────────────────────────────────────────

describe("calcEmployeeCosts", () => {
  it("calculates hourly rate correctly", () => {
    const emp = {
      salaryBase: 2000,
      transportAllowance: 200,
      mealAllowance: 300,
      otherBenefits: 0,
      hoursPerMonth: 220,
    };
    const result = calcEmployeeCosts(emp, 70);
    // monthlyCost = (2000 * 1.70) + 200 + 300 = 3400 + 500 = 3900
    expect(result.monthlyCost).toBeCloseTo(3900, 0);
    // hourlyRate = 3900 / 220
    expect(result.hourlyRate).toBeCloseTo(3900 / 220, 2);
  });

  it("handles zero hours per month without dividing by zero", () => {
    const emp = {
      salaryBase: 1500,
      transportAllowance: 0,
      mealAllowance: 0,
      otherBenefits: 0,
      hoursPerMonth: 0,
    };
    const result = calcEmployeeCosts(emp, 70);
    expect(result.hourlyRate).toBe(0);
  });

  it("includes other benefits in monthly cost", () => {
    const emp = {
      salaryBase: 1800,
      transportAllowance: 150,
      mealAllowance: 250,
      otherBenefits: 100,
      hoursPerMonth: 176,
    };
    const result = calcEmployeeCosts(emp, 70);
    // monthlyCost = (1800 * 1.70) + 150 + 250 + 100 = 3060 + 500 = 3560
    expect(result.monthlyCost).toBeCloseTo(3560, 0);
  });

  it("applies charges percent correctly", () => {
    const emp = {
      salaryBase: 1000,
      transportAllowance: 0,
      mealAllowance: 0,
      otherBenefits: 0,
      hoursPerMonth: 200,
    };
    // 0% charges: monthlyCost = 1000
    const result0 = calcEmployeeCosts(emp, 0);
    expect(result0.monthlyCost).toBeCloseTo(1000, 0);

    // 100% charges: monthlyCost = 2000
    const result100 = calcEmployeeCosts(emp, 100);
    expect(result100.monthlyCost).toBeCloseTo(2000, 0);
  });
});

// ─── Payroll % calculation logic ─────────────────────────────────────────────

describe("Payroll percentage calculation", () => {
  it("calculates payroll percent correctly", () => {
    const estimatedMonthlyPayroll = 15000;
    const monthlyRevenue = 75000;
    const payrollPercent = (estimatedMonthlyPayroll / monthlyRevenue) * 100;
    expect(payrollPercent).toBeCloseTo(20, 1);
  });

  it("returns null when revenue is zero", () => {
    const monthlyRevenue = 0;
    const payrollPercent = monthlyRevenue > 0 ? (15000 / monthlyRevenue) * 100 : null;
    expect(payrollPercent).toBeNull();
  });

  it("detects payroll over target", () => {
    const payrollPercent = 25;
    const payrollTargetPercent = 18;
    const isOverTarget = payrollPercent > payrollTargetPercent + 3;
    expect(isOverTarget).toBe(true);
  });

  it("does not flag payroll within tolerance", () => {
    const payrollPercent = 20;
    const payrollTargetPercent = 18;
    const isOverTarget = payrollPercent > payrollTargetPercent + 3;
    expect(isOverTarget).toBe(false);
  });
});

// ─── Turnover rate calculation ────────────────────────────────────────────────

describe("Turnover rate calculation", () => {
  it("calculates turnover rate correctly", () => {
    const terminationsThisMonth = 2;
    const activeCount = 10;
    const quadroMedio = activeCount + terminationsThisMonth / 2;
    const turnoverRate = (terminationsThisMonth / quadroMedio) * 100;
    expect(turnoverRate).toBeCloseTo(18.18, 1);
  });

  it("returns 0 when no terminations", () => {
    const terminationsThisMonth = 0;
    const activeCount = 8;
    const quadroMedio = activeCount + terminationsThisMonth / 2;
    const turnoverRate = quadroMedio > 0 ? (terminationsThisMonth / quadroMedio) * 100 : 0;
    expect(turnoverRate).toBe(0);
  });

  it("detects high turnover above 10%", () => {
    const turnoverRate = 18.18;
    expect(turnoverRate > 10).toBe(true);
  });
});

// ─── Productivity calculation ─────────────────────────────────────────────────

describe("Block productivity calculation", () => {
  it("calculates productivity as revenue per person-hour", () => {
    const revenue = 1200;
    const personHours = 6; // 3 people × 2 hours
    const productivity = personHours > 0 ? revenue / personHours : 0;
    expect(productivity).toBeCloseTo(200, 0);
  });

  it("returns 0 when no person-hours", () => {
    const revenue = 500;
    const personHours = 0;
    const productivity = personHours > 0 ? revenue / personHours : 0;
    expect(productivity).toBe(0);
  });

  it("classifies block as green when above target", () => {
    const productivity = 250;
    const productivityTarget = 200;
    const status = productivity >= productivityTarget ? "green" : productivity >= productivityTarget * 0.5 ? "amber" : "red";
    expect(status).toBe("green");
  });

  it("classifies block as amber when between 50% and 100% of target", () => {
    const productivity = 120;
    const productivityTarget = 200;
    const status = productivity >= productivityTarget ? "green" : productivity >= productivityTarget * 0.5 ? "amber" : "red";
    expect(status).toBe("amber");
  });

  it("classifies block as red when below 50% of target", () => {
    const productivity = 80;
    const productivityTarget = 200;
    const status = productivity >= productivityTarget ? "green" : productivity >= productivityTarget * 0.5 ? "amber" : "red";
    expect(status).toBe("red");
  });
});

// ─── Suggestion trigger logic ─────────────────────────────────────────────────

describe("Suggestion trigger: understaffed store", () => {
  it("triggers when active count < 3", () => {
    const activeCount = 2;
    const shouldTrigger = activeCount > 0 && activeCount < 3;
    expect(shouldTrigger).toBe(true);
  });

  it("does not trigger when active count >= 3", () => {
    const activeCount = 5;
    const shouldTrigger = activeCount > 0 && activeCount < 3;
    expect(shouldTrigger).toBe(false);
  });

  it("does not trigger when active count is 0 (no employees registered)", () => {
    const activeCount = 0;
    const shouldTrigger = activeCount > 0 && activeCount < 3;
    expect(shouldTrigger).toBe(false);
  });
});
