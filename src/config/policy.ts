/**
 * UZA CHARGE NETWORK — commercial policy constants.
 *
 * THE SINGLE SOURCE OF TRUTH. No business number may appear as a literal
 * anywhere else in the codebase. All money maths runs through the pure
 * functions in `src/lib/pricing.ts`.
 *
 * Every constant carries a status:
 *   CONFIRMED — signed off by UZA leadership, with the decision date.
 *   ASSUMED   — placeholder pending sign-off. Surfaced here deliberately so it
 *               can be reviewed, never buried in a component.
 *
 * Changing a value here is a code change. End users must never edit these
 * from the UI.
 */

export type PolicyStatus = "CONFIRMED" | "ASSUMED";

export type PolicyValue<T> = {
  readonly value: T;
  readonly status: PolicyStatus;
  /** ISO date of the decision (CONFIRMED) or of the assumption (ASSUMED). */
  readonly decidedOn: string;
  readonly note: string;
};

const confirmed = <T>(value: T, decidedOn: string, note: string): PolicyValue<T> => ({
  value,
  status: "CONFIRMED",
  decidedOn,
  note,
});

const assumed = <T>(value: T, decidedOn: string, note: string): PolicyValue<T> => ({
  value,
  status: "ASSUMED",
  decidedOn,
  note,
});

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

/**
 * Money is stored and computed as integer minor units. RWF has no circulating
 * subunit, but we keep 2 decimal places of headroom so per-kWh rates, splits
 * and refunds stay exact and reversible.
 */
export const CURRENCY = {
  code: "RWF",
  minorUnitsPerUnit: 100,
  /** Displayed figures are rounded to whole RWF: `RWF 1,234`. */
  displayDecimals: 0,
} as const;

/* ------------------------------------------------------------------ */
/* Market / expansion                                                  */
/* ------------------------------------------------------------------ */

export const HOME_COUNTRY = confirmed(
  "RW",
  "2026-09-02",
  "Rwanda is the validation market. Country is a column everywhere, never hardcoded in logic.",
);

export const SUPPORTED_COUNTRIES = confirmed(
  ["RW", "UG", "KE", "TZ", "CD"] as const,
  "2026-09-02",
  "East African expansion order. Adding one must never require a schema change.",
);

export const TIMEZONE = confirmed(
  "Africa/Kigali",
  "2026-09-02",
  "All timestamps stored UTC, presented in Africa/Kigali.",
);

/* ------------------------------------------------------------------ */
/* Tariff defaults — applied when an owner has not set their own        */
/* ------------------------------------------------------------------ */

export const TARIFF_DEFAULTS = {
  /** Energy price per kWh, in minor units. 320 RWF/kWh. */
  energyMinorPerKwh: assumed(
    320 * CURRENCY.minorUnitsPerUnit,
    "2026-09-02",
    "Indicative DC fast-charge energy price pending REG tariff confirmation.",
  ),
  /** Time-based component per minute while charging, in minor units. */
  timeMinorPerMinute: assumed(
    0,
    "2026-09-02",
    "UZA prices energy, not time, by default. Owners may enable a time component.",
  ),
  /** Flat per-session connection fee, in minor units. */
  sessionFeeMinor: assumed(
    0,
    "2026-09-02",
    "No connection fee on the UZA network by default.",
  ),
  /** Idle / occupancy fee per minute once the grace period expires. */
  idleFeeMinorPerMinute: assumed(
    100 * CURRENCY.minorUnitsPerUnit,
    "2026-09-02",
    "100 RWF/min occupancy fee to keep fast-charge bays turning over.",
  ),
  /** Free minutes after the session finishes before idle billing starts. */
  idleGraceMinutes: assumed(
    10,
    "2026-09-02",
    "10 minutes' grace after the vehicle stops drawing power.",
  ),
} as const;

/**
 * Time-of-use multipliers applied to the energy rate. Tiers mirror the
 * half-hour segment model in the database.
 */
export const TOU_TIER_MULTIPLIER = {
  valley: assumed(0.75, "2026-09-02", "Overnight surplus hydro window."),
  standard: assumed(1.0, "2026-09-02", "Reference rate."),
  peak: assumed(1.25, "2026-09-02", "Evening residential peak."),
  sharp: assumed(1.5, "2026-09-02", "Grid-stress window; discourages fast charging."),
} as const;

export type TouTier = keyof typeof TOU_TIER_MULTIPLIER;

