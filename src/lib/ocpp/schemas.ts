/**
 * OCPP 1.6-J payload schemas.
 *
 * Vendor-agnostic: anything that speaks compliant 1.6-J connects, whether it is
 * a UZA 180 kW dual-gun DC pile, a third-party 120 kW DC unit, or a 22 kW AC
 * wallbox. Every inbound payload is validated here before it can touch the
 * database — an invalid frame is logged and rejected, never guessed at.
 */
import { z } from "zod";

export const OCPP_CALL = 2;
export const OCPP_CALLRESULT = 3;
export const OCPP_CALLERROR = 4;

/** Wire frames. */
export const CallFrame = z.tuple([
  z.literal(OCPP_CALL),
  z.string().min(1).max(36),
  z.string().min(1).max(60),
  z.record(z.unknown()),
]);
export const CallResultFrame = z.tuple([
  z.literal(OCPP_CALLRESULT),
  z.string().min(1).max(36),
  z.record(z.unknown()),
]);
export const CallErrorFrame = z.tuple([
  z.literal(OCPP_CALLERROR),
  z.string().min(1).max(36),
  z.string(),
  z.string(),
  z.unknown(),
]);

export const AnyFrame = z.union([CallFrame, CallResultFrame, CallErrorFrame]);
export type AnyFrame = z.infer<typeof AnyFrame>;

/* ---------------------------- Core profile ---------------------------- */

export const ChargePointStatus = z.enum([
  "Available",
  "Preparing",
  "Charging",
  "SuspendedEVSE",
  "SuspendedEV",
  "Finishing",
  "Reserved",
  "Unavailable",
  "Faulted",
]);
export type ChargePointStatus = z.infer<typeof ChargePointStatus>;

export const BootNotificationReq = z.object({
  chargePointVendor: z.string().max(20),
  chargePointModel: z.string().max(20),
  chargePointSerialNumber: z.string().max(25).optional(),
  chargeBoxSerialNumber: z.string().max(25).optional(),
  firmwareVersion: z.string().max(50).optional(),
  iccid: z.string().max(20).optional(),
  imsi: z.string().max(20).optional(),
  meterType: z.string().max(25).optional(),
  meterSerialNumber: z.string().max(25).optional(),
});

export const HeartbeatReq = z.object({}).passthrough();

export const StatusNotificationReq = z.object({
  connectorId: z.number().int().min(0),
  errorCode: z.string().max(50),
  status: ChargePointStatus,
  info: z.string().max(50).optional(),
  timestamp: z.string().optional(),
  vendorId: z.string().max(255).optional(),
  vendorErrorCode: z.string().max(50).optional(),
});

export const AuthorizeReq = z.object({
  idTag: z.string().min(1).max(20),
});

export const StartTransactionReq = z.object({
  connectorId: z.number().int().min(1),
  idTag: z.string().min(1).max(20),
  meterStart: z.number().int(),
  timestamp: z.string(),
  reservationId: z.number().int().optional(),
});

export const StopTransactionReq = z.object({
  transactionId: z.number().int(),
  meterStop: z.number().int(),
  timestamp: z.string(),
  idTag: z.string().max(20).optional(),
  reason: z
    .enum([
      "EmergencyStop",
      "EVDisconnected",
      "HardReset",
      "Local",
      "Other",
      "PowerLoss",
      "Reboot",
      "Remote",
      "SoftReset",
      "UnlockCommand",
      "DeAuthorized",
    ])
    .optional(),
  transactionData: z.array(z.unknown()).optional(),
});

export const SampledValue = z.object({
  value: z.string(),
  context: z.string().optional(),
  format: z.string().optional(),
  measurand: z.string().optional(),
  phase: z.string().optional(),
  location: z.string().optional(),
  unit: z.string().optional(),
});

export const MeterValue = z.object({
  timestamp: z.string(),
  sampledValue: z.array(SampledValue).min(1),
});

