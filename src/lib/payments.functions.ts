import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PREAUTH_AMOUNT_MINOR } from "@/config/policy";

/**
 * Mobile-money money movement: pre-authorise before the session, reconcile the
 * measured kWh afterwards, then capture the shortfall or refund the excess.
 *
 * A payment reaches `captured` ONLY when MTN MoMo or Airtel Money reports
 * success. Without merchant credentials every call returns
 * `configured: false` and the row stays `pending` — the app never pretends
 * money moved.
 */

const RAIL = z.enum(["momo", "airtel"]);

/** Step 1 — hold funds on the driver's mobile money account before charging. */
export const preauthoriseSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid().optional(),
        rail: RAIL,
        phone: z.string().min(9).max(20),
        amountMinor: z.number().int().min(100).max(50_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rails = await import("./payments.server");

    const phone = rails.normalisePhone(data.phone);
    const amountMinor = data.amountMinor ?? PREAUTH_AMOUNT_MINOR.value;

    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!driver) throw new Error("No driver profile found for this account");

    if (data.sessionId) {
      const { data: session } = await supabaseAdmin
        .from("sessions")
        .select("id, driver_id")
        .eq("id", data.sessionId)
        .maybeSingle();
      if (!session || session.driver_id !== driver.id) throw new Error("Session not found");
    }

    const reference = rails.newReference();
    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .insert({
        driver_id: driver.id,
        session_id: data.sessionId ?? null,
        method: data.rail,
        kind: "preauth",
        payer_phone: phone,
        amount_rwf: Math.round(amountMinor / 100),
        amount_minor: amountMinor,
        authorized_minor: 0,
        status: "pending",
        provider_ref: reference,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const result = await rails.collect(supabaseAdmin, data.rail, {
      phone,
      amountMinor,
      reference,
      note: "UZA Charge session hold",
      paymentId: payment.id,
    });

    await supabaseAdmin
      .from("payments")
      .update({
        status: result.status === "successful" ? "authorized" : result.status === "failed" ? "failed" : "pending",
        authorized_minor: result.status === "successful" ? amountMinor : 0,
        provider_status: result.providerStatus ?? (result.configured ? null : "UNCONFIGURED"),
        failure_reason: result.error ?? null,
      })
      .eq("id", payment.id);

    return {
      paymentId: payment.id,
      providerRef: reference,
      configured: result.configured,
      status: result.status,
      amountMinor,
      message: result.configured
        ? result.status === "successful"
          ? "Hold confirmed by the mobile money network."
          : result.status === "pending"
            ? "Approve the request on your phone. This screen updates when the network confirms it."
            : (result.error ?? "The mobile money network refused the request.")
        : "Mobile money credentials are not configured yet, so no money has moved. The hold is recorded as pending.",
    };
  });

/** Ask the provider what actually happened. Only the provider can confirm. */
export const pollPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rails = await import("./payments.server");

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, method, kind, provider_ref, amount_minor, status, drivers(user_id)")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment) throw new Error("Payment not found");
    if ((payment.drivers as { user_id: string } | null)?.user_id !== context.userId)
      throw new Error("Not your payment");
    if (!payment.provider_ref || payment.method === "wallet")
      return { status: payment.status, configured: false };

    const result = await rails.checkStatus(
      supabaseAdmin,
      payment.method as "momo" | "airtel",
      payment.provider_ref,
      payment.id,
    );

    const next =
      result.status === "successful"
        ? payment.kind === "preauth"
          ? "authorized"
          : payment.kind === "refund"
            ? "refunded"
            : "captured"
        : result.status === "failed"
          ? "failed"
          : payment.status;

    await supabaseAdmin
      .from("payments")
      .update({
        status: next,
        provider_status: result.providerStatus ?? null,
        failure_reason: result.error ?? null,
        ...(result.status === "successful" && payment.kind === "preauth"
          ? { authorized_minor: Number(payment.amount_minor) }
          : {}),
        ...(result.status === "successful" && payment.kind === "capture"
          ? { captured_minor: Number(payment.amount_minor) }
          : {}),
        ...(result.status === "successful" && payment.kind === "refund"
          ? { refunded_minor: Number(payment.amount_minor) }
          : {}),
      })
      .eq("id", payment.id);

    return { status: next, configured: result.configured, providerStatus: result.providerStatus ?? null };
  });

