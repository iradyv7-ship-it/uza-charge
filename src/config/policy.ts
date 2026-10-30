/**
 * UZA CHARGE — versioned configuration seed (master build prompt v2.1, §19.5).
 *
 * See `docs/13-configuration.md` for the governing rules. In short:
 *
 *   - This file holds DEFAULTS, TYPES, STATUSES and VALIDATION. Production
 *     values live in approved, versioned configuration records; resolution
 *     order is platform safety -> country/regulatory pack -> network ->
 *     contract/owner -> permitted site override.
 *   - `null` means UNKNOWN, never zero. A feature whose key is null stays
 *     disabled and shows a setup task.
 *   - Money keys are currency-neutral `*_AMOUNT` with an explicit currency.
 *   - A value may be `VERIFIED_EXTERNAL` only if `source` names a document in
 *     `docs/evidence/`. A founder decision never verifies a regulation.
 *   - `PENDING_VERIFICATION` never drives production behaviour.
 *   - Overrides cannot weaken a value marked `mandatory`.
 *   - Sessions pin their resolved billing rules; superseded rules are kept and
 *     historical reporting is never altered retroactively.
 *
 * The v1.1 constants still used by the working prototype live in
 * `./policy.legacy.ts` and are re-exported at the bottom of this file so the
 * existing 21 importers keep working (core rule 6). Every v1.1 key is mapped
 * in `POLICY_KEY_MIGRATION`. New code must read `CONFIG`.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** §19.5 statuses. A founder decision is not an external verification. */
export type ConfigStatus =
  "FOUNDER_DECIDED" | "PROPOSED" | "VERIFIED_EXTERNAL" | "PENDING_VERIFICATION";

/** Where a value may be set. Resolution order is listed in §19.5. */
export type ConfigScope = "platform" | "country" | "network" | "owner" | "site";

export type ConfigType = "number" | "string" | "boolean" | "string[]" | "object";

export type ConfigDefinition<T> = {
  /** Registry key. Must equal the property name in `CONFIG`. */
  readonly key: string;
  /** `null` means unknown — the dependent feature stays disabled. */
  readonly value: T | null;
  readonly type: ConfigType;
  /** Unit of measure, e.g. "seconds", "minutes", "percent", "bps". */
  readonly unit: string | null;
  /** Set if and only if this is a `*_AMOUNT` money key. */
  readonly currency: string | null;
  readonly scope: ConfigScope;
  readonly status: ConfigStatus;
  /** Document reference. Required for `VERIFIED_EXTERNAL`. */
  readonly source: string | null;
  /** Who decided or reviewed this value. */
  readonly decision: string | null;
  readonly effectiveFrom: string | null;
  readonly version: number;
  /** A network/owner/site override may not weaken a mandatory value. */
  readonly mandatory: boolean;
  /** Permitted numeric override range, inclusive. */
  readonly overrideRange: readonly [number, number] | null;
  readonly note: string;
};

export type AnyConfigDefinition = ConfigDefinition<unknown>;

type Partially<T> = Partial<ConfigDefinition<T>>;

const define = <T>(
  key: string,
  status: ConfigStatus,
  value: T | null,
  type: ConfigType,
  rest: Partially<T>,
): ConfigDefinition<T> => ({
  key,
  value,
  type,
  unit: rest.unit ?? null,
  currency: rest.currency ?? null,
  scope: rest.scope ?? "network",
  status,
  source: rest.source ?? null,
  decision: rest.decision ?? null,
  effectiveFrom: rest.effectiveFrom ?? null,
  version: rest.version ?? 1,
  mandatory: rest.mandatory ?? false,
  overrideRange: rest.overrideRange ?? null,
  note: rest.note ?? "",
});

/** UZA product choice. Not an external verification (§19.5). */
const founderDecided = <T>(key: string, value: T | null, type: ConfigType, rest: Partially<T>) =>
  define(key, "FOUNDER_DECIDED", value, type, rest);

/** Engineering/commercial placeholder — test environments only. */
const proposed = <T>(key: string, value: T | null, type: ConfigType, rest: Partially<T>) =>
  define(key, "PROPOSED", value, type, rest);

/** Regulator/provider rule with the source document retained. */
const verifiedExternal = <T>(
  key: string,
  value: T | null,
  type: ConfigType,
  rest: Partially<T> & { source: string },
) => define(key, "VERIFIED_EXTERNAL", value, type, rest);

/** Outside claim awaiting authoritative evidence. Never drives production. */
const pendingVerification = <T>(key: string, type: ConfigType, rest: Partially<T>) =>
  define<T>(key, "PENDING_VERIFICATION", null, type, rest);

/* ------------------------------------------------------------------ */
/* Evidence sources                                                    */
/* ------------------------------------------------------------------ */

/**
 * Document references for `VERIFIED_EXTERNAL` values. The file must exist in
 * `docs/evidence/` before the value is relied on in production — see
 * `docs/evidence/README.md`.
 */
export const EVIDENCE = {
  RURA_011_2026:
    "docs/evidence/rura-011-2026.pdf — Regulations No 011/ENERGY/RURA/2026, Board approval 23/06/2026, signed 29/06/2026, in force on signature (Art. 39)",
} as const;

const RURA_REVIEWER = "Founder supplied the regulation text (v2.1, 7 Oct 2026)";

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */

