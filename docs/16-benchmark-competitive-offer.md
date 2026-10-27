# Competitive benchmark, gap register and the sellable working model

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Section 34**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when a sprint adds admin-panel management features, device-maintenance tooling, or anything that is sold against a competing hosted CPMS.*
*One topic, one home (core §0 rule 7): this module records the benchmark and the additions it caused. Where an addition belongs to another module's topic, the rule text lives here only until that module is next revised, then moves there and this section points to it.*

---

## 34. BENCHMARK: HOSTED CHINESE CPMS (RECEIVED 25 OCTOBER 2026)

### 34.1 What was received

- `docs/incoming/Benchmark.xlsx` — a vendor's feature list in two sheets (运营商功能 "operator features", APP功能 "app features"): **71 operator-platform features and 11 driver-app features**. English descriptions; vendor not named in the file.
- The vendor's commercial offer (pasted by the founder, 25 Oct 2026):

| Package | One-time | Annual | Includes | Customer provides |
|---|---|---|---|---|
| Branded native app | USD 5,000 customisation | USD 1,500 / year, up to 300 stations | Logo + colours, Play Store and App Store publishing help, **one** payment method | Domain, Google Play and Apple developer accounts |
| Branded H5 web app | USD 1,000 authorisation | USD 1,500 / year, up to 300 stations | Logo + colours, **one** payment method, **one** language, scan-QR-to-charge in the browser | Domain |

Both packages carry the same core platform; only the driver front end differs.

### 34.2 What the benchmark tells us

1. **The specification already exceeds the benchmark.** Of 82 features the v2.1 set specifies 41 fully and 28 partly; only 6 are absent and 7 are deliberately done differently (34.4). The benchmark has nothing equivalent to: the exposure controller and separate charging/payment/settlement state machines (§7.3–7.4), the double-entry ledger with confirmed payouts (§8.5), owner settlement and revenue splits, the RURA compliance module (§15), the owner P&L and action centre (§12, §24), the investor workspace (§25), bookings, the NFC card and cash-agent programme (§8.3), multi-tenant networks with country packs (§17), Data Capability Scores (§6.4), field operations (§14) and energy boundaries (§28).
2. **The code is behind both.** Measured on 25 Oct 2026 the rebuild (`uza-charge-*`) has 10 of the 82 built, 30 partial, 42 absent; the Lovable prototype has 10 / 39 / 33. The rebuild is strong where it matters most — the OCPP core path, Security Profile 2 handshake, paid QR and attendant sessions, estate status, rw/en — and almost empty in **management**: no create/edit for chargers, sites, tariffs, accounts or roles; no search, filter or export; no production login (staff and drivers authenticate only through `X-Dev-*` headers); no wallet. **A buyer cannot run a network on the rebuild today without an engineer.** That, not missing ideas, is the gap to close.
3. **Price is not where we win.** USD 1,500 / year for 300 stations is ≈ USD 5 per station per year. We cannot undercut hosted Chinese software on licence price and should not try. We win on what the vendor's "one payment method, one language, hosted abroad" package cannot give a Rwandan operator (34.6).

### 34.3 Additions to the specification

Each item is an addition the benchmark exposed. Phase is the earliest phase it may ship under §20; no item pulls a later phase forward.

