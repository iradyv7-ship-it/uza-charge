/**
 * UZA CHARGE — pure pricing engine.
 *
 * Every function here is pure and deterministic: same inputs, same outputs, no
 * clock, no randomness, no I/O. All money is integer minor units.
 *
 * Rules enforced:
 *  - A session is priced from its metered energy against the tariff VERSION in
 *    force when the session started. Tariff changes are never retroactive.
 *  - Time-of-use is resolved per half-hour segment, so a session that spans a
 *    tier boundary is split across tiers.
 *  - Idle fees only apply after the configured grace period.
 *  - Revenue splits are exact: energy cost first, then basis-point shares, with
 *    any rounding remainder assigned to the platform so the parts always sum
 *    back to the whole.
 */

import {
  REVENUE_SPLIT_DEFAULTS,
  TARIFF_DEFAULTS,
  TOU_TIER_MULTIPLIER,
  type TouTier,
} from "@/config/policy";

export const SEGMENTS_PER_DAY = 48;
export const MINUTES_PER_SEGMENT = 30;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** The billable shape of one effective-dated tariff version. */
export type TariffVersion = {
  /** Identifier of the version a session pins itself to. */
  id: string;
  /** Inclusive start of validity, ISO. */
  effectiveFrom: string;
  /** Exclusive end of validity, ISO, or null for "current". */
  effectiveTo: string | null;
  energyMinorPerKwh: number;
  timeMinorPerMinute: number;
  sessionFeeMinor: number;
  idleFeeMinorPerMinute: number;
  idleGraceMinutes: number;
  /** Half-hour index (0–47) → tier. Missing indexes fall back to `standard`. */
  segments: Partial<Record<number, TouTier>>;
  /** Per-tier multiplier override; falls back to policy defaults. */
  tierMultipliers?: Partial<Record<TouTier, number>>;
};

/** One metered energy reading, already normalised by the OCPP layer. */
export type MeterSample = {
  /** Epoch milliseconds — sample time. */
  atMs: number;
  /** Cumulative register value in kWh (monotonic non-decreasing). */
  cumulativeKwh: number;
};

export type EnergyTierUsage = {
  tier: TouTier;
  kwh: number;
  rateMinorPerKwh: number;
  amountMinor: number;
};

export type SessionCharge = {
  energyKwh: number;
  chargingMinutes: number;
  idleMinutes: number;
  billedIdleMinutes: number;
  energyMinor: number;
  timeMinor: number;
  sessionFeeMinor: number;
  idleMinor: number;
  totalMinor: number;
  tiers: EnergyTierUsage[];
  tariffVersionId: string;
};

export type RevenueSplitRule = {
  version: number;
  energyCostMinorPerKwh: number;
  hostShareBps: number;
  platformShareBps: number;
};

export type RevenueSplit = {
  ruleVersion: number;
  grossMinor: number;
  energyCostMinor: number;
  netMarginMinor: number;
  hostMinor: number;
  platformMinor: number;
};

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

/** The tariff shape used when an owner has published none of their own. */
export function defaultTariffVersion(id = "policy-default"): TariffVersion {
  return {
    id,
    effectiveFrom: "1970-01-01T00:00:00.000Z",
    effectiveTo: null,
    energyMinorPerKwh: TARIFF_DEFAULTS.energyMinorPerKwh.value,
    timeMinorPerMinute: TARIFF_DEFAULTS.timeMinorPerMinute.value,
    sessionFeeMinor: TARIFF_DEFAULTS.sessionFeeMinor.value,
    idleFeeMinorPerMinute: TARIFF_DEFAULTS.idleFeeMinorPerMinute.value,
    idleGraceMinutes: TARIFF_DEFAULTS.idleGraceMinutes.value,
    segments: {},
  };
}

