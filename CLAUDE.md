# UZA CHARGE — Master Build Prompt v2.1 · CORE (`CLAUDE.md`)
### Charging operations, payments, energy and investment management — built for Rwanda, designed for other networks

**Owner:** UZA Mobility Ltd (wholly owned by UZA Solutions Ltd) · **Product name in code:** `uza-charge` · **First network:** UZA Charge Network (UCN)
**Version:** 2.1 · **Prepared:** 7 October 2026 · **Status:** master build specification; every feature stays *proposed* until its proof gate passes (Section 20)
**Audience:** UZA engineering team and coding agents working under their supervision; UZA Mobility operations, finance and maintenance

**Product promise:** Know your stations are working, know where your money is, and know what to do next.

---

## 0. HOW TO USE THIS DOCUMENT SET

This file is the **core**. Load it in every session and every sprint. It contains the mission, glossary, non-negotiable rules, roles, architecture and definition of done. Load a **module** only when the sprint touches its area. Section numbers are stable IDs: a reference such as "Section 8.5" points to the module listed below, wherever it sits.

| File | Contents | Sections |
|---|---|---|
| `CLAUDE.md` (this file) | Core: how to use, mission, glossary, rules, roles, architecture, definition of done | 0–5, 22 |
| `docs/01-csms-ocpp.md` | Charger gateway (OCPP 1.6J), compatibility, migration and durable processing | 6, 26, 30.1 |
| `docs/02-sessions-tariffs.md` | Charging sessions, billing evidence, tariffs and fees | 7, 9 |
| `docs/03-payments-cards-settlement.md` | Payments, wallet, NFC card programme, offline rules, settlement, payouts and accessible routes | 8 |
| `docs/04-driver-bookings-map-fleet.md` | Bookings, public map, driver journey, fleets and growth | 10, 11, 27 |
| `docs/05-owner-portal-actions.md` | Owner portal, reports, P&L, action centre, automation and notifications | 12, 24, 16 |
| `docs/06-investor-finance.md` | Investor, lender and portfolio workspace; financial close | 25 |
| `docs/07-operations-compliance.md` | Operations, incidents, maintenance and RURA compliance | 14, 15 |
| `docs/08-energy-site-planning.md` | Site planning, energy boundaries, load management and battery insights | 28 |
| `docs/09-platform-selling-trust.md` | Selling and leasing the platform, operator trust and commercial sustainability | 17, 29, 31 |
| `docs/10-reliability-security-data.md` | Performance, security, availability, retention and recovery | 19.1–19.2, 30.2–30.4 |
| `docs/11-frontends-design-usability.md` | Frontend apps, design system, languages and usability acceptance | 13, 19.3–19.4, 32.1 |
| `docs/12-data-model.md` | Data model (core entities and extensions) | 18 (incl. former 32.2) |
| `docs/13-configuration.md` | Versioned configuration and decision provenance | 19.5 |
| `docs/14-delivery-decisions-tests.md` | Phases and proof gates, founder decisions, release test scenarios, sources and handover | 20, 21 (incl. former 33.1), 32.3, 33.2–33.3 |
| `docs/15-first-sprint.md` | First sprint prompt (copy into Claude Code) | 23 |
| `src/config/policy.ts` | Typed configuration defaults with status, unit, scope and source; v1.1 key migration map; production guards | 19.5 |
| `docs/evidence/` | Source documents for `VERIFIED_EXTERNAL` rules (start with the RURA regulation PDF) | 15 |

