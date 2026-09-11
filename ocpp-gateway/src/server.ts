/**
 * UZA Charge Network — OCPP 1.6-J gateway process.
 *
 *   ws(s)://<gateway-host><OCPP_GATEWAY_PATH>/<ChargePointIdentity>
 *   subprotocol: ocpp1.6
 *
 * This process does one job: own the charger sockets. It terminates OCPP 1.6-J
 * WebSocket connections from any compliant vendor, keeps them alive, detects
 * drops, forwards every frame to the UZA Charge API for validation and
 * persistence, and pushes queued remote commands (RemoteStart/Stop, Reset,
 * ChangeConfiguration, firmware) back down the socket.
 *
 * It never connects to the database and holds no database credentials. Meter
 * updates, pricing and audit writes remain the API's responsibility, so charger
 * traffic and the web API scale, restart and fail independently.
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { assertConfig, config } from "./config.js";
import { drainCommands, forwardFrame, isRegistered } from "./central-system.js";
import { CALL, CALLRESULT, actionOf, messageId, parseEnvelope, protocolError } from "./frames.js";
import { log } from "./log.js";
import * as registry from "./registry.js";

assertConfig();

const http = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/healthz" || req.url === "/")) {
    const body = {
      service: "ocpp-gateway",
      protocol: config.subprotocol,
      uptimeSeconds: Math.round(process.uptime()),
      connectedChargePoints: registry.size(),
      chargePoints: registry.all().map((c) => ({
        identity: c.identity,
        connectedAt: new Date(c.connectedAt).toISOString(),
        lastFrameAt: new Date(c.lastFrameAt).toISOString(),
        framesIn: c.framesIn,
        framesOut: c.framesOut,
      })),
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ noServer: true, handleProtocols: () => config.subprotocol });

function identityFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const path = url.split("?")[0] ?? "";
  const prefix = config.pathPrefix.replace(/\/+$/, "");
  if (!path.startsWith(`${prefix}/`)) return null;
  const identity = decodeURIComponent(path.slice(prefix.length + 1)).replace(/\/+$/, "");
  return identity.length > 0 && identity.length <= 128 ? identity : null;
}

http.on("upgrade", (req, socket, head) => {
  void (async () => {
    const identity = identityFromUrl(req.url);
    if (!identity) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    // Only registered charge points get a socket; unknown identities are refused.
    if (!(await isRegistered(identity))) {
      log.warn("rejected unregistered charge point", { identity });
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      accept(ws, identity, String(req.socket.remoteAddress ?? "unknown"));
    });
  })();
});

function send(connection: registry.Connection, payload: unknown): void {
  if (connection.socket.readyState !== connection.socket.OPEN) return;
  connection.socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
  connection.framesOut += 1;
}

function accept(socket: WebSocket, identity: string, remoteAddress: string): void {
  const connection: registry.Connection = {
    identity,
    socket,
    connectedAt: Date.now(),
    lastFrameAt: Date.now(),
    framesIn: 0,
    framesOut: 0,
    alive: true,
    remoteAddress,
  };
  registry.add(connection);
  log.info("charge point connected", { identity, remoteAddress });

  socket.on("pong", () => {
    connection.alive = true;
  });

  socket.on("message", (raw) => {
    void handleMessage(connection, raw.toString());
  });

  socket.on("close", (code, reason) => {
    registry.remove(identity, socket);
    log.info("charge point disconnected", {
      identity,
      code,
      reason: reason.toString(),
      framesIn: connection.framesIn,
      framesOut: connection.framesOut,
    });
  });

  socket.on("error", (error) => {
    log.error("socket error", { identity, error: error.message });
  });

  // Anything the control room queued while the charger was offline goes out now.
  void deliverQueuedCommands(connection);
}

async function handleMessage(connection: registry.Connection, raw: string): Promise<void> {
  connection.lastFrameAt = Date.now();
  connection.framesIn += 1;

  const frame = parseEnvelope(raw);
  if (!frame) {
    log.warn("malformed frame", { identity: connection.identity });
    send(connection, protocolError("0", "Frame is not valid OCPP-J"));
    return;
  }

  const reply = await forwardFrame(connection.identity, frame);
  if (!reply) {
    // The API could not be reached. For a CALL, tell the charger honestly so it
    // retries rather than assuming the transaction was recorded.
    if (frame[0] === CALL) {
      send(
        connection,
        JSON.stringify([4, messageId(frame), "InternalError", "Central system unavailable", {}]),
      );
    }
    return;
  }

  if (frame[0] === CALL) {
    const response = reply.responses[0];
    if (response !== undefined) send(connection, response);
  }
  for (const command of reply.pending) send(connection, command);

  log.info("frame handled", {
    identity: connection.identity,
    type: frame[0] === CALL ? "CALL" : frame[0] === CALLRESULT ? "CALLRESULT" : "CALLERROR",
    action: actionOf(frame),
    messageId: messageId(frame),
    commandsSent: reply.pending.length,
  });
}

async function deliverQueuedCommands(connection: registry.Connection): Promise<void> {
  const commands = await drainCommands(connection.identity);
  for (const command of commands) send(connection, command);
  if (commands.length > 0) {
    log.info("delivered queued commands", {
      identity: connection.identity,
      count: commands.length,
    });
  }
}

/** Keepalive: a charge point that misses two pings is dropped, not left stale. */
const pingTimer = setInterval(() => {
  for (const connection of registry.all()) {
    if (!connection.alive) {
      log.warn("charge point unresponsive, closing socket", { identity: connection.identity });
      connection.socket.terminate();
      registry.remove(connection.identity, connection.socket);
      continue;
    }
    connection.alive = false;
    try {
      connection.socket.ping();
    } catch {
      /* socket already closing */
    }
  }
}, config.pingIntervalMs);

/** Command delivery for sockets that are idle between charger frames. */
const commandTimer = setInterval(() => {
  for (const connection of registry.all()) {
    void deliverQueuedCommands(connection);
  }
}, config.commandPollMs);

http.listen(config.port, () => {
  log.info("gateway listening", {
    port: config.port,
    path: config.pathPrefix,
    protocol: config.subprotocol,
    api: config.apiBaseUrl,
    heartbeatPingMs: config.pingIntervalMs,
    commandPollMs: config.commandPollMs,
  });
});

function shutdown(signal: string): void {
  log.info("shutting down", { signal, connections: registry.size() });
  clearInterval(pingTimer);
  clearInterval(commandTimer);
  for (const connection of registry.all()) {
    connection.socket.close(1001, "Gateway shutting down");
  }
  wss.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
