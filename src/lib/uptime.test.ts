import { describe, expect, it } from "vitest";

import {
  accumulateAvailability,
  availabilityReport,
  silenceSeconds,
  sumAvailability,
} from "@/lib/uptime";

const HOUR = 3_600_000;
const start = Date.parse("2026-09-01T00:00:00Z");
const window = { fromMs: start, toMs: start + 48 * HOUR };

describe("accumulateAvailability", () => {
  it("reports never observed when there is no history at all", () => {
    const a = accumulateAvailability([], window);
    expect(a.neverObserved).toBe(true);
    expect(a.observedSeconds).toBe(0);
  });

  it("carries in the state the pile was already in", () => {
    const a = accumulateAvailability([], window, "online");
    expect(a.observedSeconds).toBe(48 * 3600);
    expect(a.availableSeconds).toBe(48 * 3600);
  });

  it("splits available, in-use and faulted time", () => {
    const a = accumulateAvailability(
      [
        { atMs: start, status: "online" },
        { atMs: start + 10 * HOUR, status: "charging" },
        { atMs: start + 12 * HOUR, status: "faulted" },
        { atMs: start + 24 * HOUR, status: "online" },
      ],
      window,
    );
    expect(a.observedSeconds).toBe(48 * 3600);
    expect(a.availableSeconds).toBe(36 * 3600);
    expect(a.inUseSeconds).toBe(2 * 3600);
  });

  it("ignores transitions after the window closes", () => {
    const a = accumulateAvailability(
      [
        { atMs: start, status: "online" },
        { atMs: window.toMs + HOUR, status: "faulted" },
      ],
      window,
    );
    expect(a.availableSeconds).toBe(48 * 3600);
  });
});

describe("availabilityReport", () => {
  it("refuses to state uptime for a pile that never reported", () => {
    expect(availabilityReport(accumulateAvailability([], window))).toEqual({
      kind: "never_connected",
    });
  });

  it("refuses to state uptime on too little observed history", () => {
    const short = { fromMs: start, toMs: start + 60_000 };
    const report = availabilityReport(accumulateAvailability([], short, "online"));
    expect(report.kind).toBe("measured");
    if (report.kind === "measured") {
      expect(report.verdict.status).toBe("insufficient_data");
      expect(report.utilisationPct).toBeNull();
    }
  });

  it("grades a healthy pile green and a faulted one red", () => {
    const green = availabilityReport(accumulateAvailability([], window, "online"));
    expect(green.kind === "measured" && green.verdict.status).toBe("green");

    const red = availabilityReport(
      accumulateAvailability(
        [
          { atMs: start, status: "online" },
          { atMs: start + 4 * HOUR, status: "faulted" },
        ],
        window,
      ),
    );
    expect(red.kind === "measured" && red.verdict.status).toBe("red");
  });
});

describe("sumAvailability", () => {
  it("skips piles with no history rather than counting them as downtime", () => {
    const summed = sumAvailability([
      accumulateAvailability([], window, "online"),
      accumulateAvailability([], window),
    ]);
    expect(summed.neverObserved).toBe(false);
    expect(summed.observedSeconds).toBe(48 * 3600);
  });

  it("is never observed when nothing was observed", () => {
    expect(sumAvailability([accumulateAvailability([], window)]).neverObserved).toBe(true);
  });
});

describe("silenceSeconds", () => {
  it("is null when a charge point has never been seen", () => {
    expect(silenceSeconds(null)).toBeNull();
  });

  it("measures how long a charge point has been silent", () => {
    expect(silenceSeconds("2026-09-01T00:00:00Z", start + 90_000)).toBe(90);
  });
});