**Working rules for this document set**
1. Before writing code, read this file and the modules for the area you are changing. Section 20 (in `docs/14-…`) says what ships in which phase and how it is proved; do not build a later phase's module because it is specified.
2. Build in phases. A phase is complete only when its proof gate passes with evidence.
3. Business rules come from the versioned configuration service seeded by `src/config/policy.ts`. Statuses: `FOUNDER_DECIDED`, `PROPOSED`, `VERIFIED_EXTERNAL`, `PENDING_VERIFICATION`. A founder decision never verifies a regulation. Never hard-code prices, fees, durations or thresholds in feature logic.
4. Anything depending on an outside party not yet secured is labelled in code and UI `AWAITING CREDENTIALS` or `REQUIRES OFFICIAL VERIFICATION`. Never fake it as done.
5. If this document set and the prototype disagree, this set governs the intended design. Record missing facts in `OPEN_QUESTIONS.md` and continue with reversible engineering choices. A production money, safety, privacy or regulatory decision needs its specified evidence and approver before activation; routine implementation details do not.
6. Founder decisions still open are in Section 21. Build them as configuration, not code branches.
7. One topic, one home. When a requirement changes, edit the section that owns it — never add a second, partial version of the same rule in another file.
8. Two design principles shape every decision; when in doubt, keep both true:
   - **Sellable to anyone.** Nothing UZA-specific is hard-coded: brand, country, currency, language, tax, providers, regulator rules and card programme are configuration of a **network** (Section 17). UCN is simply network #1.
   - **No personal bank account needed.** Drivers, agents and supported owners use mobile money and authorised cash channels. Provider business accounts, safeguarding and corporate settlement may sit on banking infrastructure; those are partner dependencies, not product steps (Section 8.7).

---

## 1. MISSION — WHAT WE ARE BUILDING AND WHY

UZA is building the **operating system for EV charging in Rwanda and East Africa**: one platform that connects to any brand of charger over **OCPP 1.6J**, captures **supported, useful telemetry with clear provenance and retention rules**, lets drivers **find, book, pay and charge** anywhere on the network with **mobile money or a UZA charging card (no bank needed)**, and lets station owners **manage routine operations remotely** — sessions, energy, faults, revenue and financial performance — while assigned field teams handle physical inspections, parking, repairs and safety.

UZA is the **enabler, not only the seller**. The same platform serves three kinds of owner:

| Model | Who owns the chargers | Who operates them | How UZA earns |
|---|---|---|---|
| **A. UZA-owned** | UZA Mobility | UZA | Charging revenue |
| **B. Managed ("buy it, we run it")** | Partner / investor | UZA operates on the partner's behalf | Management fee (% of revenue) + network fee |
| **C. SaaS (self-operated)** | Partner | Partner, using our software | Monthly subscription per connector + network transaction fee when payments flow through UCN |

Every owner — whichever model — can join the **UCN network**: their chargers appear on the public map, accept UZA cards and UZA wallet payments, accept bookings, and receive prompt, traceable ledger credit and payouts according to their contract, available funds, provider confirmation and risk controls.

Beyond owners, **the platform itself is a product UZA sells or leases** to anyone who wants to run charging — a fuel-station chain, a utility, a property developer, a fleet, a municipality, or a charging company in another country:

| Model | Customer | What they get | How UZA earns |
|---|---|---|---|
| **D. Network-in-a-box (white-label lease)** | An organisation that wants its **own** charging network and brand | Their own network on UZA's platform: own brand, driver app skin, NFC card programme, partners, prices, payment-provider accounts, reports | Monthly platform lease + per-connector fee + optional % of transactions; card supply |
| **E. Private deployment (licence)** | Government, utility, large group needing their own servers (e.g. sovereign cloud / UZA Cloud) | The whole platform installed in their environment, with licence key and update channel | Licence fee (one-off or annual) + annual support and updates |
| **F. Hardware + software bundle (lease-to-own)** | Investors and site owners without capital | Chargers supplied by UZA + platform subscription, paid monthly through the platform | Monthly lease instalments + subscription |

Networks can choose to **roam** with each other: a UCN card works on a partner network's chargers and vice versa, with automatic inter-network clearing (Section 17.7).

The competitive benchmark is China's Yunkuaichong (云快充) platform. Use it as an operational reference, not as a claim of parity. Our intended advantage is mobile-money integration, controlled cash operations, Kinyarwanda usability, local field support, evidence-based compliance workflows and credible investor visibility. Superiority must be demonstrated with live results.

### 1.1 What makes this sellable to owners who monitor manually today

Owners today drive to the site, read the screen, count MoMo SMS messages and keep a notebook. We replace all of that with:

- A live view of every charger and every gun, from a phone.
- An automatic daily digest on WhatsApp/SMS: sessions, kWh, revenue, uptime, faults.
- A real **Profit & Loss** statement, monthly, with every figure labelled Measured / Calculated / Entered.
- Remote control: start, stop, restart, unlock, take out of service, change price.
- A compliance workspace that tracks reviewed obligations, evidence, deadlines and responsible people; software does not guarantee a licence or replace inspections.
- Clear available balances, payout schedules, fees and confirmed MoMo/Airtel payout status.
- New customers from the UCN map, bookings and the shared UZA card.

