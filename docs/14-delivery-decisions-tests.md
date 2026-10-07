# Delivery phases and proof gates, founder decisions, release tests, sources and handover

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 20, 21** (including the former 33.1), **32.3 and 33.2–33.3**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module at the start of every sprint to confirm which phase the work belongs to and what evidence its gate needs.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 20. DELIVERY PHASES AND PROOF GATES

These are evidence gates, not calendar promises. Publish the current phase and demonstrated capabilities. Define must-have, optional and deferred work for each release; engineering capacity and outside credentials determine the schedule. Do not require an unrelated optional module to pass before fixing the core service.

### Phase 0 — Hardware, architecture and financial foundations
- Inspect existing repositories/prototype and the UZA engineering standards; reuse working components without copying unsafe production assumptions.
- Establish scoped network/owner identity, typed configuration, audit, durable event handling, secure gateway, simulator, observability and recovery runbook.
- Connect one real Wicen unit at factory or staging; record firmware, reader, meter, profiles, limits and vendor evidence. Implement core transaction handlers before advanced profiles.
- Define ledger integration contract and replay/idempotency tests without production collections. Approve the safety/site-power envelope before live energisation.
- Gate: 50 consecutive real test sessions with no lost/duplicated transactions; energy-register agreement within the approved tolerance (initial test target 0.5%, not a metrological certification); all applicable edge cases pass; durable acknowledgement/replay proven; hardware capability report and blocker list signed off. Test real reconnect/failover and shared dual-gun power.

### Phase 1 — First paid UZA site
- QR/web charging, one credentialed mobile-money provider, controlled refunds, simple tariff template, dynamic stop reserve, receipt and reconciliation.
- Owner mobile home/action centre, live view, incident routing, basic cost book, data-quality labels, technical/reported availability, morning digest and technician workflow.
- Physical commissioning and local protections must satisfy the reviewed site requirements. Site power caps/load protection needed for safety ship now; advanced economic optimisation can follow later.
- Gate: 30 days of paid operation; every collection, session, refund and payout accounted for, with all exceptions resolved or explicitly held in a reviewed queue; no unexplained financial difference at period close. Charging availability at least 97% measured as raw uptime (RURA Art. 26(a), verified — Section 15.1). Independent test of failed start, provider outage, late transaction, stop overrun and recovery. No invented tax invoice or compliance claim.

### Phase 2A — Independent owners and investors
- Onboarding/migration, Monitor-Lite, multi-owner isolation, contracts/edition billing, confirmed payouts, monthly close and investor/portfolio workspace.
- Guided monitoring-only adoption and controlled cutover for existing chargers. Third-party ownership of assets does not depend on stored-value cards launching.
- Gate: independent owner live for 30 days, correctly reconciled; owner completes core tasks without engineering help; investor pack traces returns to contracts and source evidence; close/adjustment/distribution approval tested; second demo network with distinct brand/currency isolated successfully. Two charger models tested before claiming multi-brand readiness; unsupported models remain labelled.

### Phase 2B — Cards, cash agents and controlled bookings
- Tested reader/card pairing, QR/manual card activation, approved wallet/fund-holder model, agent float, risk limits, basic top-up channels and card lifecycle.
- Booking/queue with actual reservation capability, physical bay process, start grace and transparent remedy. Cash procedures receive finance training/sign-off.
- Gate: regulatory and provider conditions satisfied for each enabled money flow; 100 active pilot cards as a proposed adoption target, actual field taps demonstrated, no duplicate/unexplained credit; every enabled top-up channel reconciled. Blocked-card propagation and offline restrictions tested. Do not delay release merely to manufacture three top-up channels. Unsupported offline modes remain off.

### Phase 3 — Demand and energy optimisation
- Fleet controls/demand commitments, retention and promotion economics, site planning, benchmarks, public API/webhooks, main meters and VGrid EMS where verified.
- Load allocation and grid/PV/storage optimisation; battery charging insights without uncertified SoH claims.
- Gate: instrumented site operates within its approved electrical envelope for 30 days; loss/fallback tests verified; complete energy boundaries reconcile within approved measurement uncertainty; promotion/fleet results distinguish measured demand from forecasts.

