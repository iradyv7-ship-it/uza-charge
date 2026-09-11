/**
 * Booking maths for charging piles. Pure and unit-tested: no database, no
 * clock of its own — every function takes the instant it should reason about,
 * so the same rules run on the driver's phone and on the server.
 *
 * A booking holds a pile for [starts_at, ends_at] plus a tolerance window
 * before and after. The hold window is what blocks other drivers; the
 * tolerance is what lets a real taxi driver arrive a few minutes early or
 * late without losing the pile.
 */

import { BOOKING } from "@/config/policy";

export type BookingStatus = "booked" | "active" | "honoured" | "expired" | "cancelled" | "no_show";

export type Booking = {
  id: string;
  connectorId: string;
  startsAt: number;
  endsAt: number;
  graceBeforeMinutes: number;
  graceAfterMinutes: number;
  status: BookingStatus;
};

export const MINUTE_MS = 60_000;

/** The window during which the pile is held for this booking only. */
export function holdWindow(b: Pick<Booking, "startsAt" | "endsAt" | "graceBeforeMinutes" | "graceAfterMinutes">) {
  return {
    from: b.startsAt - b.graceBeforeMinutes * MINUTE_MS,
    to: b.endsAt + b.graceAfterMinutes * MINUTE_MS,
  };
}

/** Only a live hold blocks the pile; cancelled and finished bookings do not. */
export function blocksPile(status: BookingStatus): boolean {
  return status === "booked" || status === "active";
}

export function overlaps(a: Booking, b: Booking): boolean {
  if (a.connectorId !== b.connectorId) return false;
  if (!blocksPile(a.status) || !blocksPile(b.status)) return false;
  const w1 = holdWindow(a);
  const w2 = holdWindow(b);
  return w1.from < w2.to && w2.from < w1.to;
}

export type BookingRequest = {
  connectorId: string;
  startsAt: number;
  minutes: number;
  graceBeforeMinutes?: number;
  graceAfterMinutes?: number;
};

export type Validation = { ok: true; booking: Omit<Booking, "id" | "status"> } | { ok: false; reason: string };

/**
 * Check a requested booking against the rules and the piles already held.
 * Returns a reason instead of throwing so the UI can show it verbatim.
 */
export function validateRequest(req: BookingRequest, existing: Booking[], now: number): Validation {
  const graceBefore = req.graceBeforeMinutes ?? BOOKING.graceBeforeMinutes.value;
  const graceAfter = req.graceAfterMinutes ?? BOOKING.graceAfterMinutes.value;

  if (!Number.isFinite(req.startsAt)) return { ok: false, reason: "invalid_start" };
  if (req.minutes < BOOKING.minMinutes.value) return { ok: false, reason: "too_short" };
  if (req.minutes > BOOKING.maxMinutes.value) return { ok: false, reason: "too_long" };
  if (req.startsAt < now - graceBefore * MINUTE_MS) return { ok: false, reason: "in_the_past" };
  if (req.startsAt - now > BOOKING.maxAheadHours.value * 3600_000) return { ok: false, reason: "too_far_ahead" };

  const candidate = {
    connectorId: req.connectorId,
    startsAt: req.startsAt,
    endsAt: req.startsAt + req.minutes * MINUTE_MS,
    graceBeforeMinutes: graceBefore,
    graceAfterMinutes: graceAfter,
  };

  const clash = existing.find((b) =>
    overlaps({ ...candidate, id: "candidate", status: "booked" }, b),
  );
  if (clash) return { ok: false, reason: "pile_already_booked" };

  return { ok: true, booking: candidate };
}

/** How many of a driver's bookings are still live — used to cap hoarding. */
export function liveCount(bookings: Booking[]): number {
  return bookings.filter((b) => blocksPile(b.status)).length;
}

export type Phase = "upcoming" | "arrive_now" | "in_window" | "running_late" | "missed" | "closed";

/** Where a booking sits relative to the clock, for honest driver copy. */
export function phase(b: Booking, now: number): Phase {
  if (b.status === "cancelled" || b.status === "expired" || b.status === "honoured") return "closed";
  if (b.status === "no_show") return "missed";
  const hold = holdWindow(b);
  if (now < hold.from) return "upcoming";
  if (now < b.startsAt) return "arrive_now";
  if (now <= b.endsAt) return "in_window";
  if (now <= hold.to) return "running_late";
  return "missed";
}

/** A booked pile nobody plugged into before the tolerance ran out. */
export function isNoShow(b: Booking, now: number): boolean {
  return b.status === "booked" && now > b.startsAt + b.graceAfterMinutes * MINUTE_MS;
}

/** Free half-hour slots on one pile for a local day, given the held windows. */
export function freeSlots(
  dayStart: number,
  dayEnd: number,
  held: Booking[],
  now: number,
  slotMinutes = BOOKING.slotMinutes.value,
): number[] {
  const step = slotMinutes * MINUTE_MS;
  const slots: number[] = [];
  const windows = held.filter((b) => blocksPile(b.status)).map(holdWindow);
  for (let t = dayStart; t + step <= dayEnd; t += step) {
    if (t < now) continue;
    const end = t + step;
    const clash = windows.some((w) => w.from < end && t < w.to);
    if (!clash) slots.push(t);
  }
  return slots;
}