/* ------------------------------------------------------------------ */
/* Revenue split — third-party owned stations                          */
/* ------------------------------------------------------------------ */

/**
 * Default split applied to gross session revenue for a host-owned station.
 * Energy cost is settled first (it is a pass-through to the utility), then the
 * remainder is split between the host and the UZA platform.
 *
 * A session pins the rule VERSION it settled under; changing these defaults
 * never re-prices a historical session.
 */
export const REVENUE_SPLIT_DEFAULTS = {
  version: confirmed(1, "2026-09-02", "First published split rule version."),
  /** Wholesale energy cost per kWh, in minor units — passed through to the utility. */
  energyCostMinorPerKwh: assumed(
    215 * CURRENCY.minorUnitsPerUnit,
    "2026-09-02",
    "REG industrial tariff estimate pending confirmed supply contract.",
  ),
  /** Host's share of net margin, in basis points. 7000 bps = 70%. */
  hostShareBps: assumed(
    7000,
    "2026-09-02",
    "Host keeps 70% of net margin where the host funds the hardware.",
  ),
  /** UZA platform fee share of net margin, in basis points. */
  platformShareBps: assumed(
    3000,
    "2026-09-02",
    "UZA keeps 30% of net margin for platform, payments and O&M.",
  ),
} as const;

/** Owner payout cadence options and the default. */
export const PAYOUT_SCHEDULES = confirmed(
  ["weekly", "fortnightly", "monthly"] as const,
  "2026-09-02",
  "Settlement statement is generated per owner on this cadence.",
);

export const DEFAULT_PAYOUT_SCHEDULE = assumed(
  "monthly" as const,
  "2026-09-02",
  "Monthly settlement unless an owner contract states otherwise.",
);

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export const PAYMENT_RAILS = confirmed(
  ["momo", "airtel", "wallet", "fleet_postpaid"] as const,
  "2026-09-02",
  "MTN MoMo and Airtel Money are primary. Cards are out of scope for now.",
);

/**
 * Amount pre-authorised before a session may start, in minor units. Reconciled
 * against actual kWh at StopTransaction, then captured or refunded.
 */
export const PREAUTH_AMOUNT_MINOR = assumed(
  15_000 * CURRENCY.minorUnitsPerUnit,
  "2026-09-02",
  "RWF 15,000 hold covers a typical 45 kWh DC session at the default rate.",
);

export const MIN_WALLET_TOPUP_MINOR = assumed(
  1_000 * CURRENCY.minorUnitsPerUnit,
  "2026-09-02",
  "Minimum MoMo top-up.",
);

/* ------------------------------------------------------------------ */
/* Operations / OCPP                                                   */
/* ------------------------------------------------------------------ */

export const OCPP = {
  /** The only protocol UZA speaks to chargers. Vendor-agnostic by contract. */
  protocol: confirmed("ocpp1.6", "2026-09-02", "OCPP 1.6-J over WebSocket."),
  /** Heartbeat interval returned in BootNotification, in seconds. */
  heartbeatIntervalSeconds: confirmed(
    300,
    "2026-09-02",
    "5-minute heartbeat: tolerant of patchy Rwandan mobile backhaul.",
  ),
  /**
   * A charge point silent for longer than heartbeat × this factor is rendered
   * offline with its last-seen time. It is never shown as stale-live.
   */
  offlineAfterMissedHeartbeats: confirmed(
    2,
    "2026-09-02",
    "Two missed heartbeats before a pile is called offline.",
  ),
  /** UZA's own hardware standard. AC and lower-power DC must also work. */
  houseStandardKw: confirmed(
    180,
    "2026-09-02",
    "180 kW dual-gun DC is the UZA standard pile.",
  ),
} as const;

/**
 * Uptime target used to colour the headline KPI.
 * GREEN on track, AMBER at risk, RED blocked.
 */
export const UPTIME_TARGETS = {
  greenAtOrAbovePct: confirmed(98, "2026-09-02", "Contractual availability target."),
  amberAtOrAbovePct: confirmed(95, "2026-09-02", "Below this a site is escalated."),
  /** Hours of observed status history required before uptime is reported at all. */
  minObservationHours: confirmed(
    24,
    "2026-09-02",
    "Below this the UI says 'insufficient data' rather than inventing a number.",
  ),
} as const;

/* ------------------------------------------------------------------ */
/* Subscription — UZA sells the management system as software          */
/* ------------------------------------------------------------------ */

