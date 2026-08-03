import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchDrivers, fetchOperators, fetchStations, fetchTariffs, type StationRow } from "@/lib/queries";
import { useLive } from "@/hooks/useUza";
import { saveCharger, saveDriver, saveOperator, saveStation, saveTariffRate } from "@/lib/admin.functions";
import { ConsoleShell } from "@/components/uza/ConsoleShell";
import {
  Btn,
  Channel,
  EmptyState,
  Field,
  Metric,
  Panel,
  PanelHeader,
  StatusPill,
  Td,
  Th,
  inputClass,
} from "@/components/uza/ui";
import { CHARGER_TONE, KIGALI, PAY_LABEL, RWF, TIER_LABEL } from "@/lib/uza";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "UZA Admin — operators, stations, chargers, tariffs" },
      {
        name: "description",
        content:
          "UZA Charge administration: onboard operators, register stations and OCPP chargers, set RWF tariffs and manage driver accounts.",
      },
      { property: "og:title", content: "UZA Charge administration" },
      {
        property: "og:description",
        content: "Network-wide control of operators, stations, chargers, tariffs and drivers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminConsole,
});

type Tab = "operators" | "stations" | "chargers" | "tariffs" | "drivers";

function AdminConsole() {
  useLive(["operators", "stations", "chargers", "drivers", "tariff_rates"], [
    ["operators"],
    ["stations"],
    ["drivers"],
    ["tariffs"],
  ]);
  const [tab, setTab] = useState<Tab>("operators");

  return (
    <ConsoleShell title="UZA administration" subtitle="Network registry · RWF · OCPP 1.6J">
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border pb-2">
        {(
          [
            ["operators", "Operators"],
            ["stations", "Stations"],
            ["chargers", "Chargers"],
            ["tariffs", "Tariffs"],
            ["drivers", "Drivers"],
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

      {tab === "operators" ? <Operators /> : null}
      {tab === "stations" ? <Stations /> : null}
      {tab === "chargers" ? <Chargers /> : null}
      {tab === "tariffs" ? <Tariffs /> : null}
      {tab === "drivers" ? <Drivers /> : null}
    </ConsoleShell>
  );
}

function useInvalidate(keys: string[][]) {
  const queryClient = useQueryClient();
  return () => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
}

function Operators() {
  const operators = useQuery({ queryKey: ["operators"], queryFn: fetchOperators });
  const invalidate = useInvalidate([["operators"], ["stations"]]);
  const save = useMutation({ mutationFn: useServerFn(saveOperator), onSuccess: invalidate });
  const [name, setName] = useState("");
  const [momo, setMomo] = useState("");
  const [share, setShare] = useState(85);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel>
        <PanelHeader title="Operators" hint="Station owners and their MoMo merchant accounts" />
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <Th>Name</Th>
              <Th>MoMo merchant</Th>
              <Th className="text-right">Revenue share</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(operators.data ?? []).map((o) => (
              <tr key={o.id}>
                <Td>{o.name}</Td>
                <Td className="metric text-xs">{o.momo_merchant_id ?? "—"}</Td>
                <Td className="text-right">
                  <Metric value={Number(o.revenue_share_pct).toFixed(0)} unit="%" size="sm" tone="gold" />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(operators.data ?? []).length ? <EmptyState>No operators yet.</EmptyState> : null}
      </Panel>

      <Panel className="p-4">
        <Channel>Add operator</Channel>
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="MoMo merchant ID">
            <input className={inputClass} value={momo} onChange={(e) => setMomo(e.target.value)} />
          </Field>
          <Field label="Revenue share %">
            <input
              className={inputClass}
              type="number"
              value={share}
              onChange={(e) => setShare(Number(e.target.value))}
            />
          </Field>
          <Btn
            variant="gold"
            disabled={save.isPending || name.length < 2}
            onClick={() =>
              save.mutate({
                data: { name, momo_merchant_id: momo || null, revenue_share_pct: share },
              })
            }
          >
            Save operator
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

function Stations() {
  const stations = useQuery({ queryKey: ["stations"], queryFn: fetchStations });
  const operators = useQuery({ queryKey: ["operators"], queryFn: fetchOperators });
  const invalidate = useInvalidate([["stations"]]);
  const save = useMutation({ mutationFn: useServerFn(saveStation), onSuccess: invalidate });
  const [form, setForm] = useState({
    operator_id: "",
    name: "",
    area: "",
    kind: "120kW DC" as "180kW DC" | "120kW DC" | "22kW AC",
    lat: KIGALI.lat,
    lng: KIGALI.lng,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel>
        <PanelHeader title="Stations" hint="Sites and their installed capacity" />
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <Th>Station</Th>
              <Th>Operator</Th>
              <Th>Area</Th>
              <Th>Kind</Th>
              <Th className="text-right">Chargers</Th>
              <Th className="text-right">GPS</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(stations.data ?? []).map((s: StationRow) => (
              <tr key={s.id}>
                <Td>{s.name}</Td>
                <Td>{s.operators?.name ?? "—"}</Td>
                <Td>{s.area ?? "—"}</Td>
                <Td className="metric text-xs">{s.kind}</Td>
                <Td className="text-right">
                  <Metric value={s.chargers.length} size="sm" />
                </Td>
                <Td className="metric text-right text-xs text-muted-foreground">
                  {Number(s.gps_lat ?? 0).toFixed(3)}, {Number(s.gps_lng ?? 0).toFixed(3)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel className="p-4">
        <Channel>Add station</Channel>
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Operator">
            <select
              className={inputClass}
              value={form.operator_id}
              onChange={(e) => setForm({ ...form, operator_id: e.target.value })}
            >
              <option value="">Select…</option>
              {(operators.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Area">
            <input
              className={inputClass}
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
            />
          </Field>
          <Field label="Kind">
            <select
              className={inputClass}
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value as typeof form.kind })
              }
            >
              <option value="180kW DC">180kW DC</option>
              <option value="120kW DC">120kW DC</option>
              <option value="22kW AC">22kW AC</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <input
                className={inputClass}
                type="number"
                step="0.0001"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })}
              />
            </Field>
            <Field label="Longitude">
              <input
                className={inputClass}
                type="number"
                step="0.0001"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Btn
            variant="gold"
            disabled={save.isPending || !form.operator_id || form.name.length < 2}
            onClick={() =>
              save.mutate({
                data: {
                  operator_id: form.operator_id,
                  name: form.name,
                  area: form.area || null,
                  kind: form.kind,
                  gps_lat: form.lat,
                  gps_lng: form.lng,
                },
              })
            }
          >
            Save station
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

function Chargers() {
  const stations = useQuery({ queryKey: ["stations"], queryFn: fetchStations });
  const invalidate = useInvalidate([["stations"]]);
  const save = useMutation({ mutationFn: useServerFn(saveCharger), onSuccess: invalidate });
  const [form, setForm] = useState({
    station_id: "",
    serial: "",
    vendor: "",
    model: "",
    connector_count: 2,
    firmware_version: "1.6.0",
  });

  const chargers = (stations.data ?? []).flatMap((s) =>
    s.chargers.map((c) => ({ ...c, stationName: s.name })),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel>
        <PanelHeader title="Chargers" hint="Any vendor, spoken to over OCPP 1.6J" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <Th>Serial</Th>
                <Th>Station</Th>
                <Th>Vendor / model</Th>
                <Th>Firmware</Th>
                <Th className="text-right">Guns</Th>
                <Th className="text-right">Cap</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chargers.map((c) => (
                <tr key={c.id}>
                  <Td className="metric text-xs">{c.serial}</Td>
                  <Td>{c.stationName}</Td>
                  <Td>
                    {c.vendor ?? "—"} {c.model ?? ""}
                  </Td>
                  <Td className="metric text-xs">{c.firmware_version ?? "—"}</Td>
                  <Td className="text-right">
                    <Metric value={c.connectors.length} size="sm" />
                  </Td>
                  <Td className="text-right">
                    <Metric value={c.max_output_pct} unit="%" size="sm" />
                  </Td>
                  <Td>
                    <StatusPill status={c.status} toneMap={CHARGER_TONE} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="p-4">
        <Channel>Register charger</Channel>
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Station">
            <select
              className={inputClass}
              value={form.station_id}
              onChange={(e) => setForm({ ...form, station_id: e.target.value })}
            >
              <option value="">Select…</option>
              {(stations.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Serial">
            <input
              className={inputClass}
              value={form.serial}
              onChange={(e) => setForm({ ...form, serial: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vendor">
              <input
                className={inputClass}
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
            </Field>
            <Field label="Model">
              <input
                className={inputClass}
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Connectors">
              <input
                className={inputClass}
                type="number"
                value={form.connector_count}
                onChange={(e) => setForm({ ...form, connector_count: Number(e.target.value) })}
              />
            </Field>
            <Field label="Firmware">
              <input
                className={inputClass}
                value={form.firmware_version}
                onChange={(e) => setForm({ ...form, firmware_version: e.target.value })}
              />
            </Field>
          </div>
          <Btn
            variant="gold"
            disabled={save.isPending || !form.station_id || form.serial.length < 3}
            onClick={() =>
              save.mutate({
                data: {
                  station_id: form.station_id,
                  serial: form.serial,
                  vendor: form.vendor || null,
                  model: form.model || null,
                  connector_count: form.connector_count,
                  firmware_version: form.firmware_version || null,
                  max_output_pct: 100,
                },
              })
            }
          >
            Register charger
          </Btn>
          <p className="channel">Connectors are provisioned automatically from the gun count.</p>
        </div>
      </Panel>
    </div>
  );
}

function Tariffs() {
  const tariffs = useQuery({ queryKey: ["tariffs"], queryFn: fetchTariffs });
  const invalidate = useInvalidate([["tariffs"]]);
  const save = useMutation({ mutationFn: useServerFn(saveTariffRate), onSuccess: invalidate });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {(tariffs.data ?? []).map((t) => {
        const rates = (t.tariff_rates ?? []) as Array<{
          tier: string;
          energy_rwf_per_kwh: number;
          service_rwf_per_kwh: number;
        }>;
        return (
          <Panel key={t.id}>
            <PanelHeader
              title={t.name}
              hint={`${(t.operators as { name?: string } | null)?.name ?? "—"} · RWF per kWh`}
            />
            <div className="divide-y divide-border">
              {["sharp", "peak", "standard", "valley"].map((tier) => {
                const r = rates.find((x) => x.tier === tier);
                return (
                  <TariffRateRow
                    key={tier}
                    tariffId={t.id as string}
                    tier={tier}
                    energy={Number(r?.energy_rwf_per_kwh ?? 0)}
                    service={Number(r?.service_rwf_per_kwh ?? 0)}
                    busy={save.isPending}
                    onSave={(energy, service) =>
                      save.mutate({
                        data: {
                          tariff_id: t.id as string,
                          tier: tier as "sharp" | "peak" | "standard" | "valley",
                          energy_rwf_per_kwh: energy,
                          service_rwf_per_kwh: service,
                        },
                      })
                    }
                  />
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function TariffRateRow({
  tier,
  energy,
  service,
  onSave,
  busy,
}: {
  tariffId: string;
  tier: string;
  energy: number;
  service: number;
  onSave: (energy: number, service: number) => void;
  busy: boolean;
}) {
  const [e, setE] = useState(energy);
  const [s, setS] = useState(service);
  return (
    <div className="flex flex-wrap items-end gap-2 px-4 py-3">
      <div className="w-24">
        <Channel>Tier</Channel>
        <span className="text-sm">{TIER_LABEL[tier]}</span>
      </div>
      <Field label="Energy">
        <input
          className={`${inputClass} w-24`}
          type="number"
          value={e}
          onChange={(ev) => setE(Number(ev.target.value))}
        />
      </Field>
      <Field label="Service">
        <input
          className={`${inputClass} w-24`}
          type="number"
          value={s}
          onChange={(ev) => setS(Number(ev.target.value))}
        />
      </Field>
      <Btn size="sm" disabled={busy} onClick={() => onSave(e, s)}>
        Save
      </Btn>
    </div>
  );
}

function Drivers() {
  const drivers = useQuery({ queryKey: ["drivers"], queryFn: fetchDrivers });
  const invalidate = useInvalidate([["drivers"]]);
  const save = useMutation({ mutationFn: useServerFn(saveDriver), onSuccess: invalidate });

  return (
    <Panel>
      <PanelHeader title="Drivers" hint="Wallets and default mobile-money method" />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th className="text-right">Wallet RWF</Th>
              <Th>Default method</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(drivers.data ?? []).map((d) => (
              <tr key={d.id}>
                <Td>{d.full_name ?? "—"}</Td>
                <Td className="metric text-xs">{d.phone ?? "—"}</Td>
                <Td className="text-right">
                  <Metric value={RWF(d.wallet_balance_rwf)} size="sm" tone="gold" />
                </Td>
                <Td>{PAY_LABEL[d.default_pay_method] ?? d.default_pay_method}</Td>
                <Td className="text-right">
                  <Btn
                    size="sm"
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({
                        data: {
                          id: d.id,
                          full_name: d.full_name ?? "UZA driver",
                          phone: d.phone ?? null,
                          wallet_balance_rwf: Number(d.wallet_balance_rwf) + 5000,
                          default_pay_method: d.default_pay_method as "momo" | "airtel" | "wallet",
                        },
                      })
                    }
                  >
                    +5,000 credit
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(drivers.data ?? []).length ? <EmptyState>No drivers yet.</EmptyState> : null}
      </div>
    </Panel>
  );
}
