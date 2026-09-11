/**
 * Forecasting and investment health — pure, unit-tested, deliberately modest.
 *
 * An owner is studying a real investment, so nothing here pretends to more
 * precision than the data supports:
 *   - a projection is a trailing average with an explicit band, always labelled
 *     an estimate, and is refused outright when there is too little history;
 *   - the health score is built only from measured inputs (observed uptime,
 *     measured utilisation, realised revenue) — never from targets or guesses.
 */
import { FORECAST, INVESTMENT_HEALTH } from "@/config/policy";

/** One day of realised activity for a site, station or whole portfolio. */
export type DayPoint = {
  /** `YYYY-MM-DD` in Africa/Kigali. */
  day: string;
  sessions: number;
  kwh: number;
  revenueMinor: number;
};

export type Trend = {
  /** Mean per day across the whole series. */
  meanPerDay: number;
  /** Mean over the most recent `FORECAST.recentDays` days. */
  recentPerDay: number;
  /** Mean over the window immediately before that, for comparison. */
  priorPerDay: number;
  /** Percentage change recent vs prior, or null when prior is empty. */
  changePct: number | null;
  direction: "up" | "down" | "flat" | "unknown";
};

export type Projection =
  | { kind: "insufficient_data"; daysObserved: number; daysRequired: number }
  | {
      kind: "estimate";
      /** Central projection for the period. */
      centralMinor: number;
      lowMinor: number;
      highMinor: number;
      daysObserved: number;
      daysProjected: number;
      /** Always true — the UI must never present this as a fact. */
      isEstimate: true;
    };

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const mean = (ns: number[]) => (ns.length ? sum(ns) / ns.length : 0);

