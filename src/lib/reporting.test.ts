import { describe, expect, it } from "vitest";

import {
  chargePointEnergy,
  energyPerSite,
  loadProfile,
  peakDemand,
  reportTotals,
  revenueBreakdown,
  sessionProfiles,
  type ChargePointRef,
  type MeterSample,
  type SessionRecord,
} from "@/lib/reporting";
import { segmentIndexLocal } from "@/lib/time";

const MIN = 60_000;
const base = Date.UTC(2026, 8, 1, 8, 0, 0); // 10:00 Kigali

function sample(over: Partial<MeterSample>): MeterSample {
  return {
    atMs: base,
    siteId: "site-a",
    siteName: "Kiyovu",
    connectorId: "gun-1",
    powerKw: 60,
    ...over,
  };
}

function session(over: Partial<SessionRecord>): SessionRecord {
  return {
    id: "s1",
    serialNo: "UZA-1",
    siteId: "site-a",
    siteName: "Kiyovu",
    stationName: "Kiyovu DC",
    connectorLabel: "Gun A",
    connectorType: "CCS2",
    startedAtMs: base,
    endedAtMs: base + 30 * MIN,
    kwh: 30,
    totalMinor: 1_500_000,
    socStart: 20,
    socEnd: 70,
    startMethod: "app",
    status: "completed",
    ...over,
  };
}

