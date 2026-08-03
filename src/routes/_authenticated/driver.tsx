import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchDriverPayments,
  fetchDriverSessions,
  fetchStations,
  type LiveSession,
  type StationRow,
} from "@/lib/queries";
import { useAccount, useLive, useNow, useSimulatorPulse } from "@/hooks/useUza";
import { paySession, startSession, stopSession, topUpWallet } from "@/lib/driver.functions";
import {
  Btn,
  Channel,
  EmptyState,
  LiveDot,
  Metric,
  Panel,
  SocRing,
  StatusPill,
} from "@/components/uza/ui";
import { UzaMark } from "@/components/uza/ConsoleShell";
import {
  CONNECTOR_TONE,
  KIGALI,
  KW,
  KWH,
  PAY_LABEL,
  RWF,
  distanceKm,
  elapsed,
} from "@/lib/uza";

export const Route = createFileRoute("/_authenticated/driver")({
  head: () => ({
    meta: [
      { title: "Driver app — charge & pay with MoMo | UZA Charge" },
      {
        name: "description",
        content:
          "Find a nearby UZA charger, start a session, watch live kW and state of charge, then pay with MTN MoMo, Airtel Money or your UZA wallet in RWF.",
      },
      { property: "og:title", content: "UZA Charge driver app" },
      {
        property: "og:description",
        content: "Start charging, track SOC live, and pay with mobile money in RWF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DriverApp,
});

type Tab = "find" | "session" | "history" | "wallet";

function DriverApp() {
  useSimulatorPulse();
  const queryClient = useQueryClient();
  const account = useAccount();
  const driverId = account.data?.driver?.id ?? null;

  useLive(
    ["sessions", "meter_values", "connectors", "chargers", "payments", "drivers"],
    [["stations"], ["driver-sessions"], ["driver-payments"], ["account"]],
  );

  const [tab, setTab] = useState<Tab>("find");
  const stations = useQuery({ queryKey: ["stations"], queryFn: fetchStations });
  const sessions = useQuery({
    queryKey: ["driver-sessions", driverId],
    queryFn: () => fetchDriverSessions(driverId as string),
    enabled: !!driverId,
  });
  const payments = useQuery({
    queryKey: ["driver-payments", driverId],
    queryFn: () => fetchDriverPayments(driverId as string),
    enabled: !!driverId,
  });

  const active = (sessions.data ?? []).find((s) =>
    ["preparing", "charging", "finishing"].includes(s.status),
  );
  const unpaid = (sessions.data ?? []).find((s) => s.status === "completed");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["driver-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["driver-payments"] });
    queryClient.invalidateQueries({ queryKey: ["account"] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
  };

  const start = useMutation({
    mutationFn: useServerFn(startSession),
    onSuccess: () => {
      invalidate();
      setTab("session");
    },
  });
  const stop = useMutation({ mutationFn: useServerFn(stopSession), onSuccess: invalidate });
  const pay = useMutation({ mutationFn: useServerFn(paySession), onSuccess: invalidate });
  const topUp = useMutation({ mutationFn: useServerFn(topUpWallet), onSuccess: invalidate });

  const wallet = Number(account.data?.driver?.wallet_balance_rwf ?? 0);

  return (
    <div className="grid-backdrop flex min-h-screen justify-center px-3 py-5">
      <div className="w-full max-w-[440px]">
        <div className="flex items-center justify-between pb-4">
          <UzaMark />
          <div className="text-right">
            <Channel>Wallet</Channel>
            <Metric value={RWF(wallet)} unit="RWF" size="sm" tone="gold" />
          </div>
        </div>

        {tab === "find" ? (
          <FindView
            stations={stations.data ?? []}
            busy={start.isPending}
            hasActive={!!active}
            onStart={(connectorId) => start.mutate({ data: { connectorId, startMethod: "app" } })}
          />
        ) : null}

        {tab === "session" ? (
          <SessionView
            session={active ?? unpaid ?? null}
            onStop={(id) => stop.mutate({ data: { sessionId: id } })}
            onPay={(id, method) => pay.mutate({ data: { sessionId: id, method } })}
            stopping={stop.isPending}
            paying={pay.isPending}
            wallet={wallet}
          />
        ) : null}

        {tab === "history" ? <HistoryView sessions={sessions.data ?? []} /> : null}

        {tab === "wallet" ? (
          <WalletView
            balance={wallet}
            payments={payments.data ?? []}
            busy={topUp.isPending}
            onTopUp={(amountRwf, method) => topUp.mutate({ data: { amountRwf, method } })}
          />
        ) : null}

        <nav className="sticky bottom-3 mt-5 grid grid-cols-4 gap-1 rounded-xl border border-border bg-panel/95 p-1.5 backdrop-blur">
          {(
            [
              ["find", "Charge"],
              ["session", "Live"],
              ["history", "History"],
              ["wallet", "Wallet"],
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                tab === value
                  ? "bg-panel-raised text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                {value === "session" && active ? <LiveDot /> : null}
                {label}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function FindView({
  stations,
  onStart,
  busy,
  hasActive,
}: {
  stations: StationRow[];
  onStart: (connectorId: string) => void;
  busy: boolean;
  hasActive: boolean;
}) {
  const ranked = useMemo(
    () =>
      stations
        .map((s) => ({
          station: s,
          km:
            s.gps_lat != null && s.gps_lng != null
              ? distanceKm(KIGALI.lat, KIGALI.lng, Number(s.gps_lat), Number(s.gps_lng))
              : 99,
        }))
        .sort((a, b) => a.km - b.km),
    [stations],
  );

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-4">
        <Channel>Nearby stations</Channel>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked from Kigali city centre. Tap a free connector to start.
        </p>
      </Panel>

      {hasActive ? (
        <Panel className="border-live/40 p-4">
          <span className="flex items-center gap-2 text-sm text-live">
            <LiveDot /> You already have a live session — see the Live tab.
          </span>
        </Panel>
      ) : null}

      {ranked.map(({ station, km }) => {
        const connectors = station.chargers.flatMap((c) =>
          c.connectors.map((x) => ({ ...x, serial: c.serial, chargerStatus: c.status })),
        );
        const free = connectors.filter((c) => c.status === "available");
        return (
          <Panel key={station.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{station.name}</h3>
                <Channel>
                  {station.area ?? "Kigali"} · {station.kind}
                </Channel>
              </div>
              <div className="text-right">
                <Metric value={km.toFixed(1)} unit="km" size="sm" />
                <Channel>{free.length} free</Channel>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {connectors.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel-raised px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="metric text-xs">
                      {conn.label} · {conn.type}
                    </span>
                    <Channel>
                      {conn.serial} · {KW(conn.power_kw)} kW
                    </Channel>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={conn.status} toneMap={CONNECTOR_TONE} />
                    <Btn
                      size="sm"
                      variant={conn.status === "available" ? "gold" : "ghost"}
                      disabled={conn.status !== "available" || busy || hasActive}
                      onClick={() => onStart(conn.id)}
                    >
                      Start
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function SessionView({
  session,
  onStop,
  onPay,
  stopping,
  paying,
  wallet,
}: {
  session: LiveSession | null;
  onStop: (id: string) => void;
  onPay: (id: string, method: "momo" | "airtel" | "wallet") => void;
  stopping: boolean;
  paying: boolean;
  wallet: number;
}) {
  useNow(1000);
  if (!session) {
    return (
      <Panel>
        <EmptyState>No active session. Pick a connector on the Charge tab.</EmptyState>
      </Panel>
    );
  }

  const live = ["preparing", "charging", "finishing"].includes(session.status);
  const soc = Number(session.soc_end ?? session.soc_start ?? 0);
  const powerKw = live && session.status === "charging" ? Number(session.connectors?.power_kw ?? 0) : 0;

  return (
    <div className="flex flex-col gap-3">
      <Panel className="flex flex-col items-center p-5">
        <div className="mb-3 flex w-full items-center justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {session.connectors?.chargers?.stations?.name ?? "Station"}
            </h3>
            <Channel>
              {session.connectors?.chargers?.serial} · {session.connectors?.label} ·{" "}
              {session.serial_no}
            </Channel>
          </div>
          <StatusPill status={session.status} toneMap={CONNECTOR_TONE} />
        </div>

        <SocRing soc={soc} />

        <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-border bg-panel-raised py-2.5">
            <Channel>Power</Channel>
            <Metric value={KW(powerKw)} unit="kW" tone="live" size="md" />
          </div>
          <div className="rounded-md border border-border bg-panel-raised py-2.5">
            <Channel>Energy</Channel>
            <Metric value={KWH(session.kwh)} unit="kWh" size="md" />
          </div>
          <div className="rounded-md border border-border bg-panel-raised py-2.5">
            <Channel>Cost</Channel>
            <Metric value={RWF(session.cost_rwf)} unit="RWF" tone="gold" size="md" />
          </div>
        </div>

        <div className="mt-2 flex w-full items-center justify-between rounded-md border border-border bg-panel-raised px-3 py-2">
          <Channel>Elapsed</Channel>
          <Metric value={elapsed(session.started_at, session.ended_at)} size="sm" />
        </div>

        {live ? (
          <Btn
            variant="danger"
            size="lg"
            className="mt-4 w-full"
            disabled={stopping}
            onClick={() => onStop(session.id)}
          >
            {stopping ? "Stopping…" : "Stop charging"}
          </Btn>
        ) : null}
      </Panel>

      {!live && session.status === "completed" ? (
        <Panel className="p-4">
          <Channel>Pay this session</Channel>
          <div className="mt-1 flex items-baseline justify-between">
            <Metric value={RWF(session.cost_rwf)} unit="RWF" tone="gold" size="lg" />
            <Channel>{KWH(session.kwh)} kWh delivered</Channel>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Btn variant="gold" size="lg" disabled={paying} onClick={() => onPay(session.id, "momo")}>
              Pay with MTN MoMo
            </Btn>
            <Btn size="lg" disabled={paying} onClick={() => onPay(session.id, "airtel")}>
              Pay with Airtel Money
            </Btn>
            <Btn
              size="lg"
              disabled={paying || wallet < Number(session.cost_rwf)}
              onClick={() => onPay(session.id, "wallet")}
            >
              UZA Wallet · {RWF(wallet)} RWF
            </Btn>
          </div>
          <p className="channel mt-3">
            Cost is computed on the backend from meter values against the station tariff.
          </p>
        </Panel>
      ) : null}

      {session.status === "paid" ? (
        <Panel className="p-4">
          <Channel>Receipt</Channel>
          <div className="mt-2 flex flex-col gap-1.5">
            <Row label="Energy" value={`${KWH(session.kwh)} kWh`} />
            <Row label="Total" value={`${RWF(session.cost_rwf)} RWF`} />
            <Row label="SOC" value={`${Math.round(Number(session.soc_start ?? 0))}% → ${Math.round(soc)}%`} />
            <Row label="Stop reason" value={session.stop_reason_code ?? "Local"} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-1.5 last:border-0">
      <Channel>{label}</Channel>
      <span className="metric text-sm">{value}</span>
    </div>
  );
}

function HistoryView({ sessions }: { sessions: LiveSession[] }) {
  if (!sessions.length) {
    return (
      <Panel>
        <EmptyState>No sessions yet.</EmptyState>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s) => (
        <Panel key={s.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">
                {s.connectors?.chargers?.stations?.name ?? "Station"}
              </h3>
              <Channel>
                {new Date(s.started_at).toLocaleString("en-GB")} · {s.start_method}
              </Channel>
            </div>
            <StatusPill status={s.status} toneMap={CONNECTOR_TONE} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <Channel>kWh</Channel>
              <Metric value={KWH(s.kwh)} size="sm" />
            </div>
            <div>
              <Channel>Duration</Channel>
              <Metric value={elapsed(s.started_at, s.ended_at)} size="sm" />
            </div>
            <div>
              <Channel>RWF</Channel>
              <Metric value={RWF(s.cost_rwf)} size="sm" tone="gold" />
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function WalletView({
  balance,
  payments,
  onTopUp,
  busy,
}: {
  balance: number;
  payments: Array<{
    id: string;
    method: string;
    amount_rwf: number;
    status: string;
    provider_ref: string | null;
    created_at: string;
  }>;
  onTopUp: (amount: number, method: "momo" | "airtel") => void;
  busy: boolean;
}) {
  const [amount, setAmount] = useState(5000);
  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-5">
        <Channel>UZA wallet balance</Channel>
        <Metric value={RWF(balance)} unit="RWF" tone="gold" size="xl" />
        <div className="mt-4 flex gap-2">
          {[2000, 5000, 10000, 20000].map((v) => (
            <Btn
              key={v}
              size="sm"
              variant={amount === v ? "gold" : "default"}
              onClick={() => setAmount(v)}
            >
              {RWF(v)}
            </Btn>
          ))}
        </div>
        <div className="mt-3 grid gap-2">
          <Btn variant="gold" size="lg" disabled={busy} onClick={() => onTopUp(amount, "momo")}>
            Top up with MTN MoMo
          </Btn>
          <Btn size="lg" disabled={busy} onClick={() => onTopUp(amount, "airtel")}>
            Top up with Airtel Money
          </Btn>
        </div>
        <p className="channel mt-3">Sandbox mobile money — no real funds move.</p>
      </Panel>

      <Panel>
        <div className="border-b border-border px-4 py-3">
          <Channel>Payment history</Channel>
        </div>
        <div className="divide-y divide-border">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <span className="text-sm">{PAY_LABEL[p.method] ?? p.method}</span>
                <Channel>
                  {p.provider_ref ?? "—"} · {new Date(p.created_at).toLocaleString("en-GB")}
                </Channel>
              </div>
              <div className="text-right">
                <Metric value={RWF(p.amount_rwf)} unit="RWF" size="sm" />
                <Channel>{p.status}</Channel>
              </div>
            </div>
          ))}
          {!payments.length ? <EmptyState>No payments yet.</EmptyState> : null}
        </div>
      </Panel>
    </div>
  );
}
