# Charger gateway — OCPP 1.6J, compatibility, migration and durable processing

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 6, 26 and 30.1**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches the CSMS gateway, charger onboarding, vendor adapters, protocol versions or durable transaction processing.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 6. CSMS — OCPP 1.6J GATEWAY (THE HEART)

### 6.1 Feature profiles — implement all six

| Profile | Messages (charger → server) | Messages (server → charger) |
|---|---|---|
| **Core** | BootNotification, Heartbeat, StatusNotification, Authorize, StartTransaction, MeterValues, StopTransaction, DataTransfer | RemoteStartTransaction, RemoteStopTransaction, Reset, UnlockConnector, ChangeAvailability, ChangeConfiguration, GetConfiguration, ClearCache, DataTransfer |
| **Firmware Management** | FirmwareStatusNotification, DiagnosticsStatusNotification | UpdateFirmware, GetDiagnostics |
| **Local Auth List Management** | — | SendLocalList, GetLocalListVersion |
| **Reservation** | — | ReserveNow, CancelReservation |
| **Smart Charging** | — | SetChargingProfile, ClearChargingProfile, GetCompositeSchedule |
| **Remote Trigger** | — | TriggerMessage |

Plus the **OCPP 1.6 Security Whitepaper** extensions where the charger supports them: SecurityEventNotification, SignedUpdateFirmware, GetLog / LogStatusNotification, ExtendedTriggerMessage, certificate messages.

### 6.2 Connection and security

- Endpoint: `wss://csms.<domain>/ocpp/{chargePointIdentity}` with subprotocol `ocpp1.6`.
- **Security Profile 2 minimum**: TLS + HTTP Basic Auth with a unique, generated password per charger (stored hashed; shown once at onboarding). Profile 3 (client certificates) when the charger supports it.
- Unknown identities are rejected and logged as a security event; repeated attempts are rate-limited and alerted.
- WebSocket ping interval configurable; detect dead connections; mark charger Offline after `policy.OFFLINE_AFTER` without heartbeat or traffic.
- Handle reconnect storms (e.g. after a grid outage all chargers reconnect at once) without dropping messages.

### 6.3 Message handling rules

- Validate every message against the official OCPP 1.6J JSON schemas. Reject malformed messages with the correct CallError and log them.
- Respond to every charger Call within the timeout; do business work asynchronously after replying where the protocol allows.
- Every inbound and outbound frame is stored raw, with charger identity, direction, message type, unique ID, timestamp received and timestamp sent by the charger. **Raw logs are append-only during their retention period**, encrypted and access-controlled, with cold storage where appropriate. Retention is purpose-specific and approved (Section 30); preserve financial evidence as required, minimise personal identifiers and do not retain all telemetry forever by default.
- Time: send BootNotification `currentTime`; correct charger clocks via Heartbeat responses; flag chargers whose clock drifts more than `policy.CLOCK_DRIFT_ALERT`.
- Transactions: the server issues `transactionId`. Use a stable internal session ID, distinct from authorisation attempt IDs, OCPP transaction IDs and provider references. Correlate them explicitly. Offline starts and retried messages must resolve to the same session without reusing an ID across different transactions.
- Queued messages: chargers resend StartTransaction/StopTransaction/MeterValues after an outage. Use durable protocol request/reply deduplication keyed by charger identity, connection/protocol context and message ID, supplemented by transaction and meter semantics. Persist the response before acknowledging side effects. Do not collapse distinct samples merely because their values match. Late evidence creates auditable settlement revisions.

### 6.4 Configuration pushed to every charger on first boot ("provisioning")

On BootNotification of a new or changed charger, run a provisioning job:

