import { CURRENCY } from "@/config/policy";

/**
 * Money helpers. Amounts crossing this module are ALWAYS integer minor units.
 * Nothing here ever produces a float amount.
 */

export type Minor = number;

export function toMinor(units: number): Minor {
  return Math.round(units * CURRENCY.minorUnitsPerUnit);
}

export function toUnits(minor: Minor): number {
  return minor / CURRENCY.minorUnitsPerUnit;
}

/** `RWF 1,234` — whole units, grouped, no decimals. */
export function formatRwf(minor: Minor | null | undefined): string {
  const units = Math.round(toUnits(Number(minor ?? 0)));
  return `${CURRENCY.code} ${units.toLocaleString("en-US")}`;
}

/** `1,234` — the same figure without the currency prefix, for dense tables. */
export function formatAmount(minor: Minor | null | undefined): string {
  return Math.round(toUnits(Number(minor ?? 0))).toLocaleString("en-US");
}

/** Compact form for KPI tiles: `RWF 1.2M`, `RWF 84.5k`. */
export function formatRwfCompact(minor: Minor | null | undefined): string {
  const units = Math.round(toUnits(Number(minor ?? 0)));
  if (Math.abs(units) >= 1_000_000) return `${CURRENCY.code} ${(units / 1_000_000).toFixed(2)}M`;
  if (Math.abs(units) >= 10_000) return `${CURRENCY.code} ${(units / 1_000).toFixed(1)}k`;
  return `${CURRENCY.code} ${units.toLocaleString("en-US")}`;
}

export function formatKwh(kwh: number | null | undefined, dp = 2): string {
  return Number(kwh ?? 0).toFixed(dp);
}

export function formatKw(kw: number | null | undefined, dp = 1): string {
  return Number(kw ?? 0).toFixed(dp);
}
