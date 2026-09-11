import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CircleSlash,
  Download,
  FileText,
  Gauge,
  Globe2,
  MinusCircle,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { ConsoleShell } from "@/components/uza/ConsoleShell";
import { RegulatorExports } from "@/components/uza/RegulatorExports";
import { Btn, Channel, Metric, Panel, PanelHeader, StatTile } from "@/components/uza/ui";
import { formatKwh, formatRwf, formatRwfCompact } from "@/lib/money";
import {
  fetchOwnerPortal,
  raiseSubscriptionInvoice,
  requestInvoicePayment,
  runOwnerSettlement,
  setPublicListing,
  type OwnerPortalSnapshot,
} from "@/lib/owner.functions";
import { useLive } from "@/hooks/useUza";
import { toCsv, downloadCsv } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({
    meta: [
      { title: "Owner portal — UZA Charge Network" },
      {
        name: "description",
        content:
          "Station owners track measured uptime, utilisation, energy, revenue, settlement statements and their UZA Charge subscription in one portal.",
      },
      { property: "og:title", content: "Owner portal — UZA Charge Network" },
      {
        property: "og:description",
        content:
          "Measured availability, realised revenue, settlement statements and payouts for every station you own.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OwnerPortal,
});

const WINDOWS = [
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "90 days", hours: 2160 },
] as const;

function OwnerPortal() {
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [windowHours, setWindowHours] = useState<number>(720);
  const queryClient = useQueryClient();
  const load = useServerFn(fetchOwnerPortal);

  const query = useQuery<OwnerPortalSnapshot>({
    queryKey: ["owner-portal", ownerId ?? "first", windowHours],
    queryFn: () => load({ data: { ownerId, windowHours } }),
    refetchInterval: 60_000,
  });

  useLive(["sessions", "settlement_runs", "payouts", "invoices"], [["owner-portal"]]);

  const snap = query.data;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["owner-portal"] });

  const settle = useMutation({
    mutationFn: useServerFn(runOwnerSettlement),
    onSuccess: invalidate,
  });
  const invoice = useMutation({
    mutationFn: useServerFn(raiseSubscriptionInvoice),
    onSuccess: invalidate,
  });
  const payInvoice = useMutation({
    mutationFn: useServerFn(requestInvoicePayment),
    onSuccess: invalidate,
  });
  const listing = useMutation({ mutationFn: useServerFn(setPublicListing), onSuccess: invalidate });

  const lastMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);

  return (
    <ConsoleShell
      title="Owner portal"
      subtitle="Your investment, measured — availability, utilisation, energy, revenue and settlements"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {snap && snap.owners.length > 1 ? (
            <select
              value={snap.owner?.id ?? ""}
              onChange={(e) => setOwnerId(e.target.value)}
              className="metric rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              aria-label="Owner"
            >
              {snap.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.hours}
                type="button"
                onClick={() => setWindowHours(w.hours)}
                className={
                  w.hours === windowHours
                    ? "metric rounded bg-panel-raised px-2 py-1 text-[11px] text-foreground"
                    : "metric rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                }
              >
                {w.label}
              </button>
            ))}
          </div>
          <Btn size="sm" onClick={() => void query.refetch()}>
            <RefreshCw className="size-3.5" /> Refresh
          </Btn>
        </div>
      }
    >
      {query.isLoading ? <SkeletonPortal /> : null}

      {query.error ? (
        <Panel className="p-6">
          <p className="text-sm text-fault">Could not load the portal: {String(query.error)}</p>
        </Panel>
      ) : null}

      {snap && !snap.owner ? (
        <Panel className="p-8 text-center">
          <CircleSlash className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h2 className="text-sm font-semibold">No owner account linked to you yet</h2>
          <p className="channel mx-auto mt-2 max-w-md">
            Once UZA links your account to a station owner, this portal will show your sites, your
            measured uptime, your energy and revenue, and your settlement statements.
          </p>
        </Panel>
      ) : null}

      {snap && snap.owner ? (
        <div className="space-y-6">
          <HeadlineRow snap={snap} />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <SitesPanel snap={snap} />
              <DailyPanel snap={snap} />
              <RegulatorExports ownerId={snap.owner.id} scopeLabel={snap.owner.name} />
              <SettlementsPanel
                snap={snap}
                onRun={() =>
                  settle.mutate({
                    data: {
                      ownerId: snap.owner!.id,
                      periodStart: lastMonth.start,
                      periodEnd: lastMonth.end,
                    },
                  })
                }
                running={settle.isPending}
                error={settle.error ? String(settle.error) : null}
              />
            </div>
            <div className="min-w-0 space-y-6">
              <HealthPanel snap={snap} />
              <SubscriptionPanel
                snap={snap}
                onToggleListing={(listed) =>
                  listing.mutate({ data: { ownerId: snap.owner!.id, listed } })
                }
                listingError={listing.error ? String(listing.error) : null}
                onRaiseInvoice={() => invoice.mutate({ data: { ownerId: snap.owner!.id } })}
                raising={invoice.isPending}
              />
              <InvoicesPanel
                snap={snap}
                onPay={(id) => payInvoice.mutate({ data: { invoiceId: id, method: "momo" } })}
                paying={payInvoice.isPending}
                note={payInvoice.data?.note ?? null}
              />
              <PayoutsPanel snap={snap} />
            </div>
          </div>
        </div>
      ) : null}
    </ConsoleShell>
  );
}