1. `GetConfiguration` (no keys) → store the full configuration snapshot (versioned).
2. Read `SupportedFeatureProfiles`, `NumberOfConnectors`, `MeterValuesSampledDataMaxLength`, `LocalAuthListMaxLength`, `ChargeProfileMaxStackLevel`, etc. → build the **capability record** for this charger.
3. `ChangeConfiguration` to UZA defaults (values from policy.ts, only keys the charger supports):
   - `HeartbeatInterval`
   - `MeterValueSampleInterval` (during sessions, target 30 s)
   - `MeterValuesSampledData` → **every measurand the charger supports** (see 6.5)
   - `ClockAlignedDataInterval` (target 900 s = 15 min, also when idle)
   - `MeterValuesAlignedData` → energy register, power, voltage, temperature
   - `StopTxnSampledData` and `StopTxnAlignedData`
   - `ConnectionTimeOut`, `AuthorizeRemoteTxRequests`, `LocalAuthListEnabled`, `LocalAuthorizeOffline`, `LocalPreAuthorize`, `AllowOfflineTxForUnknownId = false`, `StopTransactionOnEVSideDisconnect = true`, `StopTransactionOnInvalidId = true`, `UnlockConnectorOnEVSideDisconnect = true`, `TransactionMessageAttempts`, `TransactionMessageRetryInterval`, `WebSocketPingInterval`
4. Record which settings were Accepted / Rejected / RebootRequired / NotSupported. Show this on the charger page as the **Data Capability Score** (what % of the measurands and features we asked for are actually delivered).
5. `TriggerMessage(StatusNotification)` for every connector to get the true current state.

### 6.5 Capture everything the machine can provide

**Measurands (MeterValues)** — request all that the charger supports, per phase and location where applicable:

| Measurand | Why we want it |
|---|---|
| `Energy.Active.Import.Register` | kWh delivered — billing and all energy reports |
| `Energy.Active.Import.Interval` | Energy per interval — load profiles |
| `Energy.Reactive.Import.Register` | Reactive energy — power-quality checks |
| `Power.Active.Import` | Live kW |
| `Power.Offered` | What the charger offered vs what the car took |
| `Current.Import`, `Current.Offered` | Live current and limit |
| `Voltage` | Output voltage (and input voltage where reported) |
| `SoC` | Reported battery % — arrival/departure and charging curves; not a certified state-of-health measurement |
| `Temperature` (Body, Cable, Outlet, Inlet) | Overheating, predictive maintenance |
| `Power.Factor`, `Frequency` | Grid quality, RURA power factor ≥ 0.9 evidence |
| `RPM` | Fan speed — cooling health |

Each sample stored in the time-series table with: charger, connector, transaction (if any), measurand, phase, location, unit, context (`Sample.Periodic`, `Sample.Clock`, `Transaction.Begin`, `Transaction.End`, `Trigger`), value, charger timestamp, server timestamp.

**Status and faults (StatusNotification)** — store every status change per connector with `status`, `errorCode`, `vendorId`, `vendorErrorCode`, `info`, timestamp. Status values: Available, Preparing, Charging, SuspendedEVSE, SuspendedEV, Finishing, Reserved, Unavailable, Faulted. Error codes: ConnectorLockFailure, EVCommunicationError, GroundFailure, HighTemperature, InternalError, LocalListConflict, NoError, OtherError, OverCurrentFailure, OverVoltage, PowerMeterFailure, PowerSwitchFailure, ReaderFailure, ResetFailure, UnderVoltage, WeakSignal. Maintain a **vendor error-code dictionary** per model (human-readable meaning, severity, suggested action), editable in the Control Room.

**Session end reasons (StopTransaction)** — DeAuthorized, EmergencyStop, EVDisconnected, HardReset, Local, Other, PowerLoss, Reboot, Remote, SoftReset, UnlockCommand — plus our own reasons (balance exhausted, booking ended, amount reached, operator stop, watchdog stop).

**Identity of the machine (BootNotification)** — vendor, model, serial (charge point and charge box), firmware version, ICCID/IMSI (SIM), meter type and serial. Changes in firmware or meter serial are recorded as asset events.

**Logs** — GetDiagnostics / GetLog uploads (to object storage), FirmwareStatusNotification and DiagnosticsStatusNotification history.

**Vendor data via DataTransfer** — see 6.6.

### 6.6 Vendor adapters (Wicen first)

Chargers collect more than standard OCPP carries — Wicen's own protocol documentation (Yunkuaichong-style) shows the machine handles: vehicle **VIN**, BMS charging demand (voltage/current requested), battery voltage and current, **cell maximum voltage**, **battery maximum temperature**, insulation status, power-module status, gun temperature, detailed start-failure and stop codes, and dual-gun parallel charging.

