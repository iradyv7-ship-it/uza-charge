# Selling and leasing the platform, operator trust and commercial sustainability

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 17, 29 and 31**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches editions and licensing, multi-tenancy, network configuration, pluggable adapters, onboarding wizards, roaming and clearing, customer support tiers, operator neutrality and portability, or commercial pricing and promises.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 17. SELLING AND LEASING THE PLATFORM — SUPPORTED NETWORKS AND COUNTRY PACKS

The platform is a product in its own right. UCN is its first customer. A supported network can be configured without a custom software fork. A new country, provider or hardware model may require an adapter, commercial onboarding, translations and official verification; publish readiness rather than implying every country works immediately.

### 17.1 What we sell — editions

| Edition | Customer | Includes | Pricing basis (D-02/D-03) |
|---|---|---|---|
| **Monitor** | Owner who wants visibility | Live view, alarms, all reports, P&L, compliance tracker, digests | Per connector / month |
| **Operate** | Owner running their own business inside a network | Monitor + remote control, payments, traceable settlement and payouts, optional map listing, bookings, card acceptance, promotions | Per connector / month + % of transactions |
| **Managed** | Owner who wants UZA (or the network) to run everything | Operate + NOC, maintenance coordination, customer service, regulator reporting done for them, investor reports | % of revenue |
| **Network** (white-label lease, Model D) | Organisation launching its own branded network | Its own network on the platform: brand, driver app skin, card programme, agents, owners, prices, provider accounts, roaming, all apps | Platform lease / month + per connector + optional % of transactions + card supply |
| **Enterprise / Private** (Model E) | Government, utility, large group | Whole platform deployed in their environment (incl. sovereign cloud / UZA Cloud), licence key, updates, SLA | Licence fee + annual support & updates |
| **Bundle** (Model F) | Investor/site owner without capital | Chargers supplied by UZA + Operate or Managed, paid monthly | Lease instalments + subscription |

- All prices, currencies and billing cycles are configuration (policy + per-contract overrides), never code.
- Free trial, demo network and sandbox (17.8).

### 17.2 Multi-tenancy: platform → network → owner

- **Platform** (UZA): manages networks, licences, platform updates, shared services (CSMS gateway, notifications, reporting engine).
- **Network** (tenant): has its own configuration (17.3), its own drivers, cards, agents, owners, sites, provider accounts and ledger books. Its staff see only their network.
- **Owner** (inside a network): sees only their own sites and money.
- Isolation is enforced in the backend on every query (`network_id` + `owner_id` scoping) with automated cross-tenant tests in CI. Charger identities are globally unique across networks; a charger belongs to exactly one network at a time; transferring a charger between networks is an audited workflow.
- A network's data belongs to that network; owners' data belongs to owners. UZA uses only anonymised aggregates for platform benchmarks, per contract.

### 17.3 Network configuration (everything a new customer can set without code)

| Area | Configurable |
|---|---|
| **Brand** | Name, logo, colours (design tokens), app name and icon (PWA), receipt and SMS sender name, custom domain (e.g. `charge.customer.com`), email templates |
| **Country pack** | Country, currency (and minor units), timezone, date/number formats, phone number format, address format, languages and default language, tax rules (VAT rate, who is seller of record) |
| **Payment providers** | Which adapters are active (MTN MoMo, Airtel Money, M-Pesa, other mobile money, cash agents, vouchers, optional card gateway) and **the network's own provider credentials** — money for each network flows through that network's own accounts |
| **Fund holder** | `operator` or `licensed_partner` (8.3.9) |
| **Card programme** | Prefix, card types, artwork, prices, limits, KYC levels, fees, dormant rules, accepted top-up channels |
| **Regulatory pack** | Which regulator rule set applies (Rwanda RURA 011/2026 first; others added as packs): uptime target, repair time, incident report deadlines, complaint deadlines, licence/permit checklist, report formats, levy |
| **Commercial rules** | Owner fee structures, host shares, payout modes and limits, agent commissions, booking/idle/no-show fees, tariff templates |
| **Roaming** | Which other networks it roams with and on what terms (17.7) |
| **Features** | Entitlements from its licence (17.5) plus feature flags it may switch on/off |

### 17.4 Pluggable adapters (so the platform travels)