/* ------------------------------------------------------------------ */

function plural(n: number, noun: string): string {
  return `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;
}

function uptimeLabel(snap: OwnerPortalSnapshot): {
  value: string;
  tone: "live" | "gold" | "fault" | "muted";
  icon: typeof CheckCircle2;
  foot: string;
} {
  const a = snap.availability;
  if (a.kind === "never_connected")
    return {
      value: "—",
      tone: "muted",
      icon: MinusCircle,
      foot: "No charge point has reported yet",
    };
  if (a.verdict.status === "insufficient_data")
    return {
      value: "—",
      tone: "muted",
      icon: MinusCircle,
      foot: `Insufficient data (${a.verdict.observedHours.toFixed(1)} h observed of ${snap.targets.minObservationHours} h needed)`,
    };
  const tone = a.verdict.status === "green" ? "live" : a.verdict.status === "amber" ? "gold" : "fault";
  const icon =
    a.verdict.status === "green" ? CheckCircle2 : a.verdict.status === "amber" ? AlertTriangle : AlertTriangle;
  return {
    value: a.verdict.uptimePct.toFixed(2),
    tone,
    icon,
    foot: `${a.verdict.status === "green" ? "On track" : a.verdict.status === "amber" ? "At risk" : "Below target"} · target ${snap.targets.greenAtOrAbovePct}%`,
  };
}

function HeadlineRow({ snap }: { snap: OwnerPortalSnapshot }) {
  const up = uptimeLabel(snap);
  const UpIcon = up.icon;
  const util =
    snap.availability.kind === "measured" && snap.availability.utilisationPct !== null
      ? `${snap.availability.utilisationPct.toFixed(1)}%`
      : "—";
  const t = snap.revenueTrend;
  const TrendIcon = t.direction === "down" ? TrendingDown : TrendingUp;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="panel-surface flex flex-col justify-between gap-2 p-4 sm:col-span-2">
        <div className="flex items-center gap-2">
          <UpIcon
            className={
              up.tone === "live"
                ? "size-4 text-live"
                : up.tone === "gold"
                  ? "size-4 text-primary"
                  : up.tone === "fault"
                    ? "size-4 text-fault"
                    : "size-4 text-muted-foreground"
            }
          />
          <Channel>Measured uptime · last {Math.round(snap.windowHours / 24)} days</Channel>
        </div>
        <Metric value={up.value} unit="%" tone={up.tone} size="xl" />
        <div className="channel">{up.foot}</div>
      </div>
      <StatTile label="Utilisation" value={util} foot="Observed time delivering energy" />
      <StatTile
        label="Energy dispensed"
        value={formatKwh(snap.window.energyKwh, 1)}
        unit="kWh"
        foot={plural(snap.window.sessions, "session")}
      />
      <StatTile
        label="Revenue (gross)"
        value={formatRwfCompact(snap.window.revenueMinor)}
        tone="gold"
        foot={
          t.changePct === null ? (
            "Not enough history to compare"
          ) : (
            <span className="inline-flex items-center gap-1">
              <TrendIcon className="size-3" />
              {t.changePct > 0 ? "+" : ""}
              {t.changePct}% vs previous week
            </span>
          )
        }
      />
    </div>
  );
}

function HealthPanel({ snap }: { snap: OwnerPortalSnapshot }) {
  const h = snap.health;
  const p = snap.projection;
  return (
    <Panel>
      <PanelHeader title="Investment health" hint="Measured inputs only — no targets, no guesses" />
      <div className="space-y-4 p-4">
        {h.kind === "insufficient_data" ? (
          <div className="flex items-start gap-2">
            <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="channel">{h.reason}</p>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <Metric
                value={h.score}
                unit="/100"
                size="xl"
                tone={h.band === "green" ? "live" : h.band === "amber" ? "gold" : "fault"}
              />
              <span className="metric mb-1 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider">
                {h.band === "green" ? (
                  <CheckCircle2 className="size-3 text-live" />
                ) : (
                  <AlertTriangle className={h.band === "amber" ? "size-3 text-primary" : "size-3 text-fault"} />
                )}
                {h.band === "green" ? "on track" : h.band === "amber" ? "at risk" : "action needed"}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {(
                [
                  ["Availability", h.parts.uptime, 40],
                  ["Utilisation", h.parts.utilisation, 30],
                  ["Revenue", h.parts.revenue, 20],
                  ["Faults", h.parts.faults, 10],
                ] as const
              ).map(([label, got, max]) => (
                <div key={label} className="rounded-md border border-border p-2">
                  <Channel>{label}</Channel>
                  <span className="metric text-sm">
                    {got}
                    <span className="text-muted-foreground"> / {max}</span>
                  </span>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <Gauge className="size-3.5 text-primary" />
            <Channel>Next 30 days — estimate</Channel>
          </div>
          {p.kind === "insufficient_data" ? (
            <p className="channel mt-2">
              Needs {p.daysRequired} days of realised trading to project; {p.daysObserved} so far.
            </p>
          ) : (
            <>
              <Metric value={formatRwfCompact(p.centralMinor)} tone="gold" size="lg" className="mt-1" />
              <p className="channel mt-1">
                Range {formatRwfCompact(p.lowMinor)} – {formatRwfCompact(p.highMinor)} · estimate from{" "}
                {p.daysObserved} observed days, not a guarantee
              </p>
            </>
          )}
        </div>

        {snap.splitPreview ? (
          <div className="rounded-md border border-border p-3">
            <Channel>Revenue split · rule v{snap.splitPreview.ruleVersion}</Channel>
            <table className="mt-2 w-full text-xs">
              <tbody className="metric">
                <tr>
                  <td className="py-0.5 text-muted-foreground">Gross</td>
                  <td className="py-0.5 text-right">{formatRwf(snap.splitPreview.grossMinor)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-muted-foreground">Energy cost</td>
                  <td className="py-0.5 text-right">−{formatRwf(snap.splitPreview.energyCostMinor)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-muted-foreground">Your share</td>
                  <td className="py-0.5 text-right text-live">{formatRwf(snap.splitPreview.hostMinor)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-muted-foreground">UZA platform</td>
                  <td className="py-0.5 text-right">{formatRwf(snap.splitPreview.platformMinor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function SitesPanel({ snap }: { snap: OwnerPortalSnapshot }) {
  return (
    <Panel>
      <PanelHeader
        title="Your sites"
        hint={`${plural(snap.fleet.sites, "site")} · ${plural(snap.fleet.stations, "station")} · ${plural(snap.fleet.chargePoints, "charge point")}`}
        right={
          <Btn
            size="sm"
            onClick={() =>
              downloadCsv(
                `uza-sites-${snap.owner?.name ?? "owner"}.csv`,
                toCsv(
                  ["Site", "City", "Stations", "Charge points", "Never connected", "Offline", "Open faults", "kWh", "Revenue RWF"],
                  snap.sites.map((s) => [
                    s.name,
                    s.city ?? "",
                    s.stations,
                    s.chargePoints,
                    s.neverConnected,
                    s.offline,
                    s.openFaults,
                    s.energyKwh,
                    Math.round(s.revenueMinor / 100),
                  ]),
                ),
              )
            }
          >
            <Download className="size-3.5" /> CSV
          </Btn>
        }
      />
      {snap.sites.length === 0 ? (
        <p className="channel p-4">
          No sites registered yet. Once UZA registers a site under your name, its stations, piles and
          measured availability appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Site", "Uptime", "Piles", "kWh", "Revenue", "State"].map((h) => (
                  <th key={h} className="channel px-4 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snap.sites.map((s) => {
                const r = s.report;
                const pct =
                  r.kind === "measured" && r.verdict.status !== "insufficient_data"
                    ? `${r.verdict.uptimePct.toFixed(1)}%`
                    : "—";
                const state =
                  r.kind === "never_connected"
                    ? { label: "never connected", tone: "text-muted-foreground", Icon: MinusCircle }
                    : r.verdict.status === "insufficient_data"
                      ? { label: "insufficient data", tone: "text-muted-foreground", Icon: MinusCircle }
                      : r.verdict.status === "green"
                        ? { label: "on track", tone: "text-live", Icon: CheckCircle2 }
                        : r.verdict.status === "amber"
                          ? { label: "at risk", tone: "text-primary", Icon: AlertTriangle }
                          : { label: "below target", tone: "text-fault", Icon: AlertTriangle };
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <span className="block truncate font-medium">{s.name}</span>
                      <Channel>{[s.city, s.area].filter(Boolean).join(" · ") || "—"}</Channel>
                    </td>
                    <td className="metric px-4 py-2">{pct}</td>
                    <td className="metric px-4 py-2">
                      {s.chargePoints}
                      {s.neverConnected ? (
                        <span className="channel"> · {s.neverConnected} never connected</span>
                      ) : null}
                      {s.offline ? <span className="text-fault"> · {s.offline} offline</span> : null}
                    </td>
                    <td className="metric px-4 py-2">{formatKwh(s.energyKwh, 1)}</td>
                    <td className="metric px-4 py-2">{formatRwf(s.revenueMinor)}</td>
                    <td className="px-4 py-2">
                      <span className={`metric inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${state.tone}`}>
                        <state.Icon className="size-3" />
                        {state.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function DailyPanel({ snap }: { snap: OwnerPortalSnapshot }) {
  const max = Math.max(1, ...snap.daily.map((d) => d.revenueMinor));
  return (
    <Panel>
      <PanelHeader
        title="Daily report"
        hint="Realised sessions, energy and gross revenue per day (Africa/Kigali)"
        right={
          <Btn
            size="sm"
            onClick={() =>
              downloadCsv(
                `uza-daily-${snap.owner?.name ?? "owner"}.csv`,
                toCsv(
                  ["Day", "Sessions", "kWh", "Revenue RWF"],
                  snap.daily.map((d) => [d.day, d.sessions, d.kwh, Math.round(d.revenueMinor / 100)]),
                ),
              )
            }
          >
            <Download className="size-3.5" /> CSV
          </Btn>
        }
      />
      {snap.daily.length === 0 ? (
        <p className="channel p-4">
          No completed sessions in this window. Each trading day will appear here with its sessions,
          kWh and gross revenue.
        </p>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex h-28 items-end gap-1">
            {snap.daily.map((d) => (
              <div
                key={d.day}
                title={`${d.day} · ${formatRwf(d.revenueMinor)} · ${formatKwh(d.kwh, 1)} kWh`}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${Math.max(2, (d.revenueMinor / max) * 100)}%` }}
              />
            ))}
          </div>
          <div className="channel flex justify-between">
            <span>{snap.daily[0]?.day}</span>
            <span>{snap.daily[snap.daily.length - 1]?.day}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

