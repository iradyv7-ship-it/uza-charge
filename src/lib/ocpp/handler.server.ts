/**
 * OCPP 1.6-J central system.
 *
 * Transport-agnostic on purpose: `handleFrame` takes one decoded OCPP frame and
 * returns the frame to send back. The WebSocket route is a thin shell around it,
 * which also makes the protocol testable without a socket.
 *
 * Server-only: this module talks to the database with the service role.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OCPP, PREAUTH_AMOUNT_MINOR, TARIFF_DEFAULTS } from "@/config/policy";
import { minuteOfDayLocal } from "@/lib/time";
import {
  defaultTariffVersion,
  priceSession,
  selectTariffVersion,
  type MeterSample,
  type TariffVersion,
} from "@/lib/pricing";
import {
  COMMAND_TO_OCPP,
  INBOUND_SCHEMAS,
  OCPP_CALL,
  OCPP_CALLERROR,
  OCPP_CALLRESULT,
  STATUS_TO_UZA,
  normaliseSample,
  type AnyFrame,
  type InboundAction,
} from "@/lib/ocpp/schemas";
import type { TouTier } from "@/config/policy";

type ChargePoint = {
  id: string;
  station_id: string;
  ocpp_identity: string;
  status: string;
  heartbeat_interval_s: number;
};

const nowIso = () => new Date().toISOString();

/* --------------------------- audit logging --------------------------- */

async function logFrame(args: {
  identity: string;
  chargerId: string | null;
  direction: "inbound" | "outbound";
  frame: unknown;
  valid: boolean;
  error?: string | null;
}) {
  const frame = Array.isArray(args.frame) ? (args.frame as unknown[]) : [];
  const messageType = Number(frame[0] ?? 2);
  const messageId = typeof frame[1] === "string" ? frame[1] : null;
  const action =
    messageType === OCPP_CALL && typeof frame[2] === "string" ? (frame[2] as string) : null;

  await supabaseAdmin.from("ocpp_events").insert({
    charger_id: args.chargerId,
    ocpp_identity: args.identity,
    direction: args.direction,
    message_type: [2, 3, 4].includes(messageType) ? messageType : 2,
    message_id: messageId,
    action,
    payload: { frame: args.frame } as never,
    valid: args.valid,
    error: args.error ?? null,
  });
}

async function recordStatus(
  chargerId: string,
  status: string,
  connectorId: string | null,
  source: "ocpp" | "simulator" | "operator" | "watchdog" = "ocpp",
) {
  await supabaseAdmin.from("charge_point_status_history").insert({
    charger_id: chargerId,
    connector_id: connectorId,
    status,
    source,
  });
}

/* --------------------------- identity --------------------------- */

export async function resolveChargePoint(identity: string): Promise<ChargePoint | null> {
  const { data } = await supabaseAdmin
    .from("chargers")
    .select("id, station_id, ocpp_identity, status, heartbeat_interval_s")
    .eq("ocpp_identity", identity)
    .maybeSingle();
  return (data as ChargePoint | null) ?? null;
}

/** OCPP connectorId is 1-based per charge point; 0 addresses the whole unit. */
async function connectorByIndex(chargerId: string, connectorId: number) {
  if (connectorId < 1) return null;
  const { data } = await supabaseAdmin
    .from("connectors")
    .select("id, label, power_kw, status")
    .eq("charger_id", chargerId)
    .order("label", { ascending: true });
  return (data ?? [])[connectorId - 1] ?? null;
}

/* --------------------------- tariffs --------------------------- */