/**
 * Plan catalogue defaults, mirrored in the `subscription_plans` table.
 * Prices are ASSUMED until UZA leadership signs off; the seeded rows carry the
 * same figures so the portal and this registry never disagree.
 */
export const SUBSCRIPTION_DEFAULTS = {
  plans: assumed(
    [
      { code: "starter", minMonthlyMinor: 2_500_000, perChargePointMinor: 2_500_000, included: 1 },
      { code: "pro", minMonthlyMinor: 10_000_000, perChargePointMinor: 2_000_000, included: 5 },
      { code: "enterprise", minMonthlyMinor: 50_000_000, perChargePointMinor: 1_500_000, included: 25 },
    ],
    "2026-09-03",
    "Starter RWF 25,000/mo, Pro RWF 100,000/mo, Enterprise RWF 500,000/mo minimums — placeholder pricing pending CEO sign-off.",
  ),
  trialDays: assumed(30, "2026-09-03", "Free trial length for a new station owner."),
  invoiceDueDays: assumed(14, "2026-09-03", "Payment terms on a subscription invoice."),
  billingDay: assumed(1, "2026-09-03", "Day of month invoices are raised."),
} as const;

/* ------------------------------------------------------------------ */
/* Forecasting — estimates, always labelled as such                    */
/* ------------------------------------------------------------------ */

export const FORECAST = {
  minDaysForProjection: confirmed(
    7,
    "2026-09-03",
    "Below a week of realised days we refuse to project at all.",
  ),
  recentDays: assumed(7, "2026-09-03", "Trailing window used as the projection base."),
  minBandPct: assumed(15, "2026-09-03", "Floor on the projection band, so it is never shown as exact."),
  flatBandPct: assumed(5, "2026-09-03", "Change smaller than this reads as flat, not a trend."),
} as const;

/* ------------------------------------------------------------------ */
/* Investment health score                                             */
/* ------------------------------------------------------------------ */

export const INVESTMENT_HEALTH = {
  weights: confirmed(
    { uptime: 40, utilisation: 30, revenue: 20, faults: 10 },
    "2026-09-03",
    "Availability dominates: charging is an availability business.",
  ),
  healthyUtilisationPct: assumed(
    25,
    "2026-09-03",
    "Share of observed time delivering energy that scores full marks.",
  ),
  healthyRevenuePerPilePerDayMinor: assumed(
    3_000_000,
    "2026-09-03",
    "RWF 30,000 per pile per day scores full marks on revenue.",
  ),
  greenAtOrAbove: confirmed(75, "2026-09-03", "Investment on track."),
  amberAtOrAbove: confirmed(50, "2026-09-03", "Investment at risk."),
} as const;


/* ------------------------------------------------------------------ */
/* UZA EMPOWER — driver training, bank financing, savings companion    */
/* ------------------------------------------------------------------ */

/**
 * The deposit bridge. The bank must ALWAYS see a full deposit; whatever the
 * driver cannot bring, UZA fronts and grosses into the vehicle price to recover
 * it. The driver borrows and repays 100% of his own loan; UZA takes no profit
 * on collateral held.
 *
 * Invariant, unit-tested in src/lib/empower.ts:
 *   loan principal + client contribution === vehicle price
 */