### 1.2 True stage today (do not overstate)

- A **prototype** exists at `uza-charge-east.lovable.app` (Lovable/Supabase) with a charger **simulator** and 185 seeded priced sessions. It is a design and data-model reference, **not** the production system.
- No real charger has connected yet. MTN/Airtel production credentials are **not** in hand.
- First hardware: Zhejiang Wicen DC chargers (180 kW and 240 kW, dual gun GB/T + CCS2, OCPP 1.6J), order form 20260721-W001. Wicen's native protocol is likely Yunkuaichong-style; their OCPP firmware must be configured to expose all data (Section 6.6).
- Planned solar + battery sites use VGrid's DC-coupled design (700 Vdc bus, EMS). The EMS integration is a later phase (Section 6.9).

---

## 2. GLOSSARY — USE THESE WORDS CONSISTENTLY

| Term in code | Meaning | What people say |
|---|---|---|
| `platform` | The whole UZA Charge software, operated by UZA (or installed privately under licence) | "the system" |
| `network` | A tenant that runs a branded charging network on the platform, with its own drivers, cards, owners, prices, providers and rules. UCN is network #1 | "operator", "network", "customer" |
| `owner` | The legal entity that owns chargers (UZA, a hotel, a fuel station, an investor, a fleet) inside a network | "owner", "partner" |
| `site` | A physical location with an address and GPS point (one licence per site under RURA) | "station", "location" |
| `station` | A power group inside a site (e.g. one transformer, or one VGrid DC bus). Optional; default one per site | "power system" |
| `charge_point` | One physical charging machine, with one OCPP identity | "machine", "charger", "pile" (Chinese usage) |
| `connector` | One gun/outlet on a charge point. Wicen units have **2** (GB/T + CCS2) | "gun", "pile", "plug" |
| `session` | One charging transaction on one connector, start to stop | "charge", "order" |
| `booking` | A reservation of one connector for a time slot | "appointment" |
| `id_token` | Anything that authorises a start: card UID, QR session token, app token, fleet token | — |
| `card` | An NFC charging card (or key fob / sticker) issued by a network's card programme. A **key** to a wallet — never holds money itself | "UZA card", "tap card" |
| `card_programme` | A network's card scheme: card design, numbering prefix, card types, limits, fees, top-up channels, roaming rules | — |
| `agent` | A person or business (often a partner site's cashier) authorised to sell, activate and top up cards for cash | "agent", "cashier" |
| `wallet` | The single UZA money account of a person or company (shared across all UZA products) | "balance" |
| `ledger` | Double-entry record of every money movement | — |
| `tariff` | The price plan of a connector: energy + service fee per kWh, by time of day, plus other fees | "price" |
| `payout` | Money sent from UZA to an owner's MoMo/Airtel/bank | "settlement" |

The hierarchy is strict and every record is traceable through it:
**platform → network → owner → site → station → charge_point → connector → session**. Every individual gun must always be identifiable and tied to its charger, site, owner and network.

---

## 3. NON-NEGOTIABLE RULES

These come from UZA's engineering standards ("the bible") and standing product rules. They override convenience.

**Engineering**
1. Strict frontend/backend separation. Backend owns auth, authorisation, validation and all database access. Frontends never touch the database.
2. Backend: NestJS + Prisma + PostgreSQL (same spine as `uza-mobility-bn`). Frontends: React + Tailwind + shadcn/ui, lucide-react icons.
3. Folder layouts per the bible. Helmet, CORS allowlist, rate limiting, bcrypt, centralised error handling, consistent `{ success, message, data }` JSON.
4. Secrets only in environment variables; always ship `.env.example`.
5. Must be maintainable by UZA's own team with **no dependency on Lovable, Supabase or any AI at runtime**.
6. Inspect existing code before changing it; never delete working features or business logic to fix architecture.
7. Work incrementally: explain → change → verify → fix. Safety, financial correctness, security and tenant isolation are release requirements. Build usable functionality within those requirements, then improve maintainability, performance and visual polish.

**Money**
8. All money in **integer RWF** (RWF has no minor unit in practice — store integer RWF; if a currency with minor units is ever added, store minor units). Never floats. All money maths in pure, unit-tested functions in `src/lib/pricing.ts` / `src/lib/ledger.ts`.
9. Digital payments become **PAID only on authoritative provider confirmation** through a verified callback or authenticated status lookup. A missing callback must not strand a genuinely confirmed payment. SMS, screenshots and user claims are never proof. Cash is a separate controlled receipt and ledger workflow, never disguised as a provider payment.
10. Session cost is **always calculated on the backend** from meter values against the pinned tariff version — never trusted from the charger.
11. Every money movement is a balanced double-entry ledger transaction. Balances are derived from the ledger, never edited.
12. Price and tariff history is append-only. A session pins the tariff version it started on.

**Honesty**
13. No fake live data. A charger that has never reported is **"Never connected"**, not "Available". A charger with no heartbeat is **"Offline"**, with the time it was last seen.
14. No lorem ipsum, no fake logos, no invented metrics or testimonials. Empty states say what will appear and when.
15. Every figure in reports is labelled **Measured**, **Calculated** or **Entered**.
16. Unlaunched features are visibly labelled ("Coming soon", "Awaiting credentials") — never silently hidden behind a working-looking UI.

**Product**
17. Mobile money (MTN MoMo, Airtel Money) is the payment rail. Cash is first-class. Bank cards are never primary. The UZA charging card is a closed-loop key funded by mobile money or cash.
18. Phone number + SMS OTP is the primary sign-up ("in Rwanda the MoMo number is the account"). Email/Google secondary.
19. One UZA identity and a shared wallet interface across UZA products where authorised. Keep customer charging credit, loan collections, savings, promotional credit and other restricted purposes in distinct ledger accounts with explicit consent and eligibility rules; a common UI is not permission to pool or repurpose funds. Charging must not duplicate the existing charging-money ledger. For **other networks** on the platform (Models D/E), the wallet engine is multi-network: each network's money is ring-fenced in its own ledger books and its own payment-provider accounts, and one network can never see or move another network's funds.
20. Every core flow works at 360 px wide on a cheap Android phone on weak data.
21. **Nothing UZA-specific in code.** Brand names, logos, colours, currency, country, timezone, languages, tax rules, regulator rules, payment providers, card numbering and fees all come from network configuration. UCN's values are just the first configuration. A new network must be launchable with **zero code changes**.
22. Core driver flows must support a verified route without a personal bank account. Network and corporate finance flows use the provider and regulatory arrangements required in that country (Section 8.7).

---

## 4. USERS, ROLES AND PERMISSIONS

Identity follows the UZA ID model: **one person, many memberships**, each membership carrying a role scoped to an organisation (and optionally to specific sites). No exclusive roles.

| Role | Scope | Can do |
|---|---|---|
| `uza_super_admin` | Platform | Platform administration; sensitive tenant access requires scoped, time-limited support access or audited emergency access, not blanket financial or customer-data access |
| `network_admin` | Their network (Models D/E) | Everything inside their network: brand, owners, card programme, prices, providers, agents, reports — never other networks or platform settings |
| `network_finance` / `network_noc` / `network_support` | Their network | Same as the UZA roles below, limited to their network |
| `agent` | Their agent point | Sell and activate cards, cash top-ups, print/send receipts, see their own float and commission |
| `uza_noc_operator` | Platform or assigned owners | Monitor all chargers, run remote commands, open/close incidents, manage bookings |
| `uza_finance` | Platform | Ledger, payouts, reconciliation, refunds, invoices, subscription billing |
| `uza_support` | Platform | Driver and owner support, complaints, card replacement, session disputes (no money movement above a limit) |
| `uza_field_technician` | Assigned sites | Job cards, diagnostics, firmware, spare parts use, site checklists |
| `owner_admin` | Their organisation | Full control of their sites, prices, staff, payouts, reports |
| `owner_site_manager` | Assigned sites | Live view, remote commands, incidents, daily reports — no payout settings |
| `owner_viewer` / `investor` | Their organisation or assigned sites | Read-only dashboards and reports (Model B investors) |
| `host` | A site on their property | Read-only: sessions and their host revenue share |
| `fleet_manager` | Their company | Fleet cards, spending limits, fleet invoices, vehicle usage |
| `driver` | Self | Map, booking, start/stop, wallet, cards, history, receipts, complaints |
| `regulator_viewer` | Read-only export area | Download RURA reports for permitted sites (optional, owner-approved) |

**Rules**
- Permissions are checked in the backend on every request, including every OCPP remote command.
- Tenant isolation: an owner can never read or change another owner's data. Write automated tests that try to cross tenants on every endpoint.
- Dangerous commands (hard reset, change availability to Inoperative, firmware update, price change, payout settings change) require confirmation and are written to an immutable audit log (who, when, what, from where, result).
- Owner staff can be added and removed by the owner admin. Two-step verification for owner admins and all UZA staff.
- Clients are cost-blind where appropriate: drivers never see owner costs, margins or revenue shares.

---

## 5. ARCHITECTURE

### 5.1 Why the charger server is a separate, always-on service

OCPP 1.6J chargers open a **permanent WebSocket connection** to the server and keep it open 24/7. Serverless functions (Supabase edge functions, Lambda-style) cannot hold these. The CSMS gateway is therefore a long-running NestJS service on a server we control.

### 5.2 Services

```
                 ┌──────────────────────── Chargers (any brand, OCPP 1.6J over WSS) ────────────────────────┐
                 │                                                                                          │
         ┌───────▼────────┐   events (queue)   ┌──────────────────┐     ┌──────────────────────────────┐
         │ CSMS GATEWAY   │──────────────────▶ │ CORE API         │────▶│ PostgreSQL + TimescaleDB      │
         │ (OCPP 1.6J)    │◀────────────────── │ (NestJS)         │     │  - relational data            │
         │ - WSS sessions │   commands (queue) │ - sessions       │     │  - raw OCPP message log       │
         │ - message log  │                    │ - tariffs/billing│     │  - meter time-series          │
         │ - vendor adapt.│                    │ - bookings       │     └──────────────────────────────┘
         └────────────────┘                    │ - owners/sites   │     ┌──────────────────────────────┐
                                               │ - reports/P&L    │────▶│ Redis: live state, locks,     │
   ┌─────────────────┐                         │ - compliance     │     │ booking holds, rate limits    │
   │ UZA SPINE       │◀───── identity, wallet ─│ - notifications  │     └──────────────────────────────┘
   │ (uza-mobility-bn│       ledger, payouts   └────────┬─────────┘     ┌──────────────────────────────┐
   │  UZA ID+Wallet) │                                  │               │ Job queue (BullMQ): timers,   │
   └───────┬─────────┘                                  │               │ reports, payouts, retries     │
           │                                            │               └──────────────────────────────┘
   ┌───────▼──────────────┐                ┌────────────▼───────────────────────────────────────┐
   │ Payment adapters     │                │ Frontends (separate apps)                           │
   │ MTN MoMo (collect +  │                │  1. Driver app + public map (PWA)                   │
   │ disburse), Airtel    │                │  2. Owner portal (web, mobile-responsive)           │
   │ Money, cash desk     │                │  3. UZA Control Room (NOC + admin + finance)        │
   └──────────────────────┘                │  4. Technician app (PWA, offline-tolerant)          │
                                           └────────────────────────────────────────────────────┘
   Later: EMS adapter (Modbus TCP) for VGrid solar+battery sites · site main meter reader · OCPI for roaming
```

1. **CSMS Gateway** (`uza-charge-csms`): terminates OCPP WebSockets, authenticates chargers, validates every message against the OCPP 1.6J JSON schemas, writes **every raw message in and out** to the message log, and translates between OCPP and internal events/commands. Holds no business logic beyond protocol rules. Must scale horizontally (connection registry in Redis so any API node can reach any charger).
2. **Core API** (`uza-charge-api`): all business logic — sessions, billing, tariffs, bookings, owners, sites, reports, compliance, notifications, SaaS subscriptions.
3. **UZA Spine** (`uza-mobility-bn`, existing): UZA ID, memberships, wallet, ledger, payment adapters, payouts. Charging **uses** the spine; it does not duplicate it. If a capability is missing in the spine (e.g. owner payouts), build it **in the spine** as a shared module. *(Founder to confirm — Section 21, D-01.)*
4. **Workers**: booking timers, session watchdogs, report generation, payout runs, uptime calculation, RURA report generation, retries.
5. **Frontends**: five separate apps (Section 13): driver + public map, owner portal, UZA Control Room (incl. platform admin), technician, agent. All frontends read the network's brand and country configuration at runtime — one codebase serves every network.
6. **Network configuration service**: serves each network's brand, country pack, regulatory pack, provider adapters, card programme and entitlements (Section 17.3). Every service resolves `network_id` first.

### 5.3 Internal contract between gateway and core (keep from the prototype)

Keep the prototype's design: **`charger_events` (inbox) and `charger_commands` (outbox) are the only interface between business logic and chargers.** The real OCPP gateway and the simulator both plug into this seam, so no UI or business code changes when a real charger replaces the simulator.

- Every inbound OCPP message → one `charger_event` row (typed, parsed) + one raw log row.
- Every command → one `charger_command` row with status `queued → sent → accepted | rejected | timeout | error`, the requesting user, and the charger's response.
- Track command intent separately from protocol attempts. Retry only when safe; OCPP commands are not universally idempotent. Query/reconcile state before repeating starts, resets, unlocks or firmware actions. Distinguish accepted command from observed effect; a command never silently disappears.

### 5.4 Repositories (GitHub org UZA-SOLUTIONS)

| Repo | Contents |
|---|---|
| `uza-charge-csms` | OCPP gateway, vendor adapters, simulator, OCPP test suite |
| `uza-charge-api` | Core NestJS API, workers, Prisma schema for charging domain |
| `uza-charge-driver` | Driver PWA + public map (no login needed to browse) |
| `uza-charge-owner` | Owner portal |
| `uza-charge-control` | UZA Control Room (NOC, admin, finance, support) |
| `uza-charge-tech` | Technician PWA |
| `uza-charge-agent` | Agent PWA (card sales, activation, cash top-ups) |
| `uza-mobility-bn` | Existing spine — extended, not forked |

Each frontend runs with `npm run dev`; each backend with `npm start`. Each repo has a README, `.env.example`, CI (lint, type-check, tests) and a CLAUDE.md that points back to this document.

### 5.5 Hosting

- Production in a data centre **in Rwanda** by default. Rwanda's personal data protection law restricts storing personal data outside Rwanda without authorisation — `REQUIRES OFFICIAL VERIFICATION` (NCSA) before any offshore hosting. (Also a natural first workload for UZA Cloud.)
- TLS everywhere; chargers connect via `wss://`.
- Daily encrypted backups, point-in-time recovery for PostgreSQL, tested restore monthly.
- Separate `staging` and `production`. Real chargers can be pointed at staging for test-bench work.
- **Deployment modes**: (1) UZA-hosted multi-network (default, Models A–D, F); (2) private single-customer deployment (Model E) from the same codebase via containerised releases (Docker images + Helm/compose), infrastructure-as-code, and a documented install/upgrade procedure. A network's data must be exportable and movable between the two modes.

---

## 22. DEFINITION OF DONE (every feature)

1. Works end to end against the simulator **and**, for charger-facing features, against a real charger on staging.
2. Backend validation, permission checks and tenant isolation tests in place.
3. Money paths covered by unit tests on pure functions, including rounding, refunds and reversals; ledger always balances.
4. Loading, error and empty states implemented honestly; no fake data.
5. English + Kinyarwanda strings in i18n files (Kinyarwanda marked "pending founder review" until approved).
6. Works at 360 px on a low-end Android device on throttled 3G.
7. Audit log entries for every state-changing action.
8. Business rules resolved from versioned configuration; status, source and overrides visible to authorised admins; historical sessions pin their rules.
9. Docs updated: README, API docs (OpenAPI), runbook entry for operations.
10. Anything awaiting a third party is labelled `AWAITING CREDENTIALS` or `REQUIRES OFFICIAL VERIFICATION` in code and UI.
11. **Works for any network**: no UZA brand, currency, country, provider or rule hard-coded; tested on UCN and on a second demo network with different brand and currency.
12. Core driver payment has a verified route without a personal bank account; provider and corporate requirements disclosed. Cash paths require explicit controls.
13. Command acceptance versus observed effect, provisional versus final bills, and ledger credit versus confirmed payout are distinct.
14. Defined data retention, support access and recovery behaviour tested for the feature.
15. Customer-facing promise has matching hardware, operational and financial evidence.
16. Owner/driver/agent core workflow passes observed usability testing; unresolved specialist setup is not presented as self-service ready.

---

*Core of the UZA Charge Master Build Prompt v2.1. Modules live in `docs/`. Founder reviews product and commercial policy; designated specialists review safety, financial, security and external requirements.*
