/**
 * Booking a specific charging pile ahead of arrival.
 *
 * Everything shown here is measured, not assumed: the free slots come from the
 * holds actually recorded against that pile, and a booking nobody honoured is
 * shown as missed rather than left looking live.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelBooking,
  createBooking,
  fetchConnectorSlots,
  fetchMyBookings,
  type BookingRow,
} from "@/lib/reservations.functions";
import { phase, type Booking } from "@/lib/reservations";
import { BOOKING } from "@/config/policy";
import { useI18n, type MessageKey } from "@/i18n";
import { useNow } from "@/hooks/useUza";
import type { StationRow } from "@/lib/queries";
import {
  Btn,
  Channel,
  EmptyState,
  Field,
  Panel,
  PanelHeader,
  StatusPill,
  inputClass,
} from "@/components/uza/ui";
import { KW } from "@/lib/uza";

const PHASE_KEY: Record<ReturnType<typeof phase>, MessageKey> = {
  upcoming: "book.phase.upcoming",
  arrive_now: "book.phase.arrive_now",
  in_window: "book.phase.in_window",
  running_late: "book.phase.running_late",
  missed: "book.phase.missed",
  closed: "book.phase.closed",
};

/** Status colour never carries meaning alone — every pill also shows its label. */
const PHASE_TONE: Record<string, string> = {
  upcoming: "border-border bg-muted/40 text-muted-foreground",
  arrive_now: "border-gold/40 bg-gold/10 text-gold",
  in_window: "border-live/40 bg-live/10 text-live",
  running_late: "border-gold/40 bg-gold/10 text-gold",
  missed: "border-fault/40 bg-fault/10 text-fault",
  closed: "border-border bg-muted/40 text-muted-foreground",
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
}

function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    connectorId: r.connectorId,
    startsAt: Date.parse(r.startsAt),
    endsAt: Date.parse(r.endsAt),
    graceBeforeMinutes: r.graceBeforeMinutes,
    graceAfterMinutes: r.graceAfterMinutes,
    status: r.status,
  };
}

