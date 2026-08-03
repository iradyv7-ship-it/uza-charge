import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicStations, fetchFleetKpis, type PublicStationRow } from "@/lib/queries";
import { useLive, useSimulatorPulse } from "@/hooks/useUza";
import { ConsoleShell } from "@/components/uza/ConsoleShell";
import { Btn, Channel, Metric, Panel, PanelHeader, StatTile, StatusPill } from "@/components/uza/ui";
import { CHARGER_TONE, CONNECTOR_TONE, KWH, RWF } from "@/lib/uza";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UZA Charge — EV charging network control for East Africa" },
      {
        name: "description",
        content:
          "UZA Charge runs EV chargers of any brand over OCPP 1.6 with MTN MoMo and Airtel Money settlement in RWF. Live network status across Rwanda.",
      },
      { property: "og:title", content: "UZA Charge — EV charging network control for East Africa" },
      {
        property: "og:description",
        content:
          "UZA Charge runs EV chargers of any brand over OCPP 1.6 with MTN MoMo and Airtel Money settlement in RWF. Live network status across Rwanda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NetworkPage,
});

function NetworkPage() {
  useSimulatorPulse();
  useLive(
    ["sessions", "connectors", "chargers", "meter_values"],
    [["stations", "public"], ["kpis"]],
  );

  const stations = useQuery({ queryKey: ["stations", "public"], queryFn: fetchPublicStations });
  const kpis = useQuery({ queryKey: ["kpis"], queryFn: fetchFleetKpis });
  const k = kpis.data;

  return (
    <ConsoleShell
      title="Network status"
      subtitle="Live across Rwanda · currency RWF · protocol OCPP 1.6J"
      actions={
        <div className="flex gap-2">
          <Link to="/driver">
            <Btn variant="gold">Open driver app</Btn>
          </Link>
          <Link to="/ops">
            <Btn>Operator console</Btn>
          </Link>
        </div>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Chargers online"
          value={`${k?.chargersOnline ?? 0}/${k?.chargersTotal ?? 0}`}
          tone="live"
          foot={`${k?.chargersFaulted ?? 0} faulted`}
        />
        <StatTile label="Live sessions" value={k?.liveSessions ?? 0} tone="gold" foot="charging now" />
        <StatTile label="Energy today" value={KWH(k?.energyToday ?? 0, 1)} unit="kWh" />
        <StatTile
          label="Revenue today"
          value={RWF(k?.revenueToday ?? 0)}
          unit="RWF"
          tone="gold"
          foot={`${k?.openFaults ?? 0} open faults`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {(stations.data ?? []).map((station) => (
          <StationCard key={station.id} station={station} />
        ))}
        {stations.isLoading ? (
          <Panel className="p-6">
            <Channel>Loading network…</Channel>
          </Panel>
        ) : null}
      </div>
    </ConsoleShell>
  );
}

function StationCard({ station }: { station: PublicStationRow }) {
  const connectors = station.chargers.flatMap((c) => c.connectors);
  const available = connectors.filter((c) => c.status === "available").length;
  const charging = connectors.filter((c) => c.status === "charging").length;

  return (
    <Panel>
      <PanelHeader
        title={station.name}
        hint={`${station.area ?? "Kigali"} · ${station.kind} · ${station.operators?.name ?? "—"}`}
        right={
          <div className="text-right">
            <Metric value={available} tone="live" size="md" />
            <Channel>of {connectors.length} free</Channel>
          </div>
        }
      />
      <div className="divide-y divide-border">
        {station.chargers.map((charger, i) => (
          <div key={charger.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="metric text-sm">Charger {i + 1}</span>
                <Channel>{charger.connector_count} connectors</Channel>
              </div>
              <StatusPill status={charger.status} toneMap={CHARGER_TONE} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {charger.connectors.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-panel-raised px-2.5 py-1.5"
                >
                  <span className="metric text-xs">{conn.label}</span>
                  <span className="channel">{conn.type}</span>
                  <Metric value={conn.power_kw} unit="kW" size="sm" tone="muted" />
                  <StatusPill status={conn.status} toneMap={CONNECTOR_TONE} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <Channel>{charging} charging now</Channel>
        <Channel>{station.kind}</Channel>
      </div>
    </Panel>
  );
}