async function tariffForStation(stationId: string, atMs: number): Promise<TariffVersion> {
  const { data: station } = await supabaseAdmin
    .from("stations")
    .select("owner_id")
    .eq("id", stationId)
    .maybeSingle();
  if (!station?.owner_id) return defaultTariffVersion();

  const { data: rows } = await supabaseAdmin
    .from("tariff_versions")
    .select(
      "id, effective_from, effective_to, energy_minor_per_kwh, time_minor_per_minute, session_fee_minor, idle_fee_minor_per_minute, idle_grace_minutes, tariff_tou_windows(half_hour_index, tier, multiplier)",
    )
    .eq("owner_id", station.owner_id)
    .eq("published", true);

  const versions: TariffVersion[] = (rows ?? []).map((r) => {
    const segments: Partial<Record<number, TouTier>> = {};
    const multipliers: Partial<Record<TouTier, number>> = {};
    for (const w of (r.tariff_tou_windows ?? []) as Array<{
      half_hour_index: number;
      tier: string;
      multiplier: number;
    }>) {
      segments[w.half_hour_index] = w.tier as TouTier;
      multipliers[w.tier as TouTier] = Number(w.multiplier);
    }
    return {
      id: r.id as string,
      effectiveFrom: r.effective_from as string,
      effectiveTo: (r.effective_to as string | null) ?? null,
      energyMinorPerKwh: Number(r.energy_minor_per_kwh),
      timeMinorPerMinute: Number(r.time_minor_per_minute),
      sessionFeeMinor: Number(r.session_fee_minor),
      idleFeeMinorPerMinute: Number(r.idle_fee_minor_per_minute),
      idleGraceMinutes: Number(r.idle_grace_minutes),
      segments,
      tierMultipliers: multipliers,
    };
  });

  return selectTariffVersion(versions, atMs) ?? defaultTariffVersion();
}

async function samplesFor(sessionId: string): Promise<MeterSample[]> {
  const { data } = await supabaseAdmin
    .from("meter_values")
    .select("ts, kwh")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true })
    .limit(2000);
  return (data ?? []).map((r) => ({
    atMs: Date.parse(r.ts as string),
    cumulativeKwh: Number(r.kwh ?? 0),
  }));
}

/** Re-price a session from its metered energy against its pinned tariff. */
export async function repriceSession(sessionId: string) {
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, started_at, ended_at, idle_minutes, tariff_version_id, connector_id, connectors(charger_id, chargers(station_id))",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const stationId = (
    session.connectors as { chargers: { station_id: string } | null } | null
  )?.chargers?.station_id;
  const startedMs = Date.parse(session.started_at as string);
  const tariff = stationId
    ? await tariffForStation(stationId, startedMs)
    : defaultTariffVersion();

  const samples = await samplesFor(sessionId);
  const endMs = session.ended_at ? Date.parse(session.ended_at as string) : Date.now();
  const charge = priceSession({
    samples,
    tariff,
    minuteOfDayAt: minuteOfDayLocal,
    chargingMinutes: Math.round((endMs - startedMs) / 60_000),
    idleMinutes: Number(session.idle_minutes ?? 0),
  });

  await supabaseAdmin
    .from("sessions")
    .update({
      tariff_version_id: tariff.id.startsWith("policy-default") ? null : tariff.id,
      kwh: charge.energyKwh,
      charging_minutes: charge.chargingMinutes,
      energy_minor: charge.energyMinor,
      time_minor: charge.timeMinor,
      session_fee_minor: charge.sessionFeeMinor,
      idle_minor: charge.idleMinor,
      total_minor: charge.totalMinor,
      // Legacy display column kept in sync, in whole RWF.
      cost_rwf: Math.round(charge.totalMinor / 100),
    })
    .eq("id", sessionId);

  return charge;
}

/* --------------------------- frame handling --------------------------- */

export type HandleResult = { response: AnyFrame; chargerId: string | null };

