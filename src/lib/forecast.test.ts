import { describe, expect, it } from "vitest";

import {
  draftSubscriptionInvoice,
  healthScore,
  normaliseSeries,
  projectRevenue,
  trend,
  type DayPoint,
} from "@/lib/forecast";

const day = (i: number, revenueMinor: number, kwh = 10, sessions = 2): DayPoint => ({
  day: `2026-08-${String(i).padStart(2, "0")}`,
  sessions,
  kwh,
  revenueMinor,
});

describe("normaliseSeries", () => {
  it("orders oldest first and drops malformed days", () => {
    const out = normaliseSeries([day(3, 100), { ...day(1, 100), day: "nope" }, day(2, 100)]);
    expect(out.map((d) => d.day)).toEqual(["2026-08-02", "2026-08-03"]);
  });
});

describe("trend", () => {
  it("is unknown with no data", () => {
    expect(trend([], (d) => d.revenueMinor).direction).toBe("unknown");
  });

  it("reports growth when the recent window beats the prior one", () => {
    const series = [
      ...Array.from({ length: 7 }, (_, i) => day(i + 1, 100_000)),
      ...Array.from({ length: 7 }, (_, i) => day(i + 8, 200_000)),
    ];
    const t = trend(series, (d) => d.revenueMinor);
    expect(t.recentPerDay).toBe(200_000);
    expect(t.priorPerDay).toBe(100_000);
    expect(t.changePct).toBe(100);
    expect(t.direction).toBe("up");
  });

  it("reads a small change as flat", () => {
    const series = [
      ...Array.from({ length: 7 }, (_, i) => day(i + 1, 100_000)),
      ...Array.from({ length: 7 }, (_, i) => day(i + 8, 102_000)),
    ];
    expect(trend(series, (d) => d.revenueMinor).direction).toBe("flat");
  });

  it("reports decline", () => {
    const series = [
      ...Array.from({ length: 7 }, (_, i) => day(i + 1, 200_000)),
      ...Array.from({ length: 7 }, (_, i) => day(i + 8, 100_000)),
    ];
    expect(trend(series, (d) => d.revenueMinor).direction).toBe("down");
  });
});

describe("projectRevenue", () => {
  it("refuses to project below a week of history", () => {
    const p = projectRevenue([day(1, 100_000), day(2, 100_000)], 30);
    expect(p.kind).toBe("insufficient_data");
    if (p.kind === "insufficient_data") expect(p.daysRequired).toBe(7);
  });

  it("projects from the trailing average and always carries a band", () => {
    const series = Array.from({ length: 14 }, (_, i) => day(i + 1, 100_000));
    const p = projectRevenue(series, 30);
    expect(p.kind).toBe("estimate");
    if (p.kind !== "estimate") return;
    expect(p.centralMinor).toBe(3_000_000);
    expect(p.lowMinor).toBeLessThan(p.centralMinor);
    expect(p.highMinor).toBeGreaterThan(p.centralMinor);
    expect(p.isEstimate).toBe(true);
  });

  it("never projects a negative floor", () => {
    const series = Array.from({ length: 10 }, (_, i) => day(i + 1, i === 0 ? 900_000 : 0));
    const p = projectRevenue(series, 30);
    if (p.kind !== "estimate") throw new Error("expected estimate");
    expect(p.lowMinor).toBeGreaterThanOrEqual(0);
  });
});

describe("healthScore", () => {
  it("refuses to score without charge points", () => {
    const s = healthScore({
      uptimePct: 99,
      utilisationPct: 30,
      revenuePerPilePerDayMinor: 1_000_000,
      openFaults: 0,
      chargePoints: 0,
    });
    expect(s.kind).toBe("insufficient_data");
  });

  it("refuses to score without measured availability", () => {
    const s = healthScore({
      uptimePct: null,
      utilisationPct: null,
      revenuePerPilePerDayMinor: null,
      openFaults: 0,
      chargePoints: 4,
    });
    expect(s.kind).toBe("insufficient_data");
  });

  it("scores a healthy portfolio green", () => {
    const s = healthScore({
      uptimePct: 99,
      utilisationPct: 30,
      revenuePerPilePerDayMinor: 3_500_000,
      openFaults: 0,
      chargePoints: 4,
    });
    if (s.kind !== "scored") throw new Error("expected a score");
    expect(s.band).toBe("green");
    expect(s.score).toBeGreaterThanOrEqual(75);
    expect(s.score).toBeLessThanOrEqual(100);
  });

  it("scores a faulted, idle portfolio red", () => {
    const s = healthScore({
      uptimePct: 40,
      utilisationPct: 1,
      revenuePerPilePerDayMinor: 0,
      openFaults: 4,
      chargePoints: 4,
    });
    if (s.kind !== "scored") throw new Error("expected a score");
    expect(s.band).toBe("red");
  });
});

describe("draftSubscriptionInvoice", () => {
  const pro = { priceMinorPerChargePoint: 20000, minMonthlyMinor: 100000, includedChargePoints: 5 };

  it("charges the plan minimum when inside the allowance", () => {
    const d = draftSubscriptionInvoice(pro, 3);
    expect(d.totalMinor).toBe(100000);
    expect(d.lines).toHaveLength(1);
  });

  it("bills only the charge points above the allowance", () => {
    const d = draftSubscriptionInvoice(pro, 8);
    expect(d.totalMinor).toBe(100000 + 3 * 20000);
    expect(d.lines[1]?.quantity).toBe(3);
  });

  it("never totals below the plan minimum", () => {
    const d = draftSubscriptionInvoice(
      { priceMinorPerChargePoint: 100, minMonthlyMinor: 50000, includedChargePoints: 0 },
      1,
    );
    expect(d.totalMinor).toBeGreaterThanOrEqual(50000);
    expect(d.totalMinor).toBe(50100);
  });

  it("charges the minimum even with no charge points at all", () => {
    const d = draftSubscriptionInvoice(pro, 0);
    expect(d.totalMinor).toBe(100000);
  });
});