| # | Addition | Benchmark IDs | Rule | Phase |
|---|---|---|---|---|
| A-1 | **Admin list toolkit** — one shared component and API pattern for every operational list (chargers, sites, tariffs, sessions, ledger entries, payouts, idle-fee charges, cards, incidents): keyword search, filters, saved views, column chooser, CSV/Excel export of exactly the filtered view. | OP-26–28, 33, 37–44, 46–48 | Columns are limited to what the viewer's role may see: driver phone numbers stay masked for owner staff (§19.2) and the column chooser cannot unmask them. Exports are audited (who, filter, row count). Search is server-side and tenant-scoped. | 1 |
| A-2 | **Charger onboarding in production** — the §17.6 wizard step 2 made real: create charger → generate identity, `wss://` URL and one-time password (shown once, stored hashed), downloadable per-connector QR label (PNG + print PDF with short code), model-specific setup guide. | OP-12, 15, 16, 23 | Only `wss://` URLs are issued (34.4). The QR encodes `https://<network domain>/c/{connectorCode}` (§7.1). | 1 |
| A-3 | **Credential lifecycle** — rotate, disable and re-enable a charger's connection credential; the gateway refuses a disabled identity at handshake and the attempt is logged. | OP-18, 61 | Rotation and disable are dangerous commands: confirm, reason, audit (§4). | 1 |
| A-4 | **Charger and connector editing** — name, notes, connector type/power corrections, availability. Identity fields reported by BootNotification are read-only; a manual value that disagrees is kept as an *Entered* override with the reported value beside it. | OP-13, 17, 19 | Raising rated capacity shows "RURA + REG approval required" (Art. 25). | 1 |
| A-5 | **Move and batch move between sites** — reassign one or many chargers to another site in the same owner, as one audited operation. Moving out of an owner or network stays the §17.2 audited workflow. | OP-18–21 | A move between physical locations raises the RURA relocation-notice task (Art. 25(6)); history stays with the charger. No "unassigned" state for a live charger — it is decommissioned or moved. | 2A |
| A-6 | **Site fields** — maintenance contact (name, phone, role, out-of-hours), and an optional site-level **maximum SoC cap** applied through charging profiles only where the charger's capability record says it works. | OP-29, 30 | Contact phone is staff data, not public. The SoC cap is never silently claimed; unsupported models show "not available on this model". | 1 (contact) · 3 (SoC cap) |
| A-7 | **Tariff template list** — search and archive. Edits remain new versions (§9, rule 12). | OP-34–37 | "Delete" is **archive**: archived templates cannot be assigned but every past version stays readable. | 1 |
| A-8 | **Line-loss / site-loss factor** as a **cost-book and energy-boundary input** (§12.4, §28), not a driver price component. | OP-34 | Drivers pay for metered kWh at the charger plus disclosed fees. A loss factor may inform the owner's chosen price, never be added invisibly to the bill. | 1 (cost book) |
| A-9 | **Idle fees as their own charge record** — linked to the session, with its own number, state, dispute and refund path, listed and exported via A-1. | OP-46–48 | Still gated on the validated charging-completion event (§9); D-08 rate stays the founder's decision. | 1 |
| A-10 | **OCPP configuration workbench** (NOC and owner technician) — read the full configuration; show each key with the **OCPP 1.6J standard definition** (type, unit, read-only / read-write, required profile), the UZA target value, the charger's value and the difference; edit read-write keys; **revert to UZA default**; plain-language description for every standard key and every vendor key in the compatibility directory. | OP-55–58 | Edits go through the command outbox with confirmation and audit; a reboot-required response is surfaced. Vendor keys without evidence are labelled "undocumented". | 1 |
| A-11 | **Maintenance commands in the UI** — TriggerMessage (all six), soft and hard Reset, ClearCache, ChangeAvailability, UnlockConnector, raw message viewer (filter, search, export). | OP-60, 66–68, 71 | Hard reset and Inoperative are dangerous commands (§4). | 1 |
| A-12 | **Firmware and diagnostics over HTTPS** — UpdateFirmware and GetDiagnostics using signed, expiring HTTPS object-storage URLs; handle FirmwareStatusNotification and DiagnosticsStatusNotification; staged rollout (§14). FTPS only for a model that supports nothing else, recorded as a capability exception. | OP-63, 64 | Plain FTP is never offered (34.4). | 1 (diagnostics) · 2A (firmware rollout) |
| A-13 | **Local authorisation list** — SendLocalList / GetLocalListVersion for card identities. | OP-62 | §8.4: the list holds identities, not balances; offline charging stays disabled by default (D-10). | 2B |
| A-14 | **Commissioning sessions** — the benchmark's "test mode", made safe (34.4). | OP-24, 69 | Founder decided 27 Oct 2026 (Q-09.2): as proposed in 34.4. Built (`BUILD-REPORT-2026-10.md` §8). | 1 |
| A-15 | **Partner access grants** — time-boxed, charger-scoped access for an installer or manufacturer, extending the §29 support-access model to a new `uza_partner_technician` membership. | OP-25 | Grant names chargers, data types, expiry; revocable; every action audited; no money or driver data. | 2A |
| A-16 | **Role bundles within the fixed catalogue** — owner admins may name a bundle of existing permissions (e.g. "Night attendant") and assign it with a site scope. | OP-50 | A bundle can never exceed the granting user's own permissions or the role catalogue (CLAUDE §4); the backend checks permissions, not bundle names. | 2A |
| A-17 | **In-app notification centre** for staff — offline, faulted, never-connected, payout failed, compliance deadline; read/unread; links to the item. Complements SMS/WhatsApp digests (§16). | OP-04 | Critical alerts cannot be fully muted for owner admins and NOC (§16). | 1 |
| A-18 | **Licence and renewal per connector** — expiry date on each charger row (from the §17.5 licence record), "renew selected" producing one platform invoice payable by MoMo/Airtel. | OP-22 | Non-payment follows §17.5; active sessions are never interrupted. | 2A |
| A-19 | **Operations home** — today vs yesterday (energy, sessions, gross, energy component, service component), site picker, period picker, weekly and monthly report pages (the §12.5 digests rendered in-app). | OP-01–03, 08–11 | Every figure carries its Measured / Calculated / Entered label (§12.4). | 1 |
| A-20 | **Fleet / enterprise customers** — the §27.2 fleet workspace given an admin path: create, edit, assign sites, list members, view balance and budget use. | OP-51–54 | Postpaid credit and allocations follow §8.3.4 and §27.2. | 3 |
| A-21 | **Store-published driver app** — the PWA (§13.1) packaged for Google Play (Trusted Web Activity) and, if a customer pays for it, the App Store (native wrapper), from the same code and the network's brand configuration. | APP sheet | One codebase. Store accounts belong to the network (as the benchmark also requires). Sign in with Apple is required by Apple wherever Google sign-in is offered in the iOS build. | 4 |

