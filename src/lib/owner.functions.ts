/**
 * Owner portal — the station owner's own view of the investment.
 *
 * Everything is read through the caller's Supabase client, so RLS scopes a
 * host strictly to their own owner records. Figures are measured: uptime and
 * utilisation come from observed status history, revenue from settled session
 * charges, and a projection is only ever returned as an explicit estimate with
 * a band (or refused when history is too thin).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUBSCRIPTION_DEFAULTS, TIMEZONE, UPTIME_TARGETS } from "@/config/policy";
import { splitRevenue, type RevenueSplitRule } from "@/lib/pricing";
import {
  accumulateAvailability,
  availabilityReport,
  sumAvailability,
  type Availability,
  type AvailabilityReport,
  type StatusChange,
} from "@/lib/uptime";
import {
  draftSubscriptionInvoice,
  healthScore,
  projectRevenue,
  trend,
  type DayPoint,
  type HealthScore,
  type Projection,
  type Trend,
} from "@/lib/forecast";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type OwnerRef = { id: string; name: string; kind: string; city: string | null };

export type OwnerSubscriptionView = {
  status: string;
  planCode: string;
  planName: string;
  planDescription: string | null;
  features: string[];
  minMonthlyMinor: number;
  perChargePointMinor: number;
  includedChargePoints: number;
  allowsPublicListing: boolean;
  allowsReservations: boolean;
  allowsApiAccess: boolean;
  listedPublicly: boolean;
  trialEndsOn: string | null;
  currentPeriodEnd: string | null;
  billingDay: number;
  /** What this owner would be invoiced this month at their current pile count. */
  dueThisMonthMinor: number;
} | null;

export type OwnerInvoiceView = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  chargePointCount: number;
  totalMinor: number;
  status: string;
  dueOn: string | null;
  paidAt: string | null;
};

export type OwnerSettlementView = {
  id: string;
  periodStart: string;
  periodEnd: string;
  sessionCount: number;
  totalKwh: number;
  grossMinor: number;
  energyCostMinor: number;
  hostMinor: number;
  platformMinor: number;
  splitRuleVersion: number | null;
  status: string;
  generatedAt: string;
};

export type OwnerPayoutView = {
  id: string;
  amountMinor: number;
  method: string;
  status: string;
  scheduledFor: string | null;
  paidAt: string | null;
};

export type OwnerSiteView = {
  id: string;
  name: string;
  city: string | null;
  area: string | null;
  stations: number;
  chargePoints: number;
  neverConnected: number;
  offline: number;
  openFaults: number;
  energyKwh: number;
  revenueMinor: number;
  report: AvailabilityReport;
};

export type OwnerPortalSnapshot = {
  timezone: string;
  windowHours: number;
  owners: OwnerRef[];
  owner: OwnerRef | null;
  subscription: OwnerSubscriptionView;
  fleet: {
    sites: number;
    stations: number;
    chargePoints: number;
    everConnected: number;
    neverConnected: number;
    offline: number;
    openFaults: number;
    liveSessions: number;
  };
  availability: AvailabilityReport;
  targets: { greenAtOrAbovePct: number; amberAtOrAbovePct: number; minObservationHours: number };
  window: { sessions: number; energyKwh: number; revenueMinor: number };
  daily: DayPoint[];
  revenueTrend: Trend;
  energyTrend: Trend;
  projection: Projection;
  health: HealthScore;
  splitPreview: {
    ruleVersion: number;
    grossMinor: number;
    energyCostMinor: number;
    hostMinor: number;
    platformMinor: number;
  } | null;
  sites: OwnerSiteView[];
  invoices: OwnerInvoiceView[];
  settlements: OwnerSettlementView[];
  payouts: OwnerPayoutView[];
};

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

