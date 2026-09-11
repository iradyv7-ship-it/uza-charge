/**
 * Turning a finished session into money.
 *
 * Server-only. All arithmetic comes from src/lib/pricing.ts — this file only
 * fetches the facts (meter readings, the tariff version in force when the
 * session started, the owner behind the pile), applies them and writes the
 * result. Amounts are integer minor units of RWF throughout.
 *
 * The tariff is never applied retroactively: a version that came into force
 * after the session started can never price that session.
 */

import {
  defaultRevenueSplitRule,
  defaultTariffVersion,
  priceSession,
  selectTariffVersion,
  type MeterSample,
  type SessionCharge,
  type TariffVersion,
} from "./pricing";
import { minuteOfDayLocal } from "./time";
import { TOU_TIER_MULTIPLIER } from "@/config/policy";

type Admin = {
  from: (table: string) => any;
};

type TouTier = "sharp" | "peak" | "standard" | "valley";

export type SettledSession = {
  sessionId: string;
  ownerId: string | null;
  charge: SessionCharge;
  tariffVersionId: string | null;
  receiptNumber: string | null;
};

/** Human-readable receipt number, unique per session and stable on re-run. */
export function receiptNumber(serialNo: string, sessionId: string): string {
  return `UZA-${serialNo}-${sessionId.slice(0, 4).toUpperCase()}`;
}

function toTariffVersion(row: {
  id: string;
  effective_from: string;
  effective_to: string | null;
  energy_minor_per_kwh: number;
  time_minor_per_minute: number;
  session_fee_minor: number;
  idle_fee_minor_per_minute: number;
  idle_grace_minutes: number;
  tariff_tou_windows?: Array<{ half_hour_index: number; tier: string; multiplier: number }> | null;
}): TariffVersion {
  const segments: Partial<Record<number, TouTier>> = {};
  const multipliers: Partial<Record<TouTier, number>> = {};
  for (const w of row.tariff_tou_windows ?? []) {
    segments[w.half_hour_index] = w.tier as TouTier;
    multipliers[w.tier as TouTier] = Number(w.multiplier);
  }
  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    energyMinorPerKwh: Number(row.energy_minor_per_kwh),
    timeMinorPerMinute: Number(row.time_minor_per_minute),
    sessionFeeMinor: Number(row.session_fee_minor),
    idleFeeMinorPerMinute: Number(row.idle_fee_minor_per_minute),
    idleGraceMinutes: Number(row.idle_grace_minutes),
    segments,
    tierMultipliers: Object.keys(multipliers).length
      ? multipliers
      : {
          sharp: TOU_TIER_MULTIPLIER.sharp.value,
          peak: TOU_TIER_MULTIPLIER.peak.value,
          standard: TOU_TIER_MULTIPLIER.standard.value,
          valley: TOU_TIER_MULTIPLIER.valley.value,
        },
  };
}

/**
 * Price one session from its own meter readings and write the result: the
 * session's money columns, and an itemised receipt the driver can read.
 *
 * Idempotent — running it twice produces the same numbers and one receipt.
 */