### 34.4 Where we deliberately differ

| Benchmark | UZA rule | Why it is a selling point |
|---|---|---|
| WS **and** WSS connection URLs (OP-15) | `wss://` only, Security Profile 2 minimum (§6.2, §5.5) | A charger on plain WS sends its password in clear over a mobile network. |
| Operator-set device password (OP-16) | Generated per charger, shown once, stored hashed, rotatable | No reused or guessable passwords across an estate. |
| FTP diagnostics and firmware (OP-63, 64) | HTTPS signed URLs; FTPS only as a recorded exception | Firmware integrity; FTP is unencrypted. |
| **Test mode: charge without payment** (OP-24) | No free, untracked transaction (§6.7). Proposed **commissioning session** (A-14): owner admin enables it per charger for ≤ 24 h, before go-live or after a repair; every session is a normal session priced at zero with reason `COMMISSIONING`, appears in the ledger at zero, is excluded from revenue, auto-expires, and is listed on the charger's audit trail. *Decided 27 Oct 2026.* For uptime, the window's time is counted as **out of service** (Unavailable) rather than dropped from the period: RURA has accepted no exclusions, so the compliance figure counts it as down, and only the labelled technical-availability figure leaves it out. Paid starts and card taps on the charger are refused while the window is open. | Energy given away is still accounted for; nobody can leave a charger in free mode. |
| Delete station / delete tariff (OP-32, 36) | Soft delete / archive only; 180-day decommissioning notice (RURA Art. 34) | Regulator and investor records stay complete. |
| Email + password sign-up; Google/Apple/Facebook (APP-76–79) | Phone + SMS OTP primary; email and Google secondary (rule 18); no passwords for drivers | Every Rwandan driver has a MoMo number; not every driver uses email. |
| Wallet top-up before charging (APP-80) | Pay-per-session by MoMo/Airtel by default; wallet and cards optional (§8) | No stranded balances; no stored-value licence needed for the base product (BNR, D-16). |
| One payment method, one language | MTN MoMo **and** Airtel Money, cards and cash agents; Kinyarwanda first, English, French ready (§19.4) | The vendor charges per extra method and language; we include them. |

### 34.5 The sellable working model — definition

"Working model" means a buyer can do the following **without an engineer**, on the rebuild, in a demo network that is isolated from UCN (the Phase 2A gate already requires a second demo network):

1. Sign in as owner admin (phone + OTP, second factor) and invite staff with site scopes.
2. Create a site with maintenance contact, add a charger, receive its `wss://` URL, credential and QR labels, watch it connect, see its Data Capability Score.
3. Create a tariff template, assign it, run a commissioning session, go live.
4. A driver scans the QR, pays by MoMo or Airtel, charges, gets a receipt in Kinyarwanda or English.
5. Owner and NOC see the operations home, search and export sessions and ledger, receive an offline alert, read and edit the charger's configuration, reboot it, read its message log.
6. The owner sees settlement and requests a payout.

