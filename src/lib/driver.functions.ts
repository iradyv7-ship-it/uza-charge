import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Plug in and start charging on a specific connector. */
export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        connectorId: z.string().uuid(),
        startMethod: z.enum(["app", "rfid", "vin"]).default("app"),
        vin: z.string().max(24).optional(),
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

    // Single atomic call — see supabase/migrations/20260904090000_atomic_start_session.sql
    // for why this used to be three separate round trips (read status, insert session,
    // update connector) with no lock between them, and how two drivers could both pass
    // the availability check for the same connector before either write landed.
    //
    // The function returns a composite (session, already_charging) rather than the bare
    // session row, so "the driver already had this exact session open" is a value the
    // database states outright — not something this handler has to infer afterwards.
    const { data: result, error } = await supabaseAdmin.rpc("start_charging_session", {
      _driver_id: driver.id,
      _connector_id: data.connectorId,
      _start_method: data.startMethod,
      ...(data.vin ? { _vin: data.vin } : {}),
    });
    if (error) throw new Error(error.message);
    if (!result?.session) throw new Error("start_charging_session returned no session");

    return { sessionId: result.session.id, alreadyCharging: result.already_charging ?? false };
  });

/** Stop charging. Final cost is priced on the backend from meter values. */
export const stopSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, status, connector_id, driver_id, drivers(user_id), connectors(charger_id)")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Session not found");
    if ((session.drivers as { user_id: string } | null)?.user_id !== context.userId)
      throw new Error("Not your session");

    const { data: costData } = await supabaseAdmin.rpc("compute_session_cost", {
      _session_id: session.id,
    });
    const cost = (costData ?? {}) as { total_rwf?: number; total_kwh?: number; tiers?: unknown };

    await supabaseAdmin
      .from("sessions")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        stop_reason_code: "Local",
        cost_rwf: Number(cost.total_rwf ?? 0),
        kwh: Number(cost.total_kwh ?? 0),
      })
      .eq("id", session.id);

    await supabaseAdmin
      .from("connectors")
      .update({ status: "available" })
      .eq("id", session.connector_id);

    await supabaseAdmin.from("transactions").insert({
      session_id: session.id,
      tier_breakdown: (cost.tiers ?? {}) as Record<string, number>,
      meter_start: 0,
      meter_stop: Number(cost.total_kwh ?? 0),
      total_kwh: Number(cost.total_kwh ?? 0),
      total_rwf: Number(cost.total_rwf ?? 0),
      settled: false,
    });

    await supabaseAdmin.from("charger_events").insert({
      charger_id: (session.connectors as { charger_id: string } | null)?.charger_id ?? null,
      type: "StopTransaction",
      payload: { session_id: session.id, reason: "Local" },
    });

    return { totalRwf: Number(cost.total_rwf ?? 0), totalKwh: Number(cost.total_kwh ?? 0) };
  });

/** Sandbox mobile-money / wallet settlement for a finished session. */
export const paySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        method: z.enum(["momo", "airtel", "wallet"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id, wallet_balance_rwf")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, cost_rwf, driver_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.driver_id !== driver.id) throw new Error("Session not found");
    if (session.status !== "completed") throw new Error("Session is still running");

    const amount = Number(session.cost_rwf ?? 0);

    if (data.method === "wallet") {
      if (Number(driver.wallet_balance_rwf) < amount)
        throw new Error("Wallet balance is too low — top up first");
      await supabaseAdmin
        .from("drivers")
        .update({ wallet_balance_rwf: Number(driver.wallet_balance_rwf) - amount })
        .eq("id", driver.id);
    }

    const providerRef =
      (data.method === "momo" ? "MOMO-" : data.method === "airtel" ? "AIRT-" : "WALL-") +
      Math.random().toString(36).slice(2, 12).toUpperCase();

    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("session_id", session.id)
      .eq("driver_id", driver.id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("payments")
        .update({
          method: data.method,
          amount_rwf: amount,
          status: "settled",
          provider_ref: providerRef,
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("payments").insert({
        driver_id: driver.id,
        session_id: session.id,
        method: data.method,
        amount_rwf: amount,
        status: "settled",
        provider_ref: providerRef,
      });
    }

    await supabaseAdmin.from("transactions").update({ settled: true }).eq("session_id", session.id);

    return { amount, providerRef, method: data.method };
  });

/** Wallet top-up through MoMo / Airtel sandbox. */
export const topUpWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        amountRwf: z.number().int().min(500).max(500000),
        method: z.enum(["momo", "airtel"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id, wallet_balance_rwf")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found");

    const balance = Number(driver.wallet_balance_rwf) + data.amountRwf;
    await supabaseAdmin.from("drivers").update({ wallet_balance_rwf: balance }).eq("id", driver.id);
    await supabaseAdmin.from("payments").insert({
      driver_id: driver.id,
      session_id: null,
      method: data.method,
      amount_rwf: data.amountRwf,
      status: "settled",
      provider_ref: `TOPUP-${data.method.toUpperCase()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    });
    return { balance };
  });

/** Driver pay-method preference. */
export const setPayMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ method: z.enum(["momo", "airtel", "wallet"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("drivers")
      .update({ default_pay_method: data.method })
      .eq("user_id", context.userId);
    return { ok: true };
  });
