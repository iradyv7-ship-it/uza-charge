/**
 * UZA Charge charger simulator.
 *
 * Stands in for a real OCPP 1.6J server. It only ever reads `charger_commands`
 * and writes `charger_events` / telemetry, so a real OCPP gateway can replace
 * this file by reading and writing the same two tables with no UI changes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEMO_VINS = [
  "LSVAU21B8NN012345",
  "LGXC24E45N0098211",
  "WBY8P210X07J12309",
  "LFV3A23C1P3011882",
  "LRWYGCEK4NC012773",
];

const FAULT_CODES: Array<{ code: string; label: string; severity: string }> = [
  { code: "GroundFailure", label: "Ground fault detected", severity: "critical" },
  { code: "OverTemperature", label: "Cabinet temperature high", severity: "warning" },
  { code: "ConnectorLockFailure", label: "Connector lock failure", severity: "warning" },
  { code: "OverCurrentFailure", label: "Over-current on output stage", severity: "critical" },
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Tick = {
  telemetry: number;
  started: number;
  completed: number;
  faults: number;
  commands: number;
};

async function recomputeCost(sessionId: string) {
  const { data } = await supabaseAdmin.rpc("compute_session_cost", {
    _session_id: sessionId,
  });
  const result = (data ?? {}) as { total_rwf?: number; total_kwh?: number; tiers?: unknown };
  return {
    total_rwf: Number(result.total_rwf ?? 0),
    total_kwh: Number(result.total_kwh ?? 0),
    tiers: (result.tiers ?? {}) as Record<string, number>,
  };
}

/** 1. Drain the command outbox — this is what a real OCPP server would do. */
async function processCommands(tick: Tick) {
  const { data: commands } = await supabaseAdmin
    .from("charger_commands")
    .select("id, charger_id, type, payload")
    .eq("status", "queued")
    .limit(20);

  for (const cmd of commands ?? []) {
    if (cmd.type === "reset" || cmd.type === "enable") {
      await supabaseAdmin
        .from("chargers")
        .update({ status: "online", last_heartbeat: new Date().toISOString() })
        .eq("id", cmd.charger_id);
      await supabaseAdmin
        .from("connectors")
        .update({ status: "available" })
        .eq("charger_id", cmd.charger_id)
        .in("status", ["faulted", "offline"]);
      await supabaseAdmin
        .from("faults")
        .update({ cleared_at: new Date().toISOString() })
        .eq("charger_id", cmd.charger_id)
        .is("cleared_at", null);
    }
    if (cmd.type === "disable") {
      await supabaseAdmin.from("chargers").update({ status: "offline" }).eq("id", cmd.charger_id);
      await supabaseAdmin
        .from("connectors")
        .update({ status: "offline" })
        .eq("charger_id", cmd.charger_id);
    }
    if (cmd.type === "unlock") {
      const connectorId = (cmd.payload as { connector_id?: string } | null)?.connector_id;
      if (connectorId) {
        await supabaseAdmin.from("connectors").update({ status: "available" }).eq("id", connectorId);
      }
    }
    if (cmd.type === "set_max_power") {
      const pct = Number((cmd.payload as { max_output_pct?: number } | null)?.max_output_pct ?? 100);
      await supabaseAdmin
        .from("chargers")
        .update({ max_output_pct: Math.max(10, Math.min(100, pct)) })
        .eq("id", cmd.charger_id);
    }
    if (cmd.type === "update_firmware") {
      await supabaseAdmin
        .from("chargers")
        .update({ firmware_version: "1.6J-4.3.0" })
        .eq("id", cmd.charger_id);
    }

    await supabaseAdmin.from("charger_commands").update({ status: "accepted" }).eq("id", cmd.id);
    await supabaseAdmin.from("charger_events").insert({
      charger_id: cmd.charger_id,
      type: `${cmd.type}.conf`,
      payload: { status: "Accepted", command_id: cmd.id },
    });
    tick.commands += 1;
  }
}

