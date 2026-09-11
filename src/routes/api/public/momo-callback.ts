import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * MTN MoMo Collections callback. MoMo does not sign this payload, so it is
 * treated as a hint only: we take the reference and re-query MoMo's own status
 * endpoint before touching a payment row. A forged callback can therefore never
 * mark a session paid.
 */

const Body = z
  .object({
    externalId: z.string().min(1).optional(),
    referenceId: z.string().min(1).optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const Route = createFileRoute("/api/public/momo-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rails = await import("@/lib/payments.server");
        const reference = parsed.referenceId ?? parsed.externalId;

        await rails.logPaymentEvent(supabaseAdmin, {
          provider: "momo",
          direction: "callback",
          action: "requesttopay-callback",
          providerRef: reference ?? null,
          payload: parsed as unknown,
        });

        if (!reference) return new Response("ok");

        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("id, kind, amount_minor")
          .eq("provider_ref", reference)
          .maybeSingle();
        if (!payment) return new Response("ok");

        const result = await rails.checkStatus(supabaseAdmin, "momo", reference, payment.id);
        if (result.status === "pending") return new Response("ok");

        const amount = Number(payment.amount_minor ?? 0);
        await supabaseAdmin
          .from("payments")
          .update({
            status:
              result.status === "successful"
                ? payment.kind === "preauth"
                  ? "authorized"
                  : payment.kind === "refund"
                    ? "refunded"
                    : "captured"
                : "failed",
            provider_status: result.providerStatus ?? null,
            failure_reason: result.error ?? null,
            ...(result.status === "successful"
              ? payment.kind === "preauth"
                ? { authorized_minor: amount }
                : payment.kind === "refund"
                  ? { refunded_minor: amount }
                  : { captured_minor: amount }
              : {}),
          })
          .eq("id", payment.id);

        return new Response("ok");
      },
    },
  },
});
