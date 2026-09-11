import { describe, expect, it } from "vitest";
import { EMPOWER } from "@/config/policy";
import {
  bankReadiness,
  contributionFloorMinor,
  discipline,
  financePlan,
  loanPosition,
  monthlyInstalmentMinor,
  netTotalMinor,
  splitAcrossPots,
  targetPerPeriodMinor,
  weeklyReport,
  weekKey,
  windowBack,
} from "./empower";

const PRICE = EMPOWER.vehiclePriceMinor.value; // RWF 22,500,000 in minor units

describe("deposit bridge", () => {
  it("grosses up to RWF 25,000,000 and fronts RWF 2,500,000 at zero contribution", () => {
    const plan = financePlan({ contributionMinor: 0 });
    expect(plan.financedTotalMinor).toBe(25_000_000 * 100);
    expect(plan.depositMinor).toBe(2_500_000 * 100);
    expect(plan.bridgeMinor).toBe(2_500_000 * 100);
  });

  it("keeps principal + contribution equal to the fixed vehicle price, always", () => {
    for (const units of [0, 500_000, 1_000_000, 2_250_000, 5_000_000, 22_500_000]) {
      const plan = financePlan({ contributionMinor: units * 100 });
      expect(plan.principalMinor + plan.contributionMinor).toBe(PRICE);
    }
  });

  it("needs no bridge once the client brings the whole deposit", () => {
    const plan = financePlan({ contributionMinor: 2_500_000 * 100 });
    expect(plan.bridgeMinor).toBe(0);
    expect(plan.financedTotalMinor).toBe(Math.round(((22_500_000 - 2_500_000) * 100 * 10_000) / 9_000));
    expect(plan.principalMinor).toBe(20_000_000 * 100);
  });

  it("carries the term, the collateral release month and a trace", () => {
    const plan = financePlan({ contributionMinor: 500_000 * 100 });
    expect(plan.termMonths).toBe(48);
    expect(plan.collateralReleaseMonth).toBe(24);
    expect(plan.trace.length).toBeGreaterThan(3);
  });

  it("rejects impossible inputs", () => {
    expect(() => financePlan({ contributionMinor: PRICE + 1 })).toThrow();
    expect(() => financePlan({ contributionMinor: 0, depositBps: 10_000 })).toThrow();
  });

  it("waives the cash floor only for a driver whose evidence scores high enough", () => {
    expect(contributionFloorMinor(null)).toBe(EMPOWER.minClientContributionMinor.value);
    expect(contributionFloorMinor(60)).toBe(EMPOWER.minClientContributionMinor.value);
    expect(contributionFloorMinor(85)).toBe(0);
  });
});

describe("instalments and targets", () => {
  it("amortises the principal over the term", () => {
    const instalment = monthlyInstalmentMinor(22_000_000 * 100, 48, 1800);
    expect(instalment).toBeGreaterThan((22_000_000 * 100) / 48);
    expect(instalment).toBeLessThan(22_000_000 * 100);
  });

  it("splits evenly at zero interest and returns zero for no principal", () => {
    expect(monthlyInstalmentMinor(1_200_000 * 100, 48, 0)).toBe((1_200_000 * 100) / 48);
    expect(monthlyInstalmentMinor(0)).toBe(0);
    expect(() => monthlyInstalmentMinor(100, 0)).toThrow();
  });

  it("turns a monthly instalment into a daily taxi target", () => {
    const monthly = 1_200_000 * 100;
    expect(targetPerPeriodMinor(monthly, "daily")).toBe(Math.ceil(monthly / 28));
    expect(targetPerPeriodMinor(monthly, "monthly")).toBe(monthly);
    expect(targetPerPeriodMinor(monthly, "weekly")).toBeGreaterThan(
      targetPerPeriodMinor(monthly, "daily"),
    );
    expect(targetPerPeriodMinor(monthly, "per_contract", { daysUntilContractPayment: 7 })).toBe(
      Math.ceil(monthly / 7),
    );
  });

  it("splits a target across pots without losing a franc", () => {
    const rows = splitAcrossPots(10_000, [
      { id: "loan", weightBps: 6000 },
      { id: "maint", weightBps: 2000 },
      { id: "me", weightBps: 2000 },
    ]);
    expect(rows.reduce((s, r) => s + r.amountMinor, 0)).toBe(10_000);
    expect(rows[0]?.amountMinor).toBe(6000);
    expect(splitAcrossPots(10_000, [])).toEqual([]);
  });
});

