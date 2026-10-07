/**
 * Guards for the v2.1 configuration registry (master build prompt §19.5,
 * `docs/13-configuration.md`).
 *
 * §19.5 says "`POLICY_KEY_MIGRATION` maps every v1.1 key; referencing an
 * unknown key fails CI". These tests are what makes that true.
 */

import { describe, expect, it } from "vitest";

import {
  CONFIG,
  POLICY_KEY_MIGRATION,
  UnknownConfigKeyError,
  assertMigrationMapComplete,
  findProductionBlockers,
  assertUsableInProduction,
  getConfig,
  resolvePolicyKey,
  type ConfigKey,
} from "./policy";
import { LEGACY_POLICY_REGISTRY } from "./policy.legacy";

const keys = Object.keys(CONFIG) as ConfigKey[];

describe("registry integrity", () => {
  it("gives every definition a key field matching its registry name", () => {
    for (const key of keys) {
      expect(CONFIG[key].key).toBe(key);
    }
  });

  it("names every money key *_AMOUNT and gives it a currency", () => {
    for (const key of keys) {
      const def = CONFIG[key];
      if (/_AMOUNT(_PER_[A-Z]+)?$/.test(key)) {
        expect(def.currency, `${key} is a money key so it needs a currency`).not.toBeNull();
      }
      if (def.currency !== null) {
        expect(key, "a key with a currency must be named *_AMOUNT").toMatch(
          /_AMOUNT(_PER_[A-Z]+)?$/,
        );
      }
    }
  });

  it("backs every VERIFIED_EXTERNAL value with a source document", () => {
    for (const key of keys) {
      const def = CONFIG[key];
      if (def.status === "VERIFIED_EXTERNAL") {
        expect(def.source, `${key} claims external verification`).toBeTruthy();
        expect(def.decision, `${key} needs a reviewer`).toBeTruthy();
      }
    }
  });

  it("never gives a PENDING_VERIFICATION key a value (it must not drive behaviour)", () => {
    for (const key of keys) {
      const def = CONFIG[key];
      if (def.status === "PENDING_VERIFICATION") {
        expect(def.value, `${key} is pending verification`).toBeNull();
      }
    }
  });

  it("keeps numeric values inside their own declared override range", () => {
    for (const key of keys) {
      const def = CONFIG[key];
      if (def.overrideRange && typeof def.value === "number") {
        const [min, max] = def.overrideRange;
        expect(def.value, `${key} default sits outside its override range`).toBeGreaterThanOrEqual(
          min,
        );
        expect(def.value).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe("v1.1 -> v2.1 key migration", () => {
  it("maps every key from the legacy registry", () => {
    const legacyKeys = LEGACY_POLICY_REGISTRY.map((entry) => entry.key);
    expect(assertMigrationMapComplete(legacyKeys)).toEqual([]);
  });

  it("resolves a v1.1 key to a live v2.1 key", () => {
    expect(resolvePolicyKey("BOOKING.graceAfterMinutes")).toBe("BOOKING_WINDOW_AFTER_MINUTES");
    expect(resolvePolicyKey("UPTIME_TARGETS.minObservationHours")).toBe(
      "UPTIME_MIN_OBSERVATION_HOURS",
    );
  });

  it("resolves a v2.1 key to itself", () => {
    expect(resolvePolicyKey("RURA_MIN_UPTIME_PCT")).toBe("RURA_MIN_UPTIME_PCT");
  });

  it("throws on an unknown key rather than resolving to undefined", () => {
    expect(() => resolvePolicyKey("NOT_A_REAL_KEY")).toThrow(UnknownConfigKeyError);
    expect(() => getConfig("TARIFF_DEFAULTS.whatever")).toThrow(UnknownConfigKeyError);
  });

  it("throws with the reason when a key was deliberately removed", () => {
    expect(() => resolvePolicyKey("PREAUTH_AMOUNT_MINOR")).toThrow(/dynamic stopping reserve/);
    expect(() => resolvePolicyKey("OCPP.houseStandardKw")).toThrow(/compatibility directory/);
  });
});

describe("production guards", () => {
  it("passes a VERIFIED_EXTERNAL RURA key with its source", () => {
    expect(findProductionBlockers(["RURA_MIN_UPTIME_PCT"])).toEqual([]);
    expect(() => assertUsableInProduction(["RURA_REPAIR_TARGET_HOURS"])).not.toThrow();
  });

  it("blocks a PENDING_VERIFICATION key", () => {
    const [problem] = findProductionBlockers(["RURA_TURNOVER_LEVY_BPS"]);
    expect(problem?.problem).toMatch(/PENDING_VERIFICATION/);
    expect(() => assertUsableInProduction(["FUND_HOLDER"])).toThrow(/not usable in production/);
  });

  it("blocks a PROPOSED key until an approved record exists", () => {
    const [problem] = findProductionBlockers(["BOOKING_SLOT"]);
    expect(problem?.problem).toMatch(/PROPOSED/);
  });

  it("blocks a null value as unknown, never treating it as zero", () => {
    const [problem] = findProductionBlockers(["SITE_ENERGY_COST_AMOUNT_PER_KWH"]);
    expect(problem?.problem).toMatch(/null \(unknown\)/);
  });

  it("reports the known blockers across the whole registry without throwing", () => {
    const problems = findProductionBlockers();
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.problem.length > 0)).toBe(true);
  });
});

describe("values the specification fixes explicitly", () => {
  it("keeps the RURA uptime minimum at the verified 97%", () => {
    expect(CONFIG.RURA_MIN_UPTIME_PCT.value).toBe(97);
    expect(CONFIG.RURA_MIN_UPTIME_PCT.status).toBe("VERIFIED_EXTERNAL");
  });

  it("keeps UZA's internal uptime threshold separate from and above the rule", () => {
    expect(CONFIG.UPTIME_GREEN_PCT.status).toBe("FOUNDER_DECIDED");
    expect(CONFIG.UPTIME_GREEN_PCT.value).toBeGreaterThan(CONFIG.RURA_MIN_UPTIME_PCT.value ?? 0);
  });

  it("uses the founder-decided 4-minute booking arrival window", () => {
    expect(CONFIG.BOOKING_WINDOW_BEFORE_MINUTES.value).toBe(2);
    expect(CONFIG.BOOKING_WINDOW_AFTER_MINUTES.value).toBe(2);
    expect(CONFIG.BOOKING_WINDOW_BEFORE_MINUTES.status).toBe("FOUNDER_DECIDED");
  });

  it("leaves offline charging disabled by default", () => {
    expect(CONFIG.OFFLINE_CHARGING_ENABLED.value).toBe(false);
    expect(CONFIG.OFFLINE_CHARGING_ENABLED.mandatory).toBe(true);
  });

  it("leaves the RURA turnover levy unaccrued until the rate is obtained", () => {
    expect(CONFIG.RURA_TURNOVER_LEVY_BPS.value).toBeNull();
  });
});