- Build a **vendor adapter interface**: `parseDataTransfer(vendorId, messageId, data) → typed events`, plus a `capabilities` declaration per model.
- **Wicen adapter**: once Wicen confirms their OCPP DataTransfer payloads (requested via WeChat), map them to typed records: `vehicle_identity` (VIN, BMS protocol version, battery type, rated capacity, rated voltage), `bms_snapshot` (demand V/A, measured V/A, SoC, cell max V, max temp, estimated time to full), `module_health`.
- Note: the richest battery data comes from **GB/T** vehicles (the Chinese-spec cars UZA imports). CCS2 cars typically give SoC and limits but not VIN or cell data. Store what arrives; never fabricate missing fields.
- Unknown DataTransfer payloads are stored raw and surfaced in the Control Room so new vendors can be mapped later.

### 6.7 OCPP edge cases — must all be handled and tested

1. Remote start times out → mark start outcome unknown; reconcile charger state and transaction evidence before retrying or releasing funds. A late start must be stopped or linked to its authorised payment under the defined recovery rule; never create a free, untracked transaction.
2. Charger accepts start but StartTransaction is delayed/missing → reconcile status and request supported evidence. Accepted is not proof of charging. Release/refund after confirmed no-start; unresolved cases enter recovery with a bounded customer-resolution deadline.
3. StartTransaction arrives without our RemoteStart (local card tap) → normal Authorize flow; unknown token → reject.
4. Charger reports Available/Idle during an active session (two consecutive frames) → flag as **abnormal session**.
5. Cable disconnect reported but StopTransaction missing → request supported status/meter evidence, flag the record and issue a provisional bill only under the published evidence policy. Missing telemetry alone is not proof of disconnect.
6. StopTransaction arrives hours late (offline charger) → settle on arrival, adjust provisional settlement, notify driver and owner of any change.
7. Meter register goes backwards or jumps impossibly (meter replaced, reset, corrupt) → flag, do not bill the anomaly, alert NOC.
8. MeterValues gap during session → bill from register start/stop; mark gap in the session record.
9. Excessively long session → abnormal-session queue. Heartbeat is not an energy reading. Any provisional bill must use admissible meter evidence, disclose uncertainty and follow the dispute/correction policy.
10. Same card starts on two chargers at once → second Authorize rejected (`ConcurrentTx`).
11. Power loss at site → all connectors offline; on reconnect, reconcile every open transaction.
12. Charger reboots during a session → reconcile with the charger's queued messages.
13. Duplicate messages after reconnection → idempotent processing.
14. Clock drift → preserve event time and receive time with clock-quality metadata. For queued offline samples, do not use arrival time as charging time. Apply the published time-reconstruction or conservative dispute policy (Section 7.3).
15. Dual-gun on one power cabinet → when both guns charge, expected power per gun drops; show it to the driver before start.
16. Firmware update fails midway → FirmwareStatusNotification tracked; charger flagged; rollback procedure in technician runbook.
17. Wrong tariff mid-session (owner changes price) → session keeps its pinned tariff version.
18. Booking holder arrives but bay occupied → physical occupancy and reassignment workflow. SuspendedEV alone does not prove the vehicle is full or overstaying (Section 10).

### 6.8 Simulator and test suite (in `uza-charge-csms`)

- A charger simulator that speaks real OCPP 1.6J over WebSockets: configurable connectors, power curves, SoC curves, faults, disconnections, late messages, clock drift, vendor DataTransfer.
- Scenario scripts for every edge case in 6.7 — run in CI.
- Load test: 500 simulated chargers sending MeterValues every 30 s for 24 h without message loss or lag above `policy.MAX_EVENT_LAG`.
- The simulator remains in production tooling for demos and onboarding training — clearly labelled "SIMULATED" everywhere it appears.

### 6.9 Later integrations (design for them now)

