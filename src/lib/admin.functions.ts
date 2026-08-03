import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const operatorInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(80),
  momo_merchant_id: z.string().max(40).nullable().optional(),
  revenue_share_pct: z.number().min(0).max(100),
});

const stationInput = z.object({
  id: z.string().uuid().optional(),
  operator_id: z.string().uuid(),
  name: z.string().min(2).max(80),
  area: z.string().max(60).nullable().optional(),
  gps_lat: z.number().min(-90).max(90),
  gps_lng: z.number().min(-180).max(180),
  kind: z.enum(["180kW DC", "120kW DC", "22kW AC"]),
});

const chargerInput = z.object({
  id: z.string().uuid().optional(),
  station_id: z.string().uuid(),
  serial: z.string().min(3).max(40),
  vendor: z.string().max(40).nullable().optional(),
  model: z.string().max(40).nullable().optional(),
  connector_count: z.number().int().min(1).max(8),
  firmware_version: z.string().max(30).nullable().optional(),
  max_output_pct: z.number().int().min(10).max(100),
});

const rateInput = z.object({
  tariff_id: z.string().uuid(),
  tier: z.enum(["sharp", "peak", "standard", "valley"]),
  energy_rwf_per_kwh: z.number().min(0).max(5000),
  service_rwf_per_kwh: z.number().min(0).max(5000),
});

const driverInput = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(2).max(80),
  phone: z.string().max(20).nullable().optional(),
  wallet_balance_rwf: z.number().min(0).max(10_000_000),
  default_pay_method: z.enum(["momo", "airtel", "wallet"]),
});

export const saveOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => operatorInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: UZA admin role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("operators").upsert(
      {
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        momo_merchant_id: data.momo_merchant_id ?? null,
        revenue_share_pct: data.revenue_share_pct,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => stationInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: UZA admin role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("stations").upsert(
      {
        ...(data.id ? { id: data.id } : {}),
        operator_id: data.operator_id,
        name: data.name,
        area: data.area ?? null,
        gps_lat: data.gps_lat,
        gps_lng: data.gps_lng,
        kind: data.kind,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveCharger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => chargerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: UZA admin role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await supabaseAdmin
      .from("chargers")
      .upsert(
        {
          ...(data.id ? { id: data.id } : {}),
          station_id: data.station_id,
          serial: data.serial,
          vendor: data.vendor ?? null,
          model: data.model ?? null,
          connector_count: data.connector_count,
          firmware_version: data.firmware_version ?? null,
          max_output_pct: data.max_output_pct,
        },
        { onConflict: "id" },
      )
      .select("id, connector_count")
      .single();
    if (error) throw new Error(error.message);

    const { count } = await supabaseAdmin
      .from("connectors")
      .select("id", { count: "exact", head: true })
      .eq("charger_id", saved.id);
    const missing = saved.connector_count - (count ?? 0);
    for (let i = 0; i < missing; i += 1) {
      await supabaseAdmin.from("connectors").insert({
        charger_id: saved.id,
        label: `Gun ${String.fromCharCode(65 + (count ?? 0) + i)}`,
        type: data.station_id ? "CCS2" : "CCS2",
        power_kw: 120,
        status: "offline",
      });
    }
    return { ok: true };
  });

export const saveTariffRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: UZA admin role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tariff_rates")
      .upsert(data, { onConflict: "tariff_id,tier" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => driverInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: UZA admin role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("drivers")
      .update({
        full_name: data.full_name,
        phone: data.phone ?? null,
        wallet_balance_rwf: data.wallet_balance_rwf,
        default_pay_method: data.default_pay_method,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        table: z.enum(["operators", "stations", "chargers"]),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: UZA admin role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from(data.table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