Steps 1–3 and 5 are almost entirely A-1 to A-4, A-7, A-10, A-11, A-17, A-19 plus production authentication. Steps 4 and 6 depend on provider credentials (Q-05).

### 34.6 How we position against it in Rwanda

These are arguments to verify and evidence before they go into sales material (§31.3 commercial evidence register).

- **Mobile money built in, not one "customised" method** — MTN MoMo and Airtel Money collections, refunds and owner payouts with reconciliation, already in the design.
- **RURA compliance done for the operator** — per-site licence tracking, 97% raw-uptime measurement, incident reports within 1 h / 48 h, inspection pack (§15). The vendor sells none of this.
- **Owner settlement and investor reporting** — the vendor's wallet has a "withdraw" button; we show every franc from collection to confirmed payout, split per contract.
- **Kinyarwanda first**, English and French, at no extra cost.
- **Data residency** — personal data processed in Rwanda (D-11), aligned with Law No 058/2021 on personal data protection. *To verify:* the law's conditions for storing personal data outside Rwanda, before claiming a competitor's hosting is non-compliant.
- **RWF billing, local support, local field technicians** — no USD invoices, no time-zone gap.
- **Mixed-brand estates** — any OCPP 1.6J charger, with a published compatibility directory and evidence levels, not "all EU/China/US standard devices".
- **Web-first by default** — scan-and-pay in the browser is our base product, not a USD 1,000 add-on; the store app (A-21) is the paid extra.

### 34.7 Pricing for market penetration — analysis and proposal for D-02, D-03 and D-13

> **Founder decision, 25 Oct 2026: prices are set in the admin panel, never in code.** What drivers pay is set by each owner on the owner portal's Prices page (built). What UZA charges operators — the card in §34.7.3 — is configuration with these figures as starting defaults, set by UZA in the platform admin (§13.6, §17.5; that screen is not built yet, so the values live in the `plans` table until it is). The figures stay `PROPOSED` defaults until confirmed in the commercial evidence register.

The benchmark is a reference point for the founder's pricing decisions. Every figure below is a `PROPOSED` default, and every input is an assumption to verify before it appears in a quote (§31.2 price from real costs, §31.3 evidence register). The arithmetic is reproducible from the assumptions listed.

#### 34.7.1 What the vendor's offer really costs a Rwandan operator

The vendor charges **per customer, not per station**: USD 1,000 (web) or 5,000 (store app) once, then USD 1,500 a year for up to 300 stations. That is cheap for a large estate and expensive for a small one — and Rwanda's operators today are overwhelmingly small: a hotel, a fuel station, a mall or a fleet with one to five chargers.

Assumptions: USD 1 = RWF 1,450 (verify against the BNR rate on the day); a station has 2 guns; an early-market DC gun in Kigali sells 60 kWh a day at RWF 370 per kWh (energy + service), so **RWF 666,000 of charging per gun per month**, RWF 1.33 M per station.

| Stations | Vendor web, year 1 | Vendor web, year 2+ | Vendor app, year 1 | Licence cost per station, vendor web year 1 |
|---|---|---|---|---|
| 1 | RWF 3,625,000 | RWF 2,175,000 | RWF 9,425,000 | RWF 3,625,000 |
| 5 | RWF 3,625,000 | RWF 2,175,000 | RWF 9,425,000 | RWF 725,000 |
| 25 | RWF 3,625,000 | RWF 2,175,000 | RWF 9,425,000 | RWF 145,000 |

And the vendor's figure is the licence only. It excludes the payment integration beyond "one payment method", local hosting (§5.5 data residency), RURA reporting (§15), owner settlement and payouts (§8.5), Kinyarwanda beyond one language, and support in the operator's time zone. A one-station hotel pays RWF 3.6 M in year one before any of that — about **23% of its first-year charging revenue**. That operator is the market, and at that price most of them will keep the notebook and the MoMo SMS.

#### 34.7.2 Principle: the operator pays when the operator earns

In a market where utilisation is still low and uncertain, a fixed fee is a bet the operator is asked to make before a single car arrives. A share of revenue moves that risk to us, which is the point: **an idle charger costs its owner nothing, and our income grows only as the network grows.** That is what makes the product easy to say yes to.

