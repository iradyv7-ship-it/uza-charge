import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BatteryCharging,
  CalendarClock,
  Clock,
  History,
  Map,
  PiggyBank,
  Plug,
  Star,
  Wallet,
  Zap,
} from "lucide-react";
import {
  fetchDriverPayments,
  fetchDriverSessions,
  fetchStations,
  type LiveSession,
  type StationRow,
} from "@/lib/queries";
import { useAccount, useLive, useNow, useSignOut, useSimulatorPulse } from "@/hooks/useUza";
import { paySession, startSession, stopSession, topUpWallet } from "@/lib/driver.functions";
import { railStatus } from "@/lib/payments.functions";
import {
  Btn,
  Channel,
  EmptyState,
  Field,
  Metric,
  Panel,
  SocRing,
  StatusPill,
  inputClass,
} from "@/components/uza/ui";
import { UzaMark } from "@/components/uza/ConsoleShell";
import { CONNECTOR_TONE, KIGALI, KW, KWH, PAY_LABEL, RWF, distanceKm, elapsed } from "@/lib/uza";
import { I18nProvider, LOCALES, LOCALE_LABEL, useI18n, type Locale } from "@/i18n";
import type { MapStation } from "@/components/uza/StationMap";
import { BookingPanel } from "@/components/uza/BookingPanel";

const StationMapLazy = lazy(() => import("@/components/uza/StationMap"));

export const Route = createFileRoute("/_authenticated/driver")({
  head: () => ({
    meta: [
      { title: "Driver app — charge & pay with MoMo | UZA Charge" },
      {
        name: "description",
        content:
          "Find a nearby UZA charger on the map, start a session, watch live kW and state of charge, then pay with MTN MoMo, Airtel Money or your UZA wallet in RWF.",
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
  component: () => (
    <I18nProvider>
      <DriverApp />
    </I18nProvider>
  ),
});

type Tab = "find" | "book" | "session" | "history" | "wallet";

const FAV_KEY = "uza.favourites";

function useFavourites() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      if (raw) setIds(JSON.parse(raw) as string[]);
    } catch {
      /* first run */
    }
  }, []);
  const toggle = (id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };
  return { ids, toggle };
}

