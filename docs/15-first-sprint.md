# First sprint prompt (copy into Claude Code)

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Section 23**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. This sprint's modules: [`01-csms-ocpp.md`](01-csms-ocpp.md), [`12-data-model.md`](12-data-model.md), [`13-configuration.md`](13-configuration.md).*
*Phase and gate: Phase 0, part 1 — see [`14-delivery-decisions-tests.md`](14-delivery-decisions-tests.md) §20.*
*One topic, one home (core §0 rule 7): if a rule in this section changes, edit it here and nowhere else.*

---

## 23. FIRST SPRINT PROMPT (copy into Claude Code)

> You are building `uza-charge-csms` and the charging domain of `uza-charge-api` for UZA Mobility, following `CLAUDE.md` and the module documents in `docs/` (the source of truth — load `docs/01-csms-ocpp.md`, `docs/12-data-model.md` and `docs/13-configuration.md` for this sprint) and UZA's engineering standards.
>
> **Sprint goal (Phase 0, part 1):** a production-grade OCPP 1.6J gateway that a real Wicen DC charger can connect to.
>
> 1. Inspect any existing code and the Lovable prototype data model first; summarise what you will reuse.
> 2. Scaffold `uza-charge-csms` (NestJS) with: WSS endpoint `/ocpp/{identity}`, subprotocol `ocpp1.6`, Security Profile 2 (TLS + per-charger Basic Auth), JSON-schema validation of all OCPP 1.6J messages, Redis connection registry, append-only raw message log (partitioned by month).
> 3. Implement Core profile handlers: BootNotification, Heartbeat, StatusNotification, Authorize, StartTransaction, MeterValues, StopTransaction, DataTransfer (store raw) — writing typed `charger_events`.
> 4. Implement command intents/outbox with operation-specific retries, unknown-outcome reconciliation, timeouts and observed-effect tracking; server calls: RemoteStart/Stop, Reset, UnlockConnector, ChangeAvailability, Get/ChangeConfiguration, TriggerMessage. Never blindly retry physical side effects.
> 5. Implement provisioning (Section 6.4) and the capability record + Data Capability Score.
> 6. Build the OCPP simulator and automated scenarios for edge cases 6.7 #1–14.
> 7. Add Prisma models: ChargePoint, Connector, ChargerConfigSnapshot, ChargerCapability, OcppMessageRaw, ChargerEvent, ChargerCommand, StatusChange, MeterSample (TimescaleDB), Session (without billing yet).
> 8. Copy the supplied `src/config/policy.ts` as the seed; implement the versioned configuration registry on top of it (Section 19.5); keep `POLICY_KEY_MIGRATION` and make unknown keys fail CI. Put `network_id` on every table and create UCN as network #1 — no UZA-specific values in code (rule 21).
> 9. Deliver: running services (`npm start`), `.env.example`, README with how to point a real charger at staging, test report, and `OPEN_QUESTIONS.md`.
>
> Rules: gateway performs protocol/security handling and durable transaction correlation; semantic authorisation calls the core service under a bounded response deadline. Never return Accepted while the authoritative decision is still unknown. No duplicate wallet/ledger implementation; no money logic this sprint; no fake data; never mark anything done that has not run against the simulator; label external dependencies `AWAITING CREDENTIALS`.