describe("discipline from recorded payments", () => {
  const today = "2026-09-08";
  const target = 40_000 * 100;

  it("counts a missed day as zero and reports days behind", () => {
    const entries = [
      { occurredOn: "2026-09-06", amountMinor: target },
      { occurredOn: "2026-09-07", amountMinor: target },
      // nothing on the 8th
    ];
    const d = discipline({ entries, dailyTargetMinor: target, today, windowDays: 3 });
    expect(d.daysOnTarget).toBe(2);
    expect(d.daysRecorded).toBe(2);
    expect(d.daysAhead).toBe(-1);
    expect(d.streakDays).toBe(0);
    expect(d.disciplinePct).toBe(67);
  });

  it("reports days ahead and a live streak", () => {
    const entries = windowBack(today, 4).map((occurredOn) => ({
      occurredOn,
      amountMinor: target * 2,
    }));
    const d = discipline({ entries, dailyTargetMinor: target, today, windowDays: 4 });
    expect(d.daysAhead).toBe(4);
    expect(d.streakDays).toBe(4);
    expect(d.disciplinePct).toBe(100);
  });

  it("subtracts reversals instead of allowing an edit", () => {
    const entries = [
      { occurredOn: "2026-09-08", amountMinor: 50_000 },
      { occurredOn: "2026-09-08", amountMinor: 20_000, kind: "reversal" as const },
    ];
    expect(netTotalMinor(entries)).toBe(30_000);
  });

  it("says nothing is measurable with no records", () => {
    const d = discipline({ entries: [], dailyTargetMinor: target, today, windowDays: 7 });
    expect(d.measurable).toBe(false);
    expect(d.disciplinePct).toBe(0);
  });

  it("groups weeks from Monday, newest first", () => {
    expect(weekKey("2026-09-08")).toBe(weekKey("2026-09-07"));
    const rows = weeklyReport({
      entries: [{ occurredOn: "2026-09-08", amountMinor: target * 6 }],
      dailyTargetMinor: target,
      today,
      weeks: 2,
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.weekStart).toBe(weekKey(today));
    expect(rows[0]?.daysRecorded).toBe(1);
  });
});

describe("bank readiness", () => {
  it("scores a disciplined, fully trained driver green and clears zero contribution", () => {
    const r = bankReadiness({
      requiredTrainingCount: 3,
      completedRequiredTrainingCount: 3,
      disciplinePct: 100,
      recordDays: 120,
      missedInstalments: 0,
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe("green");
    expect(r.qualifiesForZeroContribution).toBe(true);
  });

  it("refuses to score anything without a record", () => {
    const r = bankReadiness({
      requiredTrainingCount: 3,
      completedRequiredTrainingCount: 3,
      disciplinePct: 0,
      recordDays: 0,
      missedInstalments: 0,
    });
    expect(r.measurable).toBe(false);
    expect(r.score).toBe(0);
    expect(r.qualifiesForZeroContribution).toBe(false);
  });

  it("holds back a driver with unfinished training even when saving well", () => {
    const r = bankReadiness({
      requiredTrainingCount: 3,
      completedRequiredTrainingCount: 2,
      disciplinePct: 100,
      recordDays: 120,
      missedInstalments: 0,
    });
    expect(r.qualifiesForZeroContribution).toBe(false);
    expect(r.reasons).toContain("Required training not finished.");
  });
});

describe("loan position", () => {
  it("measures months elapsed, arrears and collateral release", () => {
    const instalment = 500_000 * 100;
    const p = loanPosition({
      principalMinor: 22_000_000 * 100,
      instalmentMinor: instalment,
      paidToDateMinor: instalment * 4,
      startOn: "2026-01-08",
      today: "2026-09-08",
      termMonths: 48,
    });
    expect(p.monthsElapsed).toBe(8);
    expect(p.missedInstalments).toBe(4);
    expect(p.collateralReleased).toBe(false);
    expect(p.monthsToCollateralRelease).toBe(16);
  });

  it("releases collateral at month 24", () => {
    const p = loanPosition({
      principalMinor: 100,
      instalmentMinor: 10,
      paidToDateMinor: 240,
      startOn: "2024-09-08",
      today: "2026-09-08",
    });
    expect(p.monthsElapsed).toBe(24);
    expect(p.collateralReleased).toBe(true);
    expect(p.aheadMinor).toBe(0);
  });
});