- **Site main meter** (grid import meter, Modbus TCP or manual monthly reading/bill upload): needed for true energy cost and charger-loss calculation.
- **VGrid EMS** (Modbus TCP): PV production, battery SoC/charge/discharge, grid import/export, DC bus voltage, site power limit. Feeds the site energy report and the load-management engine.
- **Smart charging / load management** (RURA Art. 23): site power cap shared across connectors, time-of-day limits, demand-response command from REG/RURA, battery-low curtailment on VGrid sites — via `SetChargingProfile` (TxDefaultProfile / TxProfile / ChargePointMaxProfile).
- **OCPI 2.2.1** (roaming with other networks), **OCPP 2.0.1** support — later, behind the same gateway.

---

## 26. ADOPTION, MIGRATION AND CHARGER COMPATIBILITY

### 26.1 Adoption without unnecessary disruption
Support new build, existing OCPP migration, monitoring/manual reporting and private/fleet sites. Owners choose public listing and supported modules. A qualified owner should reach a useful report quickly without first configuring cards, roaming or investment instruments.

Monitor-Lite accepts meter readings, approved statement imports, bills and costs with source labels. It provides visibility, not live remote control. Import files map units, currency, timezone and columns; validate totals, preview errors, deduplicate and retain source provenance. Imported customer data requires an appropriate transfer basis. Opening balances are separately reviewed; historical invoices are not regenerated as new transactions.

### 26.2 Cutover workflow
1. Assess model/firmware, current backend, access credentials, vendor locks, contract exit conditions, card formats, pending sessions and balances.
2. Agree data scope, responsibilities, maintenance window, driver notice and rollback criteria. One charger usually has one active CSMS endpoint; do not promise simultaneous connection without tested support.
3. Import/read-only baseline where supported; capture configuration and complete old-platform transactions before switching.
4. Change endpoint through authorised access; provision only approved settings; test each connector, payment route and card configuration involved.
5. Reconcile old/new cutoff balances and invoices. Do not import money merely by copying a balance field.
6. Approve go-live and enhanced monitoring; retain controlled rollback with rules preventing duplicates or forgotten holds. Public availability starts only after successful acceptance.

Measure time to useful report, time to connected charger, migration downtime, support effort and onboarding completion. Advertised setup times are demonstrated targets conditional on hardware access, connectivity and credentials.

### 26.3 Compatibility directory
Each entry: manufacturer, model, hardware revision, firmware, protocol, connection/security profile, reader authentication, meter resolution, connectors/shared power, remote commands, reservation/local authorisation, smart charging, offline limit/replay, diagnostics and vendor extensions. Capabilities carry `declared`, `simulator-tested`, `hardware-tested`, `field-proven` or `unsupported`, test date, evidence and limitations.

Show functional compatibility separately from rich telemetry coverage. Lack of battery cell data must not make an otherwise reliable charger appear unsuitable. A single percentage score is secondary to the detailed capability matrix.

Supplier RFQ/acceptance requires configurable endpoint/security, owner access and export rights, test firmware/device, clear power-sharing specification, protocol evidence, meter behaviour, reader implementation and documented support. Purchase hardware conditional on required acceptance functions. Certification is verified against the issuing body's record; UZA's test badge is never presented as an OCA certificate. Plan OCA conformance testing/certification for the CSMS when commercially justified.

### 26.4 Versions and protocols
Keep protocol adapters separate from common domain logic. OCPP 1.6 and 2.0.1 need distinct implementations; OCPP 2.1 planning follows actual customer/hardware demand. OCPI partner version and supported modules are discovered and negotiated. AC/DC, private/public and multi-connector capabilities must not be hard-coded around one dual-gun DC model.

---

## 30. RELIABILITY — DURABLE TRANSACTION PROCESSING (part)

### 30.1 Durable transaction processing
Financial operations have atomic unique keys, balanced entries and database concurrency controls. Redis accelerates state and routing; it is not the final source of funds. Authorise/start creates a durable decision/hold before acknowledgement. Gateway start/stop acceptance must persist enough state to recover protocol replies and transaction correlations without duplicate side effects.

Document gateway-to-core timeout/fallback for Authorize and StartTransaction. Business work may be asynchronous only after required protocol/security/durable evidence decisions. Queue ingestion, processing, retries and dead-letter review are observable. Horizontal gateways use connection ownership/fencing and routed commands so two nodes cannot independently control the same charger. Restart/failover preserves transaction mapping and reconciles sessions.
