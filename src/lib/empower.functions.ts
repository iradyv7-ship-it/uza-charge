import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPOWER } from "@/config/policy";
import {
  bankReadiness,
  contributionFloorMinor,
  discipline,
  financePlan,
  loanPosition,
  monthlyInstalmentMinor,
  netTotalMinor,
  targetPerPeriodMinor,
  weeklyReport,
  type Cadence,
  type Entry,
} from "@/lib/empower";

/** Today in Africa/Kigali, as YYYY-MM-DD. */
function kigaliToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kigali" });
}

const CADENCES = ["daily", "weekly", "monthly", "per_contract"] as const;

/* ------------------------------------------------------------------ */
/* Driver companion                                                    */
/* ------------------------------------------------------------------ */

/**
 * Everything the driver's money companion shows. Read through the caller's own
 * session, so RLS decides what is visible. Nothing is invented: with no records
 * the response says so.
 */
export const fetchEmpowerHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const today = kigaliToday();

    const { data: driver } = await sb
      .from("drivers")
      .select("id, full_name, phone")
      .eq("user_id", context.userId)
      .maybeSingle();

    const [{ data: programs }, { data: banks }] = await Promise.all([
      sb.from("training_programs").select("*").eq("active", true).order("sort_order"),
      sb.from("banks").select("*").eq("active", true).order("name"),
    ]);

    if (!driver) {
      return {
        driver: null,
        programs: programs ?? [],
        banks: banks ?? [],
        training: [],
        application: null,
        loan: null,
        pots: [],
        entries: [],
        today,
      } as const;
    }

    const [{ data: training }, { data: application }, { data: loan }, { data: pots }, { data: entries }] =
      await Promise.all([
        sb.from("training_records").select("*").eq("driver_id", driver.id),
        sb
          .from("finance_applications")
          .select("*, banks(name, code)")
          .eq("driver_id", driver.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from("loans")
          .select("*, banks(name, code)")
          .eq("driver_id", driver.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb.from("savings_pots").select("*").eq("driver_id", driver.id).order("sort_order"),
        sb
          .from("savings_entries")
          .select("*")
          .eq("driver_id", driver.id)
          .order("occurred_on", { ascending: false })
          .limit(400),
      ]);

    return {
      driver,
      programs: programs ?? [],
      banks: banks ?? [],
      training: training ?? [],
      application: application ?? null,
      loan: loan ?? null,
      pots: pots ?? [],
      entries: entries ?? [],
      today,
    } as const;
  });

/** Record money the driver already paid — on their own MoMo, or in cash by hand. */
export const recordSaving = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        potId: z.string().uuid(),
        amountRwf: z.number().int().min(100).max(5_000_000),
        source: z.enum(["momo_recorded", "airtel_recorded", "cash_manual", "bank_statement", "charging_payout"]),
        occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        note: z.string().trim().max(200).optional(),
        externalRef: z.string().trim().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: driver } = await sb
      .from("drivers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found for this account");

    const { data: pot } = await sb
      .from("savings_pots")
      .select("id, driver_id")
      .eq("id", data.potId)
      .maybeSingle();
    if (!pot || pot.driver_id !== driver.id) throw new Error("That saving pot is not yours");

    const { error } = await sb.from("savings_entries").insert({
      driver_id: driver.id,
      pot_id: data.potId,
      kind: "credit",
      amount_minor: data.amountRwf * 100,
      source: data.source,
      occurred_on: data.occurredOn ?? kigaliToday(),
      note: data.note ?? null,
      external_ref: data.externalRef ?? null,
      recorded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Correct a mistake without rewriting history: post a reversal. */
export const reverseSaving = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: entry } = await sb
      .from("savings_entries")
      .select("id, driver_id, pot_id, amount_minor, kind, occurred_on")
      .eq("id", data.entryId)
      .maybeSingle();
    if (!entry) throw new Error("Entry not found");
    if (entry.kind === "reversal") throw new Error("A reversal cannot itself be reversed");

    const { error } = await sb.from("savings_entries").insert({
      driver_id: entry.driver_id,
      pot_id: entry.pot_id,
      kind: "reversal",
      amount_minor: entry.amount_minor,
      source: "cash_manual",
      occurred_on: entry.occurred_on,
      note: "Correction of an earlier record",
      reversal_of: entry.id,
      recorded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Create or rename a pot. The driver names their own sub-accounts. */
export const upsertPot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(40),
        category: z.enum(["loan", "maintenance", "electricity", "opex", "insurance", "personal", "other"]),
        targetCadence: z.enum(["daily", "weekly", "monthly"]),
        targetRwf: z.number().int().min(0).max(5_000_000),
        active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: driver } = await sb
      .from("drivers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found for this account");

    const row = {
      driver_id: driver.id,
      name: data.name,
      category: data.category,
      target_cadence: data.targetCadence,
      target_minor: data.targetRwf * 100,
      active: data.active ?? true,
    };

    if (data.id) {
      const { error } = await sb.from("savings_pots").update(row).eq("id", data.id).eq("driver_id", driver.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await sb.from("savings_pots").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

/** Open the default set of pots for a driver who has none yet. */
export const openDefaultPots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ dailyTargetRwf: z.number().int().min(0).max(1_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: driver } = await sb
      .from("drivers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found for this account");

    const { count } = await sb
      .from("savings_pots")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id);
    if ((count ?? 0) > 0) return { created: 0 };

    const names: Record<string, string> = {
      loan: "Loan instalment",
      maintenance: "Maintenance",
      electricity: "Electricity",
      opex: "Running costs",
      personal: "My own savings",
    };
    const weights = EMPOWER.potAllocationBps.value as Record<string, number>;
    const rows = Object.entries(weights).map(([category, bps], i) => ({
      driver_id: driver.id,
      name: names[category] ?? category,
      category,
      target_cadence: "daily",
      target_minor: Math.round((data.dailyTargetRwf * 100 * bps) / 10_000),
      system_managed: category === "loan",
      sort_order: i,
    }));
    const { error } = await sb.from("savings_pots").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length };
  });