export const MeterValuesReq = z.object({
  connectorId: z.number().int().min(0),
  transactionId: z.number().int().optional(),
  meterValue: z.array(MeterValue).min(1),
});

export const FirmwareStatusNotificationReq = z.object({
  status: z.enum([
    "Downloaded",
    "DownloadFailed",
    "Downloading",
    "Idle",
    "InstallationFailed",
    "Installing",
    "Installed",
  ]),
});

export const DiagnosticsStatusNotificationReq = z.object({
  status: z.enum(["Idle", "Uploaded", "UploadFailed", "Uploading"]),
});

export const DataTransferReq = z.object({
  vendorId: z.string().max(255),
  messageId: z.string().max(50).optional(),
  data: z.unknown().optional(),
});

/** Inbound actions this central system accepts. */
export const INBOUND_SCHEMAS = {
  BootNotification: BootNotificationReq,
  Heartbeat: HeartbeatReq,
  StatusNotification: StatusNotificationReq,
  Authorize: AuthorizeReq,
  StartTransaction: StartTransactionReq,
  StopTransaction: StopTransactionReq,
  MeterValues: MeterValuesReq,
  FirmwareStatusNotification: FirmwareStatusNotificationReq,
  DiagnosticsStatusNotification: DiagnosticsStatusNotificationReq,
  DataTransfer: DataTransferReq,
} as const;

export type InboundAction = keyof typeof INBOUND_SCHEMAS;

/** Outbound actions the control room can send to a charge point. */
export const OUTBOUND_ACTIONS = [
  "RemoteStartTransaction",
  "RemoteStopTransaction",
  "Reset",
  "UnlockConnector",
  "ChangeConfiguration",
  "GetConfiguration",
  "ChangeAvailability",
  "UpdateFirmware",
  "TriggerMessage",
  "SetChargingProfile",
] as const;
export type OutboundAction = (typeof OUTBOUND_ACTIONS)[number];

/**
 * Maps the queued command types in `charger_commands` onto real OCPP actions,
 * so the outbox is protocol-accurate rather than bespoke.
 */
export const COMMAND_TO_OCPP: Record<string, OutboundAction> = {
  remote_start: "RemoteStartTransaction",
  remote_stop: "RemoteStopTransaction",
  reset: "Reset",
  unlock: "UnlockConnector",
  update_firmware: "UpdateFirmware",
  set_max_power: "SetChargingProfile",
  enable: "ChangeAvailability",
  disable: "ChangeAvailability",
  change_configuration: "ChangeConfiguration",
};

/** OCPP connector status → the status vocabulary used across UZA Charge. */
export const STATUS_TO_UZA: Record<ChargePointStatus, string> = {
  Available: "available",
  Preparing: "preparing",
  Charging: "charging",
  SuspendedEVSE: "suspended",
  SuspendedEV: "suspended",
  Finishing: "finishing",
  Reserved: "reserved",
  Unavailable: "offline",
  Faulted: "faulted",
};

export type SampledValueT = z.infer<typeof SampledValue>;

/** Normalise a sampled value to a base unit: kWh, kW, V, A, %, °C. */
export function normaliseSample(sv: SampledValueT): { key: string; value: number } | null {
  const raw = Number(sv.value);
  if (!Number.isFinite(raw)) return null;
  const measurand = sv.measurand ?? "Energy.Active.Import.Register";
  const unit = (sv.unit ?? "").toLowerCase();

  switch (measurand) {
    case "Energy.Active.Import.Register":
      // Wh is the OCPP default unit for the energy register.
      return { key: "kwh", value: unit === "kwh" ? raw : raw / 1000 };
    case "Power.Active.Import":
      return { key: "power_kw", value: unit === "kw" ? raw : raw / 1000 };
    case "Voltage":
      return { key: "voltage", value: raw };
    case "Current.Import":
      return { key: "current", value: raw };
    case "SoC":
      return { key: "soc", value: raw };
    case "Temperature":
      return { key: "temp_c", value: raw };
    default:
      return null;
  }
}
