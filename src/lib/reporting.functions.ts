/**
 * Utility-grade reporting for grid operators and regulators.
 *
 * Read through the caller's own Supabase client, so RLS decides what is in
 * scope: an owner sees their own sites, UZA staff see the network. Every figure
 * comes from recorded sessions and reported meter samples — a site that was
 * never metered reports no peak rather than a plausible-looking number.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TIMEZONE } from "@/config/policy";
import { segmentIndexLocal } from "@/lib/time";
import {
  chargePointEnergy,
  energyPerSite,
  loadProfile,
  peakDemand,
  reportTotals,
  revenueBreakdown,
  sessionProfiles,
  type ChargePointRef,
  type ChargePointRow,
  type MeterSample,
  type PeakDemandRow,
  type ProfileSegment,
  type RevenueBreakdown,
  type SessionProfileRow,
  type SessionRecord,
  type SiteEnergyRow,
  type TariffUsageRow,
} from "@/lib/reporting";

export type RegulatorReport = {
  timezone: string;
  generatedAtMs: number;
  fromMs: number;
  toMs: number;
  scope: {
    ownerId: string | null;
    ownerName: string | null;
    owners: { id: string; name: string }[];
    /** Every site the caller may read, whether or not it is in the current filter. */
    sites: { id: string; name: string; ownerName: string | null }[];
    /** Sites the figures were restricted to; empty means every site in scope. */
    siteIds: string[];
  };
  totals: ReturnType<typeof reportTotals>;
  sites: SiteEnergyRow[];
  peaks: PeakDemandRow[];
  profile: ProfileSegment[];
  sessions: SessionProfileRow[];
  /** Every registered charge point in scope, measured or silent. */
  chargePoints: ChargePointRow[];
  /** What the tariff actually charged for, split by component. */
  revenue: RevenueBreakdown;
  /** Tariff versions in force in the period, with what they priced. */
  tariffs: TariffUsageRow[];
  /** Rows read, so the reader can see the report is not padded. */
  counts: { meterSamples: number; sessions: number; chargePoints: number; truncated: boolean };
};