export const EMPOWER = {
  /** Fixed UZA selling price per vehicle, regardless of contribution. */
  vehiclePriceMinor: confirmed(
    22_500_000 * CURRENCY.minorUnitsPerUnit,
    "2026-09-03",
    "RWF 22,500,000 per vehicle, fixed by the CEO. An input, never computed.",
  ),
  /** Deposit the financing institution must see, in basis points of the total. */
  bankDepositBps: confirmed(
    1000,
    "2026-09-03",
    "Banks require a full 10% deposit. Each institution may configure its own tier.",
  ),
  /** Floor on what the driver brings in cash. Training substitutes for the rest. */
  minClientContributionMinor: confirmed(
    500_000 * CURRENCY.minorUnitsPerUnit,
    "2026-09-03",
    "RWF 500,000 minimum client contribution plus completed training as driver equity.",
  ),
  termMonths: confirmed(48, "2026-09-03", "48-month loan term."),
  collateralReleaseMonth: confirmed(
    24,
    "2026-09-03",
    "Blocked cash collateral is released at month 24 and recycled as bank exposure falls.",
  ),
  /** Interest used for the indicative instalment until a bank offer is on paper. */
  annualInterestBps: assumed(
    1800,
    "2026-09-03",
    "18% per year reducing balance — indicative only; each bank's offer overrides it.",
  ),
  /** Days a taxi driver realistically works in a month / a week. */
  workingDaysPerMonth: assumed(
    28,
    "2026-09-03",
    "Daily target is the instalment spread over working days, not calendar days.",
  ),
  workingDaysPerWeek: assumed(6, "2026-09-03", "Six working days; one rest day."),
  savingCadences: confirmed(
    ["daily", "weekly", "monthly", "per_contract"] as const,
    "2026-09-03",
    "Taxi drivers save daily; contracted drivers align to their payment date.",
  ),
  /** Default named sub-accounts opened for a financed driver, in basis points of the daily target. */
  potAllocationBps: assumed(
    {
      loan: 6000,
      maintenance: 1500,
      electricity: 1500,
      opex: 500,
      personal: 500,
    },
    "2026-09-03",
    "Suggested split of the daily saving. The driver may rename and re-weight every pot.",
  ),
  /** How the bank-readiness score is composed. */
  readinessWeights: assumed(
    { training: 30, discipline: 40, recordLength: 20, arrears: 10 },
    "2026-09-03",
    "Evidence we present to a bank when arguing for a lower client contribution.",
  ),
  /** Score at or above which UZA presents a driver for 0% client contribution. */
  zeroContributionAtOrAbove: assumed(
    80,
    "2026-09-03",
    "Below this the driver still needs the cash minimum above.",
  ),
  /** Days of recorded saving before the score can reach full marks on record length. */
  matureRecordDays: assumed(90, "2026-09-03", "Three months of daily records is a track record."),
  /** Local hour the daily reminder is due. */
  reminderHourLocal: assumed(19, "2026-09-03", "Evening reminder, after the working day."),
} as const;


/* ------------------------------------------------------------------ */
/* Booking — reserving a pile ahead of arrival                         */
/* ------------------------------------------------------------------ */

/**
 * A booking holds one pile for a window, with a tolerance either side so a
 * driver stuck in Kigali traffic does not lose the slot. Rules live here and
 * are enforced both in pure code (src/lib/reservations.ts) and by a database
 * overlap constraint, so two drivers can never hold the same pile.
 */
export const BOOKING = {
  slotMinutes: assumed(30, "2026-09-08", "Bookings are offered in half-hour slots."),
  minMinutes: assumed(15, "2026-09-08", "Shortest useful booking."),
  maxMinutes: assumed(180, "2026-09-08", "Longest single booking on a public pile."),
  graceBeforeMinutes: assumed(
    10,
    "2026-09-08",
    "Early tolerance: the pile is held from ten minutes before the slot.",
  ),
  graceAfterMinutes: assumed(
    10,
    "2026-09-08",
    "Late tolerance: after this the booking is a no-show and the pile is released.",
  ),
  maxAheadHours: assumed(24, "2026-09-08", "How far ahead a driver may book."),
  maxLiveBookingsPerDriver: assumed(2, "2026-09-08", "Stops one driver hoarding piles."),
} as const;