/** 2. Advance every active session: telemetry, cost, completion. */
async function advanceSessions(tick: Tick) {
  const { data: sessions } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, connector_id, driver_id, started_at, soc_start, kwh, status, connectors(id, power_kw, charger_id, chargers(max_output_pct, status))",
    )
    .in("status", ["charging", "preparing", "finishing"])
    .limit(40);

  for (const s of sessions ?? []) {
    const connector = s.connectors as {
      power_kw: number;
      charger_id: string;
      chargers: { max_output_pct: number; status: string } | null;
    } | null;
    if (!connector) continue;

    if (connector.chargers?.status !== "online") {
      await endSession(s.id, connector.charger_id, s.connector_id, "PowerLoss", tick, "faulted");
      continue;
    }

    const { data: last } = await supabaseAdmin
      .from("meter_values")
      .select("ts, kwh, soc")
      .eq("session_id", s.id)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const prevTs = last?.ts ? new Date(last.ts) : new Date(s.started_at);
    const dt = Math.min(60, Math.max(3, (now.getTime() - prevTs.getTime()) / 1000));
    const prevKwh = Number(last?.kwh ?? 0);
    const soc = Number(last?.soc ?? s.soc_start ?? 20);

    // Charge curve: full rate until 60% SOC, then taper toward 100%.
    const cap = (Number(connector.power_kw) * (connector.chargers?.max_output_pct ?? 100)) / 100;
    const taper = soc < 60 ? 1 : Math.max(0.14, 1 - (soc - 60) / 45);
    const powerKw = Math.max(1.5, cap * taper * rand(0.86, 0.99));
    const kwh = prevKwh + (powerKw * dt) / 3600;
    const socNext = Math.min(100, soc + (powerKw * dt) / 3600 / 0.62);
    const voltage = rand(392, 421);

    await supabaseAdmin.from("meter_values").insert({
      session_id: s.id,
      ts: now.toISOString(),
      voltage: Number(voltage.toFixed(1)),
      current: Number(((powerKw * 1000) / voltage).toFixed(1)),
      power_kw: Number(powerKw.toFixed(2)),
      kwh: Number(kwh.toFixed(3)),
      soc: Math.round(socNext),
      temp_c: Number(rand(26, 41).toFixed(1)),
    });
    tick.telemetry += 1;

    // Cost always comes from the backend, priced off meter values.
    const cost = await recomputeCost(s.id);
    await supabaseAdmin
      .from("sessions")
      .update({
        status: "charging",
        kwh: Number(kwh.toFixed(3)),
        soc_end: Math.round(socNext),
        cost_rwf: cost.total_rwf,
      })
      .eq("id", s.id);

    if (s.status !== "charging") {
      await supabaseAdmin.from("connectors").update({ status: "charging" }).eq("id", s.connector_id);
    }

    const minutes = (now.getTime() - new Date(s.started_at).getTime()) / 60000;
    if (socNext >= 96 || minutes > 55) {
      await endSession(s.id, connector.charger_id, s.connector_id, "Local", tick, "completed");
    }
  }
}

