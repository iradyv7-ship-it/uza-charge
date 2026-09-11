/**
 * UZA EMPOWER — pure money maths for driver financing and the saving companion.
 *
 * Rules:
 *  - Every amount is an integer minor unit. No floats leave this module.
 *  - No business number is written here: everything comes from
 *    `src/config/policy.ts`, and every result carries a `trace` naming the rule
 *    that produced it plus the rule version.
 *  - UZA never holds a driver's money. These functions score a RECORD of what
 *    the driver paid on their own MoMo or in cash.
 */

import { EMPOWER, REVENUE_SPLIT_DEFAULTS } from "@/config/policy";

export const EMPOWER_RULE_VERSION = 1;

export type Cadence = "daily" | "weekly" | "monthly" | "per_contract";

/* ------------------------------------------------------------------ */
/* 1. The deposit bridge                                               */
/* ------------------------------------------------------------------ */

export type FinancePlan = {
  /** UZA selling price per vehicle — fixed input. */
  vehiclePriceMinor: number;
  /** What the driver brings in cash. */
  contributionMinor: number;
  /** Price the bank finances against, after grossing up the missing deposit. */
  financedTotalMinor: number;
  /** Full deposit the bank sees. */
  depositMinor: number;
  /** What UZA fronts so the bank always sees a full deposit. */
  bridgeMinor: number;
  /** What the driver borrows and repays in full. */
  principalMinor: number;
  depositBps: number;
  termMonths: number;
  collateralReleaseMonth: number;
  ruleVersion: number;
  trace: string[];
};

/**
 * total = (price − contribution) / (1 − depositBps)
 * so that deposit = depositBps × total, and principal + contribution = price.
 */
export function financePlan(input: {
  vehiclePriceMinor?: number;
  contributionMinor: number;
  depositBps?: number;
  termMonths?: number;
  collateralReleaseMonth?: number;
}): FinancePlan {
  const vehiclePriceMinor = Math.round(input.vehiclePriceMinor ?? EMPOWER.vehiclePriceMinor.value);
  const contributionMinor = Math.max(0, Math.round(input.contributionMinor));
  const depositBps = input.depositBps ?? EMPOWER.bankDepositBps.value;
  const termMonths = input.termMonths ?? EMPOWER.termMonths.value;
  const collateralReleaseMonth =
    input.collateralReleaseMonth ?? EMPOWER.collateralReleaseMonth.value;

  if (contributionMinor > vehiclePriceMinor)
    throw new Error("Client contribution cannot exceed the vehicle price");
  if (depositBps < 0 || depositBps >= 10_000)
    throw new Error("Deposit basis points must be between 0 and 10000");

  const financedTotalMinor = Math.round(
    ((vehiclePriceMinor - contributionMinor) * 10_000) / (10_000 - depositBps),
  );
  const depositMinor = Math.round((financedTotalMinor * depositBps) / 10_000);
  const bridgeMinor = Math.max(0, depositMinor - contributionMinor);
  // The invariant is the definition of the principal, never a rounded residual.
  const principalMinor = vehiclePriceMinor - contributionMinor;

  return {
    vehiclePriceMinor,
    contributionMinor,
    financedTotalMinor,
    depositMinor,
    bridgeMinor,
    principalMinor,
    depositBps,
    termMonths,
    collateralReleaseMonth,
    ruleVersion: EMPOWER_RULE_VERSION,
    trace: [
      `vehicle price fixed at ${vehiclePriceMinor} (EMPOWER.vehiclePriceMinor)`,
      `financed total = (price − contribution) / (1 − ${depositBps}bps)`,
      `deposit = ${depositBps}bps × financed total; UZA bridges ${bridgeMinor}`,
      `principal = price − contribution (driver repays 100% of his own loan)`,
      `term ${termMonths} months, collateral released at month ${collateralReleaseMonth}`,
    ],
  };
}

/** Contribution floor, and whether the driver's evidence earns an exemption. */
export function contributionFloorMinor(readinessScore: number | null): number {
  if (readinessScore !== null && readinessScore >= EMPOWER.zeroContributionAtOrAbove.value) return 0;
  return EMPOWER.minClientContributionMinor.value;
}

