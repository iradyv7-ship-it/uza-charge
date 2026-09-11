/**
 * Control-room availability grid.
 *
 * Uptime is the headline: charging is an availability business. Every state is
 * paired with an icon and a label, never colour alone, and any figure we cannot
 * evidence is shown as "never connected" or "measuring" instead of a number.
 */
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Gauge,
  HelpCircle,
  PlugZap,
  XCircle,
} from "lucide-react";

import type { AvailabilityReport } from "@/lib/uptime";
import type { ChargePointHealth, StationHealth } from "@/lib/control-room.functions";
import { Channel, EmptyState, Metric, Panel, PanelHeader } from "@/components/uza/ui";
import { formatRwf } from "@/lib/money";

type Tone = "live" | "warn" | "fault" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  live: "border-live/40 bg-live/10 text-live",
  warn: "border-warn/40 bg-warn/10 text-warn",
  fault: "border-fault/40 bg-fault/10 text-fault",
  muted: "border-border bg-muted/40 text-muted-foreground",
};

const TONE_ICON: Record<Tone, typeof CheckCircle2> = {
  live: CheckCircle2,
  warn: AlertTriangle,
  fault: XCircle,
  muted: HelpCircle,
};

function readReport(report: AvailabilityReport): { tone: Tone; label: string; value: string } {
  if (report.kind === "never_connected") {
    return { tone: "muted", label: "Never connected", value: "—" };
  }
  if (report.verdict.status === "insufficient_data") {
    return { tone: "muted", label: "Measuring", value: "—" };
  }
  const tone: Tone =
    report.verdict.status === "green" ? "live" : report.verdict.status === "amber" ? "warn" : "fault";
  const label =
    report.verdict.status === "green"
      ? "On target"
      : report.verdict.status === "amber"
        ? "At risk"
        : "Below target";
  return { tone, label, value: `${report.verdict.uptimePct.toFixed(2)}%` };
}

export function UptimeBadge({
  report,
  size = "sm",
}: {
  report: AvailabilityReport;
  size?: "sm" | "lg";
}) {
  const { tone, label, value } = readReport(report);
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 ${TONE_CLASS[tone]} ${
        size === "lg" ? "text-base" : "text-xs"
      }`}
    >
      <Icon className={size === "lg" ? "size-5" : "size-3.5"} aria-hidden="true" />
      <span className="metric tabular-nums">{value}</span>
      <span className="uppercase tracking-wide">{label}</span>
    </span>
  );
}

/** The number the whole console leads with. */
export function UptimeHeadline({
  report,
  windowHours,
  minObservationHours,
}: {
  report: AvailabilityReport;
  windowHours: number;
  minObservationHours: number;
}) {
  const { tone, label, value } = readReport(report);
  const Icon = TONE_ICON[tone];
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <Channel>Network uptime · measured over the last {windowHours}h</Channel>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="metric text-4xl tabular-nums">{value}</span>
            <span className={`inline-flex items-center gap-1.5 text-sm ${TONE_CLASS[tone]} rounded-md border px-2 py-0.5`}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </span>
          </div>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {report.kind === "never_connected"
              ? "No charge point has reported yet. Uptime appears once piles start sending OCPP status and heartbeats."
              : report.verdict.status === "insufficient_data"
                ? `Under ${minObservationHours}h of observed status history. We do not publish an uptime figure we cannot evidence.`
                : `From ${report.verdict.observedHours.toFixed(1)} observed pile-hours of OCPP status history.`}
          </p>
        </div>
        <Gauge className="size-14 text-muted-foreground/40" aria-hidden="true" />
      </div>
    </Panel>
  );
}

export function StationHealthGrid({
  stations,
  renderCommands,
}: {
  stations: StationHealth[];
  renderCommands?: (cp: ChargePointHealth) => React.ReactNode;
}) {
  if (!stations.length) {
    return (
      <EmptyState>
        No sites yet. Once an owner is onboarded, their sites, charge points and each individual pile
        appear here with live status.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {stations.map((station) => (
        <Panel key={station.id}>
          <PanelHeader
            title={station.name}
            hint={`${station.area ?? "—"} · ${station.kind} · host ${station.ownerName ?? "unassigned"}`}
            right={
              <div className="flex flex-wrap items-center gap-3">
                <Metric value={station.energyKwh.toFixed(1)} unit="kWh" size="sm" />
                <Metric value={formatRwf(station.revenueMinor)} size="sm" tone="gold" />
                <UptimeBadge report={station.report} />
              </div>
            }
          />
          <div className="divide-y divide-border">
            {station.chargePoints.map((cp) => (
              <div key={cp.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="metric text-sm">{cp.serial}</span>
                    <Channel>
                      {cp.vendor ?? "unknown vendor"} {cp.model ?? ""} · OCPP id {cp.ocppIdentity || "—"}{" "}
                      · fw {cp.firmwareVersion ?? "—"}
                      {cp.firmwareStatus ? ` (${cp.firmwareStatus})` : ""} · cap {cp.maxOutputPct}%
                    </Channel>
                    <Channel>
                      {cp.everConnected
                        ? `Last seen ${cp.silenceSeconds === null ? "unknown" : `${cp.silenceSeconds}s ago`}`
                        : "Never connected — this pile has not yet reported over OCPP"}
                      {cp.openFaults ? ` · ${cp.openFaults} open fault(s)` : ""}
                    </Channel>
                  </div>
                  <UptimeBadge report={cp.report} />
                  {renderCommands ? renderCommands(cp) : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {cp.piles.map((pile) => (
                    <span
                      key={pile.connectorId ?? pile.label}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-panel-raised/60 px-2 py-1 text-xs"
                    >
                      <PlugZap
                        className={`size-3.5 ${
                          pile.status === "charging"
                            ? "text-live"
                            : pile.status === "faulted"
                              ? "text-fault"
                              : "text-muted-foreground"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="metric">{pile.label}</span>
                      <span className="metric tabular-nums text-muted-foreground">
                        {pile.ratedPowerKw} kW
                      </span>
                      <span className="uppercase tracking-wide text-muted-foreground">
                        {pile.status.replace(/_/g, " ")}
                      </span>
                      <UptimeBadge report={pile.report} />
                    </span>
                  ))}
                  {!cp.piles.length ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CircleSlash className="size-3.5" aria-hidden="true" /> No piles registered
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {!station.chargePoints.length ? (
              <EmptyState>No charge points registered at this site yet.</EmptyState>
            ) : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}
