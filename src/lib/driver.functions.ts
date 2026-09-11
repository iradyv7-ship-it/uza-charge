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

    const { data: open } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .eq("driver_id", driver.id)
      .in("status", ["preparing", "charging", "finishing"])
      .maybeSingle();
    if (open) return { sessionId: open.id, alreadyCharging: true };

    const { data: connector } = await supabaseAdmin
      .from("connectors")
      .select("id, status, charger_id, chargers(status)")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (!connector) throw new Error("Connector not found");
    if ((connector.chargers as { status: string } | null)?.status !== "online")
      throw new Error("Charger is not online");
    if (!["available", "preparing"].includes(connector.status))
      throw new Error("Connector is not available");

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        connector_id: connector.id,
        driver_id: driver.id,
        start_method: data.startMethod,
        status: "charging",
        soc_start: Math.round(18 + Math.random() * 32),
        vin: data.vin ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("connectors").update({ status: "charging" }).eq("id", connector.id);
    await supabaseAdmin.from("charger_events").insert({
      charger_id: connector.charger_id,
      type: "StartTransaction",
      payload: { session_id: session.id, id_tag: driver.id, start_method: data.startMethod },
    });

    return { sessionId: session.id, alreadyCharging: false };
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

    await supabaseAdmin
      .from("sessions")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        stop_reason_code: "Local",
      })
      .eq("id", session.id);

    // Price it from its own meter readings, under the tariff in force when it started.
    const { settleSession } = await import("./settlement.server");
    const settled = await settleSession(supabaseAdmin as never, session.id);

    await supabaseAdmin
      .from("connectors")
      .update({ status: "available" })
      .eq("id", session.connector_id);

    await supabaseAdmin.from("transactions").insert({
      session_id: session.id,
      tier_breakdown: Object.fromEntries(
        (settled?.charge.tiers ?? []).map((t) => [t.tier, t.amountMinor]),
      ),
      meter_start: 0,
      meter_stop: settled?.charge.energyKwh ?? 0,
      total_kwh: settled?.charge.energyKwh ?? 0,
      total_rwf: Math.round((settled?.charge.totalMinor ?? 0) / 100),
      settled: false,
    });

    await supabaseAdmin.from("charger_events").insert({
      charger_id: (session.connectors as { charger_id: string } | null)?.charger_id ?? null,
      type: "StopTransaction",
      payload: { session_id: session.id, reason: "Local" },
    });

    return {
      totalMinor: settled?.charge.totalMinor ?? 0,
      totalKwh: settled?.charge.energyKwh ?? 0,
      receiptNumber: settled?.receiptNumber ?? null,
    };
  });

/**
 * Settle a finished session.
 *  - `wallet` moves internal UZA balance and settles immediately.
 *  - `momo` / `airtel` push a real collection request to the rail. The payment
 *    stays `pending` until MTN or Airtel confirms; it is NEVER marked settled
 *    on our side, because a fake confirmation is exactly the scam we protect
 *    drivers from.
 */