export const CONFIG = {
  /* --- Network identity (rule 21: never UZA-specific in code) ------ */

  NETWORK_COUNTRY: founderDecided("NETWORK_COUNTRY", "RW", "string", {
    scope: "network",
    decision: "UCN is network #1; Rwanda is the validation market",
    note: "Country is network configuration. UCN's value is just the first configuration.",
  }),
  NETWORK_CURRENCY: founderDecided("NETWORK_CURRENCY", "RWF", "string", {
    scope: "network",
    note: "Every *_AMOUNT key is denominated in the network's currency.",
  }),
  NETWORK_TIMEZONE: founderDecided("NETWORK_TIMEZONE", "Africa/Kigali", "string", {
    scope: "network",
    note: "Store UTC, present in the network timezone, retain event timezone context (§19.3).",
  }),
  PLATFORM_SUPPORTED_COUNTRIES: proposed(
    "PLATFORM_SUPPORTED_COUNTRIES",
    ["RW", "UG", "KE", "TZ", "CD"] as readonly string[],
    "string[]",
    {
      scope: "platform",
      note: "Expansion order only. A country is ready when §17 country-pack readiness is evidenced (D-29).",
    },
  ),
  /**
   * CONFLICT WITH CORE RULE 8 — see OPEN_QUESTIONS.md Q-01.
   * Core rule 8 requires integer RWF (1 minor unit per unit). The working
   * prototype stores RWF x 100 throughout `src/lib/pricing.ts` and its tests.
   * Kept at 100 so existing money maths stays correct; migration is an open
   * decision, not a silent change.
   */
  MONEY_MINOR_UNITS_PER_UNIT: proposed("MONEY_MINOR_UNITS_PER_UNIT", 100, "number", {
    scope: "network",
    unit: "minor_units_per_unit",
    mandatory: true,
    note: "Conflicts with core rule 8 (integer RWF). Prototype uses 100. See OPEN_QUESTIONS.md Q-01.",
  }),

  /* --- Gateway and telemetry (§6) --------------------------------- */

  OCPP_PROTOCOL: founderDecided("OCPP_PROTOCOL", "ocpp1.6", "string", {
    scope: "platform",
    mandatory: true,
    note: "OCPP 1.6J over WSS. 2.0.1 is a separate implementation (§26.4).",
  }),
  HEARTBEAT_INTERVAL_SECONDS: founderDecided("HEARTBEAT_INTERVAL_SECONDS", 300, "number", {
    scope: "network",
    unit: "seconds",
    overrideRange: [60, 900],
    note: "Returned in BootNotification; tolerant of patchy mobile backhaul.",
  }),
  OFFLINE_AFTER: founderDecided("OFFLINE_AFTER", 600, "number", {
    scope: "network",
    unit: "seconds",
    overrideRange: [120, 3600],
    note: "No heartbeat or traffic for this long -> Offline, with last-seen time (§6.2, core rule 13). Replaces the v1.1 missed-heartbeat multiplier.",
  }),
  OFFLINE_ALERT_AFTER: proposed("OFFLINE_ALERT_AFTER", 900, "number", {
    scope: "network",
    unit: "seconds",
    note: "Alarm threshold for an offline charger (§14).",
  }),
  CLOCK_DRIFT_ALERT: proposed("CLOCK_DRIFT_ALERT", 60, "number", {
    scope: "platform",
    unit: "seconds",
    note: "Flag chargers drifting more than this (§6.3). Event time and receive time are both preserved.",
  }),
  MAX_EVENT_LAG: proposed("MAX_EVENT_LAG", 5, "number", {
    scope: "platform",
    unit: "seconds",
    note: "Charger message -> visible on dashboards (§19.1 target). Also the simulator load-test bound (§6.8); a simulator result is not a production SLA (§32.3).",
  }),
  METER_SAMPLE_INTERVAL_SECONDS: founderDecided("METER_SAMPLE_INTERVAL_SECONDS", 30, "number", {
    scope: "network",
    unit: "seconds",
    note: "MeterValueSampleInterval pushed at provisioning (§6.4).",
  }),
  CLOCK_ALIGNED_DATA_INTERVAL_SECONDS: founderDecided(
    "CLOCK_ALIGNED_DATA_INTERVAL_SECONDS",
    900,
    "number",
    { scope: "network", unit: "seconds", note: "ClockAlignedDataInterval, also when idle (§6.4)." },
  ),

  /* --- Session exposure control (§7.3) ---------------------------- */

  OFFLINE_CHARGING_ENABLED: founderDecided("OFFLINE_CHARGING_ENABLED", false, "boolean", {
    scope: "network",
    mandatory: true,
    note: "Disabled by default for monetary-limited consumer cards until the hardware and exposure gate passes (§8.4).",
  }),
  STOP_EXPOSURE_WINDOW_SECONDS: pendingVerification("STOP_EXPOSURE_WINDOW_SECONDS", "number", {
    scope: "platform",
    unit: "seconds",
    mandatory: true,
    note: "Per charger model: max sample age + processing/command latency + charger stopping latency. Must be measured per model before a monetary-limited session is allowed (§7.3.5, D-20).",
  }),
  STOP_UNCERTAINTY_BUFFER_AMOUNT: pendingVerification("STOP_UNCERTAINTY_BUFFER_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    mandatory: true,
    note: "Added to the dynamic stopping reserve (§7.3.5). The v1.1 fixed margin is REMOVED — a flat amount cannot cover 240 kW for the exposure window.",
  }),
  OVERSHOOT_LIABILITY: pendingVerification("OVERSHOOT_LIABILITY", "string", {
    scope: "network",
    mandatory: true,
    note: "Who bears stop overshoot: driver (disclosed consent) / owner / network. Unknown liability is a production blocker (§7.3.9, D-20).",
  }),
  OFFLINE_ALLOWANCE_AMOUNT: pendingVerification("OFFLINE_ALLOWANCE_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "Bounded offline allowance, only where the model demonstrably enforces a local limit (§8.4, D-21).",
  }),
  OFFLINE_ALLOWANCE_EXPIRY_SECONDS: pendingVerification(
    "OFFLINE_ALLOWANCE_EXPIRY_SECONDS",
    "number",
    {
      scope: "network",
      unit: "seconds",
      note: "Max offline age before credentials fail closed (§8.4, D-21).",
    },
  ),

  /* --- Tariffs, fees and promotions (§9) -------------------------- */

  TARIFF_DEFAULT_ENERGY_AMOUNT_PER_KWH: proposed(
    "TARIFF_DEFAULT_ENERGY_AMOUNT_PER_KWH",
    32_000,
    "number",
    {
      scope: "owner",
      currency: "RWF",
      note: "RWF 320/kWh in minor units. Indicative pending the REG purchase tariff. Owners set their own prices (§9).",
    },
  ),
  TARIFF_DEFAULT_SERVICE_AMOUNT_PER_KWH: proposed(
    "TARIFF_DEFAULT_SERVICE_AMOUNT_PER_KWH",
    0,
    "number",
    {
      scope: "owner",
      currency: "RWF",
      note: "§9 prices each tier as energy + service per kWh. Driver sees one clear total before starting.",
    },
  ),
  TARIFF_DEFAULT_START_FEE_AMOUNT: proposed("TARIFF_DEFAULT_START_FEE_AMOUNT", 0, "number", {
    scope: "owner",
    currency: "RWF",
    note: "No start fee by default.",
  }),
  TARIFF_DEFAULT_TIME_AMOUNT_PER_MINUTE: proposed(
    "TARIFF_DEFAULT_TIME_AMOUNT_PER_MINUTE",
    0,
    "number",
    { scope: "owner", currency: "RWF", note: "UZA prices energy, not time, by default." },
  ),
  TARIFF_SEGMENTS_PER_DAY: founderDecided("TARIFF_SEGMENTS_PER_DAY", 48, "number", {
    scope: "platform",
    unit: "segments",
    note: "48 half-hour segments, each mapped to sharp/peak/standard/valley (§9). Note §19.3: 48 labels are not a universal UTC-day model.",
  }),
  TARIFF_TIER_MULTIPLIER_VALLEY: proposed("TARIFF_TIER_MULTIPLIER_VALLEY", 0.75, "number", {
    scope: "owner",
    unit: "multiplier",
    note: "Carried from v1.1. §9 intends explicit per-tier energy+service prices; multipliers are the interim shape.",
  }),
  TARIFF_TIER_MULTIPLIER_STANDARD: proposed("TARIFF_TIER_MULTIPLIER_STANDARD", 1.0, "number", {
    scope: "owner",
    unit: "multiplier",
    note: "Reference rate.",
  }),
  TARIFF_TIER_MULTIPLIER_PEAK: proposed("TARIFF_TIER_MULTIPLIER_PEAK", 1.25, "number", {
    scope: "owner",
    unit: "multiplier",
    note: "Evening residential peak.",
  }),
  TARIFF_TIER_MULTIPLIER_SHARP: proposed("TARIFF_TIER_MULTIPLIER_SHARP", 1.5, "number", {
    scope: "owner",
    unit: "multiplier",
    note: "Grid-stress window.",
  }),
  IDLE_FEE_AMOUNT_PER_MINUTE: founderDecided("IDLE_FEE_AMOUNT_PER_MINUTE", 0, "number", {
    scope: "owner",
    currency: "RWF",
    decision: "D-08 placeholder 0",
    note: "Activation requires charger capability, validated completion evidence, notification, exemptions and dispute remedy (§9). The v1.1 100 RWF/min default is not active.",
  }),
  IDLE_FEE_GRACE_MINUTES: founderDecided("IDLE_FEE_GRACE_MINUTES", 10, "number", {
    scope: "owner",
    unit: "minutes",
    decision: "D-08 placeholder",
    note: "Grace after a VALIDATED charging-completion event. SuspendedEV alone is not completion (§9, §10.4).",
  }),
  IDLE_FEE_CAP_AMOUNT: pendingVerification("IDLE_FEE_CAP_AMOUNT", "number", {
    scope: "owner",
    currency: "RWF",
    note: "D-08 cap not decided.",
  }),

  /* --- Bookings (§10) --------------------------------------------- */

  BOOKING_WINDOW_BEFORE_MINUTES: founderDecided("BOOKING_WINDOW_BEFORE_MINUTES", 2, "number", {
    scope: "site",
    unit: "minutes",
    decision: "UCN default, FOUNDER_DECIDED (§10.1)",
    note: "T-2 min. Per-site overrides are audited (§10.4). v1.1 used 10 min — superseded.",
  }),
  BOOKING_WINDOW_AFTER_MINUTES: founderDecided("BOOKING_WINDOW_AFTER_MINUTES", 2, "number", {
    scope: "site",
    unit: "minutes",
    decision: "UCN default, FOUNDER_DECIDED (§10.1)",
    note: "T+2 min, then CancelReservation and release. v1.1 used 10 min — superseded.",
  }),
  BOOKING_SLOT: proposed("BOOKING_SLOT", 45, "number", {
    scope: "site",
    unit: "minutes",
    decision: "D-06 placeholder 45",
    note: "v1.1 used 30. Only free slots are offered.",
  }),
  BOOKING_MIN_MINUTES: proposed("BOOKING_MIN_MINUTES", 15, "number", {
    scope: "site",
    unit: "minutes",
    note: "Shortest useful booking.",
  }),
  BOOKING_MAX_MINUTES: proposed("BOOKING_MAX_MINUTES", 180, "number", {
    scope: "site",
    unit: "minutes",
    note: "Longest single booking on a public gun.",
  }),
  BOOKING_MAX_AHEAD_HOURS: proposed("BOOKING_MAX_AHEAD_HOURS", 24, "number", {
    scope: "site",
    unit: "hours",
    note: "How far ahead a driver may book.",
  }),
  BOOKING_MAX_LIVE_PER_DRIVER: proposed("BOOKING_MAX_LIVE_PER_DRIVER", 2, "number", {
    scope: "network",
    unit: "bookings",
    note: "Stops one driver hoarding guns.",
  }),
  BOOKING_MAX_SHARE_PCT: proposed("BOOKING_MAX_SHARE_PCT", 50, "number", {
    scope: "site",
    unit: "percent",
    overrideRange: [0, 100],
    note: "Keep walk-in capacity (§10.3).",
  }),
  BOOKING_FEE_AMOUNT: founderDecided("BOOKING_FEE_AMOUNT", 0, "number", {
    scope: "site",
    currency: "RWF",
    decision: "D-07 placeholder 0",
    note: "Owner-configurable within policy.",
  }),
  BOOKING_NO_SHOW_FEE_AMOUNT: founderDecided("BOOKING_NO_SHOW_FEE_AMOUNT", 0, "number", {
    scope: "site",
    currency: "RWF",
    decision: "D-07 placeholder 0",
    note: "Applied only after a valid no-show per §10.2.7. Backend/payment/charger latency must not create a no-show.",
  }),
  BOOKING_FAILURE_CREDIT_AMOUNT: pendingVerification("BOOKING_FAILURE_CREDIT_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "Apology credit when the gun is still occupied at T-2 min (§10.2.5). Amount not decided (D-07/D-23).",
  }),
  BOOKING_START_GRACE_SECONDS: pendingVerification("BOOKING_START_GRACE_SECONDS", "number", {
    scope: "network",
    unit: "seconds",
    note: "Charger-start grace after a valid arrival (§10.2.6, D-23).",
  }),
  FREE_CANCEL_LEAD: proposed("FREE_CANCEL_LEAD", 60, "number", {
    scope: "site",
    unit: "minutes",
    note: "Free cancellation until T minus this; after that a tiered fee (D-07).",
  }),

  /* --- Cards, agents and top-ups (§8.3) --------------------------- */

  FUND_HOLDER: pendingVerification("FUND_HOLDER", "string", {
    scope: "network",
    mandatory: true,
    note: "`operator` | `licensed_partner`. Awaiting BNR (§8.3.9, D-16). Until confirmed, card spending at third-party sites stays behind feature.networkWallet.",
  }),
  CARD_MIN_START_BALANCE_AMOUNT: pendingVerification("CARD_MIN_START_BALANCE_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "Minimum balance to approve Authorize (§8.3.5). Depends on the dynamic stopping reserve (D-10/D-20).",
  }),
  CARD_LOW_BALANCE_AMOUNT: proposed("CARD_LOW_BALANCE_AMOUNT", 200_000, "number", {
    scope: "network",
    currency: "RWF",
    note: "RWF 2,000 in minor units. Low-balance SMS includes merchant code and card number (§8.3.4).",
  }),
  CARD_LIGHT_DAILY_LIMIT_AMOUNT: pendingVerification("CARD_LIGHT_DAILY_LIMIT_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "Anonymous (light) card daily limit — awaiting BNR KYC guidance (§8.3.3, D-15).",
  }),
  CARD_LIGHT_BALANCE_CAP_AMOUNT: pendingVerification("CARD_LIGHT_BALANCE_CAP_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "Anonymous card balance cap — awaiting BNR (D-15).",
  }),
  CARD_REGISTERED_DAILY_LIMIT_AMOUNT: pendingVerification(
    "CARD_REGISTERED_DAILY_LIMIT_AMOUNT",
    "number",
    {
      scope: "network",
      currency: "RWF",
      note: "Registered card daily limit — awaiting BNR (D-15).",
    },
  ),
  CARD_PRICE_AMOUNT: pendingVerification("CARD_PRICE_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "D-09/D-14: sold, free with first top-up, or subsidised.",
  }),
  CARD_REPLACEMENT_FEE_AMOUNT: pendingVerification("CARD_REPLACEMENT_FEE_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "D-09/D-14.",
  }),
  CARD_FIRST_TOPUP_MIN_AMOUNT: pendingVerification("CARD_FIRST_TOPUP_MIN_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "D-09.",
  }),
  CARD_CHIP_TARGET: founderDecided("CARD_CHIP_TARGET", "DESFire EV3", "string", {
    scope: "network",
    decision: "D-17 target",
    note: "Chip compatibility is not proof of secure authentication. Reader key provisioning/rotation must be tested before production cards (§8.3.2).",
  }),
  CARD_DORMANT_AFTER_DAYS: pendingVerification("CARD_DORMANT_AFTER_DAYS", "number", {
    scope: "network",
    unit: "days",
    note: "Dormant-balance rules follow BNR/consumer-protection guidance — never silently forfeited (§8.3.7).",
  }),
  AGENT_COMMISSION: pendingVerification("AGENT_COMMISSION", "number", {
    scope: "network",
    unit: "bps",
    note: "Commission per top-up (§8.3.8, D-14).",
  }),
  MIN_TOPUP_AMOUNT: proposed("MIN_TOPUP_AMOUNT", 100_000, "number", {
    scope: "network",
    currency: "RWF",
    note: "RWF 1,000 in minor units.",
  }),

  /* --- Payments, settlement and payouts (§8) ---------------------- */

  PAYMENT_RAILS: founderDecided(
    "PAYMENT_RAILS",
    ["momo", "airtel", "wallet", "cash", "fleet_postpaid"] as readonly string[],
    "string[]",
    {
      scope: "network",
      note: "All provider rails are AWAITING CREDENTIALS (§8.1). Bank cards are never primary (core rule 17).",
    },
  ),
  PROVIDER_RESOLUTION_TIMEOUT_SECONDS: proposed(
    "PROVIDER_RESOLUTION_TIMEOUT_SECONDS",
    900,
    "number",
    {
      scope: "platform",
      unit: "seconds",
      note: "Unknown provider outcomes are queried/reconciled before any resend; escalate unresolved items within this deadline (§8.1).",
    },
  ),
  SUPPORT_REFUND_LIMIT_AMOUNT: proposed("SUPPORT_REFUND_LIMIT_AMOUNT", 1_000_000, "number", {
    scope: "platform",
    currency: "RWF",
    note: "RWF 10,000 in minor units. Above this, finance approval under the two-person rule (§8.6).",
  }),
  MAKER_CHECKER_THRESHOLD_AMOUNT: pendingVerification("MAKER_CHECKER_THRESHOLD_AMOUNT", "number", {
    scope: "platform",
    currency: "RWF",
    note: "Two-person approval threshold (§19.2, D-25).",
  }),
  SETTLEMENT_SPLIT_RULE_VERSION: founderDecided("SETTLEMENT_SPLIT_RULE_VERSION", 1, "number", {
    scope: "platform",
    unit: "version",
    note: "A session pins the split rule version it settled under (§8.5).",
  }),
  NETWORK_FEE_BPS: pendingVerification("NETWORK_FEE_BPS", "number", {
    scope: "owner",
    unit: "bps",
    note: "Model C network transaction fee (D-03). v1.1 carried 3000 bps as an assumption; not a decided price.",
  }),
  MANAGEMENT_FEE_BPS: pendingVerification("MANAGEMENT_FEE_BPS", "number", {
    scope: "owner",
    unit: "bps",
    note: "Model B management fee as % of revenue (D-03).",
  }),
  HOST_SHARE_BPS: pendingVerification("HOST_SHARE_BPS", "number", {
    scope: "site",
    unit: "bps",
    note: "Only where the contract says so (§8.5). v1.1 carried 7000 bps as an assumption.",
  }),
  SITE_ENERGY_COST_AMOUNT_PER_KWH: proposed("SITE_ENERGY_COST_AMOUNT_PER_KWH", null, "number", {
    scope: "site",
    currency: "RWF",
    note: "The owner's own REG purchase tariff, by time of day where applicable. Used for margin and P&L, never shown to drivers (§9). Null until the site's bill or tariff is entered.",
  }),
  PAYOUT_MODES: founderDecided(
    "PAYOUT_MODES",
    ["accelerated", "daily_sweep", "weekly", "on_demand"] as readonly string[],
    "string[]",
    { scope: "network", note: "Owner chooses, within policy limits (§8.5)." },
  ),
  PAYOUT_MODE_DEFAULT: founderDecided("PAYOUT_MODE_DEFAULT", "daily_sweep", "string", {
    scope: "owner",
    decision: "D-05 placeholder",
    note: "Ledger credit is not evidence of a successful external transfer.",
  }),
  DISBURSEMENT_FEE_PAYER: founderDecided("DISBURSEMENT_FEE_PAYER", "owner", "string", {
    scope: "owner",
    decision: "D-05 placeholder",
    note: "Shown to the owner before they choose a payout mode (§8.5).",
  }),
  PAYOUT_MIN_AMOUNT: pendingVerification("PAYOUT_MIN_AMOUNT", "number", {
    scope: "network",
    currency: "RWF",
    note: "Configured minimum for an accelerated disbursement (§8.5).",
  }),
  VAT_RATE_BPS: pendingVerification("VAT_RATE_BPS", "number", {
    scope: "country",
    unit: "bps",
    note: "Depends on seller of record per model A/B/C — REQUIRES OFFICIAL VERIFICATION (RRA, §7.5).",
  }),
  ROAMING_FUNDED_CREDIT_CAP_AMOUNT: pendingVerification(
    "ROAMING_FUNDED_CREDIT_CAP_AMOUNT",
    "number",
    {
      scope: "network",
      currency: "RWF",
      note: "The platform never assumes an unlimited obligation to front roaming payments (§17.7).",
    },
  ),

  /* --- RURA regulatory pack (§15) — VERIFIED_EXTERNAL ------------- */

  RURA_MIN_UPTIME_PCT: verifiedExternal("RURA_MIN_UPTIME_PCT", 97, "number", {
    scope: "country",
    unit: "percent",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 26(a): >= 97% around the clock. Report RAW uptime as the compliance figure (§15.1).",
  }),
  RURA_REPAIR_TARGET_HOURS: verifiedExternal("RURA_REPAIR_TARGET_HOURS", 24, "number", {
    scope: "country",
    unit: "hours",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 26: repair <= 24 h.",
  }),
  RURA_FLASH_REPORT_HOURS: verifiedExternal("RURA_FLASH_REPORT_HOURS", 1, "number", {
    scope: "country",
    unit: "hours",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 25(8): flash report within 1 h of an incident affecting service.",
  }),
  RURA_DETAILED_REPORT_HOURS: verifiedExternal("RURA_DETAILED_REPORT_HOURS", 48, "number", {
    scope: "country",
    unit: "hours",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 25(8): detailed report within 48 h if downtime > 1 h or RURA requires.",
  }),
  RURA_DETAILED_REPORT_DOWNTIME_TRIGGER_HOURS: verifiedExternal(
    "RURA_DETAILED_REPORT_DOWNTIME_TRIGGER_HOURS",
    1,
    "number",
    {
      scope: "country",
      unit: "hours",
      source: EVIDENCE.RURA_011_2026,
      decision: RURA_REVIEWER,
      effectiveFrom: "2026-06-29",
      mandatory: true,
      note: "Art. 25(8).",
    },
  ),
  RURA_COMPLAINT_RESOLUTION_HOURS: verifiedExternal(
    "RURA_COMPLAINT_RESOLUTION_HOURS",
    24,
    "number",
    {
      scope: "country",
      unit: "hours",
      source: EVIDENCE.RURA_011_2026,
      decision: RURA_REVIEWER,
      effectiveFrom: "2026-06-29",
      mandatory: true,
      note: "Art. 26: complaints resolved <= 24 h, or a status update where investigation is needed.",
    },
  ),
  RURA_SWAP_WAIT_MAX_MINUTES: verifiedExternal("RURA_SWAP_WAIT_MAX_MINUTES", 20, "number", {
    scope: "country",
    unit: "minutes",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    note: "Art. 26: swap wait <= 20 min. Battery swapping is not in current UZA scope (Annex III).",
  }),
  RURA_LICENCE_VALID_YEARS: verifiedExternal("RURA_LICENCE_VALID_YEARS", 5, "number", {
    scope: "country",
    unit: "years",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 19. Licence is issued PER SITE (Art. 4, 6).",
  }),
  RURA_LICENCE_LAPSE_MONTHS: verifiedExternal("RURA_LICENCE_LAPSE_MONTHS", 6, "number", {
    scope: "country",
    unit: "months",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 19: lapses if operations do not start within 6 months of issue.",
  }),
  RURA_RENEWAL_LEAD_DAYS: verifiedExternal("RURA_RENEWAL_LEAD_DAYS", 180, "number", {
    scope: "country",
    unit: "days",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 20: apply >= 180 days before expiry; reminders at 240/200/180 days.",
  }),
  RURA_SURRENDER_NOTICE_DAYS: verifiedExternal("RURA_SURRENDER_NOTICE_DAYS", 180, "number", {
    scope: "country",
    unit: "days",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Art. 34: written notice >= 180 days with reasons, timeline and transition plan.",
  }),
  RURA_TRANSITION_MONTHS: verifiedExternal("RURA_TRANSITION_MONTHS", 12, "number", {
    scope: "country",
    unit: "months",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    note: "Art. 37: pre-existing operators comply within 12 months (by end of June 2027).",
  }),
  RURA_FINE_AMOUNT: verifiedExternal("RURA_FINE_AMOUNT", 100_000_000, "number", {
    scope: "country",
    currency: "RWF",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    note: "RWF 1,000,000 in minor units. Art. 36: operating without a licence, unapproved expansion/relocation, cessation without 6 months' notice.",
  }),
  RURA_MIN_POWER_FACTOR: verifiedExternal("RURA_MIN_POWER_FACTOR", 0.9, "number", {
    scope: "country",
    unit: "power_factor",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Annex I: power factor >= 0.9.",
  }),
  RURA_MAX_THD_PCT: verifiedExternal("RURA_MAX_THD_PCT", 3, "number", {
    scope: "country",
    unit: "percent",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Annex I: THD < 3%.",
  }),
  RURA_MIN_DC_KW_PER_GUN: verifiedExternal("RURA_MIN_DC_KW_PER_GUN", 50, "number", {
    scope: "country",
    unit: "kW",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Annex I: at least one DC system >= 50 kW per gun.",
  }),
  RURA_MAX_EARTHING_OHMS: verifiedExternal("RURA_MAX_EARTHING_OHMS", 5, "number", {
    scope: "country",
    unit: "ohms",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Annex I: earthing < 5 ohms.",
  }),
  RURA_METER_ACCURACY_CLASS: verifiedExternal("RURA_METER_ACCURACY_CLASS", 1, "number", {
    scope: "country",
    unit: "class",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Annex I: class 1 (<= +/-1%) certified tamper-proof meters. The Wicen order form lists 'Level 2.0' — FAILS this until corrected (§15, D-28).",
  }),
  RURA_METER_RECALIBRATION_YEARS: verifiedExternal("RURA_METER_RECALIBRATION_YEARS", 5, "number", {
    scope: "country",
    unit: "years",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Annex I: recalibrated at least every 5 years.",
  }),
  RURA_MIN_CHARGING_TECHNOLOGIES: verifiedExternal("RURA_MIN_CHARGING_TECHNOLOGIES", 2, "number", {
    scope: "country",
    unit: "count",
    source: EVIDENCE.RURA_011_2026,
    decision: RURA_REVIEWER,
    effectiveFrom: "2026-06-29",
    mandatory: true,
    note: "Annex I: at least the two most prevalent charging technologies.",
  }),
  RURA_TURNOVER_LEVY_BPS: pendingVerification("RURA_TURNOVER_LEVY_BPS", "number", {
    scope: "country",
    unit: "bps",
    note: "Art. 18(2) defers the rate to a separate Regulatory Board Decision. Levy accrual stays DISABLED; reports read 'Rate not yet confirmed — not accrued' (§15.2).",
  }),
  RURA_UPTIME_EXCLUSIONS: pendingVerification("RURA_UPTIME_EXCLUSIONS", "string[]", {
    scope: "country",
    note: "The regulation names no exclusions. Until RURA confirms, raw uptime is the compliance figure and any adjusted uptime is shown separately and labelled (§15.1).",
  }),
  RURA_REPORT_TEMPLATE: pendingVerification("RURA_REPORT_TEMPLATE", "string", {
    scope: "country",
    note: "Art. 25(3) 'as prescribed by the Authority' — not yet published. Configurable generator until then.",
  }),
  RURA_MODEL_B_LICENSEE: pendingVerification("RURA_MODEL_B_LICENSEE", "string", {
    scope: "owner",
    note: "Who is licensee on a managed site — owner or UZA (D-04). Affects seller of record, VAT, levy and liability.",
  }),

  /* --- Uptime presentation (internal thresholds, not the rule) ---- */

  UPTIME_GREEN_PCT: founderDecided("UPTIME_GREEN_PCT", 98, "number", {
    scope: "network",
    unit: "percent",
    note: "UZA's internal 'on track' threshold, deliberately above the RURA 97% minimum. Not a regulatory figure.",
  }),
  UPTIME_AMBER_PCT: founderDecided("UPTIME_AMBER_PCT", 95, "number", {
    scope: "network",
    unit: "percent",
    note: "Below this a site is escalated. Internal only.",
  }),
  UPTIME_MIN_OBSERVATION_HOURS: founderDecided("UPTIME_MIN_OBSERVATION_HOURS", 24, "number", {
    scope: "platform",
    unit: "hours",
    mandatory: true,
    note: "Below this the UI says 'insufficient data'. Unknown observation periods are never shown as up (§15.1, §30.2).",
  }),

  /* --- Platform licensing and SaaS billing (§17.5) ---------------- */

  SAAS_PLANS: pendingVerification("SAAS_PLANS", "object", {
    scope: "platform",
    note: "Per-connector prices for Monitor/Operate (D-02). v1.1 carried placeholder prices; they are not decided.",
  }),
  SAAS_PLATFORM_LEASE_AMOUNT: pendingVerification("SAAS_PLATFORM_LEASE_AMOUNT", "number", {
    scope: "platform",
    currency: "RWF",
    note: "Model D network lease (D-13).",
  }),
  SAAS_PRIVATE_LICENCE_AMOUNT: pendingVerification("SAAS_PRIVATE_LICENCE_AMOUNT", "number", {
    scope: "platform",
    currency: "RWF",
    note: "Model E private licence (D-13).",
  }),
  SAAS_GRACE: founderDecided("SAAS_GRACE", 14, "number", {
    scope: "platform",
    unit: "days",
    decision: "D-12 placeholder",
    note: "Then restricted administration with continuing required records access. Active-session safety is preserved and collected funds are settled/refunded (§17.5).",
  }),
  SAAS_TRIAL_DAYS: proposed("SAAS_TRIAL_DAYS", 30, "number", {
    scope: "platform",
    unit: "days",
    note: "Free trial length.",
  }),
  SAAS_INVOICE_DUE_DAYS: proposed("SAAS_INVOICE_DUE_DAYS", 14, "number", {
    scope: "platform",
    unit: "days",
    note: "Payment terms on a subscription invoice.",
  }),
  SAAS_BILLING_DAY: proposed("SAAS_BILLING_DAY", 1, "number", {
    scope: "platform",
    unit: "day_of_month",
    overrideRange: [1, 28],
    note: "Day of month invoices are raised.",
  }),

  /* --- Reporting, forecasting and benchmarks ---------------------- */

  FORECAST_MIN_DAYS: founderDecided("FORECAST_MIN_DAYS", 7, "number", {
    scope: "platform",
    unit: "days",
    mandatory: true,
    note: "Below a week of realised days, refuse to project at all. Projections are always labelled as projections (§12.4).",
  }),
  FORECAST_RECENT_DAYS: proposed("FORECAST_RECENT_DAYS", 7, "number", {
    scope: "platform",
    unit: "days",
    note: "Trailing window used as the projection base.",
  }),
  FORECAST_MIN_BAND_PCT: proposed("FORECAST_MIN_BAND_PCT", 15, "number", {
    scope: "platform",
    unit: "percent",
    note: "Floor on the projection band, so it is never shown as exact.",
  }),
  FORECAST_FLAT_BAND_PCT: proposed("FORECAST_FLAT_BAND_PCT", 5, "number", {
    scope: "platform",
    unit: "percent",
    note: "Change smaller than this reads as flat, not a trend.",
  }),
  BENCHMARK_MIN_COHORT_SIZE: proposed("BENCHMARK_MIN_COHORT_SIZE", 5, "number", {
    scope: "platform",
    unit: "count",
    mandatory: true,
    note: "Suppress sparse groups that could identify one station or operator (§29).",
  }),
  REPORT_CLOSE_TOLERANCE_AMOUNT: pendingVerification("REPORT_CLOSE_TOLERANCE_AMOUNT", "number", {
    scope: "platform",
    currency: "RWF",
    note: "Month-end close tolerance (§25.5, D-25).",
  }),

  /* --- Retention, recovery and support access --------------------- */

  RETENTION_FINANCIAL_RECORDS_DAYS: pendingVerification(
    "RETENTION_FINANCIAL_RECORDS_DAYS",
    "number",
    {
      scope: "country",
      unit: "days",
      note: "Approved retention schedule by purpose and jurisdiction (§30.3, D-26).",
    },
  ),
  RETENTION_RAW_OCPP_FRAMES_DAYS: pendingVerification("RETENTION_RAW_OCPP_FRAMES_DAYS", "number", {
    scope: "platform",
    unit: "days",
    note: "Append-only DURING retention; immutability does not imply keeping all personal data forever (§6.3, §30.3).",
  }),
  RETENTION_TELEMETRY_DAYS: pendingVerification("RETENTION_TELEMETRY_DAYS", "number", {
    scope: "platform",
    unit: "days",
    note: "High-frequency telemetry retention (§30.3, D-26).",
  }),
  RECOVERY_TIME_OBJECTIVE_MINUTES: pendingVerification(
    "RECOVERY_TIME_OBJECTIVE_MINUTES",
    "number",
    {
      scope: "platform",
      unit: "minutes",
      note: "Must be reviewed and TESTED before launch. A daily backup is not proof of recoverability (§30.2, D-26).",
    },
  ),
  RECOVERY_POINT_OBJECTIVE_MINUTES: pendingVerification(
    "RECOVERY_POINT_OBJECTIVE_MINUTES",
    "number",
    { scope: "platform", unit: "minutes", note: "§30.2, D-26." },
  ),
  SUPPORT_ACCESS_EXPIRY_HOURS: pendingVerification("SUPPORT_ACCESS_EXPIRY_HOURS", "number", {
    scope: "platform",
    unit: "hours",
    note: "Support access is scoped to ticket, tenant, data type and time, with visible audit and expiry (§29, D-24).",
  }),
} as const satisfies Record<string, AnyConfigDefinition>;

