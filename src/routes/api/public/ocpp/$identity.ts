/**
 * OCPP 1.6-J endpoint.
 *
 *   ws(s)://<host>/api/public/ocpp/<ChargePointIdentity>   (subprotocol: ocpp1.6)
 *
 * Any OCPP 1.6-J compliant charge point from any vendor connects here — UZA's
 * 180 kW dual-gun DC piles, third-party DC units, and AC wallboxes alike. The
 * identity in the path must already be registered on the network; unknown
 * identities are rejected with a SecurityError and logged.
 *
 * A POST to the same path accepts one frame (or an array of frames) as JSON.
 * That is the same central-system code path, used for commissioning tests and
 * for chargers behind gateways that cannot hold a socket open on Rwandan
 * mobile backhaul.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AnyFrame } from "@/lib/ocpp/schemas";
import { OCPP } from "@/config/policy";

export const Route = createFileRoute("/api/public/ocpp/$identity")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const identity = decodeURIComponent(params.identity);
        const {
          resolveChargePoint,
          drainCommands,
          handleFrame,
          ackCommandResult,
        } = await import("@/lib/ocpp/handler.server");

        const cp = await resolveChargePoint(identity);
        if (!cp) {
          return new Response("Charge point not registered", { status: 404 });
        }

        // Not a WebSocket handshake: report readiness instead of failing oddly.
        if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
          return Response.json({
            protocol: OCPP.protocol.value,
            identity,
            registered: true,
            heartbeatInterval: OCPP.heartbeatIntervalSeconds.value,
            hint: "Connect with a WebSocket upgrade, or POST OCPP frames to this URL.",
          });
        }

        const pairFactory = (globalThis as { WebSocketPair?: new () => Record<string, WebSocket> })
          .WebSocketPair;
        if (!pairFactory) {
          return new Response(
            "WebSocket transport is unavailable in this runtime; POST OCPP frames to this URL instead.",
            { status: 501 },
          );
        }

        const pair = new pairFactory();
        const client = pair['0']!;
        const server = pair['1']!;
        (server as unknown as { accept: () => void }).accept();

        server.addEventListener("message", (event: MessageEvent) => {
          void (async () => {
            let decoded: unknown;
            try {
              decoded = JSON.parse(String(event.data));
            } catch {
              return;
            }
            const frame = AnyFrame.safeParse(decoded);
            if (!frame.success) {
              server.send(
                JSON.stringify([4, "0", "ProtocolError", "Frame is not valid OCPP-J", {}]),
              );
              return;
            }
            if (frame.data[0] === 3) {
              const payload = frame.data[2] as Record<string, unknown>;
              await ackCommandResult(String(frame.data[1]), payload['status'] !== "Rejected");
              return;
            }
            const { response } = await handleFrame(identity, frame.data);
            server.send(JSON.stringify(response));

            // Anything queued by the control room goes out on the same socket.
            for (const outbound of await drainCommands(cp)) {
              server.send(JSON.stringify(outbound));
            }
          })();
        });

        return new Response(null, {
          status: 101,
          webSocket: client,
          headers: { "Sec-WebSocket-Protocol": OCPP.protocol.value },
        } as ResponseInit & { webSocket: WebSocket });
      },

      POST: async ({ request, params }) => {
        const identity = decodeURIComponent(params.identity);
        const { handleFrame, drainCommands, resolveChargePoint, ackCommandResult } = await import(
          "@/lib/ocpp/handler.server"
        );

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const cp = await resolveChargePoint(identity);
        if (!cp) {
          return Response.json({ error: "Charge point not registered" }, { status: 404 });
        }

        // `{"drain":true}` carries no charger frame: the standalone OCPP gateway
        // uses it to collect remote commands for a socket that is idle.
        if (
          body !== null &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          (body as { drain?: unknown }).drain === true
        ) {
          return Response.json({ responses: [], pending: await drainCommands(cp) });
        }

        const frames = Array.isArray(body) && Array.isArray(body[0]) ? (body as unknown[]) : [body];
        const responses: unknown[] = [];
        for (const raw of frames) {
          const parsed = AnyFrame.safeParse(raw);
          if (!parsed.success) {
            responses.push([4, "0", "ProtocolError", "Frame is not valid OCPP-J", {}]);
            continue;
          }
          // A CALLRESULT is the charger answering a queued remote command.
          if (parsed.data[0] === 3) {
            const payload = parsed.data[2] as Record<string, unknown>;
            await ackCommandResult(String(parsed.data[1]), payload['status'] !== "Rejected");
            continue;
          }
          const { response } = await handleFrame(identity, parsed.data);
          responses.push(response);
        }

        const pending = await drainCommands(cp);
        return Response.json({ responses, pending });
      },
    },
  },
});
