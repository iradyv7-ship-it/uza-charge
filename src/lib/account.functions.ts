import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ensures the signed-in user has a profile, a driver record and at least the
 * driver role. The very first account on a fresh network is also provisioned
 * as operator + UZA admin so the console is reachable.
 */
export const ensureAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const email = (context.claims as { email?: string }).email ?? null;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, full_name: email?.split("@")[0] ?? "UZA user" }, { onConflict: "id" });

    const { data: existingDriver } = await supabaseAdmin
      .from("drivers")
      .select("id, wallet_balance_rwf, default_pay_method, full_name, phone")
      .eq("user_id", userId)
      .maybeSingle();

    let driver = existingDriver;
    if (!driver) {
      const { data: created } = await supabaseAdmin
        .from("drivers")
        .insert({
          user_id: userId,
          full_name: email?.split("@")[0] ?? "UZA driver",
          wallet_balance_rwf: 5000,
          default_pay_method: "momo",
        })
        .select("id, wallet_balance_rwf, default_pay_method, full_name, phone")
        .maybeSingle();
      driver = created ?? null;
    }

    const { count: adminCount } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    const roles: Array<"driver" | "operator" | "admin"> =
      (adminCount ?? 0) === 0 ? ["driver", "operator", "admin"] : ["driver"];

    for (const role of roles) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
    }

    const { data: allRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    return {
      userId,
      email,
      driver,
      roles: (allRoles ?? []).map((r) => r.role as string),
    };
  });