- **Payment adapter interface**: `collect`, `checkStatus`, `handleCallback`, `disburse`, `refund`, `balance`, `limits`. Implement MTN MoMo (Rwanda first), Airtel Money; design for M-Pesa, other MTN/Airtel countries and PSPs. Each adapter declares its capabilities (refunds supported? reference field? limits?) and the UI adapts.
- **Regulatory pack interface**: rule values, checklists, report generators, deadline timers. Rwanda RURA pack is the reference implementation.
- **Charger vendor adapter interface** (6.6): support OCPP 1.6J brands subject to profile, firmware, access and acceptance testing; vendor packs add error-code dictionaries, DataTransfer parsers, setup guides with photos.
- **Messaging adapters**: SMS gateways per country, WhatsApp Business, email, USSD gateway.
- **Tax/invoice adapter**: Rwanda RRA EBM first (`REQUIRES OFFICIAL VERIFICATION`); other countries' e-invoicing as adapters.
- **Map adapter**: Google Maps first; OpenStreetMap fallback for cost-sensitive networks.

### 17.5 Licensing, entitlements and metering

- Each network (and each owner subscription) has a **licence record**: edition, connector limit, enabled modules, start/end dates, price terms, payment status.
- **Entitlements** are checked in the backend (not just hidden in the UI). Exceeding a limit shows a clear upgrade message.
- **Usage metering**: active connectors per day, sessions, kWh, transactions value, SMS sent — feeds platform invoices and lets UZA price fairly.
- **Platform billing**: monthly invoices to networks and owners, payable by MoMo/Airtel or deducted from settlement credits (opt-in); bank transfer optional.
- **Non-payment**: reminders → grace period (`policy.SAAS_GRACE`) → restricted administration with continuing required records access. Preserve active-session safety and settle/refund already collected funds; new-business restrictions and orderly handover follow the disclosed notice/transition contract (Section 29).
- **Private deployments (Model E)**: signed licence key with connector limit and expiry; offline-tolerant validation (grace period if the licence server is unreachable); update channel with versioned releases and migration scripts; remote support access only with the customer's consent.

### 17.6 Onboarding — guided setup with measured completion times

**New network (Model D)** — platform admin wizard:
1. Create network → choose country pack and regulatory pack.
2. Upload brand assets → preview driver app, receipts, card artwork.
3. Connect payment provider accounts (sandbox first, then production) → live test collection and disbursement of a small amount.
4. Configure card programme → order card batch (from UZA or own supplier) → register batch UIDs.
5. Invite network staff and agents.
6. Add first owner and site → connect first charger (below) → test session end to end.
7. Go live; public map and driver app on the network's domain.