function DriverApp() {
  useSimulatorPulse();
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const account = useAccount();
  const signOut = useSignOut();
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
    for (const key of [["driver-sessions"], ["driver-payments"], ["account"], ["stations"]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
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

  const rails = useQuery({ queryKey: ["rail-status"], queryFn: () => railStatus(), staleTime: 300_000 });
  const [phone, setPhone] = useState("");
  const payerPhone = phone || (account.data?.driver?.phone ?? "");
  const railsLive = !!rails.data && (rails.data.momo || rails.data.airtel);

  const wallet = Number(account.data?.driver?.wallet_balance_rwf ?? 0);
  const failure = start.error ?? stop.error ?? pay.error ?? topUp.error;
  const notice = pay.data?.message ?? topUp.data?.message ?? null;

  return (
    <div className="grid-backdrop flex min-h-screen justify-center px-2 pb-24 pt-4 sm:px-4">
      <div className="w-full max-w-[400px]">
        <header className="flex items-start justify-between gap-2 pb-3">
          <UzaMark compact />
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="locale">
              {t("common.language")}
            </label>
            <select
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="metric rounded-md border border-input bg-background px-2 py-1 text-[11px]"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABEL[l]}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void signOut()} className="channel">
              {t("common.signOut")}
            </button>
          </div>
        </header>

        {failure ? (
          <p className="mb-3 rounded-md border border-fault/40 bg-fault/10 px-3 py-2 text-sm text-fault">
            {failure instanceof Error ? failure.message : t("common.error")}
          </p>
        ) : null}

        {notice ? (
          <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        {tab === "find" ? (
          <FindView
            stations={stations.data ?? []}
            loading={stations.isLoading}
            busy={start.isPending}
            hasActive={!!active}
            onStart={(connectorId) => start.mutate({ data: { connectorId, startMethod: "app" } })}
          />
        ) : null}

        {tab === "book" ? (
          <BookingPanel
            stations={stations.data ?? []}
            startBusy={start.isPending}
            canStart={!active}
            onStart={(connectorId) => start.mutate({ data: { connectorId, startMethod: "app" } })}
          />
        ) : null}

        {tab === "session" ? (
          <SessionView
            session={active ?? unpaid ?? null}
            onStop={(id) => stop.mutate({ data: { sessionId: id } })}
            onPay={(id, method) =>
              pay.mutate({ data: { sessionId: id, method, ...(payerPhone ? { phone: payerPhone } : {}) } })
            }
            stopping={stop.isPending}
            paying={pay.isPending}
            wallet={wallet}
            phone={payerPhone}
            onPhone={setPhone}
            railsLive={railsLive}
          />
        ) : null}

        {tab === "history" ? <HistoryView sessions={sessions.data ?? []} /> : null}

        {tab === "wallet" ? (
          <WalletView
            balance={wallet}
            payments={payments.data ?? []}
            busy={topUp.isPending}
            onTopUp={(amountRwf, method) =>
              topUp.mutate({ data: { amountRwf, method, ...(payerPhone ? { phone: payerPhone } : {}) } })
            }
            phone={payerPhone}
            onPhone={setPhone}
            railsLive={railsLive}
          />
        ) : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-[400px] grid-cols-5">
          {(
            [
              ["find", t("nav.find"), Map],
              ["book", t("nav.book"), CalendarClock],
              ["session", t("nav.session"), BatteryCharging],
              ["history", t("nav.history"), History],
              ["wallet", t("nav.wallet"), Wallet],
            ] as Array<[Tab, string, typeof Map]>
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                tab === key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Find — map + list                                                   */
/* ------------------------------------------------------------------ */

type StationView = {
  row: StationRow;
  distance: number | null;
  free: number;
  total: number;
  neverConnected: boolean;
  lastSeen: string | null;
};

function summarise(row: StationRow): StationView {
  const connectors = row.chargers.flatMap((c) => c.connectors);
  const heartbeats = row.chargers
    .map((c) => c.last_heartbeat)
    .filter((h): h is string => !!h)
    .sort();
  return {
    row,
    distance:
      row.gps_lat !== null && row.gps_lng !== null
        ? distanceKm(KIGALI.lat, KIGALI.lng, Number(row.gps_lat), Number(row.gps_lng))
        : null,
    free: connectors.filter((c) => c.status === "available").length,
    total: connectors.length,
    neverConnected: heartbeats.length === 0,
    lastSeen: heartbeats.length ? (heartbeats[heartbeats.length - 1] as string) : null,
  };
}

function FindView({
  stations,
  loading,
  busy,
  hasActive,
  onStart,
}: {
  stations: StationRow[];
  loading: boolean;
  busy: boolean;
  hasActive: boolean;
  onStart: (connectorId: string) => void;
}) {
  const { t } = useI18n();
  const fav = useFavourites();
  const [onlyFav, setOnlyFav] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const views = useMemo(
    () =>
      stations
        .map(summarise)
        .filter((v) => (onlyFav ? fav.ids.includes(v.row.id) : true))
        .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)),
    [stations, onlyFav, fav.ids],
  );

  const mapStations: MapStation[] = views
    .filter((v) => v.row.gps_lat !== null && v.row.gps_lng !== null)
    .map((v) => ({
      id: v.row.id,
      name: v.row.name,
      area: v.row.area,
      lat: Number(v.row.gps_lat),
      lng: Number(v.row.gps_lng),
      free: v.free,
      total: v.total,
      neverConnected: v.neverConnected,
    }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("find.title")}</h1>
          <Channel>{t("find.subtitle")}</Channel>
        </div>
        <Btn size="sm" variant={onlyFav ? "gold" : "default"} onClick={() => setOnlyFav(!onlyFav)}>
          <Star className="size-3.5" aria-hidden />
          {onlyFav ? t("find.favourites") : t("find.allStations")}
        </Btn>
      </div>

      <ClientOnly
        fallback={
          <div className="h-[260px] w-full animate-pulse rounded-md border border-border bg-panel" />
        }
      >
        <Suspense
          fallback={
            <div className="h-[260px] w-full animate-pulse rounded-md border border-border bg-panel" />
          }
        >
          <StationMapLazy
            stations={mapStations}
            centre={KIGALI}
            selectedId={selected}
            onSelect={setSelected}
          />
        </Suspense>
      </ClientOnly>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-md border border-border bg-panel" />
          ))}
        </div>
      ) : views.length === 0 ? (
        <Panel className="p-4">
          <EmptyState>{t("find.empty")}</EmptyState>
        </Panel>
      ) : (
        views.map((v) => (
          <StationCard
            key={v.row.id}
            view={v}
            highlighted={selected === v.row.id}
            favourite={fav.ids.includes(v.row.id)}
            onToggleFavourite={() => fav.toggle(v.row.id)}
            busy={busy}
            hasActive={hasActive}
            onStart={onStart}
          />
        ))
      )}
    </div>
  );
}

