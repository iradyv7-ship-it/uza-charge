import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchCommandLog,
  fetchFaults,
  fetchFleetKpis,
  fetchLiveSessions,
  fetchPayments,
  fetchStations,
  fetchTariffs,
  type LiveSession,
  type StationRow,
} from "@/lib/queries";
import { useLive, useNow, useSimulatorPulse } from "@/hooks/useUza";
import { queueCommand, settlePayment } from "@/lib/ops.functions";
import { ConsoleShell } from "@/components/uza/ConsoleShell";
import {
  Btn,
  Channel,
  EmptyState,
  Metric,
  Panel,
  PanelHeader,
  StatTile,
  StatusPill,
  Td,
  Th,
} from "@/components/uza/ui";
import {
  CHARGER_TONE,
  CONNECTOR_TONE,
  KW,
  KWH,
  PAY_LABEL,
  RWF,
  TIER_BG,
  TIER_LABEL,
  currentHalfHourIndex,
  elapsed,
} from "@/lib/uza";

export const Route = createFileRoute("/_authenticated/ops")({
  head: () => ({
    meta: [
      { title: "Operator console — live sessions & settlement | UZA Charge" },
      {
        name: "description",
        content:
          "Fleet KPIs, realtime session monitoring, charger health with remote reboot and unlock, tariffs and MoMo settlement for UZA Charge operators.",
      },
      { property: "og:title", content: "UZA Charge operator console" },
      {
        property: "og:description",
        content: "Realtime OCPP 1.6 charger control and mobile-money settlement in RWF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OperatorConsole,
});

type Tab = "live" | "health" | "tariffs" | "settlement";

function OperatorConsole() {
  useSimulatorPulse();
  useLive(
    ["sessions", "meter_values", "connectors", "chargers", "payments", "faults", "charger_commands"],
    [["kpis"], ["live-sessions"], ["stations"], ["payments"], ["faults"], ["commands"]],
  );

  const [tab, setTab] = useState<Tab>("live");
  const kpis = useQuery({ queryKey: ["kpis"], queryFn: fetchFleetKpis, refetchInterval: 15000 });
  const k = kpis.data;

  return (
    <ConsoleShell
      title="Operator console"
      subtitle="Realtime fleet control · commands go out through charger_commands only"
    >
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Chargers online"
          value={`${k?.chargersOnline ?? 0}/${k?.chargersTotal ?? 0}`}
          tone="live"
          foot={`${k?.chargersFaulted ?? 0} faulted · ${k?.openFaults ?? 0} open faults`}
        />
        <StatTile
          label="Live sessions"
          value={k?.liveSessions ?? 0}
          tone="gold"
          foot={`${KWH(k?.liveKwh ?? 0, 1)} kWh in flight`}
        />
        <StatTile label="Energy today" value={KWH(k?.energyToday ?? 0, 1)} unit="kWh" />
        <StatTile label="Revenue today" value={RWF(k?.revenueToday ?? 0)} unit="RWF" tone="gold" />
      </div>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-border pb-2">
        {(
          [
            ["live", "Live sessions"],
            ["health", "Station health"],
            ["tariffs", "Tariffs"],
            ["settlement", "Payments & settlement"],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-md border-b-2 px-3 py-1.5 text-sm transition-colors ${
              tab === value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "live" ? <LiveMonitor /> : null}
      {tab === "health" ? <HealthView /> : null}
      {tab === "tariffs" ? <TariffView /> : null}
      {tab === "settlement" ? <SettlementView /> : null}
    </ConsoleShell>
  );
}

function LiveMonitor() {
  useNow(1000);
  const sessions = useQuery({ queryKey: ["live-sessions"], queryFn: fetchLiveSessions });
  const rows = sessions.data ?? [];

  return (
    <Panel>
      <PanelHeader
        title="Live session monitor"
        hint="Telemetry streamed from meter_values · updates without refresh"
        right={<Metric value={rows.length} unit="active" size="sm" tone="live" />}
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <Th>Station</Th>
              <Th>Charger / gun</Th>
              <Th>Driver</Th>
              <Th>Start</Th>
              <Th className="text-right">kW</Th>
              <Th className="text-right">kWh</Th>
              <Th className="text-right">SOC</Th>
              <Th className="text-right">RWF</Th>
              <Th className="text-right">Elapsed</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s: LiveSession) => (
              <tr key={s.id} className="hover:bg-panel-raised/50">
                <Td>{s.connectors?.chargers?.stations?.name ?? "—"}</Td>
                <Td className="metric text-xs">
                  {s.connectors?.chargers?.serial} · {s.connectors?.label}
                </Td>
                <Td>{s.drivers?.full_name ?? s.vin ?? "Anonymous"}</Td>
                <Td className="channel">{s.start_method}</Td>
                <Td className="text-right">
                  <Metric
                    value={KW(s.status === "charging" ? s.connectors?.power_kw : 0)}
                    size="sm"
                    tone="live"
                  />
                </Td>
                <Td className="text-right">
                  <Metric value={KWH(s.kwh)} size="sm" />
                </Td>
                <Td className="text-right">
                  <Metric value={Math.round(Number(s.soc_end ?? s.soc_start ?? 0))} unit="%" size="sm" />
                </Td>
                <Td className="text-right">
                  <Metric value={RWF(s.cost_rwf)} size="sm" tone="gold" />
                </Td>
                <Td className="text-right">
                  <Metric value={elapsed(s.started_at)} size="sm" tone="muted" />
                </Td>
                <Td>
                  <StatusPill status={s.status} toneMap={CONNECTOR_TONE} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <EmptyState>No live sessions right now.</EmptyState> : null}
      </div>
    </Panel>
  );
}

function HealthView() {
  const queryClient = useQueryClient();
  const stations = useQuery({ queryKey: ["stations"], queryFn: fetchStations });
  const faults = useQuery({ queryKey: ["faults"], queryFn: fetchFaults });
  const commands = useQuery({ queryKey: ["commands"], queryFn: fetchCommandLog });

  const send = useMutation({
    mutationFn: useServerFn(queueCommand),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["commands"] }),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        {(stations.data ?? []).map((station: StationRow) => (
          <Panel key={station.id}>
            <PanelHeader
              title={station.name}
              hint={`${station.area ?? "Kigali"} · ${station.kind} · ${station.operators?.name ?? "—"}`}
            />
            <div className="divide-y divide-border">
              {station.chargers.map((charger) => {
                const heartbeatAge = charger.last_heartbeat
                  ? Math.round((Date.now() - new Date(charger.last_heartbeat).getTime()) / 1000)
                  : null;
                return (
                  <div key={charger.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="metric text-sm">{charger.serial}</span>
                      <Channel>
                        {charger.vendor ?? "—"} {charger.model ?? ""} · fw{" "}
                        {charger.firmware_version ?? "—"} · cap {charger.max_output_pct}% ·{" "}
                        {heartbeatAge === null ? "no heartbeat" : `heartbeat ${heartbeatAge}s ago`}
                      </Channel>
                    </div>
                    <StatusPill status={charger.status} toneMap={CHARGER_TONE} />
                    <div className="flex gap-1.5">
                      <Btn
                        size="sm"
                        disabled={send.isPending}
                        onClick={() =>
                          send.mutate({ data: { chargerId: charger.id, type: "reset", payload: {} } })
                        }
                      >
                        Reboot
                      </Btn>
                      <Btn
                        size="sm"
                        disabled={send.isPending}
                        onClick={() =>
                          send.mutate({ data: { chargerId: charger.id, type: "unlock", payload: {} } })
                        }
                      >
                        Unlock
                      </Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        disabled={send.isPending}
                        onClick={() =>
                          send.mutate({
                            data: {
                              chargerId: charger.id,
                              type: "set_max_power",
                              payload: { max_output_pct: charger.max_output_pct >= 100 ? 70 : 100 },
                            },
                          })
                        }
                      >
                        {charger.max_output_pct >= 100 ? "Throttle 70%" : "Full power"}
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader title="Faults" hint="Raised by the OCPP layer" />
          <div className="divide-y divide-border">
            {(faults.data ?? []).map((f) => (
              <div key={f.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="metric text-xs text-fault">{f.code}</span>
                  <Channel>{f.cleared_at ? "cleared" : f.severity}</Channel>
                </div>
                <p className="mt-1 text-sm">{f.label}</p>
                <Channel>
                  {(f as { chargers?: { serial?: string } }).chargers?.serial ?? "—"} ·{" "}
                  {new Date(f.raised_at).toLocaleTimeString("en-GB")}
                </Channel>
              </div>
            ))}
            {!(faults.data ?? []).length ? <EmptyState>No faults recorded.</EmptyState> : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Command outbox" hint="charger_commands · drained by the OCPP layer" />
          <div className="divide-y divide-border">
            {(commands.data ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="metric text-xs">{c.type}</span>
                  <Channel>
                    {(c as { chargers?: { serial?: string } }).chargers?.serial ?? "—"} ·{" "}
                    {new Date(c.created_at).toLocaleTimeString("en-GB")}
                  </Channel>
                </div>
                <StatusPill
                  status={c.status}
                  toneMap={{
                    queued: "border-primary/40 bg-primary/10 text-primary",
                    sent: "border-primary/40 bg-primary/10 text-primary",
                    acknowledged: "border-live/40 bg-live/10 text-live",
                    failed: "border-fault/40 bg-fault/10 text-fault",
                  }}
                />
              </div>
            ))}
            {!(commands.data ?? []).length ? <EmptyState>No commands queued.</EmptyState> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TariffView() {
  const tariffs = useQuery({ queryKey: ["tariffs"], queryFn: fetchTariffs });
  const nowIndex = currentHalfHourIndex();

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {(tariffs.data ?? []).map((t) => {
        const segments = (t.tariff_segments ?? []) as Array<{
          half_hour_index: number;
          tier: string;
        }>;
        const rates = (t.tariff_rates ?? []) as Array<{
          tier: string;
          energy_rwf_per_kwh: number;
          service_rwf_per_kwh: number;
        }>;
        const sorted = [...segments].sort((a, b) => a.half_hour_index - b.half_hour_index);
        const activeTier = sorted.find((s) => s.half_hour_index === nowIndex)?.tier ?? "standard";
        const activeRate = rates.find((r) => r.tier === activeTier);

        return (
          <Panel key={t.id}>
            <PanelHeader
              title={t.name}
              hint={`${(t.operators as { name?: string } | null)?.name ?? "—"} · 48 half-hour segments`}
              right={
                <div className="text-right">
                  <Channel>Now · {TIER_LABEL[activeTier]}</Channel>
                  <Metric
                    value={RWF(
                      Number(activeRate?.energy_rwf_per_kwh ?? 0) +
                        Number(activeRate?.service_rwf_per_kwh ?? 0),
                    )}
                    unit="RWF/kWh"
                    tone="gold"
                    size="sm"
                  />
                </div>
              }
            />
            <div className="p-4">
              <div className="flex h-8 gap-px overflow-hidden rounded">
                {sorted.map((s) => (
                  <div
                    key={s.half_hour_index}
                    title={`${String(Math.floor(s.half_hour_index / 2)).padStart(2, "0")}:${
                      s.half_hour_index % 2 ? "30" : "00"
                    } · ${TIER_LABEL[s.tier]}`}
                    className={`flex-1 ${TIER_BG[s.tier] ?? "bg-muted"} ${
                      s.half_hour_index === nowIndex ? "ring-2 ring-foreground" : ""
                    }`}
                  />
                ))}
              </div>
              <div className="channel mt-1.5 flex justify-between">
                <span>00:00</span>
                <span>12:00</span>
                <span>24:00</span>
              </div>

              <table className="mt-4 w-full">
                <thead className="border-b border-border">
                  <tr>
                    <Th>Tier</Th>
                    <Th className="text-right">Energy</Th>
                    <Th className="text-right">Service</Th>
                    <Th className="text-right">Total RWF/kWh</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {["sharp", "peak", "standard", "valley"].map((tier) => {
                    const r = rates.find((x) => x.tier === tier);
                    return (
                      <tr key={tier}>
                        <Td>
                          <span className="flex items-center gap-2">
                            <span
                              className={`inline-block size-2.5 rounded-sm ${TIER_BG[tier] ?? ""}`}
                            />
                            {TIER_LABEL[tier]}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <Metric value={RWF(r?.energy_rwf_per_kwh ?? 0)} size="sm" />
                        </Td>
                        <Td className="text-right">
                          <Metric value={RWF(r?.service_rwf_per_kwh ?? 0)} size="sm" />
                        </Td>
                        <Td className="text-right">
                          <Metric
                            value={RWF(
                              Number(r?.energy_rwf_per_kwh ?? 0) + Number(r?.service_rwf_per_kwh ?? 0),
                            )}
                            size="sm"
                            tone="gold"
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function SettlementView() {
  const queryClient = useQueryClient();
  const payments = useQuery({ queryKey: ["payments"], queryFn: fetchPayments });
  const settle = useMutation({
    mutationFn: useServerFn(settlePayment),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
  });

  const rows = payments.data ?? [];
  const total = rows
    .filter((p) => p.status === "settled")
    .reduce((a, p) => a + Number(p.amount_rwf ?? 0), 0);

  return (
    <Panel>
      <PanelHeader
        title="Payments & settlement"
        hint="Mobile-money collections with the operator revenue split"
        right={<Metric value={RWF(total)} unit="RWF settled" size="sm" tone="gold" />}
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <Th>When</Th>
              <Th>Driver</Th>
              <Th>Station</Th>
              <Th>Method</Th>
              <Th>Provider ref</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Operator share</Th>
              <Th className="text-right">UZA fee</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => {
              const station = (
                p as {
                  sessions?: {
                    connectors?: {
                      chargers?: {
                        stations?: { name?: string; operators?: { name?: string; revenue_share_pct?: number } };
                      };
                    };
                  };
                }
              ).sessions?.connectors?.chargers?.stations;
              const share = Number(station?.operators?.revenue_share_pct ?? 0);
              const amount = Number(p.amount_rwf ?? 0);
              return (
                <tr key={p.id} className="hover:bg-panel-raised/50">
                  <Td className="channel">{new Date(p.created_at).toLocaleString("en-GB")}</Td>
                  <Td>{(p as { drivers?: { full_name?: string } }).drivers?.full_name ?? "—"}</Td>
                  <Td>{station?.name ?? "Wallet top-up"}</Td>
                  <Td>{PAY_LABEL[p.method] ?? p.method}</Td>
                  <Td className="metric text-xs text-muted-foreground">{p.provider_ref ?? "—"}</Td>
                  <Td className="text-right">
                    <Metric value={RWF(amount)} size="sm" />
                  </Td>
                  <Td className="text-right">
                    <Metric value={RWF((amount * share) / 100)} size="sm" tone="live" />
                  </Td>
                  <Td className="text-right">
                    <Metric value={RWF((amount * (100 - share)) / 100)} size="sm" tone="gold" />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        status={p.status}
                        toneMap={{
                          settled: "border-live/40 bg-live/10 text-live",
                          pending: "border-primary/40 bg-primary/10 text-primary",
                          failed: "border-fault/40 bg-fault/10 text-fault",
                        }}
                      />
                      {p.status === "pending" ? (
                        <Btn
                          size="sm"
                          disabled={settle.isPending}
                          onClick={() => settle.mutate({ data: { paymentId: p.id } })}
                        >
                          Settle
                        </Btn>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <EmptyState>No payments yet.</EmptyState> : null}
      </div>
    </Panel>
  );
}