const MAX_SAMPLES = 20000;
const MAX_SESSIONS = 5000;

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Local Kigali day boundaries, so a chosen date means that whole local day. */
function dayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00+02:00`);
}
function dayEndMs(day: string): number {
  return Date.parse(`${day}T23:59:59.999+02:00`);
}

export const fetchRegulatorReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ownerId: z.string().uuid().optional(),
        days: z.number().int().min(1).max(365).default(30),
        /** Explicit local dates win over `days` when both are supplied. */
        from: DAY.optional(),
        to: DAY.optional(),
        siteIds: z.array(z.string().uuid()).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<RegulatorReport> => {
    const supabase = context.supabase;
    const explicit = data.from && data.to && dayStartMs(data.from) <= dayEndMs(data.to);
    const toMs = explicit ? Math.min(dayEndMs(data.to!), Date.now()) : Date.now();
    const fromMs = explicit ? dayStartMs(data.from!) : toMs - data.days * 86_400_000;
    const fromIso = new Date(fromMs).toISOString();
    const toIso = new Date(toMs).toISOString();
    const siteFilter = new Set(data.siteIds ?? []);

    const { data: ownerRows } = await supabase.from("owners").select("id, name").order("name");
    const owners = (ownerRows ?? []).map((o) => ({ id: o.id, name: o.name }));
    const owner = data.ownerId ? owners.find((o) => o.id === data.ownerId) ?? null : null;

    const stationQuery = supabase
      .from("stations")
      .select(
        "id, name, site_id, area, owner_id, sites(id, name), chargers(id, serial, ocpp_identity, vendor, model, power_type, rated_power_kw, status, last_seen_at, connectors(id, label, type))",
      );
    const { data: stationRows } = owner ? await stationQuery.eq("owner_id", owner.id) : await stationQuery;

    type Ref = {
      siteId: string;
      siteName: string;
      stationName: string;
      connectorLabel: string;
      connectorType: string;
      serial: string;
      chargerId: string;
    };
    const byConnector = new Map<string, Ref>();
    const ownerName = new Map(owners.map((o) => [o.id, o.name]));
    const sitesInScope = new Map<string, { id: string; name: string; ownerName: string | null }>();
    const chargePointRefs: ChargePointRef[] = [];

    for (const st of stationRows ?? []) {
      // A station not yet grouped under a site is reported under its own name,
      // never silently merged into another site.
      const siteId = st.sites?.id ?? st.id;
      const siteName = st.sites?.name ?? `${st.name} (site not registered)`;
      sitesInScope.set(siteId, {
        id: siteId,
        name: siteName,
        ownerName: st.owner_id ? ownerName.get(st.owner_id) ?? null : null,
      });
      if (siteFilter.size && !siteFilter.has(siteId)) continue;
      for (const ch of st.chargers ?? []) {
        const lastSeen = ch.last_seen_at ? Date.parse(ch.last_seen_at) : null;
        chargePointRefs.push({
          chargerId: ch.id,
          serial: ch.serial,
          ocppIdentity: ch.ocpp_identity,
          vendor: ch.vendor,
          model: ch.model,
          stationName: st.name,
          siteId,
          siteName,
          ownerName: st.owner_id ? ownerName.get(st.owner_id) ?? null : null,
          powerType: ch.power_type,
          ratedKw: ch.rated_power_kw === null ? null : Number(ch.rated_power_kw),
          connectors: (ch.connectors ?? []).length,
          status: ch.status,
          lastSeenAtMs: lastSeen !== null && !Number.isNaN(lastSeen) ? lastSeen : null,
        });
        for (const cn of ch.connectors ?? []) {
          byConnector.set(cn.id, {
            siteId,
            siteName,
            stationName: st.name,
            connectorLabel: cn.label,
            connectorType: cn.type,
            serial: ch.serial,
            chargerId: ch.id,
          });
        }
      }
    }

    const scope = {
      ownerId: owner?.id ?? null,
      ownerName: owner?.name ?? null,
      owners,
      sites: [...sitesInScope.values()].sort((a, b) => a.name.localeCompare(b.name)),
      siteIds: [...siteFilter],
    };

    const connectorIds = [...byConnector.keys()];
    if (!connectorIds.length) {
      return {
        timezone: TIMEZONE.value,
        generatedAtMs: Date.now(),
        fromMs,
        toMs,
        scope,
        totals: reportTotals([], []),
        sites: [],
        peaks: [],
        profile: [],
        sessions: [],
        chargePoints: [],
        revenue: revenueBreakdown([]),
        tariffs: [],
        counts: { meterSamples: 0, sessions: 0, chargePoints: 0, truncated: false },
      };
    }


    const { data: sessionRows } = await supabase
      .from("sessions")
      .select(
        "id, serial_no, connector_id, started_at, ended_at, status, kwh, total_minor, cost_rwf, soc_start, soc_end, start_method, energy_minor, time_minor, session_fee_minor, idle_minor, idle_minutes, tariff_version_id",
      )
      .in("connector_id", connectorIds)
      .gte("started_at", fromIso)
      .lte("started_at", toIso)
      .order("started_at", { ascending: false })
      .limit(MAX_SESSIONS);

    const sessions: SessionRecord[] = (sessionRows ?? []).flatMap((s) => {
      const ref = byConnector.get(s.connector_id);
      if (!ref) return [];
      const startedAtMs = Date.parse(s.started_at);
      if (Number.isNaN(startedAtMs)) return [];
      const endedAtMs = s.ended_at ? Date.parse(s.ended_at) : null;
      // Sessions priced before minor units existed kept whole RWF on cost_rwf.
      const totalMinor =
        Number(s.total_minor ?? 0) > 0 ? Number(s.total_minor) : Math.round(Number(s.cost_rwf ?? 0) * 100);
      return [
        {
          id: s.id,
          serialNo: s.serial_no,
          siteId: ref.siteId,
          siteName: ref.siteName,
          stationName: ref.stationName,
          connectorLabel: ref.connectorLabel,
          connectorType: ref.connectorType,
          chargerId: ref.chargerId,
          startedAtMs,
          endedAtMs: endedAtMs !== null && !Number.isNaN(endedAtMs) ? endedAtMs : null,
          kwh: Number(s.kwh ?? 0),
          totalMinor,
          energyMinor: Number(s.energy_minor ?? 0),
          timeMinor: Number(s.time_minor ?? 0),
          sessionFeeMinor: Number(s.session_fee_minor ?? 0),
          idleMinor: Number(s.idle_minor ?? 0),
          idleMinutes: Number(s.idle_minutes ?? 0),
          tariffVersionId: s.tariff_version_id,
          socStart: s.soc_start,
          socEnd: s.soc_end,
          startMethod: s.start_method,
          status: s.status,
        },
      ];
    });

    const sessionIds = sessions.map((s) => s.id);
    const connectorOfSession = new Map((sessionRows ?? []).map((s) => [s.id, s.connector_id]));

    let samples: MeterSample[] = [];
    if (sessionIds.length) {
      const { data: meterRows } = await supabase
        .from("meter_values")
        .select("session_id, ts, power_kw")
        .in("session_id", sessionIds.slice(0, 500))
        .gte("ts", fromIso)
        .lte("ts", toIso)
        .order("ts", { ascending: true })
        .limit(MAX_SAMPLES);

      samples = (meterRows ?? []).flatMap((m) => {
        const connectorId = connectorOfSession.get(m.session_id);
        const ref = connectorId ? byConnector.get(connectorId) : undefined;
        const atMs = Date.parse(m.ts);
        if (!ref || !connectorId || Number.isNaN(atMs) || m.power_kw === null) return [];
        return [
          {
            atMs,
            siteId: ref.siteId,
            siteName: ref.siteName,
            connectorId,
            chargerId: ref.chargerId,
            powerKw: Number(m.power_kw),
          },
        ];
      });
    }

    // Tariff versions in force during the period, with what they actually
    // priced. A version nobody charged under still shows, with zero sessions.
    const tariffQuery = supabase
      .from("tariff_versions")
      .select(
        "id, name, owner_id, station_id, energy_minor_per_kwh, time_minor_per_minute, session_fee_minor, idle_fee_minor_per_minute, idle_grace_minutes, currency, published, effective_from, effective_to",
      )
      .lte("effective_from", toIso)
      .order("effective_from", { ascending: false });
    const { data: tariffRows } = owner ? await tariffQuery.eq("owner_id", owner.id) : await tariffQuery;

    const stationNameById = new Map((stationRows ?? []).map((st) => [st.id, st.name]));
    const usage = new Map<string, { sessions: number; kwh: number; revenueMinor: number }>();
    for (const s of sessions) {
      if (!s.tariffVersionId) continue;
      const u = usage.get(s.tariffVersionId) ?? { sessions: 0, kwh: 0, revenueMinor: 0 };
      u.sessions += 1;
      u.kwh += Number(s.kwh) || 0;
      u.revenueMinor += Math.round(Number(s.totalMinor) || 0);
      usage.set(s.tariffVersionId, u);
    }

    const tariffs: TariffUsageRow[] = (tariffRows ?? []).flatMap((t) => {
      const effectiveFromMs = Date.parse(t.effective_from);
      const effectiveToMs = t.effective_to ? Date.parse(t.effective_to) : null;
      // Effective-dated, never retroactive: skip a version already retired
      // before this period opened.
      if (effectiveToMs !== null && effectiveToMs < fromMs) return [];
      const u = usage.get(t.id) ?? { sessions: 0, kwh: 0, revenueMinor: 0 };
      return [
        {
          id: t.id,
          name: t.name,
          // Name the owner, so three same-named owner tariffs are told apart.
          siteScope: t.station_id
            ? stationNameById.get(t.station_id) ?? "one station"
            : `all stations of ${t.owner_id ? ownerName.get(t.owner_id) ?? "the owner" : "the owner"}`,
          energyMinorPerKwh: Number(t.energy_minor_per_kwh),
          timeMinorPerMinute: Number(t.time_minor_per_minute),
          sessionFeeMinor: Number(t.session_fee_minor),
          idleFeeMinorPerMinute: Number(t.idle_fee_minor_per_minute),
          idleGraceMinutes: Number(t.idle_grace_minutes),
          currency: t.currency,
          published: t.published,
          effectiveFromMs: Number.isNaN(effectiveFromMs) ? fromMs : effectiveFromMs,
          effectiveToMs: effectiveToMs !== null && !Number.isNaN(effectiveToMs) ? effectiveToMs : null,
          sessionsPriced: u.sessions,
          kwh: Math.round(u.kwh * 1000) / 1000,
          revenueMinor: u.revenueMinor,
        },
      ];
    });

    const sites = energyPerSite(sessions, samples);
    const profiles = sessionProfiles(sessions);
    const chargePoints = chargePointEnergy(chargePointRefs, sessions, samples);

    return {
      timezone: TIMEZONE.value,
      generatedAtMs: Date.now(),
      fromMs,
      toMs,
      scope,
      totals: reportTotals(sites, profiles),
      sites,
      peaks: peakDemand(samples),
      profile: loadProfile(samples, segmentIndexLocal),
      sessions: profiles,
      chargePoints,
      revenue: revenueBreakdown(sessions),
      tariffs,
      counts: {
        meterSamples: samples.length,
        sessions: sessions.length,
        chargePoints: chargePoints.length,
        truncated: samples.length >= MAX_SAMPLES || sessions.length >= MAX_SESSIONS,
      },
    };
  });