function StationCard({
  view,
  highlighted,
  favourite,
  onToggleFavourite,
  busy,
  hasActive,
  onStart,
}: {
  view: StationView;
  highlighted: boolean;
  favourite: boolean;
  onToggleFavourite: () => void;
  busy: boolean;
  hasActive: boolean;
  onStart: (connectorId: string) => void;
}) {
  const { t } = useI18n();
  const { row } = view;
  const connectors = row.chargers.flatMap((c) =>
    c.connectors.map((k) => ({ ...k, chargerStatus: c.status })),
  );

  return (
    <Panel className={`p-3 ${highlighted ? "border-primary" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.name}</p>
          <Channel>
            {row.area ?? "—"} · {row.kind}
          </Channel>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleFavourite}
            aria-label={favourite ? t("find.savedFavourite") : t("find.saveFavourite")}
            className={favourite ? "text-primary" : "text-muted-foreground"}
          >
            <Star className="size-4" fill={favourite ? "currentColor" : "none"} aria-hidden />
          </button>
          <div className="text-right">
            <Metric
              value={view.distance === null ? "—" : view.distance.toFixed(1)}
              unit={t("common.km")}
              size="sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {view.neverConnected ? (
          <span className="metric inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Plug className="size-3" aria-hidden /> {t("find.neverConnected")}
          </span>
        ) : (
          <span
            className={`metric inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
              view.free > 0
                ? "border-live/40 bg-live/10 text-live"
                : "border-warn/40 bg-warn/10 text-warn"
            }`}
          >
            <Zap className="size-3" aria-hidden />
            {view.free > 0 ? `${view.free}/${view.total} ${t("find.available")}` : t("find.noneFree")}
          </span>
        )}
        {row.gps_lat !== null && row.gps_lng !== null ? (
          <a
            className="channel underline hover:text-foreground"
            href={`https://www.google.com/maps/dir/?api=1&destination=${row.gps_lat},${row.gps_lng}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("find.navigate")}
          </a>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {connectors.map((c) => {
          const startable =
            !hasActive && c.chargerStatus === "online" && ["available", "preparing"].includes(c.status);
          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel-raised px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="metric truncate text-xs">
                  {c.label} · {c.type}
                </p>
                <Metric value={KW(c.power_kw)} unit="kW" size="sm" tone="muted" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill status={c.status} toneMap={CONNECTOR_TONE} />
                <Btn
                  size="sm"
                  variant="live"
                  disabled={!startable || busy}
                  onClick={() => onStart(c.id)}
                >
                  {t("find.start")}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
      {hasActive ? <p className="channel mt-2">{t("find.busyElsewhere")}</p> : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Live session                                                        */
/* ------------------------------------------------------------------ */

function SessionView({
  session,
  onStop,
  onPay,
  stopping,
  paying,
  wallet,
  phone,
  onPhone,
  railsLive,
}: {
  session: LiveSession | null;
  onStop: (id: string) => void;
  onPay: (id: string, method: "momo" | "airtel" | "wallet") => void;
  stopping: boolean;
  paying: boolean;
  wallet: number;
  phone: string;
  onPhone: (v: string) => void;
  railsLive: boolean;
}) {
  const { t } = useI18n();
  useNow(1000);

  if (!session) {
    return (
      <Panel className="p-4">
        <EmptyState>{t("session.none")}</EmptyState>
      </Panel>
    );
  }

  const live = ["preparing", "charging", "finishing"].includes(session.status);
  const soc = Number(session.soc_end ?? session.soc_start ?? 0);
  const powerKw = Number(session.connectors?.power_kw ?? 0);
  const kwh = Number(session.kwh ?? 0);
  // Estimate only from measured power; refuse to guess when nothing is flowing.
  const remainingKwh = Math.max(0, ((80 - soc) / 100) * 60);
  const minutesTo80 = powerKw > 0 && live && soc < 80 ? Math.round((remainingKwh / powerKw) * 60) : null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("session.title")}</h1>
        <Channel>
          {session.connectors?.chargers?.stations?.name ?? "—"} · {session.connectors?.label ?? "—"}
        </Channel>
      </div>

      <Panel className="flex flex-col items-center gap-3 p-4">
        <SocRing soc={soc} kw={live ? powerKw : undefined} size={200} />
        <div className="grid w-full grid-cols-3 gap-2">
          <Tile label={t("session.energy")} value={KWH(kwh)} unit="kWh" />
          <Tile label={t("session.cost")} value={RWF(session.cost_rwf)} unit="RWF" tone="gold" />
          <Tile label={t("session.time")} value={elapsed(session.started_at, session.ended_at)} />
        </div>
        <p className="channel flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden />
          {minutesTo80 === null
            ? t("session.estimateUnknown")
            : `${t("session.estimate")}: ${minutesTo80} ${t("common.min")}`}
        </p>
        {live ? (
          <Btn variant="danger" size="lg" className="w-full" disabled={stopping} onClick={() => onStop(session.id)}>
            {stopping ? t("session.stopping") : t("session.stop")}
          </Btn>
        ) : null}
      </Panel>

      {!live ? (
        <Panel className="p-4">
          <Channel>{t("session.payTitle")}</Channel>
          <div className="metric mt-2 flex items-baseline justify-between">
            <span className="channel">{t("history.total")}</span>
            <Metric value={RWF(session.cost_rwf)} unit="RWF" tone="gold" />
          </div>
          <div className="mt-3">
            <Field label={t("pay.phone")}>
              <input
                className={inputClass}
                inputMode="tel"
                placeholder="+250788123456"
                value={phone}
                onChange={(e) => onPhone(e.target.value)}
              />
            </Field>
          </div>
          <p className="channel mt-2">{railsLive ? t("pay.confirmOnPhone") : t("pay.railsPending")}</p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {(["momo", "airtel", "wallet"] as const).map((m) => (
              <Btn
                key={m}
                variant={m === "wallet" ? "default" : "gold"}
                size="lg"
                disabled={
                  paying ||
                  (m === "wallet" && wallet < Number(session.cost_rwf ?? 0)) ||
                  (m !== "wallet" && phone.trim().length < 9)
                }
                onClick={() => onPay(session.id, m)}
              >
                {paying ? t("session.paying") : `${t("session.pay")} — ${PAY_LABEL[m]}`}
              </Btn>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "gold" | "live";
}) {
  return (
    <div className="rounded-md border border-border bg-panel-raised px-2 py-2 text-center">
      <Channel>{label}</Channel>
      <div className="mt-0.5">
        <Metric value={value} unit={unit} size="sm" tone={tone ?? "default"} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History & wallet                                                    */
/* ------------------------------------------------------------------ */

function HistoryView({ sessions }: { sessions: LiveSession[] }) {
  const { t } = useI18n();
  const done = sessions.filter((s) => !["preparing", "charging", "finishing"].includes(s.status));
  if (done.length === 0)
    return (
      <Panel className="p-4">
        <EmptyState>{t("history.empty")}</EmptyState>
      </Panel>
    );
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-semibold tracking-tight">{t("history.title")}</h1>
      {done.map((s) => (
        <Panel key={s.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {s.connectors?.chargers?.stations?.name ?? "—"}
              </p>
              <Channel>
                {new Date(s.started_at).toLocaleString("en-GB", { timeZone: "Africa/Kigali" })}
              </Channel>
            </div>
            <Metric value={RWF(s.cost_rwf)} unit="RWF" size="sm" tone="gold" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Tile label={t("history.energy")} value={KWH(s.kwh)} unit="kWh" />
            <Tile label={t("history.duration")} value={elapsed(s.started_at, s.ended_at)} />
            <Tile label={t("session.soc")} value={`${Math.round(Number(s.soc_end ?? 0))}%`} />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function WalletView({
  balance,
  payments,
  busy,
  onTopUp,
  phone,
  onPhone,
  railsLive,
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
  busy: boolean;
  onTopUp: (amount: number, method: "momo" | "airtel") => void;
  phone: string;
  onPhone: (v: string) => void;
  railsLive: boolean;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState("5000");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{t("wallet.title")}</h1>
        <Link
          to="/money"
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 px-2.5 py-1 text-[11px] text-primary"
        >
          <PiggyBank className="size-3.5" /> {t("money.title")}
        </Link>
      </div>
      <Panel className="p-4">
        <Channel>{t("wallet.balance")}</Channel>
        <div className="mt-1">
          <Metric value={RWF(balance)} unit="RWF" size="xl" tone="gold" />
        </div>
        <p className="channel mt-2">{railsLive ? t("wallet.confirmedOnly") : t("pay.railsPending")}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Field label={t("pay.phone")}>
            <input
              className={inputClass}
              inputMode="tel"
              placeholder="+250788123456"
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
            />
          </Field>
          <Field label={t("wallet.amount")}>
            <input
              className={inputClass}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {(["momo", "airtel"] as const).map((m) => (
              <Btn
                key={m}
                variant="gold"
                size="lg"
                disabled={busy || Number(amount) < 500 || phone.trim().length < 9}
                onClick={() => onTopUp(Number(amount), m)}
              >
                {PAY_LABEL[m]}
              </Btn>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="p-3">
        <Channel>{t("wallet.payments")}</Channel>
        {payments.length === 0 ? (
          <EmptyState>{t("wallet.paymentsEmpty")}</EmptyState>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="metric truncate text-xs">{PAY_LABEL[p.method] ?? p.method}</p>
                  <Channel>
                    {new Date(p.created_at).toLocaleString("en-GB", { timeZone: "Africa/Kigali" })}
                    {p.provider_ref ? ` · ${p.provider_ref}` : ""}
                  </Channel>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Metric value={RWF(p.amount_rwf)} unit="RWF" size="sm" />
                  <span
                    className={`metric rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                      p.status === "settled"
                        ? "border-live/40 bg-live/10 text-live"
                        : p.status === "failed"
                          ? "border-fault/40 bg-fault/10 text-fault"
                          : "border-warn/40 bg-warn/10 text-warn"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