### Phase 4 — External branded networks and roaming
- First paid white-label customer on existing country/provider/hardware support; deployment automation, scoped support, network billing and managed support SLAs.
- Implement funded clearing, counterparty exposure, disputes and settlement controls before roaming. OCPP 2.0.1/2.1 demand and OCPI version selected through compatibility discovery, not assumption of protocol interchangeability.
- Gate: external network independently operates for 30 days; its funds/data remain isolated; configuration-only branding verified; roaming invoices, disputes, default limits and real payouts tested where activated; portability/export exercised.

### Phase 5 — Private deployments and geographic expansion
- Containerised private installation, signed releases, backups/restores, licence/update channel, reseller training and reviewed additional country packs.
- Gate: independent installation/upgrade/rollback/restore from documentation; first additional country has verified payment, tax, hosting and support readiness. Advanced AI, vehicle-to-grid or battery scoring need their own evidence gates, not a sales checkbox.

### Team accountability (PROPOSED — founder to confirm names and roles before circulation)
Gad coordinates architecture and delivery; Saddock takes scoped implementation ownership. **Abijuru is recorded as the designer of the UZA Solutions website (Figma) — confirm whether Abijuru joins as UI/UX design owner or as an implementer before assigning code ownership.** The following assignments came from v2 and are not yet confirmed:  Scorah — owner/fleet pilot feedback; Tresor — commissioning, reader/hardware acceptance and field runbooks; Kagabo — financial mapping, reconciliation and close; Vanessa (Head of Operations) — dependencies, acceptance owners and blockers. Founder approves commercial policy and customer promises. Every sprint has one accountable owner and named reviewer; do not assume specialist legal/electrical competence from a job title.

---

## 21. FOUNDER DECISIONS STILL OPEN (build as configuration)

| ID | Decision | Current placeholder (D-01–D-19) / owner and evidence (D-20–D-29) |
|---|---|---|
| D-01 | Wallet/ledger/payouts live in `uza-mobility-bn` spine (recommended) vs separate service | Spine |
| D-02 | SaaS prices per connector (Monitor / Operate) | null |
| D-03 | Network transaction fee % (Operate) and management fee % (Managed) | null |
| D-04 | In Model B, who holds the RURA licence for the site — owner or UZA? (affects seller of record, VAT, levy, liability) | Owner |
| D-05 | Who pays MoMo/Airtel disbursement fees on owner payouts; default payout mode | Owner pays; daily sweep |
| D-06 | Booking slot length options | 45 min |
| D-07 | Booking fee, no-show fee, cancellation tiers | 0 |
| D-08 | Idle fee rate, grace, cap | 0 / 10 min |
| D-09 | UZA card price, replacement fee, minimum first top-up | — |
| D-10 | Start balance, stop-overshoot liability and enforceable offline allowances | Offline disabled; limits and liability pending |
| D-11 | Data-centre choice in Rwanda (and UZA Cloud timing) | — |
| D-12 | Subscription non-payment policy timings | 14-day grace |
| D-13 | Platform pricing: network lease (Model D), private licence (Model E), roaming fee | null |
| D-14 | Card economics: card price (sold, free with first top-up, or subsidised), replacement fee, agent commission, agent float terms | — |
| D-15 | Anonymous vs registered card limits and KYC levels (after BNR guidance) | see policy |
| D-16 | Fund-holder model for UCN: UZA as operator vs licensed partner (MTN/Airtel/PSP) holding card balances | Pending BNR |
| D-17 | Card supplier and chip type (DESFire EV3 target) and whether UZA sells cards to other networks | DESFire EV3 |
| D-18 | Product/platform brand name for selling to other networks (vs "UZA Charge Network" as one network on it) | `uza-charge` |
| D-19 | Hardware bundle lease terms (Model F): deposit, term, what happens on default (never unsafe remote disabling) | — |
| D-20 | Prepaid overshoot liability and enforceable stop bounds | Founder/finance + hardware tests |
| D-21 | Offline eligibility, allowance, expiry and loss responsibility | Finance/operations + tested reader/charger |
| D-22 | Investor contract types, waterfall, reserves and approvals | Reviewed agreements + finance |
| D-23 | Completion/occupancy evidence and booking remedy | Operations + field pilots |
| D-24 | Support access, commercial neutrality and benchmark consent | Customer terms + security review |
| D-25 | Configuration approvers, rounding/time-quality policy and report close | Engineering/finance |
| D-26 | Recovery objectives and retention schedule | Operations/security + applicable evidence |
| D-27 | Managed support coverage, field boundaries and cost-based pricing | Operations/finance + actual pilot costs |
| D-28 | Initial supported model/firmware and certification plan | Compatibility acceptance evidence |
| D-29 | Required country/provider readiness and launch sequence | Country-pack checklist and partner credentials |

