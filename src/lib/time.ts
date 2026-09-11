import { TIMEZONE } from "@/config/policy";

/**
 * Africa/Kigali is UTC+02:00 all year — no daylight saving — so the wall-clock
 * conversion needed by time-of-use pricing is a fixed offset. Kept here as the
 * one place that knows it, so pricing stays pure.
 */
export const OPERATING_TIMEZONE = TIMEZONE.value;
export const OPERATING_UTC_OFFSET_MINUTES = 120;

/** Local minute-of-day (0–1439) in the operating timezone. */
export function minuteOfDayLocal(atMs: number): number {
  const totalMinutes = Math.floor(atMs / 60_000) + OPERATING_UTC_OFFSET_MINUTES;
  return ((totalMinutes % 1440) + 1440) % 1440;
}

/** Half-hour segment index (0–47) in the operating timezone. */
export function segmentIndexLocal(atMs: number): number {
  return Math.floor(minuteOfDayLocal(atMs) / 30);
}

export function minutesBetween(fromIso: string, toIso?: string | null): number {
  const a = Date.parse(fromIso);
  const b = toIso ? Date.parse(toIso) : Date.now();
  return Math.max(0, (b - a) / 60_000);
}
