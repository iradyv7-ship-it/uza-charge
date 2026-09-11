/**
 * Regression cover for the regulator exports.
 *
 * A small seeded dataset is derived by hand, then every figure the panel shows
 * and every figure the CSVs carry is checked against it: energy per site, kWh
 * totals, RWF totals and session-profile aggregation must all reconcile with the
 * measured meter samples. If an export ever starts padding, smoothing or
 * double-counting, these tests fail.
 */
import { describe, expect, it } from "vitest";

import {
  energyPerSite,
  loadProfile,
  peakDemand,
  reportTotals,
  revenueBreakdown,
  sessionProfiles,
  type MeterSample,
  type SessionRecord,
} from "@/lib/reporting";
import {
  energyPerSiteCsv,
  loadProfileCsv,
  peakDemandCsv,
  sessionProfilesCsv,
} from "@/lib/report-export";
import type { RegulatorReport } from "@/lib/reporting.functions";

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

const T0 = Date.parse("2026-09-01T08:00:00+02:00"); // 08:00 Kigali → segment 16

function session(over: Partial<SessionRecord> & { id: string; siteId: string }): SessionRecord {
  return {
    serialNo: `S-${over.id}`,
    siteName: over.siteId === "site-a" ? "Kigali Heights" : "Nyabugogo Depot",
    stationName: "Station 1",
    connectorLabel: "A1",
    connectorType: "ccs2",
    startedAtMs: T0,
    endedAtMs: T0 + 60 * 60_000,
    kwh: 10,
    totalMinor: 1_000_000,
    socStart: 20,
    socEnd: 80,
    startMethod: "app",
    status: "completed",
    ...over,
  } as SessionRecord;
}

/** Two sites: A has two metered sessions, B has one session and no telemetry. */
const SESSIONS: SessionRecord[] = [
  session({ id: "1", siteId: "site-a", kwh: 42.5, totalMinor: 1_234_500, endedAtMs: T0 + 30 * 60_000 }),
  session({
    id: "2",
    siteId: "site-a",
    kwh: 17.25,
    totalMinor: 555_500,
    connectorLabel: "A2",
    startedAtMs: T0 + 15 * 60_000,
    endedAtMs: T0 + 75 * 60_000,
  }),
  session({
    id: "3",
    siteId: "site-b",
    kwh: 5,
    totalMinor: 150_000,
    startedAtMs: T0 + 3 * 3_600_000,
    endedAtMs: null,
    status: "charging",
  }),
];

/**
 * Site A: pile A1 draws 60 kW at 08:00 and 08:10, pile A2 draws 40 kW at 08:10
 * and 30 kW at 08:20. The coincident maximum is therefore 100 kW inside the
 * 08:00–08:30 half hour, and no other interval is metered.
 */
const SAMPLES: MeterSample[] = [
  { atMs: T0, siteId: "site-a", siteName: "Kigali Heights", connectorId: "c-a1", powerKw: 60 },
  { atMs: T0 + 10 * 60_000, siteId: "site-a", siteName: "Kigali Heights", connectorId: "c-a1", powerKw: 60 },
  { atMs: T0 + 10 * 60_000, siteId: "site-a", siteName: "Kigali Heights", connectorId: "c-a2", powerKw: 40 },
  { atMs: T0 + 20 * 60_000, siteId: "site-a", siteName: "Kigali Heights", connectorId: "c-a2", powerKw: 30 },
];

/** The same half-hour mapping the server uses, pinned to Kigali (UTC+2). */
const segmentOf = (atMs: number) => {
  const local = new Date(atMs + 120 * 60_000);
  return local.getUTCHours() * 2 + (local.getUTCMinutes() >= 30 ? 1 : 0);
};

function buildReport(): RegulatorReport {
  const sites = energyPerSite(SESSIONS, SAMPLES);
  const profiles = sessionProfiles(SESSIONS);
  return {
    timezone: "Africa/Kigali",
    generatedAtMs: T0,
    fromMs: T0 - 86_400_000,
    toMs: T0 + 86_400_000,
    scope: { ownerId: null, ownerName: null, owners: [], sites: [], siteIds: [] },
    totals: reportTotals(sites, profiles),
    sites,
    peaks: peakDemand(SAMPLES),
    profile: loadProfile(SAMPLES, segmentOf),
    sessions: profiles,
    chargePoints: [],
    revenue: revenueBreakdown(SESSIONS),
    tariffs: [],
    counts: {
      meterSamples: SAMPLES.length,
      sessions: SESSIONS.length,
      chargePoints: 0,
      truncated: false,
    },
  };
}

/** Minimal CSV reader: the exports never quote a newline inside a field. */
function parseCsv(csv: string): string[][] {
  return csv
    .trim()
    .split("\n")
    .map((line) =>
      (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])
        .map((c) => c.replace(/,$/, ""))
        .filter((_, i, arr) => i < arr.length - 1 || arr[i] !== "")
        .map((c) => (c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c)),
    );
}

/* ------------------------------------------------------------------ */