export async function handleFrame(identity: string, frame: unknown): Promise<HandleResult> {
  const cp = await resolveChargePoint(identity);

  if (!Array.isArray(frame) || frame[0] !== OCPP_CALL) {
    // CALLRESULT / CALLERROR from the charge point: audit it, nothing to answer.
    await logFrame({ identity, chargerId: cp?.id ?? null, direction: "inbound", frame, valid: true });
    return {
      response: [OCPP_CALLRESULT, String((frame as unknown[])?.[1] ?? "0"), {}] as AnyFrame,
      chargerId: cp?.id ?? null,
    };
  }

  const [, messageId, action, payload] = frame as [number, string, string, unknown];

  if (!cp) {
    await logFrame({
      identity,
      chargerId: null,
      direction: "inbound",
      frame,
      valid: false,
      error: "Unknown charge point identity",
    });
    return {
      response: [
        OCPP_CALLERROR,
        messageId,
        "SecurityError",
        "Charge point is not registered on the UZA network",
        {},
      ] as AnyFrame,
      chargerId: null,
    };
  }

  const schema = INBOUND_SCHEMAS[action as InboundAction];
  if (!schema) {
    await logFrame({
      identity,
      chargerId: cp.id,
      direction: "inbound",
      frame,
      valid: false,
      error: "NotImplemented",
    });
    return {
      response: [OCPP_CALLERROR, messageId, "NotImplemented", `Unsupported action ${action}`, {}] as AnyFrame,
      chargerId: cp.id,
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    await logFrame({
      identity,
      chargerId: cp.id,
      direction: "inbound",
      frame,
      valid: false,
      error: parsed.error.message.slice(0, 500),
    });
    return {
      response: [
        OCPP_CALLERROR,
        messageId,
        "FormationViolation",
        "Payload failed validation",
        { issues: parsed.error.issues.slice(0, 5) },
      ] as AnyFrame,
      chargerId: cp.id,
    };
  }

  await logFrame({ identity, chargerId: cp.id, direction: "inbound", frame, valid: true });

  const result = await dispatch(cp, action as InboundAction, parsed.data as never);
  const response = [OCPP_CALLRESULT, messageId, result] as AnyFrame;
  await logFrame({ identity, chargerId: cp.id, direction: "outbound", frame: response, valid: true });
  return { response, chargerId: cp.id };
}

async function dispatch(
  cp: ChargePoint,
  action: InboundAction,
  payload: Record<string, never>,
): Promise<Record<string, unknown>> {
  switch (action) {
    case "BootNotification":
      return bootNotification(cp, payload as unknown as Record<string, string | undefined>);
    case "Heartbeat":
      return heartbeat(cp);
    case "StatusNotification":
      return statusNotification(cp, payload as unknown as {
        connectorId: number;
        status: keyof typeof STATUS_TO_UZA;
        errorCode: string;
        info?: string;
      });
    case "Authorize":
      return authorize(payload as unknown as { idTag: string });
    case "StartTransaction":
      return startTransaction(cp, payload as unknown as {
        connectorId: number;
        idTag: string;
        meterStart: number;
        timestamp: string;
      });
    case "StopTransaction":
      return stopTransaction(cp, payload as unknown as {
        transactionId: number;
        meterStop: number;
        timestamp: string;
        reason?: string;
      });
    case "MeterValues":
      return meterValues(cp, payload as unknown as {
        connectorId: number;
        transactionId?: number;
        meterValue: Array<{ timestamp: string; sampledValue: Array<Record<string, string>> }>;
      });
    case "FirmwareStatusNotification": {
      const status = (payload as unknown as { status: string }).status;
      await supabaseAdmin.from("chargers").update({ firmware_status: status }).eq("id", cp.id);
      return {};
    }
    case "DiagnosticsStatusNotification":
    case "DataTransfer":
    default:
      return {};
  }
}

/* --------------------------- actions --------------------------- */

async function bootNotification(cp: ChargePoint, p: Record<string, string | undefined>) {
  await supabaseAdmin
    .from("chargers")
    .update({
      vendor: p['chargePointVendor'] ?? null,
      model: p['chargePointModel'] ?? null,
      firmware_version: p['firmwareVersion'] ?? null,
      status: "online",
      last_seen_at: nowIso(),
      last_heartbeat: nowIso(),
      boot_at: nowIso(),
      is_simulated: false,
      heartbeat_interval_s: OCPP.heartbeatIntervalSeconds.value,
    })
    .eq("id", cp.id);
  await recordStatus(cp.id, "online", null);
  return {
    status: "Accepted",
    currentTime: nowIso(),
    interval: OCPP.heartbeatIntervalSeconds.value,
  };
}

async function heartbeat(cp: ChargePoint) {
  const wasSilent = cp.status === "offline" || cp.status === "never_connected";
  if (wasSilent) await recordStatus(cp.id, "online", null);
  await supabaseAdmin
    .from("chargers")
    .update(
      wasSilent
        ? { last_seen_at: nowIso(), last_heartbeat: nowIso(), status: "online" }
        : { last_seen_at: nowIso(), last_heartbeat: nowIso() },
    )
    .eq("id", cp.id);
  return { currentTime: nowIso() };
}


async function statusNotification(
  cp: ChargePoint,
  p: { connectorId: number; status: keyof typeof STATUS_TO_UZA; errorCode: string; info?: string },
) {
  const uza = STATUS_TO_UZA[p.status] ?? "offline";
  await supabaseAdmin
    .from("chargers")
    .update({ last_seen_at: nowIso(), last_heartbeat: nowIso() })
    .eq("id", cp.id);

  if (p.connectorId === 0) {
    const chargerStatus = p.status === "Faulted" ? "faulted" : p.status === "Unavailable" ? "offline" : "online";
    await supabaseAdmin.from("chargers").update({ status: chargerStatus }).eq("id", cp.id);
    await recordStatus(cp.id, chargerStatus, null);
  } else {
    const connector = await connectorByIndex(cp.id, p.connectorId);
    if (connector) {
      await supabaseAdmin.from("connectors").update({ status: uza }).eq("id", connector.id);
      await recordStatus(cp.id, uza, connector.id);
    }
    // A pile reporting anything at all is, by definition, connected.
    if (cp.status === "never_connected" || cp.status === "offline") {
      await supabaseAdmin.from("chargers").update({ status: "online" }).eq("id", cp.id);
      await recordStatus(cp.id, "online", null);
    }
    if (p.status === "Faulted") {
      await supabaseAdmin.from("chargers").update({ status: "faulted" }).eq("id", cp.id);
      await recordStatus(cp.id, "faulted", null);
      await supabaseAdmin.from("faults").insert({
        charger_id: cp.id,
        code: p.errorCode || "OtherError",
        label: p.info ?? p.errorCode ?? "Charge point reported a fault",
        severity: p.errorCode === "NoError" ? "warning" : "critical",
      });
    } else {
      await supabaseAdmin
        .from("faults")
        .update({ cleared_at: nowIso() })
        .eq("charger_id", cp.id)
        .is("cleared_at", null);
    }
  }
  return {};
}

/**
 * Authorize: a session may only start against a known card AND an authorised
 * means of payment — wallet balance, or a post-paid fleet account.
 */
async function authorize(p: { idTag: string }) {
  const { data: card } = await supabaseAdmin
    .from("rfid_cards")
    .select("id, driver_id, offline_enabled, drivers(id, wallet_balance_rwf, default_pay_method)")
    .or(`logical_number.eq.${p.idTag},physical_uid.eq.${p.idTag}`)
    .maybeSingle();

  if (!card) return { idTagInfo: { status: "Invalid" } };
  const driver = card.drivers as { wallet_balance_rwf: number; default_pay_method: string } | null;
  if (!driver) return { idTagInfo: { status: "Invalid" } };

  const walletMinor = Math.round(Number(driver.wallet_balance_rwf ?? 0) * 100);
  const authorised =
    driver.default_pay_method === "fleet_postpaid" || walletMinor >= PREAUTH_AMOUNT_MINOR.value;

  return {
    idTagInfo: {
      status: authorised ? "Accepted" : "Blocked",
      parentIdTag: undefined,
    },
  };
}

async function startTransaction(
  cp: ChargePoint,
  p: { connectorId: number; idTag: string; meterStart: number; timestamp: string },
) {
  const connector = await connectorByIndex(cp.id, p.connectorId);
  if (!connector) return { transactionId: 0, idTagInfo: { status: "Invalid" } };

  // No session starts without an authorised means of payment: wallet balance
  // covering the pre-authorisation, or a post-paid fleet account.
  const auth = (await authorize({ idTag: p.idTag })) as { idTagInfo: { status: string } };
  if (auth.idTagInfo.status !== "Accepted") {
    return { transactionId: 0, idTagInfo: auth.idTagInfo };
  }

  const { data: card } = await supabaseAdmin
    .from("rfid_cards")
    .select("driver_id")
    .or(`logical_number.eq.${p.idTag},physical_uid.eq.${p.idTag}`)
    .maybeSingle();


  const transactionId = Math.floor(Date.now() / 1000);
  const startedAt = Number.isNaN(Date.parse(p.timestamp)) ? nowIso() : p.timestamp;
  const tariff = await tariffForStation(cp.station_id, Date.parse(startedAt));

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .insert({
      connector_id: connector.id,
      driver_id: card?.driver_id ?? null,
      start_method: "rfid",
      status: "charging",
      started_at: startedAt,
      ocpp_transaction_id: transactionId,
      id_tag: p.idTag,
      tariff_version_id: tariff.id.startsWith("policy-default") ? null : tariff.id,
    })
    .select("id")
    .maybeSingle();

  if (!session) return { transactionId: 0, idTagInfo: { status: "Invalid" } };

  // meterStart is Wh on the wire; the first sample anchors the register.
  await supabaseAdmin.from("meter_values").insert({
    session_id: session.id,
    ts: startedAt,
    kwh: p.meterStart / 1000,
  });
  await supabaseAdmin.from("connectors").update({ status: "charging" }).eq("id", connector.id);
  await recordStatus(cp.id, "charging", connector.id);

  return { transactionId, idTagInfo: { status: "Accepted" } };
}

async function meterValues(
  cp: ChargePoint,
  p: {
    connectorId: number;
    transactionId?: number;
    meterValue: Array<{ timestamp: string; sampledValue: Array<Record<string, string>> }>;
  },
) {
  const session = await sessionForTransaction(cp, p.transactionId, p.connectorId);
  if (!session) return {};

  for (const mv of p.meterValue) {
    const row: Record<string, unknown> = {
      session_id: session.id,
      ts: Number.isNaN(Date.parse(mv.timestamp)) ? nowIso() : mv.timestamp,
    };
    for (const sv of mv.sampledValue) {
      const n = normaliseSample(sv as never);
      if (n) row[n.key] = Number(n.value.toFixed(3));
    }
    await supabaseAdmin.from("meter_values").insert(row as never);
    if (typeof row['soc'] === "number") {
      await supabaseAdmin.from("sessions").update({ soc_end: Math.round(row['soc'] as number) }).eq("id", session.id);
    }
  }

  await supabaseAdmin
    .from("chargers")
    .update({ last_seen_at: nowIso(), last_heartbeat: nowIso() })
    .eq("id", cp.id);
  await repriceSession(session.id);
  return {};
}

async function sessionForTransaction(
  cp: ChargePoint,
  transactionId: number | undefined,
  connectorId: number,
) {
  if (transactionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select("id, started_at")
      .eq("ocpp_transaction_id", transactionId)
      .maybeSingle();
    if (data) return data;
  }
  const connector = await connectorByIndex(cp.id, connectorId);
  if (!connector) return null;
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, started_at")
    .eq("connector_id", connector.id)
    .in("status", ["charging", "preparing", "finishing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function stopTransaction(
  cp: ChargePoint,
  p: { transactionId: number; meterStop: number; timestamp: string; reason?: string },
) {
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("id, connector_id, driver_id, started_at")
    .eq("ocpp_transaction_id", p.transactionId)
    .maybeSingle();
  if (!session) return { idTagInfo: { status: "Invalid" } };

  const endedAt = Number.isNaN(Date.parse(p.timestamp)) ? nowIso() : p.timestamp;
  await supabaseAdmin.from("meter_values").insert({
    session_id: session.id,
    ts: endedAt,
    kwh: p.meterStop / 1000,
  });
  await supabaseAdmin
    .from("sessions")
    .update({ status: "completed", ended_at: endedAt, stop_reason_code: p.reason ?? "Local" })
    .eq("id", session.id);

  const charge = await repriceSession(session.id);
  await supabaseAdmin.from("connectors").update({ status: "available" }).eq("id", session.connector_id);
  await recordStatus(cp.id, "available", session.connector_id as string);

  if (charge) {
    const { data: station } = await supabaseAdmin
      .from("stations")
      .select("owner_id")
      .eq("id", cp.station_id)
      .maybeSingle();

    await supabaseAdmin.from("transactions").insert({
      session_id: session.id,
      tier_breakdown: Object.fromEntries(charge.tiers.map((t) => [t.tier, t.amountMinor])) as never,
      meter_start: 0,
      meter_stop: charge.energyKwh,
      total_kwh: charge.energyKwh,
      total_rwf: Math.round(charge.totalMinor / 100),
      settled: false,
    });

    await supabaseAdmin.from("receipts").insert({
      session_id: session.id,
      driver_id: session.driver_id,
      owner_id: station?.owner_id ?? null,
      tariff_version_id: charge.tariffVersionId.startsWith("policy-default")
        ? null
        : charge.tariffVersionId,
      number: `UZA-R-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`,
      energy_kwh: charge.energyKwh,
      duration_minutes: charge.chargingMinutes,
      idle_minutes: charge.idleMinutes,
      lines: [
        ...charge.tiers.map((t) => ({
          kind: "energy",
          tier: t.tier,
          kwh: t.kwh,
          rate_minor_per_kwh: t.rateMinorPerKwh,
          amount_minor: t.amountMinor,
        })),
        { kind: "time", minutes: charge.chargingMinutes, amount_minor: charge.timeMinor },
        { kind: "session_fee", amount_minor: charge.sessionFeeMinor },
        { kind: "idle", minutes: charge.billedIdleMinutes, amount_minor: charge.idleMinor },
      ].filter((l) => (l as { amount_minor: number }).amount_minor > 0) as never,
      energy_minor: charge.energyMinor,
      time_minor: charge.timeMinor,
      session_fee_minor: charge.sessionFeeMinor,
      idle_minor: charge.idleMinor,
      total_minor: charge.totalMinor,
    });
  }

  return { idTagInfo: { status: "Accepted" } };
}

/* --------------------------- outbound commands --------------------------- */

/**
 * Drain the command outbox for one charge point and hand back protocol frames.
 * The control room writes to `charger_commands`; this is where those become
 * real OCPP CALLs.
 */
export async function drainCommands(cp: ChargePoint): Promise<AnyFrame[]> {
  const { data: commands } = await supabaseAdmin
    .from("charger_commands")
    .select("id, type, payload")
    .eq("charger_id", cp.id)
    .eq("status", "queued")
    .limit(10);

  const frames: AnyFrame[] = [];
  for (const cmd of commands ?? []) {
    const action = COMMAND_TO_OCPP[cmd.type as string];
    if (!action) continue;
    const payload = await outboundPayload(cp, cmd.type as string, cmd.payload as Record<string, unknown>);
    const frame = [OCPP_CALL, `uza-${cmd.id}`, action, payload] as AnyFrame;
    frames.push(frame);
    await supabaseAdmin.from("charger_commands").update({ status: "sent" }).eq("id", cmd.id);
    await logFrame({
      identity: cp.ocpp_identity,
      chargerId: cp.id,
      direction: "outbound",
      frame,
      valid: true,
    });
  }
  return frames;
}

async function outboundPayload(
  cp: ChargePoint,
  type: string,
  payload: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const p = payload ?? {};
  switch (type) {
    case "remote_start":
      return { connectorId: Number(p['connector_index'] ?? 1), idTag: String(p['id_tag'] ?? "UZAAPP") };
    case "remote_stop":
      return { transactionId: Number(p['transaction_id'] ?? 0) };
    case "reset":
      return { type: p['hard'] ? "Hard" : "Soft" };
    case "unlock":
      return { connectorId: Number(p['connector_index'] ?? 1) };
    case "enable":
      return { connectorId: Number(p['connector_index'] ?? 0), type: "Operative" };
    case "disable":
      return { connectorId: Number(p['connector_index'] ?? 0), type: "Inoperative" };
    case "update_firmware":
      return {
        location: String(p['location'] ?? ""),
        retrieveDate: String(p['retrieve_date'] ?? nowIso()),
      };
    case "change_configuration":
      return { key: String(p['key'] ?? ""), value: String(p['value'] ?? "") };
    case "set_max_power": {
      const pct = Math.max(10, Math.min(100, Number(p['max_output_pct'] ?? 100)));
      const { data: charger } = await supabaseAdmin
        .from("chargers")
        .select("rated_power_kw")
        .eq("id", cp.id)
        .maybeSingle();
      const ratedKw = Number(charger?.rated_power_kw ?? OCPP.houseStandardKw.value);
      return {
        connectorId: 0,
        csChargingProfiles: {
          chargingProfileId: 1,
          stackLevel: 0,
          chargingProfilePurpose: "TxDefaultProfile",
          chargingProfileKind: "Absolute",
          chargingSchedule: {
            chargingRateUnit: "W",
            chargingSchedulePeriod: [
              { startPeriod: 0, limit: Math.round((ratedKw * 1000 * pct) / 100) },
            ],
          },
        },
      };
    }
    default:
      return {};
  }
}

/** Acknowledge a CALLRESULT for a command we sent. */
export async function ackCommandResult(messageId: string, accepted: boolean) {
  if (!messageId.startsWith("uza-")) return;
  const id = messageId.slice(4);
  await supabaseAdmin
    .from("charger_commands")
    .update({ status: accepted ? "accepted" : "rejected" })
    .eq("id", id);
}

/**
 * Watchdog: mark any charge point that has gone silent past its heartbeat
 * window as offline. It keeps its last-seen time — it never disappears and is
 * never shown as live on stale data.
 */
export async function runLivenessWatchdog() {
  const { data: chargers } = await supabaseAdmin
    .from("chargers")
    .select("id, status, last_seen_at, last_heartbeat, heartbeat_interval_s")
    .in("status", ["online", "charging"]);

  let flipped = 0;
  for (const c of chargers ?? []) {
    const seen = c.last_seen_at ?? c.last_heartbeat;
    if (!seen) continue;
    const limitMs =
      Number(c.heartbeat_interval_s ?? OCPP.heartbeatIntervalSeconds.value) *
      OCPP.offlineAfterMissedHeartbeats.value *
      1000;
    if (Date.now() - Date.parse(seen) > limitMs) {
      await supabaseAdmin.from("chargers").update({ status: "offline" }).eq("id", c.id);
      await supabaseAdmin
        .from("connectors")
        .update({ status: "offline" })
        .eq("charger_id", c.id)
        .neq("status", "faulted");
      await recordStatus(c.id, "offline", null, "watchdog");
      flipped += 1;
    }
  }
  return { flipped };
}
