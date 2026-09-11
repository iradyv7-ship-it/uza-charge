import { describe, expect, it } from "vitest";

import { TARIFF_DEFAULTS, UPTIME_TARGETS } from "@/config/policy";
import { formatRwf, toMinor } from "@/lib/money";
import {
  defaultRevenueSplitRule,
  defaultTariffVersion,
  energyRateMinorPerKwh,
  priceSession,
  reconcilePreauth,
  segmentIndexForMinuteOfDay,
  selectTariffVersion,
  splitEnergyByTier,
  splitRevenue,
  uptimeVerdict,
  type MeterSample,
  type TariffVersion,
} from "@/lib/pricing";

const MIN = 60_000;

/** All samples land at 12:00–13:00 local unless a test says otherwise. */
const noonMinuteOfDay = (atMs: number) => 12 * 60 + Math.floor(atMs / MIN);

function samples(...cumulative: number[]): MeterSample[] {
  return cumulative.map((kwh, i) => ({ atMs: i * 5 * MIN, cumulativeKwh: kwh }));
}

describe("money formatting", () => {
  it("renders whole RWF with grouping and no decimals", () => {
    expect(formatRwf(toMinor(1234))).toBe("RWF 1,234");
    expect(formatRwf(toMinor(0))).toBe("RWF 0");
    expect(formatRwf(toMinor(22_500_000))).toBe("RWF 22,500,000");
  });

  it("treats null and undefined as zero", () => {
    expect(formatRwf(null)).toBe("RWF 0");
    expect(formatRwf(undefined)).toBe("RWF 0");
  });
});

describe("time-of-use segments", () => {
  it("maps minute-of-day onto 48 half-hour segments", () => {
    expect(segmentIndexForMinuteOfDay(0)).toBe(0);
    expect(segmentIndexForMinuteOfDay(29)).toBe(0);
    expect(segmentIndexForMinuteOfDay(30)).toBe(1);
    expect(segmentIndexForMinuteOfDay(1439)).toBe(47);
    expect(segmentIndexForMinuteOfDay(1440)).toBe(0);
    expect(segmentIndexForMinuteOfDay(-30)).toBe(47);
  });

  it("falls back to the standard tier for unmapped segments", () => {
    const tariff = defaultTariffVersion();
    expect(energyRateMinorPerKwh(tariff, "standard")).toBe(TARIFF_DEFAULTS.energyMinorPerKwh.value);
  });

  it("applies tier multipliers to the energy rate", () => {
    const tariff: TariffVersion = {
      ...defaultTariffVersion(),
      energyMinorPerKwh: 30_000,
      tierMultipliers: { peak: 1.25, valley: 0.75 },
    };
    expect(energyRateMinorPerKwh(tariff, "peak")).toBe(37_500);
    expect(energyRateMinorPerKwh(tariff, "valley")).toBe(22_500);
  });

  it("splits energy across a tier boundary instead of billing it all at one rate", () => {
    // Segment 24 = 12:00–12:30 (peak), segment 25 = 12:30–13:00 (standard).
    const tariff: TariffVersion = {
      ...defaultTariffVersion(),
      segments: { 24: "peak", 25: "standard" },
    };
    const readings: MeterSample[] = [
      { atMs: 0, cumulativeKwh: 0 }, // 12:00
      { atMs: 20 * MIN, cumulativeKwh: 10 }, // 12:20 → peak
      { atMs: 40 * MIN, cumulativeKwh: 25 }, // 12:40 → standard
    ];
    const perTier = splitEnergyByTier(readings, tariff, noonMinuteOfDay);
    expect(perTier.get("peak")).toBe(10);
    expect(perTier.get("standard")).toBe(15);
  });
});

describe("priceSession", () => {
  const tariff: TariffVersion = {
    ...defaultTariffVersion("v1"),
    energyMinorPerKwh: toMinor(320),
    timeMinorPerMinute: toMinor(5),
    sessionFeeMinor: toMinor(200),
    idleFeeMinorPerMinute: toMinor(100),
    idleGraceMinutes: 10,
  };

  it("prices metered energy, time and the session fee", () => {
    const charge = priceSession({
      samples: samples(0, 10, 20),
      tariff,
      minuteOfDayAt: noonMinuteOfDay,
      chargingMinutes: 30,
    });
    expect(charge.energyKwh).toBe(20);
    expect(charge.energyMinor).toBe(toMinor(20 * 320));
    expect(charge.timeMinor).toBe(toMinor(30 * 5));
    expect(charge.sessionFeeMinor).toBe(toMinor(200));
    expect(charge.idleMinor).toBe(0);
    expect(charge.totalMinor).toBe(toMinor(6400 + 150 + 200));
    expect(charge.tariffVersionId).toBe("v1");
  });

  it("charges nothing when a session never delivered energy or time", () => {
    const charge = priceSession({
      samples: samples(0),
      tariff,
      minuteOfDayAt: noonMinuteOfDay,
      chargingMinutes: 0,
    });
    expect(charge.totalMinor).toBe(0);
    expect(charge.sessionFeeMinor).toBe(0);
  });

  it("ignores a non-monotonic meter register instead of billing negative energy", () => {
    const charge = priceSession({
      samples: samples(0, 10, 8, 12),
      tariff,
      minuteOfDayAt: noonMinuteOfDay,
      chargingMinutes: 15,
    });
    expect(charge.energyKwh).toBe(14); // 10 + 0 + 4
  });

  describe("idle fee grace", () => {
    const idle = (idleMinutes: number) =>
      priceSession({
        samples: samples(0, 5),
        tariff,
        minuteOfDayAt: noonMinuteOfDay,
        chargingMinutes: 10,
        idleMinutes,
      });

    it("is free inside the grace window", () => {
      expect(idle(10).billedIdleMinutes).toBe(0);
      expect(idle(10).idleMinor).toBe(0);
    });

    it("bills only the minutes beyond grace", () => {
      expect(idle(11).billedIdleMinutes).toBe(1);
      expect(idle(11).idleMinor).toBe(toMinor(100));
      expect(idle(40).idleMinor).toBe(toMinor(30 * 100));
    });
  });
});