/* ------------------------------------------------------------------ */
/* 2. Instalment and targets                                           */
/* ------------------------------------------------------------------ */

/** Reducing-balance annuity instalment. Interest is indicative until a bank offers. */
export function monthlyInstalmentMinor(
  principalMinor: number,
  termMonths = EMPOWER.termMonths.value,
  annualInterestBps = EMPOWER.annualInterestBps.value,
): number {
  if (termMonths <= 0) throw new Error("Term must be at least one month");
  if (principalMinor <= 0) return 0;
  const monthlyRate = annualInterestBps / 10_000 / 12;
  if (monthlyRate === 0) return Math.round(principalMinor / termMonths);
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return Math.round((principalMinor * monthlyRate * factor) / (factor - 1));
}

/**
 * What the driver must put aside per period to meet the monthly instalment.
 * Taxi drivers aim daily; a contracted driver aligns to their payment date.
 */
export function targetPerPeriodMinor(
  monthlyAmountMinor: number,
  cadence: Cadence,
  opts?: { workingDaysPerMonth?: number; daysUntilContractPayment?: number },
): number {
  const workingDaysPerMonth = opts?.workingDaysPerMonth ?? EMPOWER.workingDaysPerMonth.value;
  const weeksPerMonth = workingDaysPerMonth / EMPOWER.workingDaysPerWeek.value;
  switch (cadence) {
    case "daily":
      return Math.ceil(monthlyAmountMinor / workingDaysPerMonth);
    case "weekly":
      return Math.ceil(monthlyAmountMinor / weeksPerMonth);
    case "monthly":
      return Math.round(monthlyAmountMinor);
    case "per_contract": {
      const days = Math.max(1, opts?.daysUntilContractPayment ?? workingDaysPerMonth);
      return Math.ceil(monthlyAmountMinor / days);
    }
  }
}

/** Split a period target across the driver's pots by weight, last pot absorbs rounding. */
export function splitAcrossPots(
  targetMinor: number,
  pots: ReadonlyArray<{ id: string; weightBps: number }>,
): Array<{ id: string; amountMinor: number }> {
  const totalBps = pots.reduce((s, p) => s + p.weightBps, 0);
  if (pots.length === 0 || totalBps <= 0) return [];
  let assigned = 0;
  return pots.map((pot, i) => {
    const last = i === pots.length - 1;
    const amountMinor = last
      ? targetMinor - assigned
      : Math.round((targetMinor * pot.weightBps) / totalBps);
    assigned += amountMinor;
    return { id: pot.id, amountMinor };
  });
}

/** Default pot weights from policy, as basis points keyed by category. */
export function defaultPotWeights(): Array<{ category: string; weightBps: number }> {
  return Object.entries(EMPOWER.potAllocationBps.value).map(([category, weightBps]) => ({
    category,
    weightBps,
  }));
}

/* ------------------------------------------------------------------ */
/* 3. Discipline — measured only, never invented                       */
/* ------------------------------------------------------------------ */

export type Entry = {
  occurredOn: string; // YYYY-MM-DD, Africa/Kigali
  amountMinor: number;
  kind?: "credit" | "reversal";
  potId?: string | null;
};

/** Net recorded amount per day, reversals subtracted. */
export function dailyTotals(entries: ReadonlyArray<Entry>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const sign = e.kind === "reversal" ? -1 : 1;
    out.set(e.occurredOn, (out.get(e.occurredOn) ?? 0) + sign * Math.round(e.amountMinor));
  }
  return out;
}

export function netTotalMinor(entries: ReadonlyArray<Entry>): number {
  let total = 0;
  for (const [, v] of dailyTotals(entries)) total += v;
  return total;
}

