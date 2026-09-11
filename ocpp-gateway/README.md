# UZA Charge Network — OCPP 1.6-J Gateway

A standalone process whose only job is to own charger sockets. It runs, restarts
and scales independently of the web API.

```
charge point ──ws (ocpp1.6)──► ocpp-gateway ──https──► UZA Charge API ──► Postgres
                               (sockets only)          (validation, pricing,
                                                        meter values, audit)
```

## Why a separate process

- A long-lived WebSocket from a charger on Rwandan mobile backhaul has a very
  different lifetime from an HTTP request. Keeping them in one process couples a
  web deploy to every charger reconnecting.
- Meter values arrive continuously. Socket handling and keepalive must not
  compete with page traffic.
- The gateway holds **no database credentials**. All persistence, Zod payload
  validation, pricing and audit writes stay in the API, which is the only
  component allowed to touch the database.

## Responsibilities

| Gateway | API (central system) |
| --- | --- |
| Terminate `ocpp1.6` WebSockets | Validate every payload with Zod |
| Verify the identity is registered before accepting the socket | Persist raw OCPP events (append-only) |
| Envelope framing (CALL / CALLRESULT / CALLERROR) | Session lifecycle, meter values, pricing, receipts |
| Ping keepalive, drop unresponsive chargers, one socket per charge point | Online / offline / last-seen state |
| Deliver queued remote commands and relay their results | Queue commands from the control room |
| Structured JSON logs, `/healthz` inventory | Everything requiring the database |

## Run it

```bash
cd ocpp-gateway
cp .env.example .env      # set UZA_API_BASE_URL
npm install
npm start                 # or: npm run dev
```

Charge point configuration:

```
ws://<gateway-host>:9220/ocpp/<ChargePointIdentity>
Sec-WebSocket-Protocol: ocpp1.6
```

Health and connected inventory: `GET http://<gateway-host>:9220/healthz`.

From the repository root the same process runs with `npm run gateway`.

## Behaviour worth knowing

- **Unregistered identities are refused** at the handshake (HTTP 401) and logged.
  If the API cannot be reached the check fails closed.
- **The API being down is never hidden.** A charger CALL gets an
  `InternalError` CALLERROR so it retries, instead of a fabricated acceptance.
- **No stale "live" state.** The gateway does not report charger status; online,
  offline and last-seen come from the database via the API.
- **Reconnect supersedes.** A new socket for the same identity closes the old one
  with code 1012.
- `SIGTERM`/`SIGINT` closes every socket with 1001 before exiting.

## Deployment note

This process needs a runtime that can hold WebSockets open — a container or VM
(Fly.io, Render, Railway, a Kigali VPS, Docker on-prem). It is not deployed with
the Lovable-hosted web app; point `UZA_API_BASE_URL` at the published API and run
it wherever your chargers can reach it. Until it is deployed, the in-app endpoint
at `/api/public/ocpp/<identity>` continues to serve chargers directly.