/**
 * Step 2 — after the session stops, reconcile the measured total against the
 * hold: collect the shortfall, or refund the difference. Returns the ledger
 * decision so the UI can show exactly what happened.
 */
export const reconcileSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rails = await import("./payments.server");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, status, total_minor, cost_rwf, driver_id, drivers(user_id, phone)")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Session not found");
    const driver = session.drivers as { user_id: string; phone: string | null } | null;
    if (driver?.user_id !== context.userId) throw new Error("Not your session");
    if (session.status !== "completed") throw new Error("Session is still running");

    const totalMinor = Number(session.total_minor ?? 0) || Math.round(Number(session.cost_rwf ?? 0) * 100);

    const { data: rows } = await supabaseAdmin
      .from("payments")
      .select("id, kind, status, method, payer_phone, provider_ref, authorized_minor, captured_minor, refunded_minor")
      .eq("session_id", session.id);

    const payments = rows ?? [];
    const hold = payments.find((p) => p.kind === "preauth" && p.status === "authorized");
    const authorised = Number(hold?.authorized_minor ?? 0);
    const captured = payments
      .filter((p) => p.kind === "capture" && p.status === "captured")
      .reduce((a, p) => a + Number(p.captured_minor ?? 0), 0);
    const outstanding = totalMinor - authorised - captured;

    // Nothing left to move — the hold already covers the measured total.
    if (Math.abs(outstanding) < 100) {
      return { action: "balanced" as const, totalMinor, authorised, outstanding: 0, configured: true, message: "The hold covers the measured total." };
    }

    const rail = (hold?.method ?? "momo") as "momo" | "airtel";
    const phone = hold?.payer_phone ?? driver?.phone ?? null;
    if (!phone)
      return {
        action: "blocked" as const,
        totalMinor,
        authorised,
        outstanding,
        configured: false,
        message: "No mobile money number on file for this driver.",
      };

    const reference = rails.newReference();
    const isRefund = outstanding < 0;
    const amountMinor = Math.abs(outstanding);

    const { data: row, error } = await supabaseAdmin
      .from("payments")
      .insert({
        driver_id: session.driver_id,
        session_id: session.id,
        method: rail,
        kind: isRefund ? "refund" : "capture",
        payer_phone: rails.normalisePhone(phone),
        amount_rwf: Math.round(amountMinor / 100),
        amount_minor: amountMinor,
        status: "pending",
        provider_ref: reference,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const result = isRefund
      ? await rails.refund(supabaseAdmin, rail, {
          phone: rails.normalisePhone(phone),
          amountMinor,
          reference,
          note: "UZA Charge refund",
          originalRef: hold?.provider_ref ?? reference,
          paymentId: row.id,
        })
      : await rails.collect(supabaseAdmin, rail, {
          phone: rails.normalisePhone(phone),
          amountMinor,
          reference,
          note: "UZA Charge session balance",
          paymentId: row.id,
        });

    await supabaseAdmin
      .from("payments")
      .update({
        status:
          result.status === "successful"
            ? isRefund
              ? "refunded"
              : "captured"
            : result.status === "failed"
              ? "failed"
              : "pending",
        provider_status: result.providerStatus ?? (result.configured ? null : "UNCONFIGURED"),
        failure_reason: result.error ?? null,
        ...(result.status === "successful"
          ? isRefund
            ? { refunded_minor: amountMinor }
            : { captured_minor: amountMinor }
          : {}),
      })
      .eq("id", row.id);

    return {
      action: isRefund ? ("refund" as const) : ("capture" as const),
      totalMinor,
      authorised,
      outstanding,
      configured: result.configured,
      paymentId: row.id,
      message: result.configured
        ? result.status === "successful"
          ? isRefund
            ? "Difference refunded to your mobile money."
            : "Balance captured from your mobile money."
          : result.status === "pending"
            ? "Waiting for the mobile money network to confirm."
            : (result.error ?? "The mobile money network refused the request.")
        : "Mobile money credentials are not configured yet — this balance is recorded as pending, not paid.",
    };
  });

/** Which rails can actually move money right now. Drives honest UI copy. */
export const railStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { railConfigured } = await import("./payments.server");
  return { momo: railConfigured("momo"), airtel: railConfigured("airtel") };
});