A pure percentage, though, overtakes the vendor's flat fee once an estate is big enough (at the assumptions above: from about 9 stations against the vendor's first year, 5 against later years). So the proposal switches to a flat fee at that size, priced at the vendor's level, and competes above it on what the vendor does not include.

#### 34.7.3 Proposed price card — starting defaults, set in the admin panel (D-02, D-03, D-13)

| Plan | Who it is for | Price (`PROPOSED`) | Includes |
|---|---|---|---|
| **Pilot** | Any new owner | **Free for 3 months, up to 2 chargers** | Everything in Operate. Ends with a reminder, never a cut-off mid-session (§17.5) |
| **Pay as you charge** (Operate, 1–5 stations) | Hotels, fuel stations, malls, small fleets | **2.5% of charging revenue collected through the platform, capped at RWF 25,000 per gun per month. No setup fee, no fixed fee.** | QR web app in the network's brand, MTN MoMo and Airtel Money, owner settlement and payouts, live view, maintenance console, reports, RURA compliance tracker, Kinyarwanda / English / French |
| **Flat** (Operate, 6–25 stations) | Growing operators | **RWF 200,000 per month** for the whole estate | Same, plus priority support |
| **Network** (Model D, white-label) | Organisations launching their own brand | **RWF 350,000 per month + RWF 2,000 per gun per month**; branded web app free; store-published app (A-21) RWF 3,000,000 once | Own brand, own payment accounts, own staff and owners, card programme, roaming |
| **Monitor only** | Chargers paid through another system | RWF 8,000 per gun per month | Live view, alarms, reports, maintenance — no payments |
| **Managed** (Model B) | Investors who want UZA to run it | 10–15% of revenue (D-03) | UZA runs the site |

What these come to, from the same assumptions:

| Stations | UZA, year 1 | Vendor web, year 1 | UZA as share of the operator's charging revenue |
|---|---|---|---|
| 1 (after the free pilot) | RWF 299,700 (9 paying months) | RWF 3,625,000 | 2.5% |
| 1, full year | RWF 399,600 | RWF 3,625,000 | 2.5% |
| 5 | RWF 1,998,000 | RWF 3,625,000 | 2.5% |
| 6 | RWF 2,400,000 (Flat) | RWF 3,625,000 | 2.5% |
| 25 | RWF 2,400,000 (Flat) | RWF 3,625,000 | 0.6% |
| 25, year 2+ | RWF 2,400,000 | RWF 2,175,000 | 0.6% |

The switch from Pay-as-you-charge to Flat at 6 stations is continuous (RWF 1.998 M → 2.4 M), so no owner is punished for adding a charger. From 6 to 25 stations the yearly cost is within about 10% of the vendor's licence after its first year, while including the payment rails, settlement and compliance work the vendor leaves to the operator.

**Where we are honestly more expensive:** a Network customer with 50+ stations pays more than the vendor's USD 1,500 licence. The case there is total cost — payment integration, in-country hosting, compliance staff time, settlement — and it must be made with the operator's own numbers, not ours (§31.3).

#### 34.7.4 Why the low entry price is sustainable

- **The marginal cost of a gun is small.** The platform is multi-tenant (§17.2): one more gun is a few rows and one WebSocket. The costs that grow per gun — SMS codes, MoMo collection fees, support time — must be measured in the pilot and written into the commercial evidence register before the cap and the share are confirmed (§31.2). Collection fees charged by MTN and Airtel are passed through, never absorbed silently (D-05).
- **Revenue follows the network.** At the assumptions above, 100 guns on Pay-as-you-charge bring in RWF 1.67 M a month. The same 100 guns on one flat licence would bring in less, and none of it in the first months, when owners are deciding.
- **The free pilot sells the product better than a sales call.** An owner who has watched a month of their own sessions, settlements and uptime on their phone has the evidence §31.3 asks for.

#### 34.7.5 What has to be true before these prices are quoted

1. Founder decision on D-02, D-03 and D-13 (this table is the proposal).
2. Verified USD/RWF rate and the operator's real kWh price (the 60 kWh/day assumption is the largest lever: at 30 kWh/day the 2.5% fee halves).
3. VAT treatment of the platform fee checked with RRA, and whether the share is computed on gross or net of VAT.
4. MoMo/Airtel collection and disbursement fees confirmed (Q-05) and who bears them (D-05).
5. Per-gun cost to serve measured during the pilot.
6. No quote states a price the platform cannot yet bill: platform invoicing (§17.5) is specified, not built.