export async function settleSession(admin: Admin, sessionId: string): Promise<SettledSession | null> {
  const { data: session } = await admin
    .from("sessions")
    .select(
      `id, serial_no, driver_id, started_at, ended_at, idle_minutes, status,
       connectors!inner ( id, chargers!inner ( id, stations!inner ( id, owner_id ) ) )`,
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const stationRow = session.connectors.chargers.stations as { id: string; owner_id: string | null };
  const ownerId = stationRow.owner_id ?? null;
  const startedMs = Date.parse(session.started_at);

  const { data: samples } = await admin
    .from("meter_values")
    .select("ts, kwh")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true });

  const readings: MeterSample[] = (samples ?? [])
    .filter((s: { kwh: number | null }) => s.kwh !== null)
    .map((s: { ts: string; kwh: number }) => ({
      atMs: Date.parse(s.ts),
      cumulativeKwh: Number(s.kwh),
    }));

  // Tariff versions this owner (or this specific station) has published.
  let tariff: TariffVersion = defaultTariffVersion();
  if (ownerId) {
    const { data: versions } = await admin
      .from("tariff_versions")
      .select(
        `id, effective_from, effective_to, energy_minor_per_kwh, time_minor_per_minute,
         session_fee_minor, idle_fee_minor_per_minute, idle_grace_minutes, station_id, published,
         tariff_tou_windows ( half_hour_index, tier, multiplier )`,
      )
      .eq("owner_id", ownerId)
      .eq("published", true);

    const candidates = (versions ?? [])
      .filter((v: { station_id: string | null }) => !v.station_id || v.station_id === stationRow.id)
      .map(toTariffVersion);
    const chosen = selectTariffVersion(candidates, startedMs);
    if (chosen) tariff = chosen;
  }

  const endedMs = session.ended_at ? Date.parse(session.ended_at) : Date.now();
  const firstMs = readings.length ? (readings[0] as MeterSample).atMs : startedMs;
  const lastMs = readings.length ? (readings[readings.length - 1] as MeterSample).atMs : endedMs;
  const chargingMinutes = Math.max(0, Math.round((lastMs - firstMs) / 60_000));
  const idleMinutes =
    session.idle_minutes && Number(session.idle_minutes) > 0
      ? Number(session.idle_minutes)
      : Math.max(0, Math.round((endedMs - lastMs) / 60_000));

  const charge = priceSession({
    samples: readings,
    tariff,
    minuteOfDayAt: minuteOfDayLocal,
    chargingMinutes,
    idleMinutes,
  });

  const split = defaultRevenueSplitRule();
  const pinnedTariffId = tariff.id === "policy-default" ? null : tariff.id;

  await admin
    .from("sessions")
    .update({
      kwh: charge.energyKwh,
      cost_rwf: Math.round(charge.totalMinor / 100),
      energy_minor: charge.energyMinor,
      time_minor: charge.timeMinor,
      session_fee_minor: charge.sessionFeeMinor,
      idle_minor: charge.idleMinor,
      total_minor: charge.totalMinor,
      charging_minutes: charge.chargingMinutes,
      idle_minutes: charge.idleMinutes,
      tariff_version_id: pinnedTariffId,
      split_rule_version: split.version,
    })
    .eq("id", sessionId);

  const number = receiptNumber(session.serial_no, sessionId);
  const durationMinutes = Math.max(0, Math.round((endedMs - startedMs) / 60_000));

  const { data: existing } = await admin
    .from("receipts")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  const receipt = {
    session_id: sessionId,
    driver_id: session.driver_id,
    owner_id: ownerId,
    tariff_version_id: pinnedTariffId,
    number,
    energy_kwh: charge.energyKwh,
    duration_minutes: durationMinutes,
    idle_minutes: charge.idleMinutes,
    lines: {
      tiers: charge.tiers,
      billedIdleMinutes: charge.billedIdleMinutes,
      chargingMinutes: charge.chargingMinutes,
      tariff: {
        id: tariff.id,
        energyMinorPerKwh: tariff.energyMinorPerKwh,
        timeMinorPerMinute: tariff.timeMinorPerMinute,
        sessionFeeMinor: tariff.sessionFeeMinor,
        idleFeeMinorPerMinute: tariff.idleFeeMinorPerMinute,
        idleGraceMinutes: tariff.idleGraceMinutes,
      },
    },
    energy_minor: charge.energyMinor,
    time_minor: charge.timeMinor,
    session_fee_minor: charge.sessionFeeMinor,
    idle_minor: charge.idleMinor,
    total_minor: charge.totalMinor,
    currency: "RWF",
  };

  if (existing) {
    await admin.from("receipts").update(receipt).eq("id", (existing as { id: string }).id);
  } else {
    await admin.from("receipts").insert(receipt);
  }

  return { sessionId, ownerId, charge, tariffVersionId: pinnedTariffId, receiptNumber: number };
}
