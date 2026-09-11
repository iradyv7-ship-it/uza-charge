/**
 * Transport-level OCPP-J framing only.
 *
 * The gateway is deliberately thin: it validates that a frame is a well-formed
 * OCPP-J envelope and nothing more. Payload semantics (BootNotification,
 * MeterValues, StartTransaction, …) are validated with Zod inside the API,
 * which is the single place that may write to the database.
 */
import { z } from "zod";

export const CALL = 2;
export const CALLRESULT = 3;
export const CALLERROR = 4;

const Call = z.tuple([z.literal(CALL), z.string(), z.string(), z.record(z.unknown())]);
const CallResult = z.tuple([z.literal(CALLRESULT), z.string(), z.record(z.unknown())]);
const CallError = z.tuple([
  z.literal(CALLERROR),
  z.string(),
  z.string(),
  z.string(),
  z.record(z.unknown()),
]);

export const Envelope = z.union([Call, CallResult, CallError]);
export type Envelope = z.infer<typeof Envelope>;

export function parseEnvelope(raw: unknown): Envelope | null {
  let decoded: unknown = raw;
  if (typeof raw === "string") {
    try {
      decoded = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = Envelope.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export function protocolError(messageId: string, description: string): string {
  return JSON.stringify([CALLERROR, messageId, "ProtocolError", description, {}]);
}

/** Message id of any envelope, used for logging and call/result correlation. */
export function messageId(frame: Envelope): string {
  return frame[1];
}

/** Action name for a CALL, or null for results and errors. */
export function actionOf(frame: Envelope): string | null {
  return frame[0] === CALL ? (frame[2] as string) : null;
}