async function endSession(
  sessionId: string,
  chargerId: string,
  connectorId: string,
  reason: string,
  tick: Tick,
  status: "completed" | "faulted",
) {
  const cost = await recomputeCost(sessionId);
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .update({
      status,
      ended_at: new Date().toISOString(),
      stop_reason_code: reason,
      cost_rwf: cost.total_rwf,
      kwh: cost.total_kwh,
    })
    .eq("id", sessionId)
    .select("driver_id, kwh, cost_rwf")
    .maybeSingle();

  await supabaseAdmin.from("connectors").update({
    status: status === "completed" ? "available" : "faulted",
  }).eq("id", connectorId);

  await supabaseAdmin.from("transactions").insert({
    session_id: sessionId,
    tier_breakdown: cost.tiers,
    meter_start: 0,
    meter_stop: cost.total_kwh,
    total_kwh: cost.total_kwh,
    total_rwf: cost.total_rwf,
    settled: false,
  });

  await supabaseAdmin.from("charger_events").insert({
    charger_id: chargerId,
    type: "StopTransaction",
    payload: { session_id: sessionId, reason, meter_stop: cost.total_kwh },
  });

  if (status === "completed" && session?.driver_id && cost.total_rwf > 0) {
    await supabaseAdmin.from("payments").insert({
      driver_id: session.driver_id,
      session_id: sessionId,
      method: Math.random() < 0.6 ? "momo" : "airtel",
      amount_rwf: cost.total_rwf,
      status: "pending",
      provider_ref: `REF-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    });
  }
  tick.completed += 1;
}

/** 3. Keep the network busy: plug new cars in on idle connectors. */
async function startArrivals(tick: Tick) {
  const { count: active } = await supabaseAdmin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .in("status", ["charging", "preparing"]);

  if ((active ?? 0) >= 7 || Math.random() > 0.45) return;

  const { data: free } = await supabaseAdmin
    .from("connectors")
    .select("id, charger_id, chargers!inner(status)")
    .eq("status", "available")
    .eq("chargers.status", "online")
    .limit(12);
  if (!free?.length) return;

  const { data: drivers } = await supabaseAdmin.from("drivers").select("id").limit(20);
  if (!drivers?.length) return;

  const connector = pick(free);
  const socStart = Math.round(rand(12, 55));
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .insert({
      connector_id: connector.id,
      driver_id: pick(drivers).id,
      start_method: pick(["app", "rfid", "vin"]),
      status: "charging",
      soc_start: socStart,
      vin: pick(DEMO_VINS),
    })
    .select("id")
    .maybeSingle();
  if (!session) return;

  await supabaseAdmin.from("connectors").update({ status: "charging" }).eq("id", connector.id);
  await supabaseAdmin.from("charger_events").insert({
    charger_id: connector.charger_id,
    type: "StartTransaction",
    payload: { session_id: session.id, soc: socStart },
  });
  tick.started += 1;
}

/** 4. Heartbeats, occasional faults, and self-healing. */
async function heartbeatsAndFaults(tick: Tick) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("chargers").update({ last_heartbeat: nowIso }).eq("status", "online");

  if (Math.random() < 0.06) {
    const { data: healthy } = await supabaseAdmin
      .from("chargers")
      .select("id")
      .eq("status", "online")
      .limit(20);
    const target = healthy?.length ? pick(healthy) : null;
    if (target) {
      const fault = pick(FAULT_CODES);
      await supabaseAdmin.from("chargers").update({ status: "faulted" }).eq("id", target.id);
      await supabaseAdmin
        .from("connectors")
        .update({ status: "faulted" })
        .eq("charger_id", target.id)
        .neq("status", "charging");
      await supabaseAdmin.from("faults").insert({ charger_id: target.id, ...fault });
      await supabaseAdmin.from("charger_events").insert({
        charger_id: target.id,
        type: "StatusNotification",
        payload: { status: "Faulted", errorCode: fault.code },
      });
      tick.faults += 1;
    }
  }

  // Field techs clear old faults over time.
  const { data: stale } = await supabaseAdmin
    .from("faults")
    .select("id, charger_id, raised_at")
    .is("cleared_at", null)
    .lt("raised_at", new Date(Date.now() - 6 * 60_000).toISOString())
    .limit(5);
  for (const f of stale ?? []) {
    if (Math.random() > 0.4) continue;
    await supabaseAdmin.from("faults").update({ cleared_at: nowIso }).eq("id", f.id);
    const { count: remaining } = await supabaseAdmin
      .from("faults")
      .select("id", { count: "exact", head: true })
      .eq("charger_id", f.charger_id)
      .is("cleared_at", null);
    if (!remaining) {
      await supabaseAdmin
        .from("chargers")
        .update({ status: "online", last_heartbeat: nowIso })
        .eq("id", f.charger_id);
      await supabaseAdmin
        .from("connectors")
        .update({ status: "available" })
        .eq("charger_id", f.charger_id)
        .in("status", ["faulted", "offline"]);
    }
  }
}

export async function runSimulatorTick() {
  const tick: Tick = { telemetry: 0, started: 0, completed: 0, faults: 0, commands: 0 };
  await processCommands(tick);
  await advanceSessions(tick);
  await startArrivals(tick);
  await heartbeatsAndFaults(tick);
  return tick;
}