export function defaultRevenueSplitRule(): RevenueSplitRule {
  return {
    version: REVENUE_SPLIT_DEFAULTS.version.value,
    energyCostMinorPerKwh: REVENUE_SPLIT_DEFAULTS.energyCostMinorPerKwh.value,
    hostShareBps: REVENUE_SPLIT_DEFAULTS.hostShareBps.value,
    platformShareBps: REVENUE_SPLIT_DEFAULTS.platformShareBps.value,
  };
}

/* ------------------------------------------------------------------ */
/* Effective dating                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pick the tariff version in force at `atMs`. Never retroactive: a version
 * whose `effectiveFrom` is after the session start can never price it.
 */
export function selectTariffVersion(
  versions: readonly TariffVersion[],
  atMs: number,
): TariffVersion | null {
  const applicable = versions
    .filter((v) => {
      const from = Date.parse(v.effectiveFrom);
      const to = v.effectiveTo === null ? Infinity : Date.parse(v.effectiveTo);
      return from <= atMs && atMs < to;
    })
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom));
  return applicable[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Time-of-use                                                         */
/* ------------------------------------------------------------------ */

/** Half-hour segment index (0–47) for a local wall-clock minute-of-day. */
export function segmentIndexForMinuteOfDay(minuteOfDay: number): number {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return Math.floor(m / MINUTES_PER_SEGMENT);
}

export function tierForSegment(tariff: TariffVersion, segmentIndex: number): TouTier {
  return tariff.segments[segmentIndex] ?? "standard";
}

export function tierMultiplier(tariff: TariffVersion, tier: TouTier): number {
  return tariff.tierMultipliers?.[tier] ?? TOU_TIER_MULTIPLIER[tier].value;
}

export function energyRateMinorPerKwh(tariff: TariffVersion, tier: TouTier): number {
  return Math.round(tariff.energyMinorPerKwh * tierMultiplier(tariff, tier));
}

/* ------------------------------------------------------------------ */
/* Session pricing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Split metered energy across time-of-use tiers.
 *
 * `minuteOfDayAt` maps a sample timestamp to the local minute-of-day, so the
 * caller owns timezone conversion and this function stays pure.
 */
export function splitEnergyByTier(
  samples: readonly MeterSample[],
  tariff: TariffVersion,
  minuteOfDayAt: (atMs: number) => number,
): Map<TouTier, number> {
  const perTier = new Map<TouTier, number>();
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1]!;
    const cur = samples[i]!;
    const delta = Math.max(0, cur.cumulativeKwh - prev.cumulativeKwh);
    if (delta === 0) continue;
    // Energy in an interval is attributed to the tier of the interval's end,
    // matching how a charger reports a completed measurement period.
    const tier = tierForSegment(tariff, segmentIndexForMinuteOfDay(minuteOfDayAt(cur.atMs)));
    perTier.set(tier, (perTier.get(tier) ?? 0) + delta);
  }
  return perTier;
}

export type PriceSessionInput = {
  samples: readonly MeterSample[];
  tariff: TariffVersion;
  /** Wall-clock minute-of-day resolver for the operating timezone. */
  minuteOfDayAt: (atMs: number) => number;
  /** Minutes the vehicle was actually drawing power. */
  chargingMinutes: number;
  /** Minutes the bay stayed occupied after charging finished. */
  idleMinutes?: number;
};