describe("peakDemand", () => {
  it("adds up piles drawing at the same minute", () => {
    const rows = peakDemand([
      sample({ connectorId: "gun-1", powerKw: 60 }),
      sample({ connectorId: "gun-2", powerKw: 90 }),
      sample({ atMs: base + 40 * MIN, connectorId: "gun-1", powerKw: 120 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.peakKw).toBe(150);
    expect(rows[0]!.peakIntervalStartMs).toBe(base);
  });

  it("counts one pile once per minute, at its highest reading", () => {
    const rows = peakDemand([
      sample({ powerKw: 40 }),
      sample({ atMs: base + 20_000, powerKw: 55 }),
    ]);
    expect(rows[0]!.peakKw).toBe(55);
  });

  it("ignores zero and negative readings and reports nothing when unmetered", () => {
    expect(peakDemand([sample({ powerKw: 0 }), sample({ powerKw: -5 })])).toEqual([]);
  });

  it("keeps sites separate and ranks by peak", () => {
    const rows = peakDemand([
      sample({ siteId: "site-a", powerKw: 40 }),
      sample({ siteId: "site-b", siteName: "Nyabugogo", powerKw: 180 }),
    ]);
    expect(rows.map((r) => r.siteId)).toEqual(["site-b", "site-a"]);
  });
});

describe("energyPerSite", () => {
  it("totals measured energy and revenue and attaches the metered peak", () => {
    const rows = energyPerSite([session({}), session({ id: "s2", kwh: 10, totalMinor: 500_000 })], [sample({ powerKw: 75 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessions: 2, kwh: 40, revenueMinor: 2_000_000, peakKw: 75 });
  });

  it("reports a null peak for a site with sessions but no meter samples", () => {
    const rows = energyPerSite([session({})], []);
    expect(rows[0]!.peakKw).toBeNull();
    expect(rows[0]!.samples).toBe(0);
  });

  it("still lists a metered site that closed no session", () => {
    const rows = energyPerSite([], [sample({ siteId: "site-c", siteName: "Kicukiro", powerKw: 22 })]);
    expect(rows[0]).toMatchObject({ siteId: "site-c", sessions: 0, kwh: 0, peakKw: 22 });
  });
});

describe("loadProfile", () => {
  it("buckets coincident demand into local half-hours", () => {
    const profile = loadProfile(
      [
        sample({ powerKw: 60 }),
        sample({ atMs: base + 5 * MIN, powerKw: 40 }),
        sample({ atMs: base + 40 * MIN, powerKw: 100 }),
      ],
      segmentIndexLocal,
    );
    expect(profile).toHaveLength(2);
    expect(profile[0]).toMatchObject({ segment: 20, meanKw: 50, maxKw: 60, samples: 2 });
    expect(profile[1]).toMatchObject({ segment: 21, meanKw: 100 });
  });
});

describe("sessionProfiles", () => {
  it("derives duration and mean power from recorded values only", () => {
    const [row] = sessionProfiles([session({})]);
    expect(row).toMatchObject({ durationMinutes: 30, kwh: 30, meanKw: 60 });
  });

  it("leaves an open session without a duration or mean power", () => {
    const [row] = sessionProfiles([session({ endedAtMs: null, status: "charging" })]);
    expect(row!.durationMinutes).toBeNull();
    expect(row!.meanKw).toBeNull();
  });

  it("returns newest first", () => {
    const rows = sessionProfiles([session({ id: "old", startedAtMs: base - 60 * MIN }), session({ id: "new" })]);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("reportTotals", () => {
  it("totals measured figures and leaves unmeasured ones null", () => {
    const sessions = [session({})];
    const totals = reportTotals(energyPerSite(sessions, [sample({ powerKw: 90 })]), sessionProfiles(sessions));
    expect(totals).toMatchObject({ sites: 1, sessions: 1, kwh: 30, revenueMinor: 1_500_000, peakKw: 90, meanSessionMinutes: 30 });
  });

  it("reports no peak when nothing was metered", () => {
    const totals = reportTotals(energyPerSite([session({})], []), sessionProfiles([session({})]));
    expect(totals.peakKw).toBeNull();
  });
});

function chargePoint(over: Partial<ChargePointRef> = {}): ChargePointRef {
  return {
    chargerId: "cp-1",
    serial: "UZA-KH-180-01",
    ocppIdentity: "UZA-KH-180-01",
    vendor: "UZA",
    model: "180DC",
    stationName: "Kiyovu hub",
    siteId: "site-a",
    siteName: "Kiyovu",
    ownerName: "Kigali PowerDrive",
    powerType: "dc",
    ratedKw: 180,
    connectors: 2,
    status: "online",
    lastSeenAtMs: base,
    ...over,
  };
}

describe("chargePointEnergy", () => {
  it("keeps every registered pile, including one that reported nothing", () => {
    const rows = chargePointEnergy(
      [chargePoint(), chargePoint({ chargerId: "cp-2", serial: "UZA-KH-180-02", lastSeenAtMs: null })],
      [session({ chargerId: "cp-1" })],
      [sample({ chargerId: "cp-1", powerKw: 120 })],
    );
    expect(rows).toHaveLength(2);
    const silent = rows.find((r) => r.chargerId === "cp-2")!;
    expect(silent).toMatchObject({ sessions: 0, kwh: 0, peakKw: null, samples: 0, lastSeenAtMs: null });
  });

  it("sums energy, revenue and coincident peak per charge point", () => {
    const [row] = chargePointEnergy(
      [chargePoint()],
      [session({ chargerId: "cp-1" }), session({ id: "s2", chargerId: "cp-1", kwh: 10, totalMinor: 500_000 })],
      [
        sample({ chargerId: "cp-1", connectorId: "gun-1", powerKw: 90 }),
        sample({ chargerId: "cp-1", connectorId: "gun-2", powerKw: 60 }),
      ],
    );
    expect(row).toMatchObject({ sessions: 2, kwh: 40, revenueMinor: 2_000_000, peakKw: 150 });
  });
});

describe("revenueBreakdown", () => {
  it("splits revenue into the components the tariff charged for", () => {
    const rev = revenueBreakdown([
      session({ totalMinor: 1_000_000, energyMinor: 800_000, timeMinor: 100_000, sessionFeeMinor: 50_000, idleMinor: 50_000, idleMinutes: 5 }),
    ]);
    expect(rev).toMatchObject({
      energyMinor: 800_000,
      timeMinor: 100_000,
      sessionFeeMinor: 50_000,
      idleMinor: 50_000,
      idleMinutes: 5,
      totalMinor: 1_000_000,
      unattributedMinor: 0,
      unpricedSessions: 0,
    });
  });

  it("reports a closed session that was never priced instead of hiding it", () => {
    const rev = revenueBreakdown([session({ totalMinor: 0 })]);
    expect(rev.unpricedSessions).toBe(1);
    expect(rev.totalMinor).toBe(0);
  });

  it("shows a legacy total with no components as unattributed, never invented", () => {
    const rev = revenueBreakdown([session({ totalMinor: 400_000 })]);
    expect(rev.unattributedMinor).toBe(400_000);
  });
});
