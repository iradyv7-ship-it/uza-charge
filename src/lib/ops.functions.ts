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
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden: operator or admin role required");

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
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden: operator or admin role required");

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