export type ConfigKey = keyof typeof CONFIG;

/* ------------------------------------------------------------------ */
/* v1.1 -> v2.1 key migration (§19.5: referencing an unknown key fails CI) */
/* ------------------------------------------------------------------ */

/** A v1.1 key that v2.1 deliberately deletes, with the reason. */
export type RemovedKey = { readonly removed: true; readonly reason: string };

const removed = (reason: string): RemovedKey => ({ removed: true, reason });

/**
 * Every key that appeared in the v1.1 `POLICY_REGISTRY` maps to its v2.1 key
 * or to an explicit removal. `resolvePolicyKey()` uses this, and
 * `assertMigrationMapComplete()` checks it against the legacy registry so a
 * forgotten key fails CI rather than resolving silently to undefined.
 */
export const POLICY_KEY_MIGRATION = {
  HOME_COUNTRY: "NETWORK_COUNTRY",
  SUPPORTED_COUNTRIES: "PLATFORM_SUPPORTED_COUNTRIES",
  TIMEZONE: "NETWORK_TIMEZONE",
  "TARIFF_DEFAULTS.energyMinorPerKwh": "TARIFF_DEFAULT_ENERGY_AMOUNT_PER_KWH",
  "TARIFF_DEFAULTS.timeMinorPerMinute": "TARIFF_DEFAULT_TIME_AMOUNT_PER_MINUTE",
  "TARIFF_DEFAULTS.sessionFeeMinor": "TARIFF_DEFAULT_START_FEE_AMOUNT",
  "TARIFF_DEFAULTS.idleFeeMinorPerMinute": "IDLE_FEE_AMOUNT_PER_MINUTE",
  "TARIFF_DEFAULTS.idleGraceMinutes": "IDLE_FEE_GRACE_MINUTES",
  "TOU_TIER_MULTIPLIER.valley": "TARIFF_TIER_MULTIPLIER_VALLEY",
  "TOU_TIER_MULTIPLIER.standard": "TARIFF_TIER_MULTIPLIER_STANDARD",
  "TOU_TIER_MULTIPLIER.peak": "TARIFF_TIER_MULTIPLIER_PEAK",
  "TOU_TIER_MULTIPLIER.sharp": "TARIFF_TIER_MULTIPLIER_SHARP",
  "REVENUE_SPLIT_DEFAULTS.version": "SETTLEMENT_SPLIT_RULE_VERSION",
  "REVENUE_SPLIT_DEFAULTS.energyCostMinorPerKwh": "SITE_ENERGY_COST_AMOUNT_PER_KWH",
  "REVENUE_SPLIT_DEFAULTS.hostShareBps": "HOST_SHARE_BPS",
  "REVENUE_SPLIT_DEFAULTS.platformShareBps": "NETWORK_FEE_BPS",
  PAYOUT_SCHEDULES: "PAYOUT_MODES",
  DEFAULT_PAYOUT_SCHEDULE: "PAYOUT_MODE_DEFAULT",
  PAYMENT_RAILS: "PAYMENT_RAILS",
  PREAUTH_AMOUNT_MINOR: removed(
    "v2.1 §7.3 replaces the fixed pre-authorisation margin with a dynamic stopping reserve computed per model from power bound, max rate and exposure window. A flat RWF 15,000 hold is neither a safe cap nor a correct reserve.",
  ),
  MIN_WALLET_TOPUP_MINOR: "MIN_TOPUP_AMOUNT",
  "OCPP.protocol": "OCPP_PROTOCOL",
  "OCPP.heartbeatIntervalSeconds": "HEARTBEAT_INTERVAL_SECONDS",
  "OCPP.offlineAfterMissedHeartbeats": "OFFLINE_AFTER",
  "OCPP.houseStandardKw": removed(
    "A hardware fact, not a policy value. It belongs in the compatibility directory (§26.3) per charger model; §26.4 forbids hard-coding around one dual-gun DC model.",
  ),
  "UPTIME_TARGETS.greenAtOrAbovePct": "UPTIME_GREEN_PCT",
  "UPTIME_TARGETS.amberAtOrAbovePct": "UPTIME_AMBER_PCT",
  "UPTIME_TARGETS.minObservationHours": "UPTIME_MIN_OBSERVATION_HOURS",
  "SUBSCRIPTION_DEFAULTS.plans": "SAAS_PLANS",
  "SUBSCRIPTION_DEFAULTS.trialDays": "SAAS_TRIAL_DAYS",
  "SUBSCRIPTION_DEFAULTS.invoiceDueDays": "SAAS_INVOICE_DUE_DAYS",
  "SUBSCRIPTION_DEFAULTS.billingDay": "SAAS_BILLING_DAY",
  "FORECAST.minDaysForProjection": "FORECAST_MIN_DAYS",
  "FORECAST.recentDays": "FORECAST_RECENT_DAYS",
  "FORECAST.minBandPct": "FORECAST_MIN_BAND_PCT",
  "FORECAST.flatBandPct": "FORECAST_FLAT_BAND_PCT",
  "INVESTMENT_HEALTH.weights": removed(
    "v2.1 §25 replaces the composite investment-health score with three distinct views (station operating performance, station cash flow, investor return) plus a completeness checklist. A single blended score hid which figures were measured, estimated or missing.",
  ),
  "INVESTMENT_HEALTH.healthyUtilisationPct": removed(
    "See INVESTMENT_HEALTH.weights. §12.3 requires utilisation published against fixed, versioned denominators instead.",
  ),
  "INVESTMENT_HEALTH.healthyRevenuePerPilePerDayMinor": removed(
    "See INVESTMENT_HEALTH.weights. §25.4 reports budget vs actual and scenario returns instead of a 'healthy' constant.",
  ),
  "INVESTMENT_HEALTH.greenAtOrAbove": removed("See INVESTMENT_HEALTH.weights."),
  "INVESTMENT_HEALTH.amberAtOrAbove": removed("See INVESTMENT_HEALTH.weights."),
  "BOOKING.slotMinutes": "BOOKING_SLOT",
  "BOOKING.minMinutes": "BOOKING_MIN_MINUTES",
  "BOOKING.maxMinutes": "BOOKING_MAX_MINUTES",
  "BOOKING.graceBeforeMinutes": "BOOKING_WINDOW_BEFORE_MINUTES",
  "BOOKING.graceAfterMinutes": "BOOKING_WINDOW_AFTER_MINUTES",
  "BOOKING.maxAheadHours": "BOOKING_MAX_AHEAD_HOURS",
  "BOOKING.maxLiveBookingsPerDriver": "BOOKING_MAX_LIVE_PER_DRIVER",
} as const satisfies Record<string, ConfigKey | RemovedKey>;