**New charger (any owner, any network)** — owner wizard (as v1.0):
1. Add site (pin, address, photos, hours, amenities, licence category).
2. Add charger: choose brand/model (or "Other OCPP 1.6J") → system generates **OCPP URL + identity + password** + model-specific setup guide.
3. Live connection check → provisioning → **Data Capability Score** shown.
4. Test session (QR + small MoMo payment, or card tap).
5. Set prices, booking and idle rules; upload compliance documents (gap report shows what's missing).
6. Choose edition; go live; optionally publish on the network map.

**Owners whose chargers can't connect yet**: **Monitor-Lite** — manual or spreadsheet entry of daily readings and MoMo statements, utility bill upload → reports and P&L labelled "Entered", with a path to upgrade (firmware, OCPP retrofit gateway, SIM). **History import** so new customers see past performance on day one.

### 17.7 Roaming and clearing between networks

- Networks opt in to roam with each other with bilateral terms (fee per session or %, settlement cycle, price display rules).
- A card or app account from network A can charge on network B's chargers: CSMS of network B authorises through the platform's roaming service against network A's wallet.
- Every roaming session creates **inter-network clearing entries**: driver's network collects from the driver, owes network B (and through it, the site owner). Clearing statements daily; net settlement via mobile money or (optionally) bank.
- Separate inter-network receivables from owner available funds. Accelerated owner credit requires an explicit funded credit arrangement, counterparty limits and default policy; the platform never assumes an unlimited obligation to front roaming payments. Hold disputed/uncleared amounts per contract and disclose the payout timeline.
- External networks not on our platform: **OCPI 2.2.1** (Phase 4) using the same clearing engine.

### 17.8 Selling and supporting customers

- **Public product site** (per platform, not per network) explaining editions, with honest stage labels — no fake logos or customer counts.
- **Live demo network** running on the simulator, clearly marked "DEMO — simulated chargers", resettable, for sales meetings.
- **Sandbox** for each prospective network: their brand, simulated chargers, test payment providers — "see your network before you pay".
- **Documentation**: owner guide, network admin guide, agent guide, charger setup guides per model, API reference (OpenAPI), regulatory pack guides.
- **Public API** (Phase 3+) for networks and fleets: sites, availability, sessions, reports, webhooks — with API keys per network and rate limits.
- **Support tiers and SLAs** per edition: response times, NOC coverage hours, escalation; support tickets visible to the customer.
- **Reseller / partner programme** (later): partners in other countries sell and support the platform; revenue share per contract.
- **Contracts and terms** stored per network/owner with version history: data ownership, SLA, fees, roaming terms, termination and **full data export** (CSV/JSON + PDFs) on exit.

### 17.9 What this means for the UZA team

- UCN must be configured like any other network — no shortcuts that only UZA can use. If UZA needs something, it becomes a configurable feature every network can buy.
- Every new idea is checked against two questions: *Would a fuel-station chain in Uganda be able to use this without code changes?* and *Does it work without a bank?*

---

## 29. OPERATOR TRUST, NEUTRALITY AND PORTABILITY

UZA operates chargers and sells software to other operators. Access governance must make that relationship trustworthy.

- Networks/owners control their customer data, private pricing, costs, site expansion plans and reports subject to contract and applicable law. Public listing, roaming and benchmarking are explicit opt-ins with clear consequences.
- UZA commercial staff do not receive rival customer lists or confidential economics because they work for the platform owner. Memberships and support roles are separate; super-admin is not routine unrestricted business-data access.
- Support access is scoped to ticket, tenant, data type and time; tenant approval where appropriate, visible audit and expiry. Emergency access follows documented break-glass controls with reason, review and notification. Finance operations have similarly scoped authority.
- Benchmarks require eligible aggregated cohorts and minimum sample sizes. Suppress sparse groups that could identify one station/operator; never expose rivals' raw records.
- Contracts cover service responsibility, fees, funds, data use, confidentiality, incident reporting, termination, retention and transition. Public map placement and recommendations follow disclosed criteria, not hidden preference for UZA-owned assets.
- Export documented CSV/JSON financial/session data, relevant documents and configuration with provenance and access controls. Provide transition assistance under clear terms. Demonstrate export and recovery before selling portability.
- On non-payment/termination, fulfil collected-funds obligations and existing-session safety, give a defined notice/transition period and continued required records access. Continuity is not an unlimited commitment to free service forever; stop accepting new business only under the disclosed contract and orderly handover.

---

## 31. UZA COMMERCIAL SUSTAINABILITY AND CUSTOMER PROMISES

### 31.1 Package around outcomes
Monitor: know performance and exceptions. Operate: collect, reconcile and manage charging. Managed: contracted NOC/customer/field coordination and reporting. Network: own branded operations on a supported pack. Enterprise/private: controlled deployment/support. Bundle: equipment and software under a reviewed financing/lease arrangement. Modules and entitlements remain explicit; do not force cards or a public map onto private fleets.

Contracts state seller of record, licensee/operator, fund holder, technical responsibilities, maintenance scope, site access, support hours, SLA definition/exclusions, price/fees, reserves, payout timing and exit. Safety, ledger correctness and required access controls are standard, not premium options.

### 31.2 Price from real costs
Track by customer/network/site: hosting/database/time-series storage, maps, SMS/OTP/WhatsApp, payment/refund/disbursement fees, onboarding, migrations, model integrations, support tickets, NOC coverage, finance reconciliation, field travel, repairs/spares/warranty, card supply/loss, reseller commissions and update/security work.

Show platform revenue separately from charging GMV, taxes and customer liabilities. Calculate contribution after service costs, recurring gross margin, setup-cost recovery, retention/churn, accounts receivable and customer acquisition payback. Pricing review tests small/large and high/low-volume operators; show subscription and transaction fees together. Flat connector pricing must account for support cost and usage; heavy messaging or bespoke integrations may need disclosed allowances/add-ons.

No automatic revenue fee stacking: define which managed/network/platform fees apply, their calculation bases, tax treatment and who pays each. Equipment financing, private deployment and emergency field work have their own reviewed terms. An owner may choose its own technicians where the contract allows. Keep fees configurable without allowing arbitrary edits to historical settlements.

### 31.3 Commercial evidence register
Every sales promise has wording, applicable edition/model, proof, conditions, owner and last test date. Examples: supported model/firmware, setup time, live reporting latency, payment success, support response, payout schedule, investor traceability and export. Label demos as simulated. Replace "any charger", "compliant out of the box", "instant cash" and "guaranteed returns" with demonstrated, qualified capabilities. Pilot case studies require consent and verified numbers.