Regulatory/official verifications to obtain: BNR (stored value across owners, payment aggregation, card KYC levels, dormant balances), RRA (EBM invoicing and seller of record), NCSA (data hosting), RURA (regulation text held and verified — still to obtain: levy rate, report template, uptime exclusions, Model B licensee treatment), RSB (charger type approval for Wicen units).

Maintain a blocker register by affected capability and release gate. An unavailable optional USSD code must not block QR charging; missing required payment/fund-holder approval must block that money flow. No founder decision is converted into a verified external fact without evidence.

---

## 32. RELEASE TEST SCENARIOS (part)

### 32.3 Additional essential test scenarios
Beyond Section 6.7: simultaneous start/hold races; delayed payment after cancelled attempt; missing callback recovered by status lookup; pending payout after provider timeout; duplicate import; unknown refund outcome; late final meter after owner distribution; time-of-use crossing/clock drift/offline backlog; negative/reset meter; stop overrun; two offline sites with one credential; reader UID cloning risk; booking arrival during backend delay; occupied reserved bay; cloud outage while local power limit operates; investor waterfall with insufficient cash; multi-currency portfolio; incomplete cost book; expired support access; cross-tenant report/export/notification leak; licence expiry during an active session.

Test failures must produce the specified customer remedy and audit evidence, not merely an exception log. Public targets use measured sample size and observation period. Do not label the simulator load test a production SLA result.

---

## 33. SOURCES AND HANDOVER

### 33.2 Source notes for this revision
The supplied v1.1 prompt is the controlling source for UZA's intended product, existing prototype status, supplier references and historical founder choices. These statements are not independently verified deployments or contracts. This revision preserves them with clarified evidence requirements.

Primary reference links used to correct technical assumptions:
- [Open Charge Alliance FAQ](https://openchargealliance.org/faq/): distinct OCPP versions, protocol compatibility and certification framework.
- [Open Charge Alliance certification programme](https://openchargealliance.org/certification-program/): independent conformance testing. Passing UZA tests is not certification.
- [Chrome Web NFC documentation](https://developer.chrome.com/docs/capabilities/nfc): NDEF scope and supported browser/device context; not arbitrary low-level card provisioning.
- [NXP DESFire EV3](https://www.nxp.com/products/MF3DHx3): chip authentication/security features; actual charger-reader implementation still needs evidence.

RURA: the regulation text (No 011/ENERGY/RURA/2026, signed 29/06/2026) was supplied by the founder and is the source for Section 15 and the `VERIFIED_EXTERNAL` RURA keys. Still pending: levy rate, report template, uptime exclusions. Obtain authoritative RURA, BNR, RRA, data-protection and equipment-approval evidence appropriate to each activated capability. Engineering verifies current protocol/provider documentation at implementation time; this document is not a substitute for their schemas or signed terms.

### 33.3 Engineering handover
Deliver this document set in each repo (`CLAUDE.md` at the root, modules under `docs/`, the seed `src/config/policy.ts`, evidence under `docs/evidence/`), a scope/phase board, architecture decision records, configuration/evidence registry, capability matrix, test results, onboarding and operational runbooks, API specification, migration/export guide and release notes. Keep customer-facing stage labels consistent with actual gates.

First release priority: safe, reliable charging; correct, traceable money; clear owner actions. Independent owner/investor proof follows, then demand/energy optimisation and external networks. Structure the system for the broader ambition without requiring the entire ambition to ship at once.

*End of revised master build prompt. Version changes record scope, reason, reviewer and evidence. Founder reviews product/commercial policy; designated specialists review safety, financial, security and applicable external requirements.*
