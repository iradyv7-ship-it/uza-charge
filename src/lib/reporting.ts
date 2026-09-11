/**
 * Utility-grade reporting maths for grid operators and regulators.
 *
 * Pure and unit-tested. Everything here is computed from measured rows only:
 * meter samples that the hardware actually reported and sessions that actually
 * closed. Nothing is interpolated, back-filled or smoothed, because a regulator
 * must be able to re-derive every figure from the raw tables.
 */

/** One reported meter sample, already resolved to its site and pile. */
export type MeterSample = {
  atMs: number;
  siteId: string;
  siteName: string;
  connectorId: string;
  powerKw: number;
  /** The charge point the pile belongs to, when the caller resolved it. */
  chargerId?: string | undefined;
};

/** One recorded charging session, already resolved to its site and pile. */
export type SessionRecord = {
  id: string;
  serialNo: string;
  siteId: string;
  siteName: string;
  stationName: string;
  connectorLabel: string;
  connectorType: string;
  startedAtMs: number;
  endedAtMs: number | null;
  kwh: number;
  totalMinor: number;
  socStart: number | null;
  socEnd: number | null;
  startMethod: string;
  status: string;
  chargerId?: string | undefined;
  /** Priced components, as settled. Absent on sessions never priced. */
  energyMinor?: number | undefined;
  timeMinor?: number | undefined;
  sessionFeeMinor?: number | undefined;
  idleMinor?: number | undefined;
  idleMinutes?: number | undefined;
  tariffVersionId?: string | null | undefined;
};

export type SiteEnergyRow = {
  siteId: string;
  siteName: string;
  sessions: number;
  kwh: number;
  revenueMinor: number;
  /** Coincident demand peak observed at this site, or null when unmetered. */
  peakKw: number | null;
  peakAtMs: number | null;
  /** Meter samples behind the peak — the audit trail for the figure. */
  samples: number;
};

export type PeakDemandRow = {
  siteId: string;
  siteName: string;
  intervalMinutes: number;
  peakKw: number;
  peakIntervalStartMs: number;
  samples: number;
};

export type ProfileSegment = {
  /** Half-hour index 0–47 in the operating timezone. */
  segment: number;
  /** Mean coincident demand observed in this segment. */
  meanKw: number;
  maxKw: number;
  samples: number;
};

export type SessionProfileRow = {
  id: string;
  serialNo: string;
  siteName: string;
  stationName: string;
  connector: string;
  connectorType: string;
  startedAtMs: number;
  endedAtMs: number | null;
  durationMinutes: number | null;
  kwh: number;
  meanKw: number | null;
  totalMinor: number;
  socStart: number | null;
  socEnd: number | null;
  startMethod: string;
  status: string;
};

/* ------------------------------------------------------------------ */
/* Coincident demand                                                   */
/* ------------------------------------------------------------------ */

/**
 * Coincident demand: several piles drawing at the same instant add up. Samples
 * are matched on the reported minute, which is the resolution OCPP MeterValues
 * realistically arrive at.
 */
function coincidentByMinute(samples: MeterSample[]): Map<number, number> {
  const perMinute = new Map<number, Map<string, number>>();
  for (const s of samples) {
    if (!Number.isFinite(s.powerKw) || s.powerKw <= 0) continue;
    const minute = Math.floor(s.atMs / 60_000);
    const byConnector = perMinute.get(minute) ?? new Map<string, number>();
    // One pile reporting twice in a minute counts once, at its highest reading.
    byConnector.set(s.connectorId, Math.max(byConnector.get(s.connectorId) ?? 0, s.powerKw));
    perMinute.set(minute, byConnector);
  }
  const totals = new Map<number, number>();
  for (const [minute, byConnector] of perMinute) {
    let sum = 0;
    for (const kw of byConnector.values()) sum += kw;
    totals.set(minute, round3(sum));
  }
  return totals;
}

/** Peak coincident demand per site, over fixed clock intervals. */
export function peakDemand(samples: MeterSample[], intervalMinutes = 30): PeakDemandRow[] {
  const bySite = new Map<string, MeterSample[]>();
  for (const s of samples) {
    const list = bySite.get(s.siteId) ?? [];
    list.push(s);
    bySite.set(s.siteId, list);
  }

  const rows: PeakDemandRow[] = [];
  for (const [siteId, siteSamples] of bySite) {
    const minutes = coincidentByMinute(siteSamples);
    if (!minutes.size) continue;
    const buckets = new Map<number, number>();
    for (const [minute, kw] of minutes) {
      const bucket = Math.floor(minute / intervalMinutes) * intervalMinutes;
      buckets.set(bucket, Math.max(buckets.get(bucket) ?? 0, kw));
    }
    let peakKw = 0;
    let peakBucket = 0;
    for (const [bucket, kw] of buckets) {
      if (kw > peakKw) {
        peakKw = kw;
        peakBucket = bucket;
      }
    }
    rows.push({
      siteId,
      siteName: siteSamples[0]!.siteName,
      intervalMinutes,
      peakKw: round3(peakKw),
      peakIntervalStartMs: peakBucket * 60_000,
      samples: siteSamples.length,
    });
  }
  return rows.sort((a, b) => b.peakKw - a.peakKw);
}

