/**
 * Availability maths for the control room.
 *
 * Pure and unit-tested. Uptime is measured from observed status intervals only:
 * a pile that has never reported has no uptime, and a window with too little
 * observed history is reported as "insufficient data" rather than a made-up
 * percentage. Charging is an availability business, so this number must be
 * defensible in front of an owner or a regulator.
 */
import { UPTIME_TARGETS } from "@/config/policy";
import { uptimeVerdict, type UptimeVerdict } from "@/lib/pricing";

/** One observed status transition for a charge point or a single pile. */
export type StatusChange = {
  atMs: number;
  status: string;
};

/** Statuses that count as "the pile could have served a driver". */
const AVAILABLE = new Set([
  "online",
  "available",
  "preparing",
  "charging",
  "finishing",
  "reserved",
]);

/** Statuses that count as serving energy, for utilisation. */
const IN_USE = new Set(["charging", "finishing"]);

export type AvailabilityWindow = {
  fromMs: number;
  toMs: number;
};

export type Availability = {
  observedSeconds: number;
  availableSeconds: number;
  inUseSeconds: number;
  /** Never reported inside the window and no prior state to carry in. */
  neverObserved: boolean;
};

/**
 * Walks the transitions and totals the time spent in each state class.
 * `carryInStatus` is the state the pile was already in when the window opened.
 */
export function accumulateAvailability(
  changes: StatusChange[],
  window: AvailabilityWindow,
  carryInStatus?: string | null,
): Availability {
  const ordered = [...changes]
    .filter((c) => c.atMs <= window.toMs)
    .sort((a, b) => a.atMs - b.atMs);

  if (!ordered.length && !carryInStatus) {
    return { observedSeconds: 0, availableSeconds: 0, inUseSeconds: 0, neverObserved: true };
  }

  let cursor = window.fromMs;
  let current = carryInStatus ?? null;
  let available = 0;
  let inUse = 0;
  let observed = 0;

  const advance = (toMs: number) => {
    if (!current || toMs <= cursor) return;
    const seconds = (toMs - cursor) / 1000;
    observed += seconds;
    if (AVAILABLE.has(current)) available += seconds;
    if (IN_USE.has(current)) inUse += seconds;
  };

  for (const change of ordered) {
    if (change.atMs <= window.fromMs) {
      current = change.status;
      continue;
    }
    advance(change.atMs);
    cursor = change.atMs;
    current = change.status;
  }
  advance(window.toMs);

  return {
    observedSeconds: round3(observed),
    availableSeconds: round3(available),
    inUseSeconds: round3(inUse),
    neverObserved: false,
  };
}

export type AvailabilityReport =
  | { kind: "never_connected" }
  | { kind: "measured"; verdict: UptimeVerdict; utilisationPct: number | null };

/** Turn raw observed time into what the control room is allowed to display. */
export function availabilityReport(a: Availability): AvailabilityReport {
  if (a.neverObserved || a.observedSeconds <= 0) return { kind: "never_connected" };
  const verdict = uptimeVerdict(a.availableSeconds, a.observedSeconds, {
    greenAtOrAbovePct: UPTIME_TARGETS.greenAtOrAbovePct.value,
    amberAtOrAbovePct: UPTIME_TARGETS.amberAtOrAbovePct.value,
    minObservationHours: UPTIME_TARGETS.minObservationHours.value,
  });
  const utilisationPct =
    verdict.status === "insufficient_data"
      ? null
      : Math.round((a.inUseSeconds / a.observedSeconds) * 10000) / 100;
  return { kind: "measured", verdict, utilisationPct };
}

/** Aggregate several piles into one station or network figure. */
export function sumAvailability(parts: Availability[]): Availability {
  const observed = parts.filter((p) => !p.neverObserved);
  if (!observed.length) {
    return { observedSeconds: 0, availableSeconds: 0, inUseSeconds: 0, neverObserved: true };
  }
  return {
    observedSeconds: round3(observed.reduce((a, p) => a + p.observedSeconds, 0)),
    availableSeconds: round3(observed.reduce((a, p) => a + p.availableSeconds, 0)),
    inUseSeconds: round3(observed.reduce((a, p) => a + p.inUseSeconds, 0)),
    neverObserved: false,
  };
}

/** Seconds since a last-seen timestamp, or null when never seen. */
export function silenceSeconds(lastSeenIso: string | null, nowMs = Date.now()): number | null {
  if (!lastSeenIso) return null;
  const t = Date.parse(lastSeenIso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((nowMs - t) / 1000));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