export type LegacyKey = keyof typeof POLICY_KEY_MIGRATION;

const isRemoved = (v: ConfigKey | RemovedKey): v is RemovedKey =>
  typeof v === "object" && v !== null && "removed" in v;

/** Thrown when code references a configuration key that does not exist. */
export class UnknownConfigKeyError extends Error {
  constructor(key: string, hint: string) {
    super(`Unknown configuration key "${key}". ${hint}`);
    this.name = "UnknownConfigKeyError";
  }
}

/**
 * Resolve a key that may still be written in v1.1 form.
 * Throws on an unknown key and on a key v2.1 removed, so CI fails rather than
 * silently reading `undefined` (§19.5).
 */
export const resolvePolicyKey = (key: string): ConfigKey => {
  if (Object.prototype.hasOwnProperty.call(CONFIG, key)) return key as ConfigKey;

  const mapped: (ConfigKey | RemovedKey) | undefined = Object.prototype.hasOwnProperty.call(
    POLICY_KEY_MIGRATION,
    key,
  )
    ? POLICY_KEY_MIGRATION[key as LegacyKey]
    : undefined;

  if (mapped === undefined) {
    throw new UnknownConfigKeyError(key, "It is not in CONFIG and not in POLICY_KEY_MIGRATION.");
  }
  if (isRemoved(mapped)) {
    throw new UnknownConfigKeyError(key, `Removed in v2.1: ${mapped.reason}`);
  }
  return mapped;
};

