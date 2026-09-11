/**
 * Gateway configuration. Every value comes from the environment — no secret and
 * no endpoint is ever hardcoded here. See .env.example.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return parsed;
}

export const config = {
  /** Port the charge points connect to. */
  port: num("OCPP_GATEWAY_PORT", 9220),
  /** Path prefix; a charger connects to ws://host<prefix>/<ChargePointIdentity>. */
  pathPrefix: process.env["OCPP_GATEWAY_PATH"] ?? "/ocpp",
  /** Base URL of the UZA Charge API (central system). Required. */
  apiBaseUrl: (process.env["UZA_API_BASE_URL"] ?? "").replace(/\/+$/, ""),
  /** Optional shared secret sent to the central system as x-gateway-token. */
  gatewayToken: process.env["OCPP_GATEWAY_TOKEN"] ?? "",
  /** OCPP subprotocol this gateway speaks. */
  subprotocol: "ocpp1.6",
  /** WebSocket ping interval; a charger that misses two pings is dropped. */
  pingIntervalMs: num("OCPP_GATEWAY_PING_MS", 30_000),
  /** How often the gateway asks the API for queued remote commands. */
  commandPollMs: num("OCPP_GATEWAY_COMMAND_POLL_MS", 5_000),
  /** Per-request timeout when calling the central system. */
  apiTimeoutMs: num("UZA_API_TIMEOUT_MS", 10_000),
  /** Retries for a failed central-system call before the frame is dropped. */
  apiRetries: num("UZA_API_RETRIES", 2),
} as const;

export function assertConfig(): void {
  if (!config.apiBaseUrl) {
    throw new Error(
      "UZA_API_BASE_URL is required — the gateway forwards every OCPP frame to the API and never touches the database directly.",
    );
  }
}
