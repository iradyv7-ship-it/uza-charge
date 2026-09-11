/**
 * Control-room data: measured availability, utilisation, energy and revenue.
 *
 * Everything here is read through the caller's own Supabase client, so RLS
 * scopes an owner strictly to their own sites — a host never sees another
 * host's piles. Nothing is estimated: where history is too thin the row says
 * so instead of showing a number.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OCPP, UPTIME_TARGETS } from "@/config/policy";
import {
  accumulateAvailability,
  availabilityReport,
  silenceSeconds,
  sumAvailability,
  type Availability,
  type AvailabilityReport,
  type StatusChange,
} from "@/lib/uptime";

export type PileHealth = {
  chargerId: string;
  connectorId: string | null;
  label: string;
  ratedPowerKw: number;
  status: string;
  report: AvailabilityReport;
};

export type ChargePointHealth = {
  id: string;
  serial: string;
  ocppIdentity: string;
  vendor: string | null;
  model: string | null;
  firmwareVersion: string | null;
  firmwareStatus: string | null;
  status: string;
  lastSeenAt: string | null;
  silenceSeconds: number | null;
  everConnected: boolean;
  maxOutputPct: number;
  report: AvailabilityReport;
  piles: PileHealth[];
  openFaults: number;
};

export type StationHealth = {
  id: string;
  name: string;
  area: string | null;
  kind: string;
  ownerName: string | null;
  report: AvailabilityReport;
  energyKwh: number;
  revenueMinor: number;
  sessions: number;
  chargePoints: ChargePointHealth[];
};

export type ControlRoomSnapshot = {
  windowHours: number;
  observedFrom: string;
  network: AvailabilityReport;
  totals: {
    chargePoints: number;
    everConnected: number;
    online: number;
    faulted: number;
    neverConnected: number;
    openFaults: number;
    liveSessions: number;
    energyKwh: number;
    revenueMinor: number;
  };
  targets: { greenAtOrAbovePct: number; amberAtOrAbovePct: number; minObservationHours: number };
  stations: StationHealth[];
};

export const fetchControlRoom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ windowHours: z.number().int().min(1).max(720).default(48) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ControlRoomSnapshot> => {
    const supabase = context.supabase;
    const toMs = Date.now();
    const fromMs = toMs - data.windowHours * 3_600_000;
    const fromIso = new Date(fromMs).toISOString();
    const win = { fromMs, toMs };

    const [{ data: stationRows }, { data: history }, { data: sessions }, { data: faults }] =
      await Promise.all([
        supabase
          .from("stations")
          .select(
            "id, name, area, kind, owners(name), chargers(id, serial, ocpp_identity, vendor, model, firmware_version, firmware_status, status, last_seen_at, last_heartbeat, boot_at, max_output_pct, rated_power_kw, connectors(id, label, power_kw, status))",
          )
          .order("name", { ascending: true }),
        supabase
          .from("charge_point_status_history")
          .select("charger_id, connector_id, status, changed_at")
          .order("changed_at", { ascending: true })
          .limit(20000),
        supabase
          .from("sessions")
          .select("id, status, kwh, total_minor, cost_rwf, started_at, connector_id")
          .gte("started_at", fromIso),
        supabase.from("faults").select("id, charger_id").is("cleared_at", null),
      ]);

    // Index history by charge point and by pile, keeping the state carried into
    // the window so a quiet-but-healthy pile is not read as downtime.
    const cpChanges = new Map<string, StatusChange[]>();
    const pileChanges = new Map<string, StatusChange[]>();
    for (const row of history ?? []) {
      const change: StatusChange = {
        atMs: Date.parse(row.changed_at as string),
        status: row.status as string,
      };
      const key = row.connector_id as string | null;
      if (key) {
        const list = pileChanges.get(key) ?? [];
        list.push(change);
        pileChanges.set(key, list);
      } else {
        const list = cpChanges.get(row.charger_id as string) ?? [];
        list.push(change);
        cpChanges.set(row.charger_id as string, list);
      }
    }

    const faultsByCharger = new Map<string, number>();
    for (const f of faults ?? []) {
      faultsByCharger.set(f.charger_id as string, (faultsByCharger.get(f.charger_id as string) ?? 0) + 1);
    }

    const connectorToStation = new Map<string, string>();
    const stations: StationHealth[] = [];
    const networkParts: Availability[] = [];
    const totals = {
      chargePoints: 0,
      everConnected: 0,
      online: 0,
      faulted: 0,
      neverConnected: 0,
      openFaults: 0,
      liveSessions: 0,
      energyKwh: 0,
      revenueMinor: 0,
    };

    for (const st of stationRows ?? []) {
      const stationParts: Availability[] = [];
      const chargePoints: ChargePointHealth[] = [];

      for (const cp of (st.chargers ?? []) as Array<Record<string, unknown>>) {
        const chargerId = cp['id'] as string;
        const everConnected = Boolean(cp['boot_at'] ?? cp['last_seen_at'] ?? cp['last_heartbeat']);
        const availability = accumulateAvailability(cpChanges.get(chargerId) ?? [], win);
        const piles: PileHealth[] = [];

        for (const c of (cp['connectors'] ?? []) as Array<Record<string, unknown>>) {
          const connectorId = c['id'] as string;
          connectorToStation.set(connectorId, st.id as string);
          const pileAvailability = accumulateAvailability(pileChanges.get(connectorId) ?? [], win);
          piles.push({
            chargerId,
            connectorId,
            label: (c['label'] as string) ?? "Gun",
            ratedPowerKw: Number(c['power_kw'] ?? 0),
            status: everConnected ? ((c['status'] as string) ?? "offline") : "never_connected",
            report: availabilityReport(pileAvailability),
          });
          stationParts.push(pileAvailability);
        }

        const cpAvailability = piles.length
          ? sumAvailability(piles.map((_, i) => stationParts[stationParts.length - piles.length + i]!))
          : availability;

        chargePoints.push({
          id: chargerId,
          serial: cp['serial'] as string,
          ocppIdentity: (cp['ocpp_identity'] as string) ?? "",
          vendor: (cp['vendor'] as string | null) ?? null,
          model: (cp['model'] as string | null) ?? null,
          firmwareVersion: (cp['firmware_version'] as string | null) ?? null,
          firmwareStatus: (cp['firmware_status'] as string | null) ?? null,
          status: everConnected ? ((cp['status'] as string) ?? "offline") : "never_connected",
          lastSeenAt: (cp['last_seen_at'] as string | null) ?? (cp['last_heartbeat'] as string | null) ?? null,
          silenceSeconds: silenceSeconds(
            (cp['last_seen_at'] as string | null) ?? (cp['last_heartbeat'] as string | null) ?? null,
            toMs,
          ),
          everConnected,
          maxOutputPct: Number(cp['max_output_pct'] ?? 100),
          report: availabilityReport(cpAvailability),
          piles,
          openFaults: faultsByCharger.get(chargerId) ?? 0,
        });

        totals.chargePoints += 1;
        totals.openFaults += faultsByCharger.get(chargerId) ?? 0;
        if (!everConnected) totals.neverConnected += 1;
        else if (cp['status'] === "faulted") totals.faulted += 1;
        else if (cp['status'] === "online" || cp['status'] === "charging") totals.online += 1;
        if (everConnected) totals.everConnected += 1;
      }

      const stationAvailability = sumAvailability(stationParts);
      networkParts.push(...stationParts);
      stations.push({
        id: st.id as string,
        name: st.name as string,
        area: (st.area as string | null) ?? null,
        kind: st.kind as string,
        ownerName: (st.owners as { name?: string } | null)?.name ?? null,
        report: availabilityReport(stationAvailability),
        energyKwh: 0,
        revenueMinor: 0,
        sessions: 0,
        chargePoints,
      });
    }

    const byStation = new Map(stations.map((s) => [s.id, s]));
    for (const s of sessions ?? []) {
      const stationId = connectorToStation.get(s.connector_id as string);
      const station = stationId ? byStation.get(stationId) : undefined;
      const kwh = Number(s.kwh ?? 0);
      const minor = Number(s.total_minor ?? 0) || Math.round(Number(s.cost_rwf ?? 0) * 100);
      totals.energyKwh += kwh;
      totals.revenueMinor += minor;
      if (s.status === "charging") totals.liveSessions += 1;
      if (station) {
        station.energyKwh = Math.round((station.energyKwh + kwh) * 1000) / 1000;
        station.revenueMinor += minor;
        station.sessions += 1;
      }
    }
    totals.energyKwh = Math.round(totals.energyKwh * 1000) / 1000;

    return {
      windowHours: data.windowHours,
      observedFrom: fromIso,
      network: availabilityReport(sumAvailability(networkParts)),
      totals,
      targets: {
        greenAtOrAbovePct: UPTIME_TARGETS.greenAtOrAbovePct.value,
        amberAtOrAbovePct: UPTIME_TARGETS.amberAtOrAbovePct.value,
        minObservationHours: UPTIME_TARGETS.minObservationHours.value,
      },
      stations,
    };
  });

/**
 * Run the liveness watchdog on demand from the control room: any pile silent
 * past its heartbeat window flips to offline and keeps its last-seen time.
 */
export const sweepLiveness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden: operator or admin role required");
    const { runLivenessWatchdog } = await import("@/lib/ocpp/handler.server");
    const result = await runLivenessWatchdog();
    return { ...result, missedHeartbeats: OCPP.offlineAfterMissedHeartbeats.value };
  });