/** Look up a definition, accepting v1.1 keys. Throws on unknown/removed keys. */
export const getConfig = (key: string): AnyConfigDefinition => CONFIG[resolvePolicyKey(key)];

/* ------------------------------------------------------------------ */
/* Production guards                                                   */
/* ------------------------------------------------------------------ */

export type ConfigProblem = { readonly key: string; readonly problem: string };

/**
 * Collect every reason a value may not drive production behaviour (§19.5):
 *  - `null` (unknown) — the dependent feature must stay disabled
 *  - `PENDING_VERIFICATION` — never drives production
 *  - `PROPOSED` — test environments only until an approved registry record exists
 *  - `VERIFIED_EXTERNAL` without a `source` document
 *  - a mandatory value with no `mandatory` enforcement point
 */
export const findProductionBlockers = (
  keys: readonly ConfigKey[] = Object.keys(CONFIG) as ConfigKey[],
): readonly ConfigProblem[] => {
  const problems: ConfigProblem[] = [];
  for (const key of keys) {
    const def: AnyConfigDefinition = CONFIG[key];
    if (def.key !== key) {
      problems.push({
        key,
        problem: `key field is "${def.key}" but the registry name is "${key}"`,
      });
    }
    if (def.status === "PENDING_VERIFICATION") {
      problems.push({ key, problem: "PENDING_VERIFICATION — awaiting authoritative evidence" });
      continue;
    }
    if (def.value === null) {
      problems.push({
        key,
        problem: "value is null (unknown) — dependent feature must stay disabled",
      });
      continue;
    }
    if (def.status === "PROPOSED") {
      problems.push({ key, problem: "PROPOSED — needs an approved configuration record first" });
    }
    if (def.status === "VERIFIED_EXTERNAL" && !def.source) {
      problems.push({
        key,
        problem: "VERIFIED_EXTERNAL without a source document in docs/evidence/",
      });
    }
    if (def.currency !== null && !/_AMOUNT(_PER_[A-Z]+)?$/.test(def.key)) {
      problems.push({ key, problem: "has a currency but is not named *_AMOUNT" });
    }
  }
  return problems;
};