/* ------------------------------------------------------------------ */
/* Energy per site                                                     */
/* ------------------------------------------------------------------ */

export function energyPerSite(sessions: SessionRecord[], samples: MeterSample[]): SiteEnergyRow[] {
  const peaks = new Map(peakDemand(samples).map((p) => [p.siteId, p]));
  const rows = new Map<string, SiteEnergyRow>();

  for (const s of sessions) {
    const row =
      rows.get(s.siteId) ??
      ({
        siteId: s.siteId,
        siteName: s.siteName,
        sessions: 0,
        kwh: 0,
        revenueMinor: 0,
        peakKw: null,
        peakAtMs: null,
        samples: 0,
      } satisfies SiteEnergyRow);
    row.sessions += 1;
    row.kwh += Number(s.kwh) || 0;
    row.revenueMinor += Math.round(Number(s.totalMinor) || 0);
    rows.set(s.siteId, row);
  }

  // A site can be metered without having closed a session in the window.
  for (const p of peaks.values()) {
    if (!rows.has(p.siteId)) {
      rows.set(p.siteId, {
        siteId: p.siteId,
        siteName: p.siteName,
        sessions: 0,
        kwh: 0,
        revenueMinor: 0,
        peakKw: null,
        peakAtMs: null,
        samples: 0,
      });
    }
  }

  for (const row of rows.values()) {
    const peak = peaks.get(row.siteId);
    row.kwh = round3(row.kwh);
    row.peakKw = peak ? peak.peakKw : null;
    row.peakAtMs = peak ? peak.peakIntervalStartMs : null;
    row.samples = peak ? peak.samples : 0;
  }

  return [...rows.values()].sort((a, b) => b.kwh - a.kwh);
}

/* ------------------------------------------------------------------ */
/* Session load profile                                                */
/* ------------------------------------------------------------------ */

/**
 * Half-hourly demand profile across the whole selection. `segmentOf` maps a
 * timestamp to its local half-hour index, so the caller owns the timezone rule.
 */
export function loadProfile(samples: MeterSample[], segmentOf: (atMs: number) => number): ProfileSegment[] {
  const minutes = coincidentByMinute(samples);
  const buckets = new Map<number, { sum: number; max: number; n: number }>();
  for (const [minute, kw] of minutes) {
    const segment = segmentOf(minute * 60_000);
    const bucket = buckets.get(segment) ?? { sum: 0, max: 0, n: 0 };
    bucket.sum += kw;
    bucket.max = Math.max(bucket.max, kw);
    bucket.n += 1;
    buckets.set(segment, bucket);
  }
  return [...buckets.entries()]
    .map(([segment, b]) => ({
      segment,
      meanKw: round3(b.sum / b.n),
      maxKw: round3(b.max),
      samples: b.n,
    }))
    .sort((a, b) => a.segment - b.segment);
}

/** Per-session profile rows, exactly as recorded. */
export function sessionProfiles(sessions: SessionRecord[]): SessionProfileRow[] {
  return sessions
    .map((s) => {
      const durationMinutes =
        s.endedAtMs === null ? null : Math.max(0, Math.round(((s.endedAtMs - s.startedAtMs) / 60_000) * 10) / 10);
      const meanKw =
        durationMinutes && durationMinutes > 0 ? round3((Number(s.kwh) || 0) / (durationMinutes / 60)) : null;
      return {
        id: s.id,
        serialNo: s.serialNo,
        siteName: s.siteName,
        stationName: s.stationName,
        connector: s.connectorLabel,
        connectorType: s.connectorType,
        startedAtMs: s.startedAtMs,
        endedAtMs: s.endedAtMs,
        durationMinutes,
        kwh: round3(Number(s.kwh) || 0),
        meanKw,
        totalMinor: Math.round(Number(s.totalMinor) || 0),
        socStart: s.socStart,
        socEnd: s.socEnd,
        startMethod: s.startMethod,
        status: s.status,
      };
    })
    .sort((a, b) => b.startedAtMs - a.startedAtMs);
}