describe("regulator export reconciles with the measured rows", () => {
  const report = buildReport();

  it("energy per site sums exactly the session kWh of that site", () => {
    const a = report.sites.find((s) => s.siteId === "site-a")!;
    const b = report.sites.find((s) => s.siteId === "site-b")!;
    expect(a.kwh).toBe(59.75); // 42.5 + 17.25
    expect(a.sessions).toBe(2);
    expect(b.kwh).toBe(5);
    expect(b.sessions).toBe(1);
  });

  it("RWF per site sums exactly the session minor units, with no float drift", () => {
    const a = report.sites.find((s) => s.siteId === "site-a")!;
    expect(a.revenueMinor).toBe(1_234_500 + 555_500);
    expect(Number.isInteger(a.revenueMinor)).toBe(true);
    expect(report.totals.revenueMinor).toBe(1_234_500 + 555_500 + 150_000);
  });

  it("totals equal the sum over sites, not a separate calculation", () => {
    expect(report.totals.kwh).toBe(64.75);
    expect(report.totals.kwh).toBe(report.sites.reduce((a, s) => a + s.kwh, 0));
    expect(report.totals.revenueMinor).toBe(report.sites.reduce((a, s) => a + s.revenueMinor, 0));
    expect(report.totals.sessions).toBe(SESSIONS.length);
    expect(report.totals.sites).toBe(2);
  });

  it("peak demand is the coincident maximum of the meter samples", () => {
    expect(report.totals.peakKw).toBe(100); // 60 + 40 at 08:10
    const a = report.sites.find((s) => s.siteId === "site-a")!;
    expect(a.peakKw).toBe(100);
    expect(a.samples).toBe(SAMPLES.length);
    expect(report.peaks[0]?.peakIntervalStartMs).toBe(T0); // 08:00–08:30
  });

  it("an unmetered site reports no peak instead of zero", () => {
    const b = report.sites.find((s) => s.siteId === "site-b")!;
    expect(b.peakKw).toBeNull();
    expect(b.peakAtMs).toBeNull();
    expect(b.samples).toBe(0);
  });

  it("the demand profile only fills the half hour that was metered", () => {
    expect(report.profile.map((p) => p.segment)).toEqual([16]);
    const seg = report.profile[0]!;
    // Metered minutes: 08:00 = 60 kW, 08:10 = 100 kW, 08:20 = 30 kW.
    expect(seg.maxKw).toBe(100);
    expect(seg.meanKw).toBeCloseTo((60 + 100 + 30) / 3, 3);
    expect(seg.samples).toBe(3);
  });

  it("session profiles aggregate duration and mean power from the record", () => {
    const one = report.sessions.find((s) => s.id === "1")!;
    expect(one.durationMinutes).toBe(30);
    expect(one.meanKw).toBe(85); // 42.5 kWh over half an hour
    const open = report.sessions.find((s) => s.id === "3")!;
    expect(open.durationMinutes).toBeNull();
    expect(open.meanKw).toBeNull();
    expect(report.totals.meanSessionMinutes).toBe(45); // (30 + 60) / 2
  });
});

describe("the CSVs carry exactly the dataset shown in the panel", () => {
  const report = buildReport();

  it("energy per site CSV matches the panel rows and its own totals", () => {
    const rows = parseCsv(energyPerSiteCsv(report));
    expect(rows[0]?.[0]).toBe("Site");
    expect(rows).toHaveLength(report.sites.length + 1);

    const kwh = rows.slice(1).reduce((a, r) => a + Number(r[2]), 0);
    const rwf = rows.slice(1).reduce((a, r) => a + Number(r[3]), 0);
    expect(kwh).toBeCloseTo(report.totals.kwh, 3);
    expect(rwf).toBe(Math.round(report.totals.revenueMinor / 100));

    const unmetered = rows.slice(1).find((r) => r[0] === "Nyabugogo Depot")!;
    expect(unmetered[4]).toBe("not metered");
  });

  it("peak demand CSV carries only metered sites, at the measured figure", () => {
    const rows = parseCsv(peakDemandCsv(report));
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[0]).toBe("Kigali Heights");
    expect(Number(rows[1]?.[2])).toBe(100);
    expect(Number(rows[1]?.[1])).toBe(30);
  });

  it("demand profile CSV holds one row per metered half hour", () => {
    const rows = parseCsv(loadProfileCsv(report));
    expect(rows).toHaveLength(report.profile.length + 1);
    expect(rows[1]?.[0]).toBe("08:00–08:30");
    expect(Number(rows[1]?.[2])).toBe(100);
  });

  it("session profile CSV reconciles kWh and RWF with the site totals", () => {
    const rows = parseCsv(sessionProfilesCsv(report));
    expect(rows).toHaveLength(report.sessions.length + 1);
    const kwh = rows.slice(1).reduce((a, r) => a + Number(r[8]), 0);
    const rwf = rows.slice(1).reduce((a, r) => a + Number(r[14]), 0);
    expect(kwh).toBeCloseTo(report.totals.kwh, 3);
    expect(rwf).toBe(Math.round(report.totals.revenueMinor / 100));
    const open = rows.slice(1).find((r) => r[6] === "in progress")!;
    expect(open[7]).toBe("in progress");
    expect(open[9]).toBe("not metered");
  });
});
