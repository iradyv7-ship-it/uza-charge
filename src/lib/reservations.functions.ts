import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BOOKING, PREAUTH_AMOUNT_MINOR } from "@/config/policy";
import {
  MINUTE_MS,
  blocksPile,
  freeSlots,
  isNoShow,
  liveCount,
  validateRequest,
  type Booking,
  type BookingStatus,
} from "./reservations";

/** A booking as the driver app shows it: pile, place, window, tolerance. */
export type BookingRow = {
  id: string;
  connectorId: string;
  connectorLabel: string;
  connectorType: string;
  powerKw: number;
  stationId: string;
  stationName: string;
  area: string | null;
  startsAt: string;
  endsAt: string;
  graceBeforeMinutes: number;
  graceAfterMinutes: number;
  status: BookingStatus;
  sessionId: string | null;
};

const SELECT = `
  id, connector_id, starts_at, ends_at, grace_before_minutes, grace_after_minutes,
  status, session_id,
  connectors!inner (
    id, label, type, power_kw,
    chargers!inner ( id, stations!inner ( id, name, area ) )
  )
`;

type Raw = {
  id: string;
  connector_id: string;
  starts_at: string;
  ends_at: string;
  grace_before_minutes: number;
  grace_after_minutes: number;
  status: string;
  session_id: string | null;
  connectors: {
    id: string;
    label: string;
    type: string;
    power_kw: number;
    chargers: { id: string; stations: { id: string; name: string; area: string | null } };
  };
};

function toRow(r: Raw): BookingRow {
  const station = r.connectors.chargers.stations;
  return {
    id: r.id,
    connectorId: r.connector_id,
    connectorLabel: r.connectors.label,
    connectorType: r.connectors.type,
    powerKw: Number(r.connectors.power_kw),
    stationId: station.id,
    stationName: station.name,
    area: station.area,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    graceBeforeMinutes: r.grace_before_minutes,
    graceAfterMinutes: r.grace_after_minutes,
    status: r.status as BookingStatus,
    sessionId: r.session_id,
  };
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

async function driverIdFor(supabase: SupabaseLike, userId: string): Promise<string> {
  const { data } = await supabase.from("drivers").select("id").eq("user_id", userId).maybeSingle();
  const driver = data as { id: string } | null;
  if (!driver) throw new Error("No driver profile on this account yet");
  return driver.id;
}

// Minimal structural type: the authenticated client injected by the middleware.
type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * The driver's own bookings, newest window first, with stale holds settled:
 * a booking nobody plugged into before the late tolerance ran out is recorded
 * as a no-show rather than left looking live.
 */
export const fetchMyBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    const driverId = await driverIdFor(supabase, context.userId);
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    const { data, error } = await supabase
      .from("reservations")
      .select(SELECT)
      .eq("driver_id", driverId)
      .gte("starts_at", since)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = ((data ?? []) as Raw[]).map(toRow);
    const now = Date.now();

    const missed = rows.filter((r) => isNoShow(toBooking(r), now));
    for (const row of missed) {
      await supabase.from("reservations").update({ status: "no_show" }).eq("id", row.id);
      row.status = "no_show";
    }

    return {
      driverId,
      bookings: rows,
      liveCount: liveCount(rows.map(toBooking)),
      maxLive: BOOKING.maxLiveBookingsPerDriver.value,
      graceBeforeMinutes: BOOKING.graceBeforeMinutes.value,
      graceAfterMinutes: BOOKING.graceAfterMinutes.value,
      slotMinutes: BOOKING.slotMinutes.value,
    };
  });

/**
 * Free half-hour slots on one pile between two instants, computed from the
 * holds actually recorded — never a guess.
 */
export const fetchConnectorSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        connectorId: z.string().uuid(),
        fromIso: z.string().datetime(),
        hours: z.number().int().min(1).max(48).default(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = Date.parse(data.fromIso);
    const to = from + data.hours * 3600_000;

    // Holds on a public pile are not the caller's rows, so this read is
    // deliberately service-side and returns windows only — no driver identity.
    const { data: held, error } = await supabaseAdmin
      .from("reservations")
      .select("id, connector_id, starts_at, ends_at, grace_before_minutes, grace_after_minutes, status")
      .eq("connector_id", data.connectorId)
      .in("status", ["booked", "active"])
      .lt("starts_at", new Date(to + 3600_000).toISOString())
      .gt("ends_at", new Date(from - 3600_000).toISOString());
    if (error) throw new Error(error.message);

    const bookings: Booking[] = (held ?? []).map((h) => ({
      id: h.id,
      connectorId: h.connector_id,
      startsAt: Date.parse(h.starts_at),
      endsAt: Date.parse(h.ends_at),
      graceBeforeMinutes: h.grace_before_minutes,
      graceAfterMinutes: h.grace_after_minutes,
      status: h.status as BookingStatus,
    }));

    const now = Date.now();
    return {
      slots: freeSlots(from, to, bookings, now).map((ms) => new Date(ms).toISOString()),
      heldWindows: bookings
        .filter((b) => blocksPile(b.status))
        .map((b) => ({ from: new Date(b.startsAt).toISOString(), to: new Date(b.endsAt).toISOString() })),
      slotMinutes: BOOKING.slotMinutes.value,
    };
  });

