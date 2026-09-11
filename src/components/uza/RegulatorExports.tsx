/**
 * Utility-grade export panel: energy per site, peak demand, half-hourly demand
 * profile and session profiles, as CSV or a printable PDF statement. Everything
 * shown here is measured — a site with no telemetry says "not metered".
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, RefreshCw } from "lucide-react";

import { Btn, Channel, Panel, PanelHeader } from "@/components/uza/ui";
import { downloadCsv } from "@/lib/export";
import { formatAmount, formatKwh, formatRwf } from "@/lib/money";
import {
  chargePointsCsv,
  downloadBlob,
  energyPerSiteCsv,
  loadProfileCsv,
  localDay,
  peakDemandCsv,
  pricingCsv,
  regulatorPdf,
  segmentLabel,
  sessionProfilesCsv,
} from "@/lib/report-export";
import { fetchRegulatorReport, type RegulatorReport } from "@/lib/reporting.functions";

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

/** Local Kigali day, so a chosen date means that whole working day. */
function kigaliDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "Africa/Kigali",
  });
}

/** The last twelve closed-or-current calendar months, newest first. */
function recentMonths(count = 12): { key: string; label: string; from: string; to: string }[] {
  const today = kigaliDay();
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  return Array.from({ length: count }, (_, i) => {
    const month = m - i;
    const year = y + Math.floor((month - 1) / 12);
    const mm = ((((month - 1) % 12) + 12) % 12) + 1;
    const pad = String(mm).padStart(2, "0");
    const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate();
    const to = `${year}-${pad}-${String(lastDay).padStart(2, "0")}`;
    return {
      key: `${year}-${pad}`,
      label: new Date(Date.UTC(year, mm - 1, 1)).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      from: `${year}-${pad}-01`,
      to: to > today ? today : to,
    };
  });
}