export type Discipline = {
  /** Days in the window that met their target. */
  daysOnTarget: number;
  /** Days in the window with any record at all. */
  daysRecorded: number;
  windowDays: number;
  /** Share of the expected amount actually recorded, 0–100, capped at 100. */
  disciplinePct: number;
  savedMinor: number;
  expectedMinor: number;
  /** Positive = ahead of the loan, negative = behind. Whole days of target. */
  daysAhead: number;
  /** Consecutive days meeting the target, counting back from the latest day. */
  streakDays: number;
  /** True only when there is enough record to say anything. */
  measurable: boolean;
};

/**
 * Compare what was recorded against what the daily target expected, over a
 * window of calendar days ending on `today`. Days with no record count as zero
 * — the whole point is that a missed day shows.
 */
export function discipline(input: {
  entries: ReadonlyArray<Entry>;
  dailyTargetMinor: number;
  today: string;
  windowDays: number;
}): Discipline {
  const { dailyTargetMinor, today, windowDays } = input;
  const totals = dailyTotals(input.entries);
  const days = windowBack(today, windowDays);

  let savedMinor = 0;
  let daysOnTarget = 0;
  let daysRecorded = 0;
  for (const day of days) {
    const amount = totals.get(day) ?? 0;
    savedMinor += amount;
    if (amount > 0) daysRecorded += 1;
    if (dailyTargetMinor > 0 && amount >= dailyTargetMinor) daysOnTarget += 1;
  }

  const expectedMinor = dailyTargetMinor * windowDays;
  let streakDays = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const amount = totals.get(days[i] as string) ?? 0;
    if (dailyTargetMinor > 0 && amount >= dailyTargetMinor) streakDays += 1;
    else break;
  }

  return {
    daysOnTarget,
    daysRecorded,
    windowDays,
    disciplinePct:
      expectedMinor > 0 ? Math.min(100, Math.round((savedMinor / expectedMinor) * 100)) : 0,
    savedMinor,
    expectedMinor,
    daysAhead:
      dailyTargetMinor > 0 ? Math.trunc((savedMinor - expectedMinor) / dailyTargetMinor) : 0,
    streakDays,
    measurable: daysRecorded > 0,
  };
}