/** Totals for the report header — measured, never estimated. */
export function reportTotals(sites: SiteEnergyRow[], profiles: SessionProfileRow[]) {
  const closed = profiles.filter((p) => p.durationMinutes !== null);
  return {
    sites: sites.length,
    sessions: profiles.length,
    kwh: round3(sites.reduce((a, s) => a + s.kwh, 0)),
    revenueMinor: sites.reduce((a, s) => a + s.revenueMinor, 0),
    peakKw: sites.reduce<number | null>((a, s) => (s.peakKw === null ? a : Math.max(a ?? 0, s.peakKw)), null),
    meanSessionMinutes: closed.length
      ? Math.round((closed.reduce((a, p) => a + (p.durationMinutes ?? 0), 0) / closed.length) * 10) / 10
      : null,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* Charge points and pricing                                           */
/* ------------------------------------------------------------------ */

/** A charge point as registered, before any measurement is attached. */
export type ChargePointRef = {
  chargerId: string;
  serial: string;
  ocppIdentity: string;
  vendor: string | null;
  model: string | null;
  stationName: string;
  siteId: string;
  siteName: string;
  ownerName: string | null;
  powerType: string;
  ratedKw: number | null;
  connectors: number;
  status: string;
  lastSeenAtMs: number | null;
};

export type ChargePointRow = ChargePointRef & {
  sessions: number;
  kwh: number;
  revenueMinor: number;
  /** Coincident demand across this charge point's own piles, or null. */
  peakKw: number | null;
  samples: number;
};

/**
 * Per-charge-point measured energy, revenue and peak demand. Every registered
 * charge point is listed, including one that reported nothing in the period —
 * a silent pile is a fact a regulator needs, not a row to hide.
 */
export function chargePointEnergy(
  refs: ChargePointRef[],
  sessions: SessionRecord[],
  samples: MeterSample[],
): ChargePointRow[] {
  const peaks = new Map(
    peakDemand(
      samples.flatMap((s) =>
        s.chargerId ? [{ ...s, siteId: s.chargerId, siteName: s.siteName }] : [],
      ),
    ).map((p) => [p.siteId, p]),
  );

  const rows = new Map<string, ChargePointRow>(
    refs.map((r) => [
      r.chargerId,
      { ...r, sessions: 0, kwh: 0, revenueMinor: 0, peakKw: null, samples: 0 },
    ]),
  );

  for (const s of sessions) {
    if (!s.chargerId) continue;
    const row = rows.get(s.chargerId);
    if (!row) continue;
    row.sessions += 1;
    row.kwh = round3(row.kwh + (Number(s.kwh) || 0));
    row.revenueMinor += Math.round(Number(s.totalMinor) || 0);
  }

  for (const row of rows.values()) {
    const peak = peaks.get(row.chargerId);
    row.peakKw = peak ? peak.peakKw : null;
    row.samples = peak ? peak.samples : 0;
  }

  return [...rows.values()].sort((a, b) => b.kwh - a.kwh || a.serial.localeCompare(b.serial));
}

export type RevenueBreakdown = {
  energyMinor: number;
  timeMinor: number;
  sessionFeeMinor: number;
  idleMinor: number;
  /** Sum of the recorded session totals — the figure that was billed. */
  totalMinor: number;
  /** Total minus the four components; non-zero means a legacy unpriced row. */
  unattributedMinor: number;
  idleMinutes: number;
  /** Closed sessions carrying no priced total, reported rather than hidden. */
  unpricedSessions: number;
};

/** Revenue split into the components the tariff actually charged for. */
export function revenueBreakdown(sessions: SessionRecord[]): RevenueBreakdown {
  const out: RevenueBreakdown = {
    energyMinor: 0,
    timeMinor: 0,
    sessionFeeMinor: 0,
    idleMinor: 0,
    totalMinor: 0,
    unattributedMinor: 0,
    idleMinutes: 0,
    unpricedSessions: 0,
  };
  for (const s of sessions) {
    const total = Math.round(Number(s.totalMinor) || 0);
    out.energyMinor += Math.round(Number(s.energyMinor ?? 0));
    out.timeMinor += Math.round(Number(s.timeMinor ?? 0));
    out.sessionFeeMinor += Math.round(Number(s.sessionFeeMinor ?? 0));
    out.idleMinor += Math.round(Number(s.idleMinor ?? 0));
    out.idleMinutes += Math.round(Number(s.idleMinutes ?? 0));
    out.totalMinor += total;
    if (s.endedAtMs !== null && total === 0) out.unpricedSessions += 1;
  }
  out.unattributedMinor =
    out.totalMinor - (out.energyMinor + out.timeMinor + out.sessionFeeMinor + out.idleMinor);
  return out;
}

/** A tariff version that was in force in the period, with its usage count. */
export type TariffUsageRow = {
  id: string;
  name: string;
  siteScope: string;
  energyMinorPerKwh: number;
  timeMinorPerMinute: number;
  sessionFeeMinor: number;
  idleFeeMinorPerMinute: number;
  idleGraceMinutes: number;
  currency: string;
  published: boolean;
  effectiveFromMs: number;
  effectiveToMs: number | null;
  /** Sessions in the period that settled under this exact version. */
  sessionsPriced: number;
  kwh: number;
  revenueMinor: number;
};
