import { describe, expect, it } from "vitest";
import {
  MINUTE_MS,
  blocksPile,
  freeSlots,
  holdWindow,
  isNoShow,
  liveCount,
  overlaps,
  phase,
  validateRequest,
  type Booking,
} from "./reservations";

const NOW = Date.parse("2026-09-08T09:00:00+02:00");

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: "b1",
    connectorId: "c1",
    startsAt: NOW + 60 * MINUTE_MS,
    endsAt: NOW + 90 * MINUTE_MS,
    graceBeforeMinutes: 10,
    graceAfterMinutes: 10,
    status: "booked",
    ...over,
  };
}

describe("hold window", () => {
  it("extends the booking by the tolerance on both sides", () => {
    const w = holdWindow(booking());
    expect(w.from).toBe(NOW + 50 * MINUTE_MS);
    expect(w.to).toBe(NOW + 100 * MINUTE_MS);
  });

  it("only live holds block a pile", () => {
    expect(blocksPile("booked")).toBe(true);
    expect(blocksPile("active")).toBe(true);
    expect(blocksPile("cancelled")).toBe(false);
    expect(blocksPile("no_show")).toBe(false);
    expect(blocksPile("honoured")).toBe(false);
  });
});

describe("collisions", () => {
  it("catches an overlap that only touches inside the tolerance", () => {
    const a = booking();
    const b = booking({ id: "b2", startsAt: NOW + 95 * MINUTE_MS, endsAt: NOW + 125 * MINUTE_MS });
    expect(overlaps(a, b)).toBe(true);
  });

  it("allows back-to-back bookings once both tolerances clear", () => {
    const a = booking();
    const b = booking({ id: "b2", startsAt: NOW + 110 * MINUTE_MS, endsAt: NOW + 140 * MINUTE_MS });
    expect(overlaps(a, b)).toBe(false);
  });

  it("never blocks a different pile", () => {
    expect(overlaps(booking(), booking({ id: "b2", connectorId: "c2" }))).toBe(false);
  });

  it("ignores a cancelled booking", () => {
    const a = booking();
    const b = booking({ id: "b2", status: "cancelled" });
    expect(overlaps(a, b)).toBe(false);
  });
});

describe("validateRequest", () => {
  it("accepts a normal 30 minute booking an hour out", () => {
    const res = validateRequest(
      { connectorId: "c1", startsAt: NOW + 60 * MINUTE_MS, minutes: 30 },
      [],
      NOW,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.booking.endsAt - res.booking.startsAt).toBe(30 * MINUTE_MS);
  });

  it("refuses a booking in the past beyond the early tolerance", () => {
    const res = validateRequest(
      { connectorId: "c1", startsAt: NOW - 60 * MINUTE_MS, minutes: 30 },
      [],
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "in_the_past" });
  });

  it("refuses a slot that is too short or too long", () => {
    expect(
      validateRequest({ connectorId: "c1", startsAt: NOW + 60 * MINUTE_MS, minutes: 5 }, [], NOW),
    ).toEqual({ ok: false, reason: "too_short" });
    expect(
      validateRequest({ connectorId: "c1", startsAt: NOW + 60 * MINUTE_MS, minutes: 600 }, [], NOW),
    ).toEqual({ ok: false, reason: "too_long" });
  });

  it("refuses a booking further ahead than the policy allows", () => {
    const res = validateRequest(
      { connectorId: "c1", startsAt: NOW + 40 * 3600_000, minutes: 30 },
      [],
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "too_far_ahead" });
  });

  it("refuses a pile that is already held for that window", () => {
    const res = validateRequest(
      { connectorId: "c1", startsAt: NOW + 70 * MINUTE_MS, minutes: 30 },
      [booking()],
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "pile_already_booked" });
  });

  it("counts only live holds against a driver", () => {
    expect(liveCount([booking(), booking({ id: "b2", status: "cancelled" })])).toBe(1);
  });
});

describe("phase and no-show", () => {
  it("walks a booking through its phases", () => {
    const b = booking();
    expect(phase(b, NOW)).toBe("upcoming");
    expect(phase(b, NOW + 55 * MINUTE_MS)).toBe("arrive_now");
    expect(phase(b, NOW + 70 * MINUTE_MS)).toBe("in_window");
    expect(phase(b, NOW + 95 * MINUTE_MS)).toBe("running_late");
    expect(phase(b, NOW + 120 * MINUTE_MS)).toBe("missed");
  });

  it("marks a no-show only after the late tolerance passes", () => {
    const b = booking();
    expect(isNoShow(b, NOW + 65 * MINUTE_MS)).toBe(false);
    expect(isNoShow(b, NOW + 75 * MINUTE_MS)).toBe(true);
    expect(isNoShow({ ...b, status: "active" }, NOW + 75 * MINUTE_MS)).toBe(false);
  });
});

describe("freeSlots", () => {
  const dayStart = Date.parse("2026-09-08T00:00:00+02:00");
  const dayEnd = Date.parse("2026-09-09T00:00:00+02:00");

  it("never offers a slot in the past", () => {
    const slots = freeSlots(dayStart, dayEnd, [], NOW);
    expect(slots.every((s) => s >= NOW)).toBe(true);
    expect(slots[0]).toBe(NOW);
  });

  it("drops slots that clash with a held window", () => {
    const held = booking({ startsAt: NOW + 60 * MINUTE_MS, endsAt: NOW + 90 * MINUTE_MS });
    const slots = freeSlots(dayStart, dayEnd, [held], NOW);
    const w = holdWindow(held);
    expect(slots.some((s) => s < w.to && s + 30 * MINUTE_MS > w.from)).toBe(false);
  });

  it("offers the whole rest of the day when nothing is held", () => {
    const slots = freeSlots(dayStart, dayEnd, [], NOW);
    expect(slots.length).toBe(30); // 09:00 to 24:00 in half hours
  });
});