/**
 * Call this on the startup path of any production deployment, passing the keys
 * the enabled features actually read. Blocks nulls, pending values, proposed
 * values and "verified" values without a source (§19.5).
 */
export const assertUsableInProduction = (keys?: readonly ConfigKey[]): void => {
  const problems = findProductionBlockers(keys);
  if (problems.length > 0) {
    const lines = problems.map((p) => `  - ${p.key}: ${p.problem}`).join("\n");
    throw new Error(
      `Configuration is not usable in production (policy.ts §19.5):\n${lines}\n` +
        `Resolve each item in an approved versioned configuration record, or keep the dependent feature disabled and labelled.`,
    );
  }
};

/**
 * CI check: every v1.1 registry key must appear in `POLICY_KEY_MIGRATION`, and
 * every mapping target must exist in `CONFIG`. Returns the offending keys.
 */
export const assertMigrationMapComplete = (
  legacyKeys: readonly string[],
): readonly ConfigProblem[] => {
  const problems: ConfigProblem[] = [];
  for (const key of legacyKeys) {
    if (!Object.prototype.hasOwnProperty.call(POLICY_KEY_MIGRATION, key)) {
      problems.push({ key, problem: "v1.1 key missing from POLICY_KEY_MIGRATION" });
    }
  }
  for (const [legacy, target] of Object.entries(POLICY_KEY_MIGRATION)) {
    if (!isRemoved(target) && !Object.prototype.hasOwnProperty.call(CONFIG, target)) {
      problems.push({ key: legacy, problem: `maps to "${target}" which is not in CONFIG` });
    }
  }
  return problems;
};