export const fetchOwnerPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ownerId: z.string().uuid().optional(),
        windowHours: z.number().int().min(24).max(2160).default(720),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<OwnerPortalSnapshot> => {
    const supabase = context.supabase;
    const toMs = Date.now();
    const fromMs = toMs - data.windowHours * 3_600_000;
    const fromIso = new Date(fromMs).toISOString();

    const { data: ownerRows } = await supabase
      .from("owners")
      .select("id, name, kind, city")
      .order("name", { ascending: true });

    const owners: OwnerRef[] = (ownerRows ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      kind: o.kind,
      city: o.city,
    }));

    const owner = data.ownerId ? owners.find((o) => o.id === data.ownerId) ?? null : owners[0] ?? null;

    const empty: OwnerPortalSnapshot = {
      timezone: TIMEZONE.value,
      windowHours: data.windowHours,
      owners,
      owner,
      subscription: null,
      fleet: {
        sites: 0,
        stations: 0,
        chargePoints: 0,
        everConnected: 0,
        neverConnected: 0,
        offline: 0,
        openFaults: 0,
        liveSessions: 0,
      },
      availability: { kind: "never_connected" },
      targets: {
        greenAtOrAbovePct: UPTIME_TARGETS.greenAtOrAbovePct.value,
        amberAtOrAbovePct: UPTIME_TARGETS.amberAtOrAbovePct.value,
        minObservationHours: UPTIME_TARGETS.minObservationHours.value,
      },
      window: { sessions: 0, energyKwh: 0, revenueMinor: 0 },
      daily: [],
      revenueTrend: trend([], (d) => d.revenueMinor),
      energyTrend: trend([], (d) => d.kwh),
      projection: projectRevenue([], 30),
      health: healthScore({
        uptimePct: null,
        utilisationPct: null,
        revenuePerPilePerDayMinor: null,
        openFaults: 0,
        chargePoints: 0,
      }),
      splitPreview: null,
      sites: [],
      invoices: [],
      settlements: [],
      payouts: [],
    };

    if (!owner) return empty;

    const [
      { data: siteRows },
      { data: stationRows },
      { data: subRow },
      { data: invoiceRows },
      { data: settlementRows },
      { data: payoutRows },
      { data: splitRow },
    ] = await Promise.all([
      supabase
        .from("sites")
        .select("id, name, city, area")
        .eq("owner_id", owner.id)
        .order("name", { ascending: true }),
      supabase
        .from("stations")
        .select(
          "id, name, site_id, chargers(id, status, last_seen_at, connectors(id, status))",
        )
        .eq("owner_id", owner.id),
      supabase
        .from("owner_subscriptions")
        .select(
          "status, billing_day, trial_ends_on, current_period_end, listed_publicly, subscription_plans(code, name, description, features, price_minor_per_charge_point, min_monthly_minor, included_charge_points, allows_public_listing, allows_reservations, allows_api_access)",
        )
        .eq("owner_id", owner.id)
        .maybeSingle(),
      supabase
        .from("invoices")
        .select("id, number, period_start, period_end, charge_point_count, total_minor, status, due_on, paid_at")
        .eq("owner_id", owner.id)
        .order("period_start", { ascending: false })
        .limit(24),
      supabase
        .from("settlement_runs")
        .select(
          "id, period_start, period_end, session_count, total_kwh, gross_minor, energy_cost_minor, host_minor, platform_minor, split_rule_version, status, generated_at",
        )
        .eq("owner_id", owner.id)
        .order("period_start", { ascending: false })
        .limit(24),
      supabase
        .from("payouts")
        .select("id, amount_minor, method, status, scheduled_for, paid_at")
        .eq("owner_id", owner.id)
        .order("created_at", { ascending: false })
        .limit(24),
      supabase
        .from("revenue_split_rules")
        .select("version, energy_cost_minor_per_kwh, host_share_bps, platform_share_bps")
        .eq("owner_id", owner.id)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const stations = stationRows ?? [];
    const chargerIds: string[] = [];
    const connectorToStation = new Map<string, string>();
    const stationToSite = new Map<string, string | null>();
    let neverConnected = 0;
    let offline = 0;
    let everConnected = 0;
    let chargePoints = 0;

    for (const st of stations) {
      stationToSite.set(st.id, st.site_id ?? null);
      for (const ch of st.chargers ?? []) {
        chargePoints += 1;
        chargerIds.push(ch.id);
        if (ch.status === "never_connected" || !ch.last_seen_at) neverConnected += 1;
        else {
          everConnected += 1;
          if (ch.status === "offline") offline += 1;
        }
        for (const cn of ch.connectors ?? []) connectorToStation.set(cn.id, st.id);
      }
    }

    const connectorIds = [...connectorToStation.keys()];

    const [{ data: history }, { data: sessions }, { data: faults }] = await Promise.all([
      chargerIds.length
        ? supabase
            .from("charge_point_status_history")
            .select("charger_id, connector_id, status, changed_at")
            .in("charger_id", chargerIds)
            .order("changed_at", { ascending: true })
            .limit(20000)
        : Promise.resolve({ data: [] as never[] }),
      connectorIds.length
        ? supabase
            .from("sessions")
            .select("id, status, kwh, total_minor, cost_rwf, started_at, connector_id")
            .in("connector_id", connectorIds)
            .gte("started_at", fromIso)
        : Promise.resolve({ data: [] as never[] }),
      chargerIds.length
        ? supabase.from("faults").select("id, charger_id").in("charger_id", chargerIds).is("cleared_at", null)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    // Availability per charge point, aggregated up to site and owner.
    const changesByCharger = new Map<string, StatusChange[]>();
    for (const row of history ?? []) {
      const at = Date.parse(row.changed_at);
      if (Number.isNaN(at)) continue;
      const list = changesByCharger.get(row.charger_id) ?? [];
      list.push({ atMs: at, status: row.status });
      changesByCharger.set(row.charger_id, list);
    }

    const win = { fromMs, toMs };
    const availabilityByStation = new Map<string, Availability[]>();
    for (const st of stations) {
      const parts: Availability[] = [];
      for (const ch of st.chargers ?? []) {
        parts.push(accumulateAvailability(changesByCharger.get(ch.id) ?? [], win, null));
      }
      availabilityByStation.set(st.id, parts);
    }

    const ownerAvailability = sumAvailability([...availabilityByStation.values()].flat());
    const ownerReport = availabilityReport(ownerAvailability);

    // Daily realised activity, bucketed in Africa/Kigali.
    const dailyMap = new Map<string, DayPoint>();
    let windowKwh = 0;
    let windowRevenue = 0;
    let liveSessions = 0;
    const energyByStation = new Map<string, number>();
    const revenueByStation = new Map<string, number>();
    const sessionsByStation = new Map<string, number>();

    for (const s of sessions ?? []) {
      const kwh = Number(s.kwh ?? 0);
      // Legacy sessions priced before minor units were introduced kept their
      // total in whole RWF on `cost_rwf`; read that rather than showing zero.
      const revenue =
        Number(s.total_minor ?? 0) > 0 ? Number(s.total_minor) : Math.round(Number(s.cost_rwf ?? 0) * 100);
      windowKwh += kwh;
      windowRevenue += revenue;
      if (s.status === "active" || s.status === "charging") liveSessions += 1;

      const dayKey = kigaliDay(s.started_at);
      const point = dailyMap.get(dayKey) ?? { day: dayKey, sessions: 0, kwh: 0, revenueMinor: 0 };
      point.sessions += 1;
      point.kwh += kwh;
      point.revenueMinor += revenue;
      dailyMap.set(dayKey, point);

      const stationId = connectorToStation.get(s.connector_id);
      if (stationId) {
        energyByStation.set(stationId, (energyByStation.get(stationId) ?? 0) + kwh);
        revenueByStation.set(stationId, (revenueByStation.get(stationId) ?? 0) + revenue);
        sessionsByStation.set(stationId, (sessionsByStation.get(stationId) ?? 0) + 1);
      }
    }

    const daily = [...dailyMap.values()]
      .map((d) => ({ ...d, kwh: Math.round(d.kwh * 1000) / 1000 }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const faultsByCharger = new Map<string, number>();
    for (const f of faults ?? []) {
      faultsByCharger.set(f.charger_id, (faultsByCharger.get(f.charger_id) ?? 0) + 1);
    }
    const openFaults = [...faultsByCharger.values()].reduce((a, b) => a + b, 0);

    // Sites roll-up. Stations with no site yet are grouped as unassigned.
    const sitesView: OwnerSiteView[] = (siteRows ?? []).map((site) => {
      const own = stations.filter((st) => st.site_id === site.id);
      const parts = own.flatMap((st) => availabilityByStation.get(st.id) ?? []);
      let cp = 0;
      let never = 0;
      let off = 0;
      let sf = 0;
      for (const st of own) {
        for (const ch of st.chargers ?? []) {
          cp += 1;
          if (ch.status === "never_connected" || !ch.last_seen_at) never += 1;
          else if (ch.status === "offline") off += 1;
          sf += faultsByCharger.get(ch.id) ?? 0;
        }
      }
      return {
        id: site.id,
        name: site.name,
        city: site.city,
        area: site.area,
        stations: own.length,
        chargePoints: cp,
        neverConnected: never,
        offline: off,
        openFaults: sf,
        energyKwh: round3(own.reduce((a, st) => a + (energyByStation.get(st.id) ?? 0), 0)),
        revenueMinor: own.reduce((a, st) => a + (revenueByStation.get(st.id) ?? 0), 0),
        report: availabilityReport(sumAvailability(parts)),
      };
    });

    const measuredUptime =
      ownerReport.kind === "measured" && ownerReport.verdict.status !== "insufficient_data"
        ? ownerReport.verdict.uptimePct
        : null;
    const measuredUtilisation = ownerReport.kind === "measured" ? ownerReport.utilisationPct : null;
    const observedDays = Math.max(1, data.windowHours / 24);

    const rule: RevenueSplitRule | null = splitRow
      ? {
          version: splitRow.version,
          energyCostMinorPerKwh: Number(splitRow.energy_cost_minor_per_kwh),
          hostShareBps: splitRow.host_share_bps,
          platformShareBps: splitRow.platform_share_bps,
        }
      : null;

    const preview = rule ? splitRevenue(windowRevenue, windowKwh, rule) : null;

    const plan = subRow?.subscription_plans ?? null;
    const subscription: OwnerSubscriptionView = plan
      ? {
          status: subRow?.status ?? "trialing",
          planCode: plan.code,
          planName: plan.name,
          planDescription: plan.description,
          features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
          minMonthlyMinor: Number(plan.min_monthly_minor),
          perChargePointMinor: Number(plan.price_minor_per_charge_point),
          includedChargePoints: plan.included_charge_points,
          allowsPublicListing: plan.allows_public_listing,
          allowsReservations: plan.allows_reservations,
          allowsApiAccess: plan.allows_api_access,
          listedPublicly: subRow?.listed_publicly ?? false,
          trialEndsOn: subRow?.trial_ends_on ?? null,
          currentPeriodEnd: subRow?.current_period_end ?? null,
          billingDay: subRow?.billing_day ?? SUBSCRIPTION_DEFAULTS.billingDay.value,
          dueThisMonthMinor: draftSubscriptionInvoice(
            {
              priceMinorPerChargePoint: Number(plan.price_minor_per_charge_point),
              minMonthlyMinor: Number(plan.min_monthly_minor),
              includedChargePoints: plan.included_charge_points,
            },
            chargePoints,
          ).totalMinor,
        }
      : null;

    return {
      ...empty,
      owner,
      subscription,
      fleet: {
        sites: (siteRows ?? []).length,
        stations: stations.length,
        chargePoints,
        everConnected,
        neverConnected,
        offline,
        openFaults,
        liveSessions,
      },
      availability: ownerReport,
      window: {
        sessions: (sessions ?? []).length,
        energyKwh: round3(windowKwh),
        revenueMinor: windowRevenue,
      },
      daily,
      revenueTrend: trend(daily, (d) => d.revenueMinor),
      energyTrend: trend(daily, (d) => d.kwh),
      projection: projectRevenue(daily, 30),
      health: healthScore({
        uptimePct: measuredUptime,
        utilisationPct: measuredUtilisation,
        revenuePerPilePerDayMinor: chargePoints
          ? Math.round(windowRevenue / chargePoints / observedDays)
          : null,
        openFaults,
        chargePoints,
      }),
      splitPreview: preview
        ? {
            ruleVersion: preview.ruleVersion,
            grossMinor: preview.grossMinor,
            energyCostMinor: preview.energyCostMinor,
            hostMinor: preview.hostMinor,
            platformMinor: preview.platformMinor,
          }
        : null,
      sites: sitesView,
      invoices: (invoiceRows ?? []).map((i) => ({
        id: i.id,
        number: i.number,
        periodStart: i.period_start,
        periodEnd: i.period_end,
        chargePointCount: i.charge_point_count,
        totalMinor: Number(i.total_minor),
        status: i.status,
        dueOn: i.due_on,
        paidAt: i.paid_at,
      })),
      settlements: (settlementRows ?? []).map((s) => ({
        id: s.id,
        periodStart: s.period_start,
        periodEnd: s.period_end,
        sessionCount: s.session_count,
        totalKwh: Number(s.total_kwh),
        grossMinor: Number(s.gross_minor),
        energyCostMinor: Number(s.energy_cost_minor),
        hostMinor: Number(s.host_minor),
        platformMinor: Number(s.platform_minor),
        splitRuleVersion: s.split_rule_version,
        status: s.status,
        generatedAt: s.generated_at,
      })),
      payouts: (payoutRows ?? []).map((p) => ({
        id: p.id,
        amountMinor: Number(p.amount_minor),
        method: p.method,
        status: p.status,
        scheduledFor: p.scheduled_for,
        paidAt: p.paid_at,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Settlement run + payout                                             */
/* ------------------------------------------------------------------ */

export const runOwnerSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ownerId: z.string().uuid(),
        periodStart: z.string().min(10),
        periodEnd: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden: operator or admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: stations, error: stationErr } = await supabaseAdmin
      .from("stations")
      .select("id, chargers(id, connectors(id))")
      .eq("owner_id", data.ownerId);
    if (stationErr) throw new Error(stationErr.message);

    const connectorIds = (stations ?? []).flatMap((st) =>
      (st.chargers ?? []).flatMap((ch) => (ch.connectors ?? []).map((cn) => cn.id)),
    );

    const { data: sessions } = connectorIds.length
      ? await supabaseAdmin
          .from("sessions")
          .select("id, kwh, total_minor, cost_rwf, ended_at")
          .in("connector_id", connectorIds)
          .eq("status", "completed")
          .gte("ended_at", data.periodStart)
          .lt("ended_at", data.periodEnd)
      : { data: [] as { id: string; kwh: number; total_minor: number; cost_rwf: number }[] };

    // Legacy sessions priced before minor units kept their total on `cost_rwf`.
    const grossMinor = (sessions ?? []).reduce(
      (a, s) =>
        a +
        (Number(s.total_minor ?? 0) > 0
          ? Number(s.total_minor)
          : Math.round(Number(s.cost_rwf ?? 0) * 100)),
      0,
    );
    const totalKwh = (sessions ?? []).reduce((a, s) => a + Number(s.kwh ?? 0), 0);

    const { data: splitRow } = await supabaseAdmin
      .from("revenue_split_rules")
      .select("version, energy_cost_minor_per_kwh, host_share_bps, platform_share_bps")
      .eq("owner_id", data.ownerId)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!splitRow) throw new Error("No revenue split rule configured for this owner");

    const split = splitRevenue(grossMinor, totalKwh, {
      version: splitRow.version,
      energyCostMinorPerKwh: Number(splitRow.energy_cost_minor_per_kwh),
      hostShareBps: splitRow.host_share_bps,
      platformShareBps: splitRow.platform_share_bps,
    });

    const { data: owner } = await supabaseAdmin
      .from("owners")
      .select("payout_schedule, momo_merchant_id, airtel_merchant_id")
      .eq("id", data.ownerId)
      .single();

    const { data: run, error } = await supabaseAdmin
      .from("settlement_runs")
      .insert({
        owner_id: data.ownerId,
        period_start: new Date(data.periodStart).toISOString(),
        period_end: new Date(data.periodEnd).toISOString(),
        session_count: (sessions ?? []).length,
        total_kwh: Math.round(totalKwh * 1000) / 1000,
        gross_minor: split.grossMinor,
        energy_cost_minor: split.energyCostMinor,
        host_minor: split.hostMinor,
        platform_minor: split.platformMinor,
        split_rule_version: split.ruleVersion,
        status: "issued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (split.hostMinor > 0) {
      const { error: payoutErr } = await supabaseAdmin.from("payouts").insert({
        settlement_run_id: run.id,
        owner_id: data.ownerId,
        amount_minor: split.hostMinor,
        method: owner?.momo_merchant_id ? "momo" : owner?.airtel_merchant_id ? "airtel" : "bank",
        destination: owner?.momo_merchant_id ?? owner?.airtel_merchant_id ?? null,
        status: "scheduled",
      });
      if (payoutErr) throw new Error(payoutErr.message);
    }

    return {
      settlementRunId: run.id,
      sessions: (sessions ?? []).length,
      grossMinor: split.grossMinor,
      hostMinor: split.hostMinor,
      platformMinor: split.platformMinor,
    };
  });

/* ------------------------------------------------------------------ */
/* Subscription invoice                                                */
/* ------------------------------------------------------------------ */

export const raiseSubscriptionInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ownerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden: operator or admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("owner_subscriptions")
      .select(
        "id, owner_id, subscription_plans(price_minor_per_charge_point, min_monthly_minor, included_charge_points)",
      )
      .eq("owner_id", data.ownerId)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub?.subscription_plans) throw new Error("This owner has no subscription plan yet");

    const { data: stations } = await supabaseAdmin
      .from("stations")
      .select("id, chargers(id)")
      .eq("owner_id", data.ownerId);
    const chargePoints = (stations ?? []).reduce((a, st) => a + (st.chargers ?? []).length, 0);

    const plan = sub.subscription_plans;
    const draft = draftSubscriptionInvoice(
      {
        priceMinorPerChargePoint: Number(plan.price_minor_per_charge_point),
        minMonthlyMinor: Number(plan.min_monthly_minor),
        includedChargePoints: plan.included_charge_points,
      },
      chargePoints,
    );

    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const due = new Date(periodStart);
    due.setUTCDate(due.getUTCDate() + SUBSCRIPTION_DEFAULTS.invoiceDueDays.value);
    const number = `UCN-SUB-${periodStart.toISOString().slice(0, 7)}-${data.ownerId.slice(0, 8)}`;

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .upsert(
        {
          owner_id: data.ownerId,
          subscription_id: sub.id,
          number,
          period_start: isoDate(periodStart),
          period_end: isoDate(periodEnd),
          charge_point_count: chargePoints,
          subtotal_minor: draft.totalMinor,
          total_minor: draft.totalMinor,
          status: "issued",
          due_on: isoDate(due),
        },
        { onConflict: "number" },
      )
      .select("id, number, total_minor")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("invoice_lines").delete().eq("invoice_id", invoice.id);
    const { error: lineErr } = await supabaseAdmin.from("invoice_lines").insert(
      draft.lines.map((l) => ({
        invoice_id: invoice.id,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity,
        unit_minor: l.unitMinor,
        amount_minor: l.amountMinor,
      })),
    );
    if (lineErr) throw new Error(lineErr.message);

    return { invoiceId: invoice.id, number: invoice.number, totalMinor: Number(invoice.total_minor) };
  });

/**
 * Owner asks to pay a subscription invoice by mobile money.
 *
 * The MTN MoMo / Airtel collection API is not connected yet, so this records a
 * verifiable request and moves the invoice to `awaiting_payment` — it never
 * claims money has moved.
 */
export const requestInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ invoiceId: z.string().uuid(), method: z.enum(["momo", "airtel", "bank"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS: the owner can only see (and therefore only update) their own invoice.
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id, owner_id, status, total_minor")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") return { status: "paid", note: "This invoice is already paid." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateErr } = await supabaseAdmin
      .from("invoices")
      .update({
        status: "awaiting_payment",
        pay_method: data.method,
        provider_ref: `REQ-${Date.now().toString(36).toUpperCase()}`,
      })
      .eq("id", invoice.id);
    if (updateErr) throw new Error(updateErr.message);

    return {
      status: "awaiting_payment",
      amountMinor: Number(invoice.total_minor),
      note: "Payment request recorded. Mobile-money collection goes live once the MoMo/Airtel merchant credentials are connected.",
    };
  });

/** Owner opts their stations in or out of the public locator. */
export const setPublicListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ownerId: z.string().uuid(), listed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_owner_access", {
      _owner_id: data.ownerId,
    });
    if (!allowed) throw new Error("Forbidden: you do not manage this owner");

    const { data: sub } = await context.supabase
      .from("owner_subscriptions")
      .select("id, subscription_plans(allows_public_listing)")
      .eq("owner_id", data.ownerId)
      .maybeSingle();
    if (!sub) throw new Error("No subscription found for this owner");
    if (data.listed && !sub.subscription_plans?.allows_public_listing) {
      throw new Error("Public locator listing needs the Pro plan or above");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("owner_subscriptions")
      .update({ listed_publicly: data.listed })
      .eq("owner_id", data.ownerId);
    if (error) throw new Error(error.message);
    return { listed: data.listed };
  });

/* ------------------------------------------------------------------ */

function kigaliDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE.value,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