export function priceSession(input: PriceSessionInput): SessionCharge {
  const { samples, tariff, minuteOfDayAt } = input;
  const idleMinutes = Math.max(0, input.idleMinutes ?? 0);
  const chargingMinutes = Math.max(0, input.chargingMinutes);

  const perTier = splitEnergyByTier(samples, tariff, minuteOfDayAt);

  const tiers: EnergyTierUsage[] = [...perTier.entries()]
    .map(([tier, kwh]) => {
      const rate = energyRateMinorPerKwh(tariff, tier);
      return {
        tier,
        kwh: round3(kwh),
        rateMinorPerKwh: rate,
        amountMinor: Math.round(kwh * rate),
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const energyKwh = round3([...perTier.values()].reduce((a, b) => a + b, 0));
  const energyMinor = tiers.reduce((a, t) => a + t.amountMinor, 0);
  const timeMinor = Math.round(chargingMinutes * tariff.timeMinorPerMinute);
  const billedIdleMinutes = Math.max(0, idleMinutes - tariff.idleGraceMinutes);
  const idleMinor = Math.round(billedIdleMinutes * tariff.idleFeeMinorPerMinute);
  const sessionFeeMinor = energyKwh > 0 || chargingMinutes > 0 ? tariff.sessionFeeMinor : 0;

  return {
    energyKwh,
    chargingMinutes,
    idleMinutes,
    billedIdleMinutes,
    energyMinor,
    timeMinor,
    sessionFeeMinor,
    idleMinor,
    totalMinor: energyMinor + timeMinor + sessionFeeMinor + idleMinor,
    tiers,
    tariffVersionId: tariff.id,
  };
}

/* ------------------------------------------------------------------ */
/* Pre-authorisation reconciliation                                    */
/* ------------------------------------------------------------------ */

export type Reconciliation = {
  captureMinor: number;
  refundMinor: number;
  shortfallMinor: number;
};

/**
 * Reconcile a pre-authorised hold against the real session total.
 * Capture what was used, refund the rest; anything above the hold is a
 * shortfall the wallet or fleet account must cover.
 */
export function reconcilePreauth(preauthMinor: number, totalMinor: number): Reconciliation {
  const hold = Math.max(0, Math.round(preauthMinor));
  const total = Math.max(0, Math.round(totalMinor));
  const capture = Math.min(hold, total);
  return {
    captureMinor: capture,
    refundMinor: hold - capture,
    shortfallMinor: Math.max(0, total - hold),
  };
}

/* ------------------------------------------------------------------ */
/* Revenue split                                                       */
/* ------------------------------------------------------------------ */

/**
 * Split gross session revenue under a pinned rule version.
 * Energy cost is a pass-through; the remainder splits by basis points.
 * The platform absorbs the rounding remainder so parts always sum to gross.
 */
export function splitRevenue(
  grossMinor: number,
  energyKwh: number,
  rule: RevenueSplitRule,
): RevenueSplit {
  const gross = Math.max(0, Math.round(grossMinor));
  const energyCost = Math.min(gross, Math.round(Math.max(0, energyKwh) * rule.energyCostMinorPerKwh));
  const net = gross - energyCost;
  const totalBps = rule.hostShareBps + rule.platformShareBps;
  const host = totalBps === 0 ? 0 : Math.floor((net * rule.hostShareBps) / totalBps);
  return {
    ruleVersion: rule.version,
    grossMinor: gross,
    energyCostMinor: energyCost,
    netMarginMinor: net,
    hostMinor: host,
    platformMinor: net - host,
  };
}

/* ------------------------------------------------------------------ */
/* Uptime                                                              */
/* ------------------------------------------------------------------ */

export type UptimeVerdict =
  | { status: "insufficient_data"; observedHours: number }
  | { status: "green" | "amber" | "red"; uptimePct: number; observedHours: number };

/**
 * Uptime from observed availability, never invented. Callers pass the observed
 * window; below the policy minimum we refuse to state a number.
 */
export function uptimeVerdict(
  availableSeconds: number,
  observedSeconds: number,
  targets: { greenAtOrAbovePct: number; amberAtOrAbovePct: number; minObservationHours: number },
): UptimeVerdict {
  const observedHours = observedSeconds / 3600;
  if (observedSeconds <= 0 || observedHours < targets.minObservationHours) {
    return { status: "insufficient_data", observedHours: round3(observedHours) };
  }
  const pct = Math.max(0, Math.min(100, (availableSeconds / observedSeconds) * 100));
  const status =
    pct >= targets.greenAtOrAbovePct ? "green" : pct >= targets.amberAtOrAbovePct ? "amber" : "red";
  return { status, uptimePct: Math.round(pct * 100) / 100, observedHours: round3(observedHours) };
}

/* ------------------------------------------------------------------ */

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
