import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Queue an OCPP command. Writing to `charger_commands` is the ONLY way the
 * console talks to hardware — the simulator (or a real OCPP 1.6J server)
 * drains this outbox.
 */
export const queueCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        chargerId: z.string().uuid(),
        type: z.enum([
          "remote_start",
          "remote_stop",
          "reset",
          "unlock",
          "update_firmware",
          "set_max_power",
          "enable",
          "disable",
        ]),
        payload: z.record(z.unknown()).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Scoped to the charger's OWN operator, not "is this user staff of anything" —
    // see supabase/migrations/20260904093000_operator_scoping.sql. Without this, any
    // operator-role user could queue a remote command (including reset/unlock/
    // update_firmware) on another operator's charger.
    const { data: operatorId } = await context.supabase.rpc("operator_for_charger", {
      _charger_id: data.chargerId,
    });
    // No resolvable operator (e.g. an unknown charger id) is never staffable — same
    // outcome is_operator_staff() would give a null operator, checked here too so the
    // call below can stay typed as the non-nullable uuid it actually requires.
    const { data: allowed } = operatorId
      ? await context.supabase.rpc("is_operator_staff", {
          _user_id: context.userId,
          _operator_id: operatorId,
        })
      : { data: false };
    if (!allowed) throw new Error("Forbidden: not staff of this charger's operator");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cmd, error } = await supabaseAdmin
      .from("charger_commands")
      .insert({
        charger_id: data.chargerId,
        type: data.type,
        payload: data.payload as Record<string, never>,
        status: "queued",
        requested_by: context.userId,
      })
      .select("id, type, status")
      .single();
    if (error) throw new Error(error.message);
    return cmd;
  });

/** Mark a mobile-money payout as settled to the operator. */
export const settlePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Scoped to the payment's own operator — settling a payment is a revenue action, and
    // "any operator-role user can settle any operator's payment" was the exact gap this
    // migration closes. A null-session (wallet top-up) payment resolves to no operator,
    // so only global admin can settle one — see operator_for_payment()'s own comment.
    const { data: operatorId } = await context.supabase.rpc("operator_for_payment", {
      _payment_id: data.paymentId,
    });
    // A wallet top-up (no session) resolves to no operator — only global admin may
    // settle one, same as is_operator_staff() would decide with a null operator.
    const { data: allowed } = operatorId
      ? await context.supabase.rpc("is_operator_staff", {
          _user_id: context.userId,
          _operator_id: operatorId,
        })
      : { data: false };
    if (!allowed) throw new Error("Forbidden: not staff of this payment's operator");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .update({ status: "settled" })
      .eq("id", data.paymentId)
      .select("id, session_id")
      .single();
    if (error) throw new Error(error.message);
    if (payment.session_id) {
      await supabaseAdmin
        .from("transactions")
        .update({ settled: true })
        .eq("session_id", payment.session_id);
    }
    return { ok: true };
  });