export function RegulatorExports({ ownerId, scopeLabel }: { ownerId?: string | undefined; scopeLabel: string }) {
  const [days, setDays] = useState<number>(30);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useServerFn(fetchRegulatorReport);

  const exactRange = Boolean(from && to && from <= to);
  const monthKey =
    exactRange && recentMonths().some((mo) => mo.from === from && mo.to === to) ? from.slice(0, 7) : "";
  const effectiveOwnerId = ownerId ?? (ownerFilter || undefined);

  const query = useQuery<RegulatorReport>({
    queryKey: [
      "regulator-report",
      effectiveOwnerId ?? "all",
      exactRange ? `${from}:${to}` : days,
      siteIds.join(","),
    ],
    queryFn: () =>
      load({
        data: {
          ...(effectiveOwnerId ? { ownerId: effectiveOwnerId } : {}),
          ...(exactRange ? { from, to } : { days }),
          ...(siteIds.length ? { siteIds } : {}),
        },
      }),
  });

  const report = query.data;
  const slug = scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "network";
  const stamp = report ? `${localDay(report.fromMs)}_${localDay(report.toMs)}` : "";

  const toggleSite = (id: string) =>
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Panel>
      <PanelHeader
        title="Utility &amp; regulator exports"
        hint="Measured energy per site, peak coincident demand, half-hourly profile and session profiles"
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setDays(p.days);
                }}
                aria-pressed={!exactRange && days === p.days}
                className={`metric rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  !exactRange && days === p.days
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
            <Btn size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Btn>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
        <label className="min-w-0 text-xs">
          <span className="channel block">Month</span>
          <select
            value={monthKey}
            onChange={(e) => {
              const month = recentMonths().find((x) => x.key === e.target.value);
              if (!month) return;
              setFrom(month.from);
              setTo(month.to);
            }}
            className="metric mt-1 w-[11rem] rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">Choose a month…</option>
            {recentMonths().map((mo) => (
              <option key={mo.key} value={mo.key}>
                {mo.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs">
          <span className="channel block">From</span>
          <input
            type="date"
            value={from}
            max={to || kigaliDay()}
            onChange={(e) => {
              setFrom(e.target.value);
              if (!to) setTo(kigaliDay());
            }}
            className="metric mt-1 w-[9.5rem] rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="min-w-0 text-xs">
          <span className="channel block">To</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            max={kigaliDay()}
            onChange={(e) => {
              setTo(e.target.value);
              if (!from) setFrom(kigaliDay(-29));
            }}
            className="metric mt-1 w-[9.5rem] rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
        {from || to ? (
          <Btn
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear dates
          </Btn>
        ) : null}

        {!ownerId && report?.scope.owners.length ? (
          <label className="min-w-0 text-xs">
            <span className="channel block">Owner</span>
            <select
              value={ownerFilter}
              onChange={(e) => {
                setOwnerFilter(e.target.value);
                setSiteIds([]);
              }}
              className="mt-1 w-[13rem] max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">All owners in scope</option>
              {report.scope.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {report?.scope.sites.length ? (
          <div className="min-w-0 flex-1 text-xs">
            <span className="channel block">
              Sites {siteIds.length ? `(${siteIds.length} selected)` : "(all in scope)"}
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {report.scope.sites.map((s) => {
                const on = siteIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSite(s.id)}
                    aria-pressed={on}
                    className={`max-w-[14rem] truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${
                      on
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    title={s.ownerName ? `${s.name} · ${s.ownerName}` : s.name}
                  >
                    {s.name}
                  </button>
                );
              })}
              {siteIds.length ? (
                <button
                  type="button"
                  onClick={() => setSiteIds([])}
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  All sites
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="space-y-2 p-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ) : query.isError ? (
        <p className="p-4 text-sm text-fault">
          The report could not be built. {(query.error as Error)?.message ?? "Try again."}
        </p>
      ) : !report ? null : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Figure label="Sites reporting" value={String(report.totals.sites)} />
            <Figure label="Sessions" value={String(report.totals.sessions)} />
            <Figure label="Energy" value={`${formatKwh(report.totals.kwh, 1)} kWh`} />
            <Figure label="Gross revenue" value={formatRwf(report.totals.revenueMinor)} />
            <Figure
              label="Peak coincident"
              value={report.totals.peakKw === null ? "not metered" : `${report.totals.peakKw.toFixed(1)} kW`}
            />
          </div>

          <Channel>
            {`${report.scope.ownerName ?? scopeLabel} · ${localDay(report.fromMs)} to ${localDay(report.toMs)} (${report.timezone}) · built from `}
            {report.counts.sessions} recorded sessions and {report.counts.meterSamples} reported meter samples.
            {report.scope.siteIds.length
              ? ` Filtered to ${report.scope.siteIds.length} of ${report.scope.sites.length} sites.`
              : ""}
            {report.counts.truncated ? " Row limit reached — narrow the period for a complete extract." : ""}
          </Channel>


          {report.peaks.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Site", "Energy", "Peak coincident", "Peak half-hour", "Samples"].map((h) => (
                      <th key={h} className="channel px-3 py-2 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.sites.map((s) => (
                    <tr key={s.siteId} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <span className="block truncate font-medium">{s.siteName}</span>
                        <Channel>{s.sessions} sessions</Channel>
                      </td>
                      <td className="metric px-3 py-2">{formatKwh(s.kwh, 1)} kWh</td>
                      <td className="metric px-3 py-2">
                        {s.peakKw === null ? (
                          <span className="text-muted-foreground">not metered</span>
                        ) : (
                          `${s.peakKw.toFixed(1)} kW`
                        )}
                      </td>
                      <td className="metric px-3 py-2 text-muted-foreground">
                        {s.peakAtMs ? localDay(s.peakAtMs) : "—"}
                      </td>
                      <td className="metric px-3 py-2 text-muted-foreground">{s.samples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="channel">
              No site reported energy in this period. Once a charge point reports meter values, its energy and peak
              demand appear here.
            </p>
          )}

          {report.profile.length ? (
            <div>
              <Channel>Half-hourly demand profile — mean coincident kW ({report.timezone})</Channel>
              <div className="mt-2 flex h-24 items-end gap-[2px]">
                {report.profile.map((p) => {
                  const max = Math.max(...report.profile.map((x) => x.maxKw), 1);
                  return (
                    <div
                      key={p.segment}
                      className="flex-1 rounded-t bg-primary/70"
                      style={{ height: `${Math.max(2, (p.meanKw / max) * 100)}%` }}
                      title={`${segmentLabel(p.segment)} · mean ${p.meanKw.toFixed(1)} kW · max ${p.maxKw.toFixed(1)} kW`}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          {report.chargePoints.length ? (
            <div>
              <Channel>
                Charge points — {report.counts.chargePoints} registered in scope, each pile independently identified
              </Channel>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {["Charge point", "Site & station", "Sessions", "Energy", "Revenue", "Peak", "Last seen"].map(
                        (h) => (
                          <th key={h} className="channel px-3 py-2 font-normal">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {report.chargePoints.map((c) => (
                      <tr key={c.chargerId} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <span className="metric block truncate font-medium">{c.serial}</span>
                          <Channel>
                            {c.powerType}
                            {c.ratedKw === null ? "" : ` · ${c.ratedKw} kW`} · {c.connectors} connector
                            {c.connectors === 1 ? "" : "s"}
                          </Channel>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block truncate">{c.siteName}</span>
                          <Channel>
                            {c.stationName}
                            {c.ownerName ? ` · ${c.ownerName}` : ""}
                          </Channel>
                        </td>
                        <td className="metric px-3 py-2">{c.sessions}</td>
                        <td className="metric px-3 py-2">{formatKwh(c.kwh, 1)} kWh</td>
                        <td className="metric px-3 py-2">{formatRwf(c.revenueMinor)}</td>
                        <td className="metric px-3 py-2">
                          {c.peakKw === null ? (
                            <span className="text-muted-foreground">not metered</span>
                          ) : (
                            `${c.peakKw.toFixed(1)} kW`
                          )}
                        </td>
                        <td className="metric px-3 py-2 text-muted-foreground">
                          {c.lastSeenAtMs ? localDay(c.lastSeenAtMs) : "never connected"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <Channel>Revenue by tariff component</Channel>
              <dl className="mt-2 space-y-1 text-sm">
                {[
                  ["Energy", report.revenue.energyMinor],
                  ["Time", report.revenue.timeMinor],
                  ["Session fees", report.revenue.sessionFeeMinor],
                  [`Idle fees (${report.revenue.idleMinutes} charged min)`, report.revenue.idleMinor],
                  ...(report.revenue.unattributedMinor !== 0
                    ? ([["Settled before component pricing", report.revenue.unattributedMinor]] as const)
                    : []),
                ].map(([label, minor]) => (
                  <div key={String(label)} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="metric">{formatRwf(Number(minor))}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1 font-medium">
                  <dt>Billed total</dt>
                  <dd className="metric">{formatRwf(report.revenue.totalMinor)}</dd>
                </div>
              </dl>
              {report.revenue.unpricedSessions ? (
                <p className="channel mt-2">
                  {report.revenue.unpricedSessions} closed session
                  {report.revenue.unpricedSessions === 1 ? "" : "s"} carry no priced total and are excluded from
                  revenue.
                </p>
              ) : null}
            </div>

            <div className="rounded-md border border-border p-3">
              <Channel>Tariff versions in force ({report.tariffs.length})</Channel>
              {report.tariffs.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        {["Version", "RWF/kWh", "RWF/min", "Idle", "Priced"].map((h) => (
                          <th key={h} className="channel px-2 py-1 font-normal">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.tariffs.map((t) => (
                        <tr key={t.id} className="border-b border-border/60 last:border-0">
                          <td className="px-2 py-1">
                            <span className="block truncate">
                              {t.name}
                              {t.published ? "" : " (draft)"}
                            </span>
                            <Channel>
                              {t.siteScope} · from {localDay(t.effectiveFromMs)}
                              {t.effectiveToMs ? ` to ${localDay(t.effectiveToMs)}` : ""}
                            </Channel>
                          </td>
                          <td className="metric px-2 py-1">{formatAmount(t.energyMinorPerKwh)}</td>
                          <td className="metric px-2 py-1">{formatAmount(t.timeMinorPerMinute)}</td>
                          <td className="metric px-2 py-1">
                            {formatAmount(t.idleFeeMinorPerMinute)}/min after {t.idleGraceMinutes}m
                          </td>
                          <td className="metric px-2 py-1">{t.sessionsPriced}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="channel mt-2">
                  No tariff version was in force in this period. Publish a tariff to price sessions.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn size="sm" onClick={() => downloadCsv(`uza-energy-per-site-${slug}-${stamp}.csv`, energyPerSiteCsv(report))}>
              <Download className="size-3.5" /> Energy per site
            </Btn>
            <Btn size="sm" onClick={() => downloadCsv(`uza-peak-demand-${slug}-${stamp}.csv`, peakDemandCsv(report))}>
              <Download className="size-3.5" /> Peak demand
            </Btn>
            <Btn size="sm" onClick={() => downloadCsv(`uza-demand-profile-${slug}-${stamp}.csv`, loadProfileCsv(report))}>
              <Download className="size-3.5" /> Demand profile
            </Btn>
            <Btn
              size="sm"
              onClick={() => downloadCsv(`uza-session-profiles-${slug}-${stamp}.csv`, sessionProfilesCsv(report))}
            >
              <Download className="size-3.5" /> Session profiles
            </Btn>
            <Btn size="sm" onClick={() => downloadCsv(`uza-charge-points-${slug}-${stamp}.csv`, chargePointsCsv(report))}>
              <Download className="size-3.5" /> Charge points
            </Btn>
            <Btn size="sm" onClick={() => downloadCsv(`uza-pricing-${slug}-${stamp}.csv`, pricingCsv(report))}>
              <Download className="size-3.5" /> Pricing &amp; tariffs
            </Btn>
            <Btn
              size="sm"
              variant="gold"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  downloadBlob(`uza-utility-report-${slug}-${stamp}.pdf`, await regulatorPdf(report));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FileText className="size-3.5" /> {busy ? "Building PDF…" : "PDF report"}
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <Channel>{label}</Channel>
      <p className="metric mt-1 truncate text-base font-medium">{value}</p>
    </div>
  );
}