function SettlementsPanel({
  snap,
  onRun,
  running,
  error,
}: {
  snap: OwnerPortalSnapshot;
  onRun: () => void;
  running: boolean;
  error: string | null;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Settlement statements"
        hint="Each run pins the revenue-split rule version it settled under"
        right={
          <Btn size="sm" onClick={onRun} disabled={running}>
            <Receipt className="size-3.5" /> {running ? "Running…" : "Run last month"}
          </Btn>
        }
      />
      {error ? <p className="px-4 pt-3 text-xs text-fault">{error}</p> : null}
      {snap.settlements.length === 0 ? (
        <p className="channel p-4">
          No settlement run yet. A run totals completed sessions for a period, applies your split
          rule and schedules the payout.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Period", "Sessions", "kWh", "Gross", "Your share", "Rule", "Status"].map((h) => (
                  <th key={h} className="channel px-4 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snap.settlements.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="metric px-4 py-2">
                    {s.periodStart.slice(0, 10)} → {s.periodEnd.slice(0, 10)}
                  </td>
                  <td className="metric px-4 py-2">{s.sessionCount}</td>
                  <td className="metric px-4 py-2">{formatKwh(s.totalKwh, 1)}</td>
                  <td className="metric px-4 py-2">{formatRwf(s.grossMinor)}</td>
                  <td className="metric px-4 py-2 text-live">{formatRwf(s.hostMinor)}</td>
                  <td className="metric px-4 py-2">v{s.splitRuleVersion ?? "—"}</td>
                  <td className="metric px-4 py-2 text-[11px] uppercase tracking-wider">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SubscriptionPanel({
  snap,
  onToggleListing,
  listingError,
  onRaiseInvoice,
  raising,
}: {
  snap: OwnerPortalSnapshot;
  onToggleListing: (listed: boolean) => void;
  listingError: string | null;
  onRaiseInvoice: () => void;
  raising: boolean;
}) {
  const s = snap.subscription;
  return (
    <Panel>
      <PanelHeader title="Your UZA Charge plan" hint="Management software, billed monthly" />
      {!s ? (
        <p className="channel p-4">No plan assigned yet. UZA will place you on a plan at onboarding.</p>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-sm font-semibold">{s.planName}</span>
              <Channel>{s.planDescription ?? ""}</Channel>
            </div>
            <span className="metric rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider">
              {s.status}
            </span>
          </div>

          <div className="rounded-md border border-border p-3">
            <Channel>Due this month · {snap.fleet.chargePoints} charge points</Channel>
            <Metric value={formatRwf(s.dueThisMonthMinor)} tone="gold" size="lg" className="mt-1" />
            <p className="channel mt-1">
              Minimum {formatRwf(s.minMonthlyMinor)} · {s.includedChargePoints} included ·{" "}
              {formatRwf(s.perChargePointMinor)} per extra pile
              {s.trialEndsOn ? ` · trial ends ${s.trialEndsOn}` : ""}
            </p>
          </div>

          <ul className="space-y-1.5">
            {s.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs">
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-live" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-start gap-2 rounded-md border border-border p-3">
            <Globe2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium">Public locator listing</span>
              <p className="channel mt-0.5">
                {s.allowsPublicListing
                  ? "Show your stations to drivers on the UZA map, with a verified badge and slot bookings."
                  : "Available on Pro and above."}
              </p>
              {listingError ? <p className="mt-1 text-xs text-fault">{listingError}</p> : null}
            </div>
            <Btn
              size="sm"
              variant={s.listedPublicly ? "default" : "gold"}
              disabled={!s.allowsPublicListing}
              onClick={() => onToggleListing(!s.listedPublicly)}
            >
              {s.listedPublicly ? "Listed" : "List"}
            </Btn>
          </div>

          <Btn size="sm" onClick={onRaiseInvoice} disabled={raising} className="w-full">
            <FileText className="size-3.5" /> {raising ? "Raising…" : "Raise this month's invoice"}
          </Btn>
        </div>
      )}
    </Panel>
  );
}

function InvoicesPanel({
  snap,
  onPay,
  paying,
  note,
}: {
  snap: OwnerPortalSnapshot;
  onPay: (invoiceId: string) => void;
  paying: boolean;
  note: string | null;
}) {
  return (
    <Panel>
      <PanelHeader title="Subscription invoices" hint="Software fees, in RWF" />
      {note ? <p className="channel px-4 pt-3">{note}</p> : null}
      {snap.invoices.length === 0 ? (
        <p className="channel p-4">No invoice raised yet. Monthly invoices appear here with their lines and due date.</p>
      ) : (
        <ul className="divide-y divide-border">
          {snap.invoices.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <span className="metric block truncate text-xs">{i.number}</span>
                <Channel>
                  {i.periodStart} → {i.periodEnd} · {i.chargePointCount} piles
                  {i.dueOn ? ` · due ${i.dueOn}` : ""}
                </Channel>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Metric value={formatRwf(i.totalMinor)} size="sm" />
                {i.status === "paid" ? (
                  <span className="metric inline-flex items-center gap-1 text-[10px] uppercase text-live">
                    <CheckCircle2 className="size-3" /> paid
                  </span>
                ) : (
                  <Btn size="sm" onClick={() => onPay(i.id)} disabled={paying}>
                    <Wallet className="size-3.5" /> {i.status === "awaiting_payment" ? "Requested" : "Pay"}
                  </Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PayoutsPanel({ snap }: { snap: OwnerPortalSnapshot }) {
  return (
    <Panel>
      <PanelHeader title="Payouts to you" hint="Your share of charging revenue" />
      {snap.payouts.length === 0 ? (
        <p className="channel p-4">
          No payout scheduled yet. Payouts are created by a settlement run and follow your payout
          schedule.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {snap.payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <Metric value={formatRwf(p.amountMinor)} size="sm" tone="live" />
                <Channel>
                  {p.method.toUpperCase()}
                  {p.scheduledFor ? ` · scheduled ${p.scheduledFor}` : ""}
                </Channel>
              </div>
              <span className="metric text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SkeletonPortal() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="panel-surface h-24 animate-pulse" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="panel-surface h-72 animate-pulse lg:col-span-2" />
        <div className="panel-surface h-72 animate-pulse" />
      </div>
    </div>
  );
}