/** Ask to join a course. Completion and score are set by the assessor, never self-declared. */
export const enrolTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ programId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found for this account");

    const { error } = await supabaseAdmin
      .from("training_records")
      .upsert(
        { driver_id: driver.id, program_id: data.programId, status: "enrolled", started_on: kigaliToday() },
        { onConflict: "driver_id,program_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Submit a financing application. Every figure is recomputed here from
 * `src/lib/empower.ts` — the client cannot dictate a price, a bridge or a
 * principal, and the rule version used is stored on the row.
 */
export const submitFinanceApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bankId: z.string().uuid(),
        contributionRwf: z.number().int().min(0).max(22_500_000),
        cadence: z.enum(CADENCES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found for this account");

    const { data: bank } = await supabaseAdmin
      .from("banks")
      .select("id, deposit_bps, min_client_contribution_minor")
      .eq("id", data.bankId)
      .maybeSingle();
    if (!bank) throw new Error("Financing institution not found");

    // Evidence: training + recorded saving decide whether the cash floor applies.
    const [{ data: programs }, { data: training }, { data: entries }] = await Promise.all([
      supabaseAdmin.from("training_programs").select("id").eq("required_for_finance", true).eq("active", true),
      supabaseAdmin.from("training_records").select("program_id, status").eq("driver_id", driver.id),
      supabaseAdmin.from("savings_entries").select("occurred_on, amount_minor, kind").eq("driver_id", driver.id),
    ]);

    const requiredIds = new Set((programs ?? []).map((p) => p.id));
    const completed = (training ?? []).filter(
      (t) => t.status === "completed" && requiredIds.has(t.program_id),
    ).length;

    const today = kigaliToday();
    const rows: Entry[] = (entries ?? []).map((e) => ({
      occurredOn: e.occurred_on as string,
      amountMinor: Number(e.amount_minor),
      kind: e.kind as "credit" | "reversal",
    }));
    const days = new Set(rows.map((r) => r.occurredOn)).size;
    const indicativeDailyTarget = targetPerPeriodMinor(
      monthlyInstalmentMinor(EMPOWER.vehiclePriceMinor.value),
      "daily",
    );
    const disc = discipline({
      entries: rows,
      dailyTargetMinor: indicativeDailyTarget,
      today,
      windowDays: 30,
    });
    const readiness = bankReadiness({
      requiredTrainingCount: requiredIds.size,
      completedRequiredTrainingCount: completed,
      disciplinePct: disc.disciplinePct,
      recordDays: days,
      missedInstalments: 0,
    });

    const floor = Math.max(
      contributionFloorMinor(readiness.measurable ? readiness.score : null),
      readiness.qualifiesForZeroContribution ? 0 : Number(bank.min_client_contribution_minor),
    );
    const contributionMinor = data.contributionRwf * 100;
    if (contributionMinor < floor)
      throw new Error(
        `This bank needs at least RWF ${(floor / 100).toLocaleString("en-US")} from you until your training and saving record are strong enough.`,
      );

    const plan = financePlan({ contributionMinor, depositBps: Number(bank.deposit_bps) });
    const instalment = monthlyInstalmentMinor(plan.principalMinor, plan.termMonths);

    const { data: created, error } = await supabaseAdmin
      .from("finance_applications")
      .insert({
        driver_id: driver.id,
        bank_id: bank.id,
        vehicle_price_minor: plan.vehiclePriceMinor,
        client_contribution_minor: plan.contributionMinor,
        bridge_minor: plan.bridgeMinor,
        financed_total_minor: plan.financedTotalMinor,
        deposit_required_minor: plan.depositMinor,
        principal_minor: plan.principalMinor,
        term_months: plan.termMonths,
        collateral_release_month: plan.collateralReleaseMonth,
        status: "submitted",
        rule_version: plan.ruleVersion,
        submitted_at: new Date().toISOString(),
        trace: {
          trace: plan.trace,
          indicativeInstalmentMinor: instalment,
          cadence: data.cadence satisfies Cadence,
          readiness,
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { applicationId: created.id, plan, instalmentMinor: instalment, readiness };
  });

/* ------------------------------------------------------------------ */
/* Bank officer portfolio                                              */
/* ------------------------------------------------------------------ */

/**
 * What a bank officer sees: only clients financed by their own bank, with the
 * daily and weekly payment record instead of a single monthly figure.
 */
export const fetchBankPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const today = kigaliToday();

    const { data: memberships } = await sb.from("bank_members").select("bank_id, role");
    const { data: banks } = await sb.from("banks").select("*").order("name");

    const [{ data: applications }, { data: loans }] = await Promise.all([
      sb
        .from("finance_applications")
        .select("*, drivers(id, full_name, phone), banks(name, code)")
        .order("created_at", { ascending: false })
        .limit(200),
      sb.from("loans").select("*, drivers(id, full_name, phone), banks(name, code)").limit(200),
    ]);

    const driverIds = [...new Set((loans ?? []).map((l) => l.driver_id))];
    const { data: entries } = driverIds.length
      ? await sb
          .from("savings_entries")
          .select("driver_id, pot_id, amount_minor, kind, occurred_on, source")
          .in("driver_id", driverIds)
          .gte(
            "occurred_on",
            new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10),
          )
      : { data: [] as Array<Record<string, unknown>> };

    const clients = (loans ?? []).map((loan) => {
      const rows: Entry[] = (entries ?? [])
        .filter((e) => (e as { driver_id: string }).driver_id === loan.driver_id)
        .map((e) => ({
          occurredOn: (e as { occurred_on: string }).occurred_on,
          amountMinor: Number((e as { amount_minor: number }).amount_minor),
          kind: (e as { kind: "credit" | "reversal" }).kind,
        }));
      const dailyTarget = targetPerPeriodMinor(Number(loan.instalment_minor), "daily");
      const disc = discipline({ entries: rows, dailyTargetMinor: dailyTarget, today, windowDays: 30 });
      const position = loanPosition({
        principalMinor: Number(loan.principal_minor),
        instalmentMinor: Number(loan.instalment_minor),
        paidToDateMinor: Number(loan.paid_to_date_minor),
        startOn: loan.start_on as string,
        today,
        termMonths: Number(loan.term_months),
        collateralReleaseMonth: Number(loan.collateral_release_month),
      });
      return {
        loan,
        dailyTargetMinor: dailyTarget,
        recordedLast30Minor: netTotalMinor(rows),
        discipline: disc,
        position,
        weekly: weeklyReport({ entries: rows, dailyTargetMinor: dailyTarget, today, weeks: 6 }),
      };
    });

    return {
      today,
      isStaffView: (memberships ?? []).length === 0,
      banks: banks ?? [],
      applications: applications ?? [],
      clients,
    } as const;
  });