/* ------------------------------------------------------------------ */
/* Legacy re-exports — keep the working prototype compiling (rule 6)   */
/* ------------------------------------------------------------------ */

/**
 * The 21 modules listed in OPEN_QUESTIONS.md Q-02 still import these v1.1
 * value groups. They are re-exported unchanged so no working behaviour moves
 * in this commit. New code must read `CONFIG` above.
 *
 * `EMPOWER` is UZA's driver-financing product, not part of uza-charge scope;
 * it has no v2.1 key and is simply passed through.
 */
export {
  CURRENCY,
  HOME_COUNTRY,
  SUPPORTED_COUNTRIES,
  TIMEZONE,
  TARIFF_DEFAULTS,
  TOU_TIER_MULTIPLIER,
  REVENUE_SPLIT_DEFAULTS,
  PAYOUT_SCHEDULES,
  DEFAULT_PAYOUT_SCHEDULE,
  PAYMENT_RAILS as LEGACY_PAYMENT_RAILS,
  PREAUTH_AMOUNT_MINOR,
  MIN_WALLET_TOPUP_MINOR,
  OCPP,
  UPTIME_TARGETS,
  SUBSCRIPTION_DEFAULTS,
  FORECAST,
  INVESTMENT_HEALTH,
  EMPOWER,
  BOOKING,
  LEGACY_POLICY_REGISTRY,
} from "./policy.legacy";

export type { TouTier, LegacyPolicyStatus, LegacyPolicyValue } from "./policy.legacy";
