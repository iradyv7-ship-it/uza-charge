# Performance, security, availability, retention and recovery

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 19.1–19.2 and 30.2–30.4**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches performance budgets, security practices, availability objectives and metrics, data retention and privacy, or security and support operations.*
*Related: durable transaction processing (§30.1) lives in [`01-csms-ocpp.md`](01-csms-ocpp.md); the RURA uptime definition (§15.1) lives in [`07-operations-compliance.md`](07-operations-compliance.md).*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 19. NON-FUNCTIONAL REQUIREMENTS (part)

### 19.1 Performance and reliability
- Charger message → visible on dashboards in under `policy.MAX_EVENT_LAG` (target 5 s).
- Platform availability target 99.9%; CSMS gateway with no single point of failure (two nodes minimum in production).
- QR scan → payment prompt in under 10 s on 3G.
- Reports over 12 months of data render in under 5 s (use pre-aggregated daily/hourly tables).

### 19.2 Security
- OWASP ASVS level 2 practices; dependency scanning in CI; secrets in env/secret manager only.
- OCPP Security Profile 2+ (6.2). Per-charger credentials, rotation supported.
- Payment callbacks verified; idempotency everywhere; two-person approval for large refunds and payout-account changes.
- PII minimised; drivers' phone numbers never shown to owner staff by default; access logged.
- Rate limits on OTP, login, card linking, QR start.
- Fraud rules: card UID at two distant sites within minutes, many failed starts per token, unusual refund patterns.

---

## 30. RELIABILITY, SECURITY, RETENTION AND RECOVERY (part)

### 30.2 Availability objectives
Separate platform uptime, charger connectivity, charging technical availability and successful driver charge rate. Report unknown observation periods honestly. Define denominator, scheduled hours, weighting (connector-time and optionally installed power), exclusions and metric version; show raw and any approved adjusted uptime. Successful charge rate denominator includes eligible attempts and clear exclusions, not only completed sessions.

Monitor queue lag, callback delays, reconciliation backlog, command outcome, failed starts, stop overshoot, provider availability, tenant isolation, report completeness and support response. Set reviewed recovery-time/recovery-point objectives for database, gateway, configuration and document store before launch; test them. Daily backup is not proof of recoverability. Exercise restores, database failover, provider outages and site reconnect storms; publish customer communications and operational runbooks.

### 30.3 Data retention and privacy
Approve a retention schedule by purpose and jurisdiction: financial records, receipts/contracts, raw protocol frames, diagnostic files, high-frequency telemetry, support media, identity and security logs. Encrypt storage/backups; separate sensitive identifiers from reusable analytics; pseudonymise where appropriate. Restrict exports and log access. Retain records under a justified legal hold; expire other data safely, including backup lifecycle. Immutability during retention does not imply indefinite retention of all personal data.

Review all processors and transfers: hosting, backup, SMS/WhatsApp, analytics, maps, support and optional AI. Rwanda hosting alone does not resolve every data-transfer question. Retain applicable approvals and processing agreements. Provide account recovery, data-request/complaint routes and protected deletion/anonymisation workflows without corrupting retained financial evidence.

### 30.4 Security and support operations
Enforce MFA for privileged users, OTP abuse/SIM-change safeguards, verified payout destination and maker-checker for sensitive changes. Commissioning QR labels use trusted domain and tamper-evident/inspection practices; incident reports include suspected replacement QR/payment fraud. Firmware authenticity, staged rollout and rollback are model-specific. Audit storage must resist unauthorised modification and record support/emergency access. Test isolation at API, jobs, WebSocket updates, object storage, exports and report generation, not only database queries.