describe("selectTariffVersion — effective dating, never retroactive", () => {
  const v1: TariffVersion = {
    ...defaultTariffVersion("v1"),
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2026-06-01T00:00:00.000Z",
  };
  const v2: TariffVersion = {
    ...defaultTariffVersion("v2"),
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveTo: null,
  };

  it("prices a session with the version in force at its start", () => {
    expect(selectTariffVersion([v1, v2], Date.parse("2026-03-04T10:00:00Z"))?.id).toBe("v1");
    expect(selectTariffVersion([v1, v2], Date.parse("2026-08-04T10:00:00Z"))?.id).toBe("v2");
  });

  it("treats effectiveFrom as inclusive and effectiveTo as exclusive", () => {
    expect(selectTariffVersion([v1, v2], Date.parse("2026-06-01T00:00:00Z"))?.id).toBe("v2");
  });

  it("never applies a future version to an earlier session", () => {
    expect(selectTariffVersion([v2], Date.parse("2026-02-01T00:00:00Z"))).toBeNull();
  });
});

describe("reconcilePreauth", () => {
  it("captures the used amount and refunds the balance of the hold", () => {
    expect(reconcilePreauth(toMinor(15_000), toMinor(6_400))).toEqual({
      captureMinor: toMinor(6_400),
      refundMinor: toMinor(8_600),
      shortfallMinor: 0,
    });
  });

  it("captures the whole hold and reports a shortfall when the session overran", () => {
    expect(reconcilePreauth(toMinor(15_000), toMinor(19_000))).toEqual({
      captureMinor: toMinor(15_000),
      refundMinor: 0,
      shortfallMinor: toMinor(4_000),
    });
  });

  it("refunds everything when nothing was delivered", () => {
    expect(reconcilePreauth(toMinor(15_000), 0)).toEqual({
      captureMinor: 0,
      refundMinor: toMinor(15_000),
      shortfallMinor: 0,
    });
  });
});

describe("splitRevenue", () => {
  const rule = { version: 1, energyCostMinorPerKwh: toMinor(215), hostShareBps: 7000, platformShareBps: 3000 };

  it("settles energy cost first, then splits the net margin by basis points", () => {
    const split = splitRevenue(toMinor(32_000), 100, rule);
    expect(split.energyCostMinor).toBe(toMinor(21_500));
    expect(split.netMarginMinor).toBe(toMinor(10_500));
    expect(split.hostMinor).toBe(toMinor(7_350));
    expect(split.platformMinor).toBe(toMinor(3_150));
  });

  it("always sums the parts back to gross, remainder to the platform", () => {
    for (const gross of [1, 7, 999, 100_003]) {
      const split = splitRevenue(gross, 0, rule);
      expect(split.hostMinor + split.platformMinor + split.energyCostMinor).toBe(split.grossMinor);
    }
  });

  it("never lets energy cost exceed gross revenue", () => {
    const split = splitRevenue(toMinor(1_000), 100, rule);
    expect(split.energyCostMinor).toBe(toMinor(1_000));
    expect(split.netMarginMinor).toBe(0);
    expect(split.hostMinor).toBe(0);
  });

  it("pins the rule version it settled under", () => {
    expect(splitRevenue(toMinor(1_000), 0, defaultRevenueSplitRule()).ruleVersion).toBe(
      defaultRevenueSplitRule().version,
    );
  });
});

describe("uptimeVerdict — honest or silent", () => {
  const hours = (h: number) => h * 3600;

  it("refuses to state a number below the minimum observation window", () => {
    const verdict = uptimeVerdict(hours(2), hours(2), UPTIME_TARGETS_VALUES);
    expect(verdict.status).toBe("insufficient_data");
  });

  it("reports green at or above the target", () => {
    const verdict = uptimeVerdict(hours(99), hours(100), UPTIME_TARGETS_VALUES);
    expect(verdict).toMatchObject({ status: "green", uptimePct: 99 });
  });

  it("reports amber between the two thresholds and red below", () => {
    expect(uptimeVerdict(hours(96), hours(100), UPTIME_TARGETS_VALUES).status).toBe("amber");
    expect(uptimeVerdict(hours(90), hours(100), UPTIME_TARGETS_VALUES).status).toBe("red");
  });

  it("says insufficient data rather than 0% when nothing was observed", () => {
    expect(uptimeVerdict(0, 0, UPTIME_TARGETS_VALUES).status).toBe("insufficient_data");
  });
});

const UPTIME_TARGETS_VALUES = {
  greenAtOrAbovePct: UPTIME_TARGETS.greenAtOrAbovePct.value,
  amberAtOrAbovePct: UPTIME_TARGETS.amberAtOrAbovePct.value,
  minObservationHours: UPTIME_TARGETS.minObservationHours.value,
};