export function BookingPanel({
  stations,
  onStart,
  startBusy,
  canStart,
}: {
  stations: StationRow[];
  onStart: (connectorId: string) => void;
  startBusy: boolean;
  canStart: boolean;
}) {
  const { t } = useI18n();
  const now = useNow(30_000);
  const queryClient = useQueryClient();

  const listBookings = useServerFn(fetchMyBookings);
  const listSlots = useServerFn(fetchConnectorSlots);

  const mine = useQuery({ queryKey: ["my-bookings"], queryFn: () => listBookings(), retry: false });

  const [stationId, setStationId] = useState<string>("");
  const [connectorId, setConnectorId] = useState<string>("");
  const [slotIso, setSlotIso] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(BOOKING.slotMinutes.value);

  const station = useMemo(
    () => stations.find((s) => s.id === (stationId || stations[0]?.id)) ?? null,
    [stations, stationId],
  );

  const piles = useMemo(
    () =>
      (station?.chargers ?? []).flatMap((charger) =>
        charger.connectors.map((c) => ({ ...c, chargerStatus: charger.status })),
      ),
    [station],
  );

  const activePileId = connectorId || piles[0]?.id || "";

  const slots = useQuery({
    queryKey: ["booking-slots", activePileId],
    queryFn: () =>
      listSlots({
        data: { connectorId: activePileId, fromIso: new Date().toISOString(), hours: 12 },
      }),
    enabled: !!activePileId,
    staleTime: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["booking-slots"] });
  };

  const book = useMutation({
    mutationFn: useServerFn(createBooking),
    onSuccess: () => {
      setSlotIso("");
      refresh();
    },
  });
  const drop = useMutation({ mutationFn: useServerFn(cancelBooking), onSuccess: refresh });

  const failure = book.error ?? drop.error;
  const bookings = mine.data?.bookings ?? [];
  const live = bookings.filter((b) => b.status === "booked" || b.status === "active");
  const past = bookings.filter((b) => !(b.status === "booked" || b.status === "active"));
  const atLimit = live.length >= (mine.data?.maxLive ?? BOOKING.maxLiveBookingsPerDriver.value);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("book.title")}</h1>
        <Channel>{t("book.subtitle")}</Channel>
      </div>

      {failure ? (
        <p className="rounded-md border border-fault/40 bg-fault/10 px-3 py-2 text-sm text-fault">
          {failure instanceof Error ? failure.message : t("common.error")}
        </p>
      ) : null}

      <Panel className="p-0">
        <PanelHeader title={t("book.mine")} />
        <div className="flex flex-col gap-3 p-4">
        {mine.isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted/40" />
        ) : live.length === 0 && past.length === 0 ? (
          <EmptyState>{t("book.none")}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...live, ...past].map((b) => {
              const p = phase(toBooking(b), now);
              const inWindow = p === "in_window" || p === "arrive_now" || p === "running_late";
              return (
                <li key={b.id} className="rounded-md border border-border bg-card/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.stationName}</p>
                      <Channel>
                        {b.area ? `${b.area} · ` : ""}
                        {b.connectorLabel} · {b.connectorType} · {KW(b.powerKw)}
                      </Channel>
                    </div>
                    <StatusPill status={p} toneMap={PHASE_TONE} label={t(PHASE_KEY[p])} />
                  </div>
                  <p className="metric mt-2 text-sm">
                    {dayLabel(b.startsAt)} {clock(b.startsAt)}–{clock(b.endsAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inWindow && canStart ? (
                      <Btn
                        onClick={() => onStart(b.connectorId)}
                        disabled={startBusy}
                      >
                        {t("book.startHere")}
                      </Btn>
                    ) : null}
                    {b.status === "booked" || b.status === "active" ? (
                      <Btn
                        variant="ghost"
                        onClick={() => drop.mutate({ data: { id: b.id } })}
                        disabled={drop.isPending}
                      >
                        {t("book.cancel")}
                      </Btn>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Channel>
          {t("book.grace", {
            before: mine.data?.graceBeforeMinutes ?? BOOKING.graceBeforeMinutes.value,
            after: mine.data?.graceAfterMinutes ?? BOOKING.graceAfterMinutes.value,
          })}
        </Channel>
        </div>
      </Panel>

      <Panel className="p-0">
        <PanelHeader title={t("book.confirm")} />
        <div className="flex flex-col gap-3 p-4">
        {stations.length === 0 ? (
          <EmptyState>{t("find.empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={t("book.pickStation")}>
              <select
                className={inputClass}
                value={station?.id ?? ""}
                onChange={(e) => {
                  setStationId(e.target.value);
                  setConnectorId("");
                  setSlotIso("");
                }}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.area ? ` — ${s.area}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("book.pickPile")}>
              <select
                className={inputClass}
                value={activePileId}
                onChange={(e) => {
                  setConnectorId(e.target.value);
                  setSlotIso("");
                }}
              >
                {piles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.type} · {KW(Number(p.power_kw))}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("book.pickSlot")}>
              {slots.isLoading ? (
                <div className="h-9 animate-pulse rounded-md bg-muted/40" />
              ) : (slots.data?.slots ?? []).length === 0 ? (
                <Channel>{t("book.noSlots")}</Channel>
              ) : (
                <select
                  className={inputClass}
                  value={slotIso || (slots.data?.slots[0] ?? "")}
                  onChange={(e) => setSlotIso(e.target.value)}
                >
                  {(slots.data?.slots ?? []).map((iso) => (
                    <option key={iso} value={iso}>
                      {dayLabel(iso)} {clock(iso)}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label={t("book.duration")}>
              <select
                className={inputClass}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                {[30, 60, 90, 120, 180]
                  .filter((m) => m >= BOOKING.minMinutes.value && m <= BOOKING.maxMinutes.value)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </select>
            </Field>

            <Btn
              onClick={() => {
                const start = slotIso || slots.data?.slots[0];
                if (!start || !activePileId) return;
                book.mutate({ data: { connectorId: activePileId, startsAtIso: start, minutes } });
              }}
              disabled={book.isPending || atLimit || (slots.data?.slots ?? []).length === 0}
            >
              {book.isPending ? t("book.holding") : t("book.confirm")}
            </Btn>

            {atLimit ? (
              <Channel>
                {t("book.limit", { n: mine.data?.maxLive ?? BOOKING.maxLiveBookingsPerDriver.value })}
              </Channel>
            ) : null}
          </div>
        )}
        </div>
      </Panel>
    </div>
  );
}

export default BookingPanel;
