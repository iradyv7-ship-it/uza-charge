/**
 * The gateway's only link to the rest of the platform.
 *
 * Every frame a charger sends is forwarded to the UZA Charge API, which owns the
 * database, the pricing rules and the audit trail. The gateway holds no
 * credentials for Postgres and performs no business logic of its own.
 */
import { config } from "./config.js";
import type { Envelope } from "./frames.js";
import { log } from "./log.js";

export interface CentralSystemReply {
  /** Responses to the frames that were forwarded, in order. */
  responses: unknown[];
  /** Remote commands the control room queued for this charge point. */
  pending: unknown[];
}

async function post(identity: string, body: unknown): Promise<CentralSystemReply | null> {
  const url = `${config.apiBaseUrl}/api/public/ocpp/${encodeURIComponent(identity)}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.gatewayToken) headers["x-gateway-token"] = config.gatewayToken;

  for (let attempt = 0; attempt <= config.apiRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.apiTimeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        log.warn("central system rejected frame", {
          identity,
          status: res.status,
          attempt,
        });
        if (res.status >= 400 && res.status < 500) return null;
      } else {
        const json = (await res.json()) as Partial<CentralSystemReply>;
        return {
          responses: Array.isArray(json.responses) ? json.responses : [],
          pending: Array.isArray(json.pending) ? json.pending : [],
        };
      }
    } catch (error) {
      log.warn("central system unreachable", {
        identity,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
    if (attempt < config.apiRetries) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return null;
}

/** Forward one charger frame and return the reply plus any queued commands. */
export function forwardFrame(identity: string, frame: Envelope) {
  return post(identity, frame);
}

/** Ask for queued remote commands without sending a charger frame. */
export async function drainCommands(identity: string): Promise<unknown[]> {
  const reply = await post(identity, { drain: true });
  return reply?.pending ?? [];
}

/** Confirm the identity is registered before accepting the socket. */
export async function isRegistered(identity: string): Promise<boolean> {
  const url = `${config.apiBaseUrl}/api/public/ocpp/${encodeURIComponent(identity)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.apiTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return false;
    if (!res.ok) return false;
    const json = (await res.json()) as { registered?: boolean };
    return json.registered === true;
  } catch (error) {
    log.warn("registration check failed", {
      identity,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fail closed: an unverified charge point is not accepted.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