export const POLICY_REGISTRY: ReadonlyArray<{ key: string; policy: PolicyValue<unknown> }> = [

  { key: "HOME_COUNTRY", policy: HOME_COUNTRY },
  { key: "SUPPORTED_COUNTRIES", policy: SUPPORTED_COUNTRIES },
  { key: "TIMEZONE", policy: TIMEZONE },
  { key: "TARIFF_DEFAULTS.energyMinorPerKwh", policy: TARIFF_DEFAULTS.energyMinorPerKwh },
  { key: "TARIFF_DEFAULTS.timeMinorPerMinute", policy: TARIFF_DEFAULTS.timeMinorPerMinute },
  { key: "TARIFF_DEFAULTS.sessionFeeMinor", policy: TARIFF_DEFAULTS.sessionFeeMinor },
  { key: "TARIFF_DEFAULTS.idleFeeMinorPerMinute", policy: TARIFF_DEFAULTS.idleFeeMinorPerMinute },
  { key: "TARIFF_DEFAULTS.idleGraceMinutes", policy: TARIFF_DEFAULTS.idleGraceMinutes },
  { key: "TOU_TIER_MULTIPLIER.valley", policy: TOU_TIER_MULTIPLIER.valley },
  { key: "TOU_TIER_MULTIPLIER.standard", policy: TOU_TIER_MULTIPLIER.standard },
  { key: "TOU_TIER_MULTIPLIER.peak", policy: TOU_TIER_MULTIPLIER.peak },
  { key: "TOU_TIER_MULTIPLIER.sharp", policy: TOU_TIER_MULTIPLIER.sharp },
  { key: "REVENUE_SPLIT_DEFAULTS.version", policy: REVENUE_SPLIT_DEFAULTS.version },
  {
    key: "REVENUE_SPLIT_DEFAULTS.energyCostMinorPerKwh",
    policy: REVENUE_SPLIT_DEFAULTS.energyCostMinorPerKwh,
  },
  { key: "REVENUE_SPLIT_DEFAULTS.hostShareBps", policy: REVENUE_SPLIT_DEFAULTS.hostShareBps },
  {
    key: "REVENUE_SPLIT_DEFAULTS.platformShareBps",
    policy: REVENUE_SPLIT_DEFAULTS.platformShareBps,
  },
  { key: "PAYOUT_SCHEDULES", policy: PAYOUT_SCHEDULES },
  { key: "DEFAULT_PAYOUT_SCHEDULE", policy: DEFAULT_PAYOUT_SCHEDULE },
  { key: "PAYMENT_RAILS", policy: PAYMENT_RAILS },
  { key: "PREAUTH_AMOUNT_MINOR", policy: PREAUTH_AMOUNT_MINOR },
  { key: "MIN_WALLET_TOPUP_MINOR", policy: MIN_WALLET_TOPUP_MINOR },
  { key: "OCPP.protocol", policy: OCPP.protocol },
  { key: "OCPP.heartbeatIntervalSeconds", policy: OCPP.heartbeatIntervalSeconds },
  { key: "OCPP.offlineAfterMissedHeartbeats", policy: OCPP.offlineAfterMissedHeartbeats },
  { key: "OCPP.houseStandardKw", policy: OCPP.houseStandardKw },
  { key: "UPTIME_TARGETS.greenAtOrAbovePct", policy: UPTIME_TARGETS.greenAtOrAbovePct },
  { key: "UPTIME_TARGETS.amberAtOrAbovePct", policy: UPTIME_TARGETS.amberAtOrAbovePct },
  { key: "UPTIME_TARGETS.minObservationHours", policy: UPTIME_TARGETS.minObservationHours },
  { key: "SUBSCRIPTION_DEFAULTS.plans", policy: SUBSCRIPTION_DEFAULTS.plans },
  { key: "SUBSCRIPTION_DEFAULTS.trialDays", policy: SUBSCRIPTION_DEFAULTS.trialDays },
  { key: "SUBSCRIPTION_DEFAULTS.invoiceDueDays", policy: SUBSCRIPTION_DEFAULTS.invoiceDueDays },
  { key: "SUBSCRIPTION_DEFAULTS.billingDay", policy: SUBSCRIPTION_DEFAULTS.billingDay },
  { key: "FORECAST.minDaysForProjection", policy: FORECAST.minDaysForProjection },
  { key: "FORECAST.recentDays", policy: FORECAST.recentDays },
  { key: "FORECAST.minBandPct", policy: FORECAST.minBandPct },
  { key: "FORECAST.flatBandPct", policy: FORECAST.flatBandPct },
  { key: "INVESTMENT_HEALTH.weights", policy: INVESTMENT_HEALTH.weights },
  { key: "INVESTMENT_HEALTH.healthyUtilisationPct", policy: INVESTMENT_HEALTH.healthyUtilisationPct },
  { key: "INVESTMENT_HEALTH.healthyRevenuePerPilePerDayMinor", policy: INVESTMENT_HEALTH.healthyRevenuePerPilePerDayMinor },
  { key: "INVESTMENT_HEALTH.greenAtOrAbove", policy: INVESTMENT_HEALTH.greenAtOrAbove },
  { key: "INVESTMENT_HEALTH.amberAtOrAbove", policy: INVESTMENT_HEALTH.amberAtOrAbove },
  { key: "BOOKING.slotMinutes", policy: BOOKING.slotMinutes },
  { key: "BOOKING.minMinutes", policy: BOOKING.minMinutes },
  { key: "BOOKING.maxMinutes", policy: BOOKING.maxMinutes },
  { key: "BOOKING.graceBeforeMinutes", policy: BOOKING.graceBeforeMinutes },
  { key: "BOOKING.graceAfterMinutes", policy: BOOKING.graceAfterMinutes },
  { key: "BOOKING.maxAheadHours", policy: BOOKING.maxAheadHours },
  { key: "BOOKING.maxLiveBookingsPerDriver", policy: BOOKING.maxLiveBookingsPerDriver },
];