/** Inclusive list of ISO days ending at `today`, oldest first. */
export function windowBack(today: string, days: number): string[] {
  const out: string[] = [];
  const end = new Date(`${today}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Monday-based ISO week key, for the weekly report. */
export function weekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export type WeeklyRow = {
  weekStart: string;
  savedMinor: number;
  targetMinor: number;
  daysRecorded: number;
  metTarget: boolean;
};

/** Week-by-week record for the driver's weekly report and the bank's view. */
export function weeklyReport(input: {
  entries: ReadonlyArray<Entry>;
  dailyTargetMinor: number;
  today: string;
  weeks: number;
}): WeeklyRow[] {
  const totals = dailyTotals(input.entries);
  const days = windowBack(input.today, input.weeks * 7);
  const byWeek = new Map<string, { saved: number; days: number; target: number }>();
  for (const day of days) {
    const key = weekKey(day);
    const row = byWeek.get(key) ?? { saved: 0, days: 0, target: 0 };
    const amount = totals.get(day) ?? 0;
    row.saved += amount;
    row.target += input.dailyTargetMinor;
    if (amount > 0) row.days += 1;
    byWeek.set(key, row);
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, r]) => ({
      weekStart,
      savedMinor: r.saved,
      targetMinor: r.target,
      daysRecorded: r.days,
      metTarget: r.target > 0 && r.saved >= r.target,
    }));
}

/* ------------------------------------------------------------------ */
/* 4. Bank readiness — the evidence we hand a bank                     */
/* ------------------------------------------------------------------ */

export type Readiness = {
  score: number; // 0–100
  band: "green" | "amber" | "red";
  qualifiesForZeroContribution: boolean;
  parts: { training: number; discipline: number; recordLength: number; arrears: number };
  measurable: boolean;
  reasons: string[];
};

export function bankReadiness(input: {
  requiredTrainingCount: number;
  completedRequiredTrainingCount: number;
  disciplinePct: number;
  recordDays: number;
  missedInstalments: number;
}): Readiness {
  const w = EMPOWER.readinessWeights.value;
  const trainingShare =
    input.requiredTrainingCount > 0
      ? Math.min(1, input.completedRequiredTrainingCount / input.requiredTrainingCount)
      : 0;
  const recordShare = Math.min(1, input.recordDays / EMPOWER.matureRecordDays.value);
  const arrearsShare = input.missedInstalments <= 0 ? 1 : Math.max(0, 1 - input.missedInstalments / 3);

  const parts = {
    training: Math.round(trainingShare * w.training),
    discipline: Math.round(Math.min(1, input.disciplinePct / 100) * w.discipline),
    recordLength: Math.round(recordShare * w.recordLength),
    arrears: Math.round(arrearsShare * w.arrears),
  };
  const score = parts.training + parts.discipline + parts.recordLength + parts.arrears;
  const measurable = input.recordDays > 0;

  const reasons: string[] = [];
  if (!measurable) reasons.push("No saving recorded yet — nothing can be scored.");
  if (trainingShare < 1) reasons.push("Required training not finished.");
  if (input.disciplinePct < 80) reasons.push("Daily saving is below target.");
  if (recordShare < 1)
    reasons.push(`Track record is ${input.recordDays} of ${EMPOWER.matureRecordDays.value} days.`);
  if (input.missedInstalments > 0) reasons.push(`${input.missedInstalments} instalment(s) missed.`);

  return {
    score: measurable ? score : 0,
    band: !measurable ? "red" : score >= 75 ? "green" : score >= 50 ? "amber" : "red",
    qualifiesForZeroContribution:
      measurable && score >= EMPOWER.zeroContributionAtOrAbove.value && trainingShare === 1,
    parts,
    measurable,
    reasons,
  };
}

/* ------------------------------------------------------------------ */
/* 5. Loan position                                                    */
/* ------------------------------------------------------------------ */

export type LoanPosition = {
  monthsElapsed: number;
  scheduledToDateMinor: number;
  paidToDateMinor: number;
  aheadMinor: number;
  missedInstalments: number;
  outstandingMinor: number;
  collateralReleased: boolean;
  monthsToCollateralRelease: number;
};

export function loanPosition(input: {
  principalMinor: number;
  instalmentMinor: number;
  paidToDateMinor: number;
  startOn: string;
  today: string;
  termMonths?: number;
  collateralReleaseMonth?: number;
}): LoanPosition {
  const termMonths = input.termMonths ?? EMPOWER.termMonths.value;
  const releaseMonth = input.collateralReleaseMonth ?? EMPOWER.collateralReleaseMonth.value;
  const start = new Date(`${input.startOn}T00:00:00Z`);
  const now = new Date(`${input.today}T00:00:00Z`);
  const rawMonths =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth()) +
    (now.getUTCDate() >= start.getUTCDate() ? 0 : -1);
  const monthsElapsed = Math.max(0, Math.min(termMonths, rawMonths));
  const scheduledToDateMinor = monthsElapsed * input.instalmentMinor;
  const aheadMinor = input.paidToDateMinor - scheduledToDateMinor;

  return {
    monthsElapsed,
    scheduledToDateMinor,
    paidToDateMinor: input.paidToDateMinor,
    aheadMinor,
    missedInstalments:
      input.instalmentMinor > 0 && aheadMinor < 0
        ? Math.floor(-aheadMinor / input.instalmentMinor)
        : 0,
    outstandingMinor: Math.max(
      0,
      input.instalmentMinor * termMonths - input.paidToDateMinor,
    ),
    collateralReleased: monthsElapsed >= releaseMonth,
    monthsToCollateralRelease: Math.max(0, releaseMonth - monthsElapsed),
  };
}

/**
 * Energy cost the driver should budget per day, so the electricity pot target is
 * grounded in the same wholesale figure the settlement engine uses.
 */
export function dailyEnergyBudgetMinor(kwhPerDay: number): number {
  return Math.round(kwhPerDay * REVENUE_SPLIT_DEFAULTS.energyCostMinorPerKwh.value);
}