export const paySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        method: z.enum(["momo", "airtel", "wallet"]),
        phone: z.string().min(9).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id, wallet_balance_rwf, phone")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, cost_rwf, total_minor, driver_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.driver_id !== driver.id) throw new Error("Session not found");
    if (session.status !== "completed") throw new Error("Session is still running");

    const amountMinor =
      Number(session.total_minor ?? 0) || Math.round(Number(session.cost_rwf ?? 0) * 100);
    const amount = Math.round(amountMinor / 100);

    if (data.method === "wallet") {
      if (Number(driver.wallet_balance_rwf) < amount)
        throw new Error("Wallet balance is too low — top up first");
      await supabaseAdmin
        .from("drivers")
        .update({ wallet_balance_rwf: Number(driver.wallet_balance_rwf) - amount })
        .eq("id", driver.id);

      const { data: row } = await supabaseAdmin
        .from("payments")
        .insert({
          driver_id: driver.id,
          session_id: session.id,
          method: "wallet",
          kind: "capture",
          amount_rwf: amount,
          amount_minor: amountMinor,
          captured_minor: amountMinor,
          status: "settled",
          provider_ref: `WALLET-${session.id.slice(0, 8).toUpperCase()}`,
        })
        .select("id, provider_ref")
        .single();
      await supabaseAdmin.from("transactions").update({ settled: true }).eq("session_id", session.id);
      return {
        amount,
        providerRef: row?.provider_ref ?? "",
        method: "wallet" as const,
        status: "settled" as const,
        configured: true,
        message: "Paid from your UZA wallet.",
      };
    }

    const rails = await import("./payments.server");
    const phone = rails.normalisePhone(data.phone ?? driver.phone ?? "");
    const reference = rails.newReference();

    const { data: row, error } = await supabaseAdmin
      .from("payments")
      .insert({
        driver_id: driver.id,
        session_id: session.id,
        method: data.method,
        kind: "capture",
        payer_phone: phone,
        amount_rwf: amount,
        amount_minor: amountMinor,
        status: "pending",
        provider_ref: reference,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const result = await rails.collect(supabaseAdmin, data.method, {
      phone,
      amountMinor,
      reference,
      note: "UZA Charge session",
      paymentId: row.id,
    });

    await supabaseAdmin
      .from("payments")
      .update({
        status: result.status === "successful" ? "captured" : result.status === "failed" ? "failed" : "pending",
        captured_minor: result.status === "successful" ? amountMinor : 0,
        provider_status: result.providerStatus ?? (result.configured ? null : "UNCONFIGURED"),
        failure_reason: result.error ?? null,
      })
      .eq("id", row.id);

    if (result.status === "successful")
      await supabaseAdmin.from("transactions").update({ settled: true }).eq("session_id", session.id);

    return {
      amount,
      providerRef: reference,
      method: data.method,
      paymentId: row.id,
      status: result.status,
      configured: result.configured,
      message: result.configured
        ? result.status === "successful"
          ? "Confirmed by the mobile money network."
          : result.status === "pending"
            ? "Approve the request on your phone. Only a network confirmation counts as paid."
            : (result.error ?? "The mobile money network refused the request.")
        : "Mobile money is not connected yet, so no money has moved. This payment is recorded as pending.",
    };
  });

/**
 * Wallet top-up over MoMo / Airtel. The balance is credited ONLY when the rail
 * confirms the collection — never on request.
 */
export const topUpWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        amountRwf: z.number().int().min(500).max(500000),
        method: z.enum(["momo", "airtel"]),
        phone: z.string().min(9).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rails = await import("./payments.server");

    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id, wallet_balance_rwf, phone")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found");

    const phone = rails.normalisePhone(data.phone ?? driver.phone ?? "");
    const amountMinor = data.amountRwf * 100;
    const reference = rails.newReference();

    const { data: row, error } = await supabaseAdmin
      .from("payments")
      .insert({
        driver_id: driver.id,
        session_id: null,
        method: data.method,
        kind: "topup",
        payer_phone: phone,
        amount_rwf: data.amountRwf,
        amount_minor: amountMinor,
        status: "pending",
        provider_ref: reference,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const result = await rails.collect(supabaseAdmin, data.method, {
      phone,
      amountMinor,
      reference,
      note: "UZA wallet top-up",
      paymentId: row.id,
    });

    let balance = Number(driver.wallet_balance_rwf);
    if (result.status === "successful") {
      balance += data.amountRwf;
      await supabaseAdmin.from("drivers").update({ wallet_balance_rwf: balance }).eq("id", driver.id);
    }

    await supabaseAdmin
      .from("payments")
      .update({
        status: result.status === "successful" ? "captured" : result.status === "failed" ? "failed" : "pending",
        captured_minor: result.status === "successful" ? amountMinor : 0,
        provider_status: result.providerStatus ?? (result.configured ? null : "UNCONFIGURED"),
        failure_reason: result.error ?? null,
      })
      .eq("id", row.id);

    return {
      balance,
      paymentId: row.id,
      status: result.status,
      configured: result.configured,
      message: result.configured
        ? result.status === "successful"
          ? "Top-up confirmed. Balance updated."
          : result.status === "pending"
            ? "Approve the top-up on your phone. Your balance updates when the network confirms."
            : (result.error ?? "The mobile money network refused the top-up.")
        : "Mobile money is not connected yet, so your balance has not changed. The request is recorded as pending.",
    };
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