const REASON_MESSAGE: Record<string, string> = {
  invalid_start: "That start time is not valid.",
  too_short: `A booking must be at least ${BOOKING.minMinutes.value} minutes.`,
  too_long: `A booking cannot be longer than ${BOOKING.maxMinutes.value} minutes.`,
  in_the_past: "That slot has already passed.",
  too_far_ahead: `You can book up to ${BOOKING.maxAheadHours.value} hours ahead.`,
  pile_already_booked: "Another driver already holds that pile for that window.",
};

/** Book a specific pile for a window. Rules are checked here, then by the database. */
export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        connectorId: z.string().uuid(),
        startsAtIso: z.string().datetime(),
        minutes: z.number().int().min(BOOKING.minMinutes.value).max(BOOKING.maxMinutes.value),
        note: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    const driverId = await driverIdFor(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: connector } = await supabaseAdmin
      .from("connectors")
      .select("id, chargers(id, status)")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (!connector) throw new Error("That pile is not registered");

    // No pile is held without a way to pay for it: either wallet money covering
    // the pre-authorisation, or a mobile-money number on file to pre-authorise
    // against. A fleet account on post-paid terms is exempt.
    const { data: payer } = await supabaseAdmin
      .from("drivers")
      .select("wallet_balance_rwf, default_pay_method, phone")
      .eq("id", driverId)
      .maybeSingle();
    const walletMinor = Math.round(Number(payer?.wallet_balance_rwf ?? 0) * 100);
    const hasPhone = (payer?.phone ?? "").replace(/\D/g, "").length >= 9;
    if (walletMinor < PREAUTH_AMOUNT_MINOR.value && !hasPhone) {
      throw new Error(
        "Add a MoMo or Airtel number, or top up your wallet, before holding a pile.",
      );
    }

    const startsAt = Date.parse(data.startsAtIso);
    const now = Date.now();

    const { data: mine } = await supabaseAdmin
      .from("reservations")
      .select("id, connector_id, starts_at, ends_at, grace_before_minutes, grace_after_minutes, status")
      .eq("driver_id", driverId)
      .in("status", ["booked", "active"]);
    if ((mine ?? []).length >= BOOKING.maxLiveBookingsPerDriver.value) {
      throw new Error(
        `You already hold ${BOOKING.maxLiveBookingsPerDriver.value} bookings. Cancel one first.`,
      );
    }

    const { data: held } = await supabaseAdmin
      .from("reservations")
      .select("id, connector_id, starts_at, ends_at, grace_before_minutes, grace_after_minutes, status")
      .eq("connector_id", data.connectorId)
      .in("status", ["booked", "active"]);

    const existing: Booking[] = (held ?? []).map((h) => ({
      id: h.id,
      connectorId: h.connector_id,
      startsAt: Date.parse(h.starts_at),
      endsAt: Date.parse(h.ends_at),
      graceBeforeMinutes: h.grace_before_minutes,
      graceAfterMinutes: h.grace_after_minutes,
      status: h.status as BookingStatus,
    }));

    const check = validateRequest(
      { connectorId: data.connectorId, startsAt, minutes: data.minutes },
      existing,
      now,
    );
    if (!check.ok) throw new Error(REASON_MESSAGE[check.reason] ?? check.reason);

    const { data: created, error } = await supabase
      .from("reservations")
      .insert({
        connector_id: data.connectorId,
        driver_id: driverId,
        starts_at: new Date(check.booking.startsAt).toISOString(),
        ends_at: new Date(check.booking.endsAt).toISOString(),
        grace_before_minutes: check.booking.graceBeforeMinutes,
        grace_after_minutes: check.booking.graceAfterMinutes,
        note: data.note ?? null,
      })
      .select("id, starts_at, ends_at")
      .single();
    if (error) {
      // The database overlap constraint is the final word on collisions.
      if (error.message.includes("reservations_no_overlap")) {
        throw new Error(REASON_MESSAGE["pile_already_booked"]);
      }
      throw new Error(error.message);
    }

    return {
      id: (created as { id: string }).id,
      startsAt: (created as { starts_at: string }).starts_at,
      endsAt: (created as { ends_at: string }).ends_at,
      holdFrom: new Date(check.booking.startsAt - check.booking.graceBeforeMinutes * MINUTE_MS).toISOString(),
      holdTo: new Date(check.booking.endsAt + check.booking.graceAfterMinutes * MINUTE_MS).toISOString(),
    };
  });

/** Release a booking early so the pile goes back to the network. */
export const cancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    const { error } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: context.userId,
      })
      .eq("id", data.id)
      .in("status", ["booked", "active"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