/** Sorts oldest → newest and drops anything unparseable. */
export function normaliseSeries(series: DayPoint[]): DayPoint[] {
  return [...series]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function trend(series: DayPoint[], pick: (d: DayPoint) => number): Trend {
  const ordered = normaliseSeries(series);
  const values = ordered.map(pick);
  if (!values.length) {
    return { meanPerDay: 0, recentPerDay: 0, priorPerDay: 0, changePct: null, direction: "unknown" };
  }
  const window = FORECAST.recentDays.value;
  const recent = values.slice(-window);
  const prior = values.slice(-2 * window, -window);
  const recentPerDay = mean(recent);
  const priorPerDay = mean(prior);
  const changePct =
    prior.length && priorPerDay > 0
      ? Math.round(((recentPerDay - priorPerDay) / priorPerDay) * 1000) / 10
      : null;
  const direction: Trend["direction"] =
    changePct === null
      ? "unknown"
      : changePct >= FORECAST.flatBandPct.value
        ? "up"
        : changePct <= -FORECAST.flatBandPct.value
          ? "down"
          : "flat";
  return {
    meanPerDay: round2(mean(values)),
    recentPerDay: round2(recentPerDay),
    priorPerDay: round2(priorPerDay),
    changePct,
    direction,
  };
}

/**
 * Projects revenue over `daysAhead` from the trailing daily average, widened by
 * the observed spread. Refuses to answer below the minimum history.
 */
export function projectRevenue(series: DayPoint[], daysAhead: number): Projection {
  const ordered = normaliseSeries(series);
  const required = FORECAST.minDaysForProjection.value;
  if (ordered.length < required) {
    return { kind: "insufficient_data", daysObserved: ordered.length, daysRequired: required };
  }
  const recent = ordered.slice(-FORECAST.recentDays.value).map((d) => d.revenueMinor);
  const perDay = mean(recent);
  const spread = standardDeviation(recent);
  const bandPerDay = Math.max(spread, (perDay * FORECAST.minBandPct.value) / 100);
  return {
    kind: "estimate",
    centralMinor: Math.round(perDay * daysAhead),
    lowMinor: Math.max(0, Math.round((perDay - bandPerDay) * daysAhead)),
    highMinor: Math.round((perDay + bandPerDay) * daysAhead),
    daysObserved: ordered.length,
    daysProjected: daysAhead,
    isEstimate: true,
  };
}

export type HealthInput = {
  /** Measured availability over the window, or null when not measurable. */
  uptimePct: number | null;
  /** Measured share of observed time spent delivering energy. */
  utilisationPct: number | null;
  /** Realised revenue per charge point per day, minor units. */
  revenuePerPilePerDayMinor: number | null;
  /** Faults still open right now. */
  openFaults: number;
  chargePoints: number;
};

export type HealthScore =
  | { kind: "insufficient_data"; reason: string }
  | {
      kind: "scored";
      score: number;
      band: "green" | "amber" | "red";
      parts: { uptime: number; utilisation: number; revenue: number; faults: number };
    };

/**
 * 0–100 investment health. Weights live in policy, so a change is a reviewed
 * code change rather than a number invented in a component.
 */
export function healthScore(input: HealthInput): HealthScore {
  if (!input.chargePoints) {
    return { kind: "insufficient_data", reason: "No charge points registered yet." };
  }
  if (input.uptimePct === null || input.utilisationPct === null) {
    return {
      kind: "insufficient_data",
      reason: "Not enough observed history to score availability yet.",
    };
  }

  const w = INVESTMENT_HEALTH.weights.value;
  const uptime = clamp01(input.uptimePct / 100) * w.uptime;
  const utilisation =
    clamp01(input.utilisationPct / INVESTMENT_HEALTH.healthyUtilisationPct.value) * w.utilisation;
  const revenue =
    input.revenuePerPilePerDayMinor === null
      ? 0
      : clamp01(
          input.revenuePerPilePerDayMinor / INVESTMENT_HEALTH.healthyRevenuePerPilePerDayMinor.value,
        ) * w.revenue;
  const faults =
    clamp01(1 - input.openFaults / Math.max(1, input.chargePoints)) * w.faults;

  const score = Math.round(uptime + utilisation + revenue + faults);
  const band: "green" | "amber" | "red" =
    score >= INVESTMENT_HEALTH.greenAtOrAbove.value
      ? "green"
      : score >= INVESTMENT_HEALTH.amberAtOrAbove.value
        ? "amber"
        : "red";

  return {
    kind: "scored",
    score,
    band,
    parts: {
      uptime: round2(uptime),
      utilisation: round2(utilisation),
      revenue: round2(revenue),
      faults: round2(faults),
    },
  };
}

/**
 * Subscription invoice maths: the plan minimum covers the included allowance,
 * and every charge point above it is billed per pile. The total can therefore
 * never fall below the plan minimum.
 */
export type SubscriptionPlanShape = {
  priceMinorPerChargePoint: number;
  minMonthlyMinor: number;
  includedChargePoints: number;
};

export type InvoiceLineDraft = {
  kind: "included" | "charge_points";
  description: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
};

export function draftSubscriptionInvoice(
  plan: SubscriptionPlanShape,
  chargePoints: number,
): { lines: InvoiceLineDraft[]; totalMinor: number } {
  const billable = Math.max(0, chargePoints - plan.includedChargePoints);
  const lines: InvoiceLineDraft[] = [
    {
      kind: "included",
      description: `Plan base — ${plan.includedChargePoints} charge point(s) included`,
      quantity: 1,
      unitMinor: plan.minMonthlyMinor,
      amountMinor: plan.minMonthlyMinor,
    },
  ];
  if (billable > 0) {
    lines.push({
      kind: "charge_points",
      description: `Additional charge points (${billable} × monthly fee)`,
      quantity: billable,
      unitMinor: plan.priceMinorPerChargePoint,
      amountMinor: billable * plan.priceMinorPerChargePoint,
    });
  }
  return { lines, totalMinor: lines.reduce((a, l) => a + l.amountMinor, 0) };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function standardDeviation(ns: number[]): number {
  if (ns.length < 2) return 0;
  const m = mean(ns);
  return Math.sqrt(mean(ns.map((n) => (n - m) ** 2)));
}
