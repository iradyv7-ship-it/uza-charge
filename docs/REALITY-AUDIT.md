# UZA Charge: Reality Audit (Stage 1)

**Status:** for Gate 1. Gad reads this and decides what must be REAL for the Gad demo (Stage 4) and the pilot (Stage 8). Nothing here is a gate passed.
**Written:** 2 November 2026.
**Reviewer:** Gad. **Owner of commercial decisions:** Yves.

It was built in two passes.

1. **Code trace (Table A and Table B below).** Every route in the four apps was traced to the API endpoint, the service and the Prisma model, and the code was searched for invented data.
2. **Browser walkthrough on PostgreSQL.** Every P1 journey was run in a real browser (headless Chrome at 390 px) against a fresh, empty PostgreSQL database (`DEMO_STORE=prisma`, `SEED_ESTATE=none`), with the gateway, a simulated charger and all four apps running. Every defect found by either pass is listed under "Defects and their status". Each one is now fixed and tested, or still open with an owner.

The per-screen statuses in Table A are from the code trace, before the fixes. Where the defect table says a defect is fixed, the fix supersedes the Table A row.

## What was proven on 2 Nov, end to end, on PostgreSQL

All of the following ran in a browser against a database that started empty. The step scripts are in `uza-charge-api/browser-e2e/steps/`.

| Journey | Result | Simulated parts |
|---|---|---|
| A business applies to join (`/apply` on the owner portal) | PASS. The application is stored; nothing else is created | none |
| A network admin approves it in the NOC and chooses the commercial model | PASS. The owner and its first admin are created; the applicant's SMS is logged | SMS (no provider; logged, not sent) |
| The new owner signs in and sees an honest empty portal | PASS | sign-in code shown on screen |
| The owner adds a site and registers a charger, and gets its one-time password | PASS | none |
| A charger connects with that identity and password over OCPP | PASS | the charger is the `UZA-SIMULATED` simulator |
| Licence recorded by the owner, approved by the NOC; 24 RURA checklist items evidenced by the owner and approved by the NOC | PASS. The site may sell charging once every item the **regulation** requires is settled | none (the licence and documents are test entries) |
| The owner shows the site on the map and turns bookings on; one gun takes bookings | PASS (the bookings switch was added tonight) | none |
| The site appears on the driver map with live gun status, price **with currency**, and a "Simulated" tag | PASS | charger |
| The NOC records how fast the charger stops (the prepaid safety gate) | PASS. Payments are refused until it is recorded, as §7.3 requires | figures are labelled as a simulator profile |
| A driver signs in and books a gun; told honestly it is a priority place, not a held bay, and free | PASS | — |
| Nobody arrives: the booking is released automatically after T+2 and the driver is texted | PASS. The window closed 04:47; it was released at 04:47:39 | SMS logged |
| A driver scans, sees "Simulated charger", pays by MoMo, charges (live figures every second), stops, gets the receipt, finds it in History | PASS | payment (`SIMULATE_PAYMENT_CONFIRMATION`), charger |
| An owner adds an attendant (Staff → Attendant, one site) | PASS | — |
| The attendant opens a shift. Refused while no float is set; opens once the network sets one | PASS | the float (50,000) is a **test value**, recorded as such |
| The attendant takes cash, starts a charge for the driver, shows the driver a QR for the live charge and receipt, stops it, closes the shift with a count | PASS. Expected 3,000, counted 3,000 | charger |
| A charger goes silent: an offline incident opens and alerts | PASS for the incident (opened at 01:57). The SMS path is unit-tested; the live run reused an incident that was already open | SMS logged |
| The simulator delivered 72 kW on a 60 kW gun | Caught: an "over its recorded limit" incident opened automatically | charger |

**Level reached: L1 (laptop) with real PostgreSQL and real OCPP over a socket.** L2 (a server reachable from phones, MTN MoMo sandbox, SMS sandbox) needs a host and accounts: see "Blocked".

## Defects and their status

Numbers 1–22 are from the code trace; 23 onwards were found walking the journeys.

| # | Defect | Status | Where fixed / owner |
|---|---|---|---|
| 1 | A refused or unknown start, and an accepted stop, were never saved under PostgreSQL. The gun stayed "in use" and no refund ran | **FIXED**: saved only over the state that was read, so a charger's own Start/StopTransaction is not overwritten | api `sessions.service.ts` `moveState`; tests in `sessions.service.test.ts` |
| 2 | An attendant's driver-MoMo start never started the charge (it sent a second push) | **FIXED** | operator `StartPage.tsx`, `endpoints.ts` |
| 3 | A driver's app charges never reached their History | **FIXED**: optional driver identity on walk-up start; never required | api `public.controller.ts`, `driver.guard.ts` `optionalDriverId`; driver `PayPage.tsx` |
| 4 | Bookings never expired; two missed ones locked the driver out | **FIXED**: a sweep every minute releases after T+2 (plus any extension), audited, SMS | api `booking.sweeper.ts`, `sweepNoShows`; proven live |
| 5 | A booking did not hold the gun | **FIXED**: others are refused inside the hold; the booker starts and the booking is honoured; the scan page knows the booker | api `holdingBooking`, `sessions.service.ts`; driver `ConnectorPage.tsx` |
| 6 | Attendant cash for charges uses the `agents` till, not the ledger-backed card-agent shifts | **OPEN (reduced)**. Shifts now open and close for real with a counted till, change due, and handback (Q-01, Q-05 done). Moving charge cash onto the ledger (`AgentShift` + postings) is a money-path change for Gad's review | Gad |
| 7 | An attendant the owner adds could not take cash | **FIXED** through the shift model above. The float is the rules value `ATTENDANT_SHIFT_FLOAT_AMOUNT` (unset until decided) | api `operator.service.ts` `openShift`/`closeShift` |
| 8 | Simulated chargers were not labelled in the driver or attendant apps | **FIXED** (scan page, map, bay). The banner still does not list sandbox rails | driver, operator, api `locator` |
| 9 | Finance-only staff are locked out of the NOC console | **OPEN** | Gad (role decision) |
| 10 | Offline alert after 15 min, telling nobody | **FIXED**: default 5 min (still PROPOSED, adjustable); SMS to `NOC_ALERT_PHONES` and the owner's admins | api `incident-alerter.ts`, catalogue |
| 11 | Wallet advertised as a payment method but unusable | **FIXED**: shown as coming soon | api `funding.ts` |
| 12 | "We sent a code by SMS" when it was shown on screen | **FIXED** | api `auth.service.ts`, `public.controller.ts` |
| 13 | Cash customer got no receipt; `POST /operator/cash` has no idempotency key | **PARTLY FIXED**: QR to the live charge and receipt. Idempotency key still **OPEN** (the button is disabled while sending) | Gad |
| 14 | No owner self-registration | **FIXED**: public application, admin approval, SMS | api `applications/`, owner `ApplyPage.tsx`, NOC `ApplicationsPage.tsx` |
| 15 | Booking screens promised a fee that is never charged | **FIXED**: "Booking is free" everywhere until a fee is decided | api `bookings.ts`, driver copy |
| 16 | Invented "90 seconds to plug in"; paid amount could show 0 | **FIXED** | driver `PayPage.tsx` |
| 17 | Sites with no pin at 0,0 | **FIXED** | api `prisma.ts` |
| 18 | Business values hard-coded (booking policy, amount limits, cash presets, NOC thresholds, "RWF") | **OPEN** | Gad |
| 19 | Booking day wrong between 00:00 and 02:00 Kigali time | **OPEN** | Gad |
| 20 | P&L shows uncosted lines as 0 "Entered" | **OPEN** | Gad |
| 21 | Raw OCPP log has no charger time or clock drift | **OPEN** | Gad |
| 22 | Smaller gaps (RURA report site filter, stale guard comments) | **OPEN**. The per-shift receipt list is fixed by the shift model | Gad |
| 23 | The seed accepted a regulatory pack name that does not exist (`RW-RURA-2026`) without complaint | **OPEN**: validate in `seed-dev.ts` and in network settings | Gad |
| 24 | Recommended checklist items (master plan, not law) blocked a site from the map | **FIXED**: only `basis: REGULATION` items gate it (§11, §19.5) | api `regulatory-pack.ts` `checklistReviewed` |
| 25 | Nothing could turn bookings on for a site | **FIXED**: owner site form switch | api `onboarding.ts`; owner `SiteFormPage.tsx` |
| 26 | The map price had an empty currency | **FIXED** | api `locator.service.ts` |
| 27 | The receipt said "Refund sent" beside "not sent yet" | **FIXED**: the receipt reads the refund's real state | api `receipts.service.ts`; driver `ReceiptPage.tsx` |
| 28 | A cash driver's change was never stated; the till expected the full cash | **FIXED** | api `operator.service.ts` `changeDue` |
| 29 | "Cash" and "attendant MoMo" were offered only with `?agent=true` in the URL | **FIXED**: offered when an attendant has a shift open at the site | api `sessions.service.ts` |
| 30 | The attendant app said "UZA" in its copy (rule 21) | **FIXED** | operator i18n |
| 31 | The simulator reports more power than the gun's rating (72 kW on 60 kW) | **OPEN** (simulator realism); the platform flags it correctly | Gad |
| 32 | The demo did not start the attendant app on a real network | **FIXED** | api `scripts/demo.sh` |
| 33 | A charger that goes silent again while its first incident is still open sends no new alert | **OPEN** (by design today; decide whether a re-offline should alert again) | Gad |

## Decisions only Yves can make (the system refuses until they are set)

These are recorded in the rules registry as unknown, and the NOC lists them as blockers.

- **Attendant float per shift** (`ATTENDANT_SHIFT_FLOAT_AMOUNT`). With none set, no attendant shift opens.
- **Booking fee.** None exists, and every screen says booking is free.
- **Exposure limits, revenue share, seller of record, payout fee per rail.** These are the four paid-launch decisions in GO-LIVE §8.
- **Real prices.** The demo tariff is development seed data. Owners set real prices in the portal.

## Blocked (needs someone outside the code)

| What | Who | Why |
|---|---|---|
| A server (staging) with a domain | Gad / Yves | L2 needs HTTPS and phones. The Docker stack is ready to build (`deploy/`) |
| MTN MoMo and Airtel Money developer and production accounts | Yves | The rails exist, are labelled AWAITING CREDENTIALS, and refuse to pretend |
| Africa's Talking SMS (sandbox, then a sender ID) | Yves | Sign-in codes and alerts are logged, not sent, until then |
| A real Wicen charger on site, with a class 1 meter | Yves / Gad | Stage 7 |
| Native Kinyarwanda review of the new strings | Yves | New copy is written but unreviewed, like the rest |

---

## Code trace: summary counts (Table A, 127 rows, before the 2 Nov fixes)

| App | REAL | SIMULATED | PLACEHOLDER | MISSING | Rows |
|---|---|---|---|---|---|
| Driver | 18 | 7 | 3 | 5 | 33 |
| Owner | 21 | 11 | 0 | 5 | 37 |
| Operator (attendant) | 12 | 5 | 2 | 4 | 23 |
| NOC | 21 | 10 | 0 | 3 | 34 |
| **Total** | **72** | **33** | **5** | **17** | **127** |

**Headline answer to Gad's review:** no production screen invents a figure.

The grep sweep found:
- no `faker`, `mock` or fixture data;
- no `Math.random` figures;
- no hard-coded arrays of sites, chargers or sessions.

The problems are of a different kind:
1. **Broken P1 flows.** A failed start is not saved under Prisma. An attendant's MoMo start never fires. App charges are never linked to the signed-in driver.
2. **Booking enforcement that does not exist.** There is no auto-cancel and no hold on the gun.
3. **A split attendant cash system.** Cash charges use a seeded shift and never reach the ledger.
4. **Missing labels for simulation.** The driver and attendant apps do not show that a charger is simulated.

---

## Table A: screens and features

### A1. Driver app (`uza-charge-driver`)

| App | Screen / feature | Data source (endpoint → model) | Status | Evidence (file:line) | What makes it REAL |
|---|---|---|---|---|---|
| Driver | Shell: simulation banner | GET /public/environment → config flags | REAL (incomplete) | drv/components/SimulationBanner.tsx:27-58; api/public/environment.ts:31-70 | Add notices for: a simulated charger, a sandbox MTN/Airtel rail, `ALLOW_DEV_DRIVER_IDENTITY`, and the logging SMS sender (defect D-08) |
| Driver | Network branding | GET /public/network → Network | REAL | drv/network/branding.tsx:79; api/packages/packages.controller.ts:191-199 | Already real |
| Driver | /c/:code ConnectorPage: site, gun, status, price, kW | GET /public/connectors/:shortCode → `SessionsService.preStart` → Connector, Site, ChargePoint, Session, Tariff/TariffVersion | REAL (status fed by the charger) | drv/routes/ConnectorPage.tsx:56,134-144; api/public/public.controller.ts:80; api/sessions/sessions.service.ts:232 | Fix three API values: `reservedSoon:false` is hard-coded (sessions.service.ts:257, re-verified), `idleFeePerMinute:null` is hard-coded (:317), and the amount limits are RWF literals (:211-215) |
| Driver | ConnectorPage: payment-method list and Continue | Same call; `routeAvailability` | PLACEHOLDER | api/funding/funding.ts:650-654; drv/routes/ConnectorPage.tsx:140,271 | WALLET is shown as available, but neither the app nor the walk-up API can pay by wallet (api/public/public.controller.ts:32-38) |
| Driver | /c/:code/pay: MoMo / Airtel | POST /public/payments/session-charge → `PaymentsService.collect` → Payment, PaymentRailRequest; polls GET /public/payments/:id | SIMULATED (payment) | drv/routes/PayPage.tsx:95-173; api/payments/payments.service.ts:408-418; api/payments/rails/rails.config.ts:176-184 | MTN/Airtel credentials. Without them, a 2 s simulated confirmation. MTN defaults to the sandbox |
| Driver | Pay by wallet balance | none | MISSING | drv/routes/PayPage.tsx:95 (MOMO/AIRTEL only); api/public/public.controller.ts:32-38 | A WALLET start route plus a screen |
| Driver | Pay by bank card | API has BANK_CARD_INSTANT (public.controller.ts:166) | MISSING (no UI) | PayPage has no card UI | A card screen (low priority: core rule 17) |
| Driver | Pay: "You have 90 seconds to plug in" | literal | PLACEHOLDER | drv/routes/PayPage.tsx:252 | Read the value from the charger's ConnectionTimeOut via the API, or remove it |
| Driver | Start session (QR self-serve) | POST /public/sessions/start → `SessionsService.start` → Session + gateway RemoteStartTransaction | SIMULATED (charger) | drv/routes/PayPage.tsx:190-198; api/public/public.controller.ts:213-237; api/sessions/sessions.service.ts:486-531 | A real charger. The session is not linked to a signed-in driver (D-03), and a refused or unknown start is not saved (D-01) |
| Driver | /session/:id: live kWh, cost, kW, SoC | GET /public/sessions/:id every 5 s → Session (MeterValues) | SIMULATED (charger) | drv/routes/SessionPage.tsx:39,214-220; api/csms-gateway/charger-events.service.ts:564 | A real charger. Nothing is interpolated on the client; the 1 s timer only moves the clock |
| Driver | Session stop | POST /public/sessions/:id/stop | SIMULATED (charger) | drv/routes/SessionPage.tsx:238; api/public/public.controller.ts:309 | A real charger. When the stop outcome is unknown, the screen shows the wrong message |
| Driver | /receipt/:id | GET /public/sessions/:id/receipt → Session, Payment, pinned TariffVersion | SIMULATED (charger and payment inputs) | drv/routes/ReceiptPage.tsx:45; api/receipts (`forSession`) | Real meter values and payment. Marked provisional until final |
| Driver | /find list: free guns, wait, price, distance | GET /public/sites/nearby → `LocatorService.nearby` → Site > Station > ChargePoint > Connector + Session + Reservation | REAL | drv/routes/FindPage.tsx:150-190; api/public/public.controller.ts:333; api/persistence/prisma.ts:1471-1545 | Already real. Sites with null coordinates are placed at 0,0 (D-17) |
| Driver | Map (SiteMap) | Leaflet + OpenStreetMap tiles; marker colour from the API | REAL | drv/routes/SiteMap.tsx:52-101 | Already real |
| Driver | Find: type a gun code | navigates to /c/:code | REAL | drv/routes/FindPage.tsx:577-608 | — |
| Driver | /book/:code: free slots | GET /public/connectors/:code/slots → Reservation | REAL | drv/routes/BookPage.tsx:57-75; api/public/public.controller.ts:591 | — |
| Driver | Book: create | POST /driver/bookings → `BookingsService.create` → Reservation | REAL write; window not enforced | drv/routes/BookPage.tsx:93-149; api/driver/driver.controller.ts:96; api/bookings/bookings.service.ts:132 | See Table B, booking row. The window appears only *after* booking |
| Driver | Book: booking fee / "refunded in full" wording | none | PLACEHOLDER (untrue) | drv/i18n/messages.en.ts:351-361; api/bookings/bookings.service.ts:322-327 | Either charge a fee or remove the wording |
| Driver | /bookings: list and cancel | GET /driver/bookings, DELETE /driver/bookings/:id → Reservation | REAL | drv/routes/BookingsPage.tsx:62,84; api/driver/driver.controller.ts:80,141 | The "free to cancel until" time is wrong (D-15) |
| Driver | Walk-up booking without an account | POST /public/bookings exists | MISSING (no UI) | api/public/public.controller.ts:405; drv/routes/BookPage.tsx:160-169 requires sign-in | — |
| Driver | /history: list and stats | GET /driver/sessions, /driver/stats → Session where driverId | REAL query; **always empty for charges started in the app** | api/driver/driver.controller.ts:46,62 | Link sessions to the driver (D-03, re-verified) |
| Driver | /account sign-in (phone + SMS code) | POST /auth/code, /auth/driver/verify → PhoneVerification, Driver, AuthSession | SIMULATED (SMS) | drv/routes/AccountPage.tsx:83-172; api/app.module.ts:362-368; api/verification/verification.service.ts:129,224-229 | Africa's Talking credentials. The code is shown on screen only when not in production and `ALLOW_DEV_VERIFICATION_CODE=true` |
| Driver | Account profile | GET /auth/me | REAL | drv/routes/AccountPage.tsx:247-264 | — |
| Driver | Account deletion | POST /driver/account/delete → anonymise Driver, revoke AuthSession | REAL | api/driver/driver.controller.ts:35; drv/routes/AccountPage.tsx:330-380 | Already real. It is blocked by a stale BOOKED row (D-04). The phone number is kept in Payment and Complaint rows (unverified whether intended) |
| Driver | /wallet: balance, cards, history | GET /driver/wallet, /driver/wallet/history → Wallet, Card, ledger | REAL | drv/routes/WalletPage.tsx:136-137; api/wallet/wallet.controller.ts:27,38 | Already real |
| Driver | Wallet top-up | POST /driver/wallet/top-up → Payment | SIMULATED (payment) | api/wallet/wallet.controller.ts:48; api/wallet/wallet.service.ts:267-311 | Rail credentials. The status is checked by hand, not polled |
| Driver | Link / block a card | POST /driver/wallet/cards/link, /cards/:id/block → Card | REAL | drv/routes/WalletPage.tsx:255,584 | — |
| Driver | /help: complaint channels | GET /public/complaints → Network | REAL | drv/routes/HelpPage.tsx:139 | — |
| Driver | Help: file a complaint | POST /driver/complaints, /public/complaints → Complaint | REAL | drv/routes/HelpPage.tsx:284-300 | — |
| Driver | My complaints / ComplaintPage | GET /driver/complaints(/:id) → Complaint | REAL | drv/App.tsx:34; drv/routes/HelpPage.tsx:441,504 | — |
| Driver | SignInPrompt | static | REAL | drv/routes/SignInPrompt.tsx:18-48 | — |
| Driver | Automatic booking no-show / auto-cancel | none | MISSING | api/bookings/bookings.ts:230 (`isNoShow` is never called) | See Table B |
| Driver | "Simulated charger" label | none (`isSimulated` is not in the driver views) | MISSING | api/csms-gateway/charger-events.service.ts:298; no `isSimulated` in drv/ (grep) | Rule 2 requires the label in every app |

### A2. Owner portal (`uza-charge-owner`)

| App | Screen / feature | Data source (endpoint → model) | Status | Evidence (file:line) | What makes it REAL |
|---|---|---|---|---|---|
| Owner | SignInPage (phone, code, PIN) | POST /auth/code, /auth/staff/verify, /auth/staff/pin → Membership, StaffPin, AuthSession | SIMULATED (SMS) | own/routes/SignInPage.tsx:72-90; api/auth/auth.controller.ts:41-58; api/auth/auth.service.ts:76-82 | Africa's Talking credentials |
| Owner | /home | GET /owner/home, /owner/notifications, /owner/demand-response → ChargePoint, Connector, Session | SIMULATED (charger) | own/routes/HomePage.tsx:78-83; api/operations/operations.service.ts:88-136 | A real charger |
| Owner | /notifications | GET/POST /owner/notifications → Site, Incident, Session, NotificationRead | REAL | own/routes/NotificationsPage.tsx:64,79; api/operations/operations.controller.ts:48,54 | — |
| Owner | /reports (week/month digest) | GET /owner/reports/{week,month} → Session, uptime intervals | SIMULATED (charger) | own/routes/ReportsPage.tsx:39; api/operations/operations.service.ts:138-166 | A real charger |
| Owner | /overview | GET /owner/overview → Owner, Site, Session, TariffVersion | SIMULATED (charger) | own/routes/OverviewPage.tsx:46; api/owner/owner.service.ts:202-326 | A real charger |
| Owner | /chargers: list and CSV | GET /owner/lists/chargers, /owner/exports/chargers → ChargePoint, Connector | REAL (shows a "simulated" flag) | own/routes/ChargersPage.tsx:82,169,197; api/lists/lists.service.ts:152-166 | — |
| Owner | /chargers/new: add a charger | POST /owner/chargers → ChargePoint, Connector, Station + gateway POST /internal/chargers | REAL | own/routes/AddChargerPage.tsx:67; api/onboarding/onboarding.service.ts:180-336; api/csms-gateway/csms-gateway.client.ts:369-381 | Needs a gateway it can reach |
| Owner | /chargers/:id: setup sheet, password, connection, gun labels, audit | /owner/chargers/:id/setup, /credential, /connection; PATCH /owner/connectors/:id; GET /owner/audit | REAL | own/routes/ChargerDetailPage.tsx:80-423; api/onboarding/onboarding.controller.ts:68-155 | — |
| Owner | Charger detail: maintenance (OCPP log, configuration, commands) | /owner/chargers/:id/maintenance/* → gateway | SIMULATED (charger) | own/components/maintenance.tsx:179; api/maintenance/maintenance.controller.ts:87-138 | A real charger |
| Owner | Charger detail: test mode / commissioning | /owner/chargers/:id/commissioning → CommissioningWindow, Session | SIMULATED (charger) | own/components/test-mode.tsx:71; api/commissioning/commissioning.controller.ts:40-75 | A real charger |
| Owner | Charger detail: stopping latency | GET /owner/chargers/:id/stopping | SIMULATED (charger) | own/components/stopping.tsx:27; api/stopping/stopping.controller.ts:16-21 | A real charger |
| Owner | /sites: list | GET /owner/lists/sites → Site, Connector | REAL | own/routes/SitesPage.tsx:27; api/owner/owner.service.ts:567-614 | — |
| Owner | /sites/new, /sites/:id | POST /owner/sites, GET/PATCH /owner/sites/:id → Site (+ default Station) | REAL | own/routes/SiteFormPage.tsx:101,159; api/onboarding/onboarding.service.ts:129-169 | — |
| Owner | /sites/:id/load | /owner/sites/:id/load*, POST rebalance → LoadLimit, gateway charging profiles | SIMULATED (enforcement by the charger) | own/components/load.tsx:357,447; api/load/load.controller.ts:24-58 | A real charger |
| Owner | /payouts (MoneyPage): balance, quote, request, destination | /owner/payouts, /quote, /payout-destination → Payout, PayoutEvent, OwnerPayoutDestination, ledger | SIMULATED (balances come from simulated payments); disbursement AWAITING CREDENTIALS | own/routes/MoneyPage.tsx:76-176; api/payments/payouts.service.ts:229-259,435-470 | MTN/Airtel disbursement keys, and a payout number verified by finance (api/payments/payments.controller.ts:364) |
| Owner | /payouts/periods | GET /owner/lists/settlements → SettlementRun, SettlementSplit | REAL (empty until a settlement runs) | own/routes/PayoutsPage.tsx:34; api/owner/owner.service.ts:461-467 | A settlement run |
| Owner | /payouts/:id | GET /owner/payouts/:id → Payout, PayoutEvent, AuditLog | REAL | own/routes/PayoutDetailPage.tsx:43; api/payments/payments.controller.ts:415-420 | — |
| Owner | /package | GET /owner/package, /public/packages | REAL (read-only) | own/routes/PackagePage.tsx:70,76; api/packages/packages.controller.ts:174,206 | — |
| Owner | /agents: cash and shifts | GET /owner/agents → WalletAgent, AgentShift, ledger | REAL (read-only) | own/routes/AgentsPage.tsx:45; api/wallet/wallet.controller.ts:300-318 | Agents can only be registered by an admin (D-07) |
| Owner | /export | GET /owner/export | REAL | own/routes/ExportPage.tsx:46; api/portability/export.controller.ts:17 | — |
| Owner | /compliance | /owner/compliance* → ComplianceItem, SiteLicence, RegulatorSiteAccess | REAL | own/routes/CompliancePage.tsx:63-341; api/reports/w3.controller.ts:103-160 | — |
| Owner | /incidents, /incidents/:id | /owner/incidents* → Incident, IncidentNote | REAL | own/routes/IncidentsPage.tsx:50,64; api/reports/w3.controller.ts:166-210 | — |
| Owner | /analysis (7 reports, forecast) | GET /owner/reports/{kind} → Session, power samples, uptime | SIMULATED (charger) | own/routes/AnalysisPage.tsx:41-116; api/reports/w3.controller.ts:215-250 | A real charger. The forecast says "insufficient data" rather than guess |
| Owner | /costs | /owner/costs*, /costs/energy-rates/:siteId → CostBookItem | REAL (Entered) | own/routes/CostsPage.tsx:31-230; api/reports/w3.controller.ts:256-287 | — |
| Owner | /pnl | GET /owner/pnl → Session, CostBookItem, rules | REAL (every line labelled Measured / Calculated / Entered / Unknown) | own/routes/PnlPage.tsx:18-62; api/reports/pnl.ts:4-7,103-140 | Lines with no cost show as 0 "Entered" (D-20) |
| Owner | /regulator-reports | GET /owner/regulator-reports/monthly, /incidents (CSV/PDF) | REAL | own/routes/RegulatorReportsPage.tsx:49,70; api/reports/w3.controller.ts:296-316 | — |
| Owner | /rules | GET /owner/rules → RuleVersion | REAL (read-only) | own/routes/RulesPage.tsx:64; api/rules/rules.controller.ts:56-61 | — |
| Owner | /complaints, /complaints/:id | /owner/complaints* → Complaint, ComplaintNote | REAL | own/routes/ComplaintsPage.tsx:36,124; api/complaints/complaints.controller.ts:102-140 | — |
| Owner | /charges | GET /owner/lists/sessions → Session | SIMULATED (charger and payment) | own/routes/ChargesPage.tsx:60; api/owner/owner.service.ts:512-534 | A real charger and payment rail |
| Owner | /prices | /owner/tariffs* → Tariff, TariffVersion | REAL | own/routes/PricesPage.tsx:83-588; api/tariffs/tariffs.controller.ts:15-59 | — |
| Owner | /staff | GET/POST /owner/staff, DELETE, reset-pin → Membership, StaffPin | REAL | own/routes/StaffPage.tsx:65-102; api/auth/staff.service.ts:38-163 | — |
| Owner | /more | static menu | REAL (navigation only) | own/routes/MorePage.tsx:25-41 | — |
| Owner | Owner self-registration / application | none (admin only) | MISSING | api/packages/packages.controller.ts:141-147; api/packages/packages.service.ts:624-625 (re-verified) | See Table B |
| Owner | Host view | API GET /owner/host exists; no screen | MISSING (no UI) | api/owner/host-view.controller.ts:9-26 | — |
| Owner | Investor view | none | MISSING | schema:528 (the role exists, nothing uses it) | — |
| Owner | Fleet view | none | MISSING | schema:530 (FLEET_MANAGER is never referenced in api/) | — |
| Owner | Booking admin and digest settings | API /owner/bookings, /owner/digest exist; no screens | MISSING (no UI) | api/bookings/booking-admin.controller.ts:17; api/digest/digest.controller.ts:15 | Booking admin is the only way to mark a no-show today |

### A3. Attendant app (`uza-charge-operator`)

| App | Screen / feature | Data source (endpoint → model) | Status | Evidence (file:line) | What makes it REAL |
|---|---|---|---|---|---|
| Operator | SignInPage (phone, code, PIN) | POST /auth/code (staff), /auth/staff/verify, /auth/staff/pin | SIMULATED (SMS) | op/routes/SignInPage.tsx:76,107; api/auth/auth.service.ts:64-111; api/operator/operator.guard.ts:57,81-89 | Africa's Talking credentials |
| Operator | /bay: gun list and status | GET /operator/bay → Connector, ChargePoint, Session (10 s poll) | REAL | op/routes/BayPage.tsx:35,103,158-160; api/operator/operator.service.ts:232 | `reservedSoon:false` is hard-coded (api/operator/operator.service.ts:837) |
| Operator | /bay: live kWh and cost | same call | SIMULATED (charger) | api/operator/operator.service.ts:262-273; op/routes/BayPage.tsx:204-224 | A real charger. "RWF" is a literal (BayPage.tsx:221) |
| Operator | /bay: Stop | POST /operator/sessions/:id/stop | SIMULATED (charger) | op/api/endpoints.ts:109; api/operator/operator.service.ts:854 | A real charger |
| Operator | /shift: float, cash taken, expected in till | GET /operator/shift → Agent (`agents`) | PLACEHOLDER (seeded shift and 50,000 float) | op/routes/ShiftPage.tsx:50-170; api/operator/operator.service.ts:175-228; uza-charge-api/scripts/seed-dev.ts:650-662 | Endpoints to open and close this shift, and a float from configuration (operator Q-01, Q-04) |
| Operator | /shift: cash receipts | GET /operator/cash → CashReceipt | REAL (but lists every receipt ever taken, not this shift's) | api/operator/operator.service.ts:763-770 | Filter by shift |
| Operator | /start: cash charge, step 1 (record cash) | POST /operator/cash → Agent, CashReceipt | REAL write against the seeded shift | op/routes/StartPage.tsx:96-126; api/operator/operator.service.ts:320-393 | Put the cash on the ledger and the WalletAgent shift (D-06). No idempotency key (D-13) |
| Operator | /start: cash charge, step 2 (start) | POST /operator/sessions (CASH_AT_AGENT) → `SessionsService.start` → RemoteStartTransaction → csms charger_commands | SIMULATED (charger) | op/routes/StartPage.tsx:128-145; api/operator/operator.service.ts:675-712; csms/gateway/internal-api.ts:475 | A real charger |
| Operator | /start: amount presets | `[1_000, 2_000, 5_000, 10_000, 20_000]` | PLACEHOLDER | op/routes/StartPage.tsx:46 | Read the presets from network configuration |
| Operator | /start: driver's MoMo push | POST /operator/sessions (OPERATOR_MOMO_PUSH), polls GET /operator/payments/:id | SIMULATED (payment), and **broken** | op/routes/StartPage.tsx:151-262 | Send `paymentId` on the start call (D-02, re-verified) |
| Operator | /agent home: float, cash, commission, stock | GET /operator/wallet/me → ledger, WalletAgent, AgentShift, Card | REAL | op/routes/agent/AgentHomePage.tsx:40-146; api/agents/agents.service.ts:182 | Needs a WalletAgent registered by an admin |
| Operator | /agent/shift: open | POST /operator/wallet/shift/open → AgentShift | REAL | op/routes/agent/AgentShiftPage.tsx:69,179; api/agents/agents.service.ts:192 | — |
| Operator | /agent/shift: close with blind count | POST /operator/wallet/shift/close → AgentShift, LedgerEntry (expected cash from the ledger, variance) | REAL (covers card top-ups only) | op/routes/agent/AgentShiftPage.tsx:82-151; api/agents/agents.service.ts:227-272 | Include cash taken for charges (D-06) |
| Operator | /agent/find | GET /operator/wallet/cards/lookup → Card | REAL | op/agent/CardPicker.tsx:44 | NFC tap works only in Chrome on Android |
| Operator | /agent/sell | POST /operator/wallet/cards/sell → Card, Wallet, ledger | REAL (activation SMS simulated in dev) | op/routes/agent/SellCardPage.tsx:63-111; api/cards/cards.service.ts:531-601 | — |
| Operator | /agent/top-up | POST /operator/wallet/top-ups/cash → ledger | REAL | op/routes/agent/TopUpPage.tsx:69-185; api/wallet/wallet.service.ts:136-229 | — |
| Operator | /agent/report | GET /operator/wallet/report | REAL | op/routes/agent/AgentReportPage.tsx:35; api/agents/agents.service.ts:312 | — |
| Operator | /complaint | POST /operator/complaints → Complaint | REAL | op/routes/ComplaintPage.tsx:68-76; api/complaints/complaints.service.ts:175 | The "driver is texted" line is static (ComplaintPage.tsx:100) |
| Operator | Simulation banner | GET /public/environment | REAL | op/components/SimulationBanner.tsx:33,45 | — |
| Operator | Open and close the cash-charge shift | none for the `Agent` shift | MISSING | operator OPEN_QUESTIONS Q-01 | Merge it into WalletAgent and AgentShift |
| Operator | Cash receipt for a cash charge | `receiptRef` is generated but never shown | MISSING | api/operator/operator.service.ts:364-370; op/routes/StartPage.tsx:358-369; operator Q-05 | Show the reference, and SMS or print it |
| Operator | Till reconciliation for cash charges | none | MISSING | operator Q-03; api OPEN_QUESTIONS Q-11 item 9 | — |
| Operator | Float top-up request | none in this app (NOC funds it at api/wallet/wallet.controller.ts:252) | MISSING | operator Q-02 | — |

### A4. NOC console (`uza-charge-noc`)

| App | Screen / feature | Data source (endpoint → model) | Status | Evidence (file:line) | What makes it REAL |
|---|---|---|---|---|---|
| NOC | Sign-in | /auth/code, /auth/staff/verify, /auth/staff/pin, /auth/me | SIMULATED (SMS) | noc/api/auth.ts:19-35 | Africa's Talking credentials. Finance-only roles are refused afterwards (D-09) |
| NOC | Simulation banner | GET /public/environment | REAL | noc/components/SimulationBanner.tsx:31-58 | — |
| NOC | /estate | GET /noc/estate → ChargePoint, Site, Owner, Connector, Session, ConnectorStatusChange + gateway connections | SIMULATED (charger; `isSimulated` pill shown) | noc/routes/EstatePage.tsx:90-236; api/noc/noc.service.ts:186-266,399-410 | A real charger. Offline after 180 s of silence (api/rules/catalogue.ts:84-85) |
| NOC | /commands | GET /noc/commands → csms ChargerCommand / CommandAttempt | REAL | noc/routes/CommandsPage.tsx:61; api/noc/noc.service.ts:307-340 | The 300 s "stale" threshold is hard-coded (api/noc/noc.service.ts:54) |
| NOC | /sessions | GET /noc/sessions → Session | REAL | noc/routes/SessionsPage.tsx:64; api/noc/noc.service.ts:343-357 | The 6 h "stuck" threshold is hard-coded (api/noc/noc.service.ts:51) |
| NOC | Charger > Overview | GET /noc/chargers/:id → gateway ChargePoint | REAL | noc/routes/charger/OverviewTab.tsx:25; api/maintenance/maintenance.service.ts:133-135 | — |
| NOC | Charger > Configuration | GET/refresh/change configuration → csms ChargerConfigSnapshot | SIMULATED (charger) | noc/routes/charger/ConfigurationTab.tsx:55,59; api/maintenance/maintenance.service.ts:437-490 | A real charger |
| NOC | Charger > Messages (raw OCPP log) | GET /noc/chargers/:id/messages → gateway → csms OcppMessageRaw | SIMULATED (simulator traffic; the pipeline is real) | noc/routes/charger/MessagesTab.tsx:72; csms/gateway/ocpp.server.ts:1127-1150; api/csms-gateway/csms-gateway.client.ts:429-449 | A real charger. `chargerTimestamp` and clock drift are always null (D-21) |
| NOC | Charger > Commands (reset, unlock, availability, firmware, diagnostics) | POST /noc/chargers/:id/commands → csms ChargerCommand; 3 s progress poll | SIMULATED (charger) | noc/routes/charger/CommandsTab.tsx:50-88; api/maintenance/maintenance.service.ts:249-380 | A real charger. Hard reset needs a confirmation and a reason; soft reset is one click (:370) |
| NOC | Charger > Diagnostics | GET diagnostics, file content → csms DiagnosticsUpload | REAL | noc/routes/charger/DiagnosticsTab.tsx:27; api/maintenance/maintenance.service.ts:149-203 | — |
| NOC | Charger > TestMode | commissioning, test-charges → CommissioningWindow, Session | SIMULATED (charger) | noc/routes/charger/TestModeTab.tsx:45-237; api/commissioning/commissioning.service.ts:127-399 | A real charger |
| NOC | Charger > Stopping | /noc/chargers/:id/stopping → ChargePoint.stopLatency* | REAL (declared values) | noc/routes/charger/StoppingTab.tsx:48-51; api/stopping/stopping.service.ts:79-169 | — |
| NOC | /uptime | GET /noc/uptime → ConnectorStatusChange; 97% target from rules | REAL (measured; unobserved time is never counted as up) | noc/routes/ops/UptimePage.tsx:45,237; api/reports/w3.controller.ts:435-451 | — |
| NOC | /incidents | /noc/incidents* → Incident, IncidentNote | REAL | noc/routes/ops/IncidentsPage.tsx:195-385; api/reports/w3.controller.ts:388-432 | 1 h / 48 h / 24 h clocks from the regulatory pack (api/compliance/regulatory-pack.ts:160-161) |
| NOC | /compliance (queue, licences, checklist, reports) | /noc/compliance*, /noc/regulator-reports/* → SiteLicence, ComplianceItem | REAL | noc/routes/ops/CompliancePage.tsx:597-664; api/reports/w3.controller.ts:342-480 | The monthly report has no site filter (api/reports/w3.controller.ts:454-465) |
| NOC | /load | /noc/load, /noc/sites/:id/load, demand-response → LoadLimit, DemandResponseEvent, LoadCommand | SIMULATED (charger meter and profiles) | noc/api/load.ts:88-132; api/load/load.service.ts:260-920 | A real charger |
| NOC | /complaints | /noc/complaints* (+ refund, register.csv) → Complaint, ComplaintNote, Refund | REAL | noc/routes/complaints/ComplaintsPage.tsx:91-130; api/complaints/complaints.controller.ts:146-192 | — |
| NOC | Admin > Network settings | GET/PATCH /admin/network → Network | REAL | noc/api/admin.ts:83-89; api/packages/packages.controller.ts:149-165 | — |
| NOC | Admin > Packages, DraftEditor | /admin/packages* → Package, PackageVersion | REAL | noc/api/admin.ts:94-122 | — |
| NOC | Admin > Quote tool | POST /admin/packages/:id/quote | REAL (calculated) | noc/api/admin.ts:140 | — |
| NOC | Admin > Subscriptions and owners | /admin/subscriptions*, GET/POST /admin/owners → PackageSubscription, Owner | REAL | noc/api/admin.ts:147-180; api/packages/packages.controller.ts:101-146 | — |
| NOC | Admin > Rules | /admin/rules* → RuleVersion | REAL | noc/api/rules.ts:131-140; api/rules/rules.controller.ts:19-52 | — |
| NOC | Admin > Wallet (batches, cards) | /admin/wallet/card-batches, cards* → CardBatch, Card | REAL | noc/api/admin.ts:185-221; api/wallet/wallet.controller.ts:149-233 | — |
| NOC | Admin > Wallet agents, float, exceptions | /admin/wallet/agents*, float-fundings* → WalletAgent, FloatFunding | REAL records | noc/api/admin.ts:224-254; api/wallet/wallet.controller.ts:236-292 | — |
| NOC | Admin > Payments: rails, exceptions, requery, reconcile | /admin/payments/* → Payment, PaymentException, PaymentRailRequest | SIMULATED (payment) | noc/routes/admin/PaymentsPage.tsx:69-208; api/payments/reconciliation.service.ts:1-18 | Rail credentials. The scheduler is off unless `PAYMENT_RECONCILIATION_ENABLED=true` |
| NOC | Admin > Payment detail | GET /admin/payments/:id → Payment, PaymentEvent | REAL | noc/api/admin.ts:263 | — |
| NOC | Admin > Refunds | /admin/refunds* → Refund | SIMULATED (money movement) | noc/api/admin.ts:284-301; api/payments/refunds.service.ts:63-103 | Rail credentials. Card refunds: REQUIRES OFFICIAL VERIFICATION (:103) |
| NOC | Admin > Payouts and destinations | /admin/payouts*, /admin/payout-destinations* → Payout, OwnerPayoutDestination | SIMULATED (transfer) | noc/api/admin.ts:304-316 | Disbursement credentials |
| NOC | Finance: provider statement vs ledger vs payouts | none | MISSING | api/payments/reconciliation.service.ts:15-17 (re-verified: "Provider statements … are not reconciled") | A statement import and a three-way match screen |
| NOC | /regulator > Sites | GET /regulator/sites → RegulatorSiteAccess, Site | REAL (name and address only) | noc/routes/regulator/RegulatorPage.tsx:67; api/reports/w3.controller.ts:489-507 | — |
| NOC | /regulator > Monthly report per site | GET /regulator/reports/monthly?siteId (CSV/HTML/PDF) | REAL | noc/routes/regulator/RegulatorPage.tsx:200; api/reports/w3.controller.ts:509-521 | — |
| NOC | /regulator > Incident register | GET /regulator/incidents (CSV) | REAL | noc/routes/regulator/RegulatorPage.tsx:254; api/reports/w3.controller.ts:524-536 | — |
| NOC | Regulator live view (licences, uptime vs 97%, incident and complaint timers) | none | MISSING | noc/routes/regulator/RegulatorPage.tsx:42-46 (3 file tabs only) | JSON regulator endpoints plus screens |
| NOC | Offline alert to a person | the watchdog opens an incident only | MISSING | api/uptime/watchdog.ts:22,35; api/uptime/availability.ts:151-188 (re-verified) | An SMS or push to on-call; a threshold of 5 min or less (D-10) |

---

## Grep sweep (production code only)

**Scope:** the four apps' `src` and `uza-charge-api/src`. Excluded: `*.test.*`, `test-harness`, `test-setup`, `node_modules`, `dist`.

**Patterns searched:**
- `Math.random`, `faker`, `mock`, `fixture`, `sample`, `example`, `demo`, `TODO`, `FIXME`;
- `setTimeout` and `setInterval`;
- hard-coded arrays;
- literal RWF or kWh values.

**Findings:**
- **No hits** for faker, mock or fixture data in any of the four apps.
- **No TODO or FIXME** in any of the four apps.
- **No hard-coded arrays** of sites, chargers or sessions. The constant arrays are enums or tab lists only.
- **The API is clean too.** The only matches are comments, help text, and the dev fixture estate in `api/persistence/memory.ts`. That estate loads only with `API_STORE=memory` plus `API_DEV_ESTATE=fixtures`. When it loads, the banner says so (api/public/environment.ts:49-54), and production refuses the memory store (api/config/configuration.ts:206-213).

### Hits that reach a production screen

| Hit | file:line | Verdict |
|---|---|---|
| `Math.random` (idempotency-key fallback) | own/routes/MoneyPage.tsx:46; op/agent/keys.ts:31 | Harmless. Not a displayed figure |
| `Math.random` (complaint reference) | api/complaints/complaints.ts:49 | Harmless. Builds a reference ID, not a figure |
| "90 seconds to plug in" | drv/routes/PayPage.tsx:252 | **PLACEHOLDER.** Nothing in the code backs this promise |
| Cash presets `[1_000 … 20_000]` | op/routes/StartPage.tsx:46 | **PLACEHOLDER.** Not from configuration |
| Seeded 50,000 float and shift | uza-charge-api/scripts/seed-dev.ts:650-662 (read by op/routes/ShiftPage.tsx) | **PLACEHOLDER** |
| Literal "RWF" currency | op/routes/BayPage.tsx:221; op/routes/StartPage.tsx:77 | **Defect** (rule 21) |
| `currency ?? "RWF"` fallbacks | own/routes/AgentsPage.tsx:36, OverviewPage.tsx:89, ReportsPage.tsx:67; drv/routes/ReceiptPage.tsx:63, WalletPage.tsx:163; several op/ agent pages; api/payments/payouts.service.ts:225 | Minor (rule 21). Shown only if the API omits currency |
| Amount limits as RWF literals in the API | api/sessions/sessions.service.ts:211-215, :470 | **Defect.** Should come from configuration (core rule 3) |
| Booking policy constant (2/2 min, 45 min slot, 2 live, 30 min free cancel) | api/bookings/bookings.service.ts:42-52 (re-verified) | **Defect.** Hard-coded, not in the rules registry (core rule 3) |
| Offline-incident fallback `?? 15` | api/uptime/availability.ts:175 | **Defect.** 15 min against the 5 min target |
| `STUCK_AFTER_HOURS=6`, `COMMAND_STALE_AFTER_SECONDS=300` | api/noc/noc.service.ts:51,54 | Minor. Should be in the rules registry |
| Booking-fee wording | drv/i18n/messages.en.ts:351-361 | **PLACEHOLDER.** No fee exists |
| Client-side "Charging stops at X kWh" estimate | drv/presentation/connector-view.ts:330-354; drv/routes/PayPage.tsx:70-76 | Minor. Labelled as an estimate, but ignores the start fee; should use the API's funding cap |
| `setTimeout` / `setInterval` | drv/routes/PayPage.tsx:165, SessionPage.tsx:214,220; op/routes/BayPage.tsx:103, StartPage.tsx:233; own/components/*.tsx polls; noc/api/useRead.ts:125, noc/routes/charger/useCommand.ts:160 | Harmless. All real API polling or request timeouts. None fakes progress |
| Kigali fallback map centre | drv/presentation/site-marker.ts:72 | Harmless. Used only when there are no sites |
| `placeholder="…example…"` input hints | several | Harmless |

---

## Table B: stakeholder matrix

| Stakeholder (priority) | Job | Status | Evidence (file:line) |
|---|---|---|---|
| **Driver (P1)** | Find a site with live free guns on the map | REAL | Geolocation runs only on "Near me", or when permission was already granted (drv/routes/FindPage.tsx:108-148), then GET /public/sites/nearby?lat&lng (api/public/public.controller.ts:333). The API computes distance (api/locator/locator.ts:40,386). Free-gun counts come from the gun's status, its last-seen time, the active session and the booking window (api/persistence/prisma.ts:1524-1531). Real Leaflet/OSM map (drv/routes/SiteMap.tsx:52-62). Only sites that are public, reviewed and licensed appear (api/locator/locator.ts:316). Defect: null coordinates land at 0,0 (prisma.ts:4925) |
|  | See the full price before paying | REAL | ConnectorPage shows the published tariff (api/sessions/sessions.service.ts:232-317; drv/routes/ConnectorPage.tsx:134-144). `idleFeePerMinute` is hard-coded null (:317) |
|  | **Book a gun** (4-min window, then auto-cancel) | **PLACEHOLDER: booking is recorded, the window is not enforced** | See below |
|  | Pay by MoMo / Airtel | SIMULATED (payment) | drv/routes/PayPage.tsx:95-173; real MTN/Airtel adapters at api/payments/rails/mtn-momo.rail.ts and airtel-money.rail.ts. Sandbox by default (rails.config.ts:176-184). Production refuses sandbox or simulation (rails.config.ts:145-160; api/config/configuration.ts:219-240) |
|  | Pay by wallet | MISSING (shown as available) | api/public/public.controller.ts:32-38; api/funding/funding.ts:650-654 |
|  | Pay by card | MISSING in app (API path exists) | api/public/public.controller.ts:166 |
|  | Self-start with no attendant (QR → pay → start) | SIMULATED (charger and payment), and works end to end in code | /c/:code (drv/routes/ConnectorPage.tsx:253-256) → /c/:code/pay → POST /public/sessions/start (drv/routes/PayPage.tsx:190-198) → RemoteStartTransaction (api/sessions/sessions.service.ts:505-516). Service model is SELF_SERVE (api/public/public.controller.ts:226-228). Defects D-01 and D-03 |
|  | Watch the charge live | SIMULATED (charger) | 5 s poll (drv/routes/SessionPage.tsx:39,214) of meter values (api/csms-gateway/charger-events.service.ts:564) |
|  | Stop | SIMULATED (charger) | api/public/public.controller.ts:309 |
|  | Receipt | SIMULATED (inputs); REAL path | drv/routes/ReceiptPage.tsx:45 |
|  | History | REAL query, **empty for charges started in the app** | api/public/public.controller.ts:230-237 passes no driverId; api/sessions/sessions.service.ts:492 (re-verified) |
|  | Wallet top-up | SIMULATED (payment) | api/wallet/wallet.service.ts:267-311 |
|  | Account deletion | REAL | api/driver/driver.controller.ts:35; blocked by stale bookings (api/driver/account.service.ts:62-67, BOOKING_LIVE at :65) |
|  | Installable app (manifest, service worker) | REAL | uza-charge-driver/public/manifest.webmanifest, public/sw.js; registration at drv/pwa/pwa.ts:88 (re-verified) |
| **Station owner (P1)** | Apply / register as a new owner without an admin | **MISSING (confirmed)** | The only path that creates an owner is POST /admin/owners (api/packages/packages.controller.ts:141-147), behind NocGuard plus `assertRole(...ADMINS)` (api/packages/packages.service.ts:624-625). It also creates the first OWNER_ADMIN membership (:676-682). An unknown number at sign-in is refused NOT_INVITED (api/auth/auth.service.ts:76-82). No public apply endpoint exists (grep of controllers) |
|  | Add a site and charger without an engineer | REAL (OWNER_ADMIN) | Site: api/onboarding/onboarding.controller.ts:26; onboarding.service.ts:129-169. Charger: POST /owner/chargers (:60). The OCPP identity is generated and registered with the gateway, and a setup sheet returns the URL, a one-time password and QR labels (api/onboarding/onboarding.service.ts:180-336,622-650). Commissioning windows follow (api/commissioning/commissioning.service.ts:53-61). Physical wiring and charger configuration are still on-site work |
|  | Set prices | REAL | own/routes/PricesPage.tsx; api/tariffs/tariffs.controller.ts:15-59 (append-only versions) |
|  | Today's sessions, kWh, money | SIMULATED (charger and payment) | own/routes/HomePage.tsx:78-83; api/operations/operations.service.ts:88-136 |
|  | Payouts | SIMULATED / AWAITING CREDENTIALS | api/payments/payouts.service.ts:435-470 |
|  | Monthly P&L labelled Measured / Calculated / Entered | REAL | api/reports/pnl.ts:4-7,103-140; own/routes/PnlPage.tsx:44-49. Defect D-20: no cost shows as 0 "Entered" |
|  | Reports | REAL | Week/month digest (own/routes/ReportsPage.tsx:39). Analysis: energy, peak, load profile, revenue, chargers, uptime, forecast (own/routes/AnalysisPage.tsx:41-48; api/reports/w3.controller.ts:215-250). P&L (:289). RURA monthly and incident register (:296-316). Complaints register CSV (api/complaints/complaints.controller.ts:113). Full export (api/portability/export.controller.ts:17). Daily WhatsApp/SMS digest exists in the API (api/digest/digest.service.ts:105) but is off unless `OWNER_DIGEST_ENABLED=true` (:146), and has no owner screen |
|  | Incidents | REAL | own/routes/IncidentsPage.tsx; api/reports/w3.controller.ts:166-210 |
|  | Staff (create an attendant) | REAL membership; **cash-agent record admin-only** | StaffPage → POST /owner/staff → `StaffService.invite` (api/auth/staff.service.ts:58-109). Invitable roles are OWNER_ADMIN, OWNER_SITE_MANAGER, OWNER_VIEWER and AGENT (:20-25); an AGENT gets exactly one site (:81-86). No SMS is sent at invite: the owner tells the person to sign in (:107). The WalletAgent needed for card and top-up cash work can only be created by NETWORK_ADMIN or UZA_SUPER_ADMIN (api/wallet/wallet.controller.ts:243-249). The cash-charge `Agent` shift is seeded only (see Attendant) |
|  | Hide a site from the map | REAL | `publicOnNetwork` checkbox when editing a site (own/routes/SiteFormPage.tsx:146-147,284-296). New sites default to hidden (schema:230) |
| **Attendant (P1)** | Sign in (AGENT membership) | SIMULATED (SMS); REAL path | Phone, SMS code, then PIN (op/api/auth.ts:37-44; api/auth/auth.controller.ts:41-61). The guard accepts AGENT or OWNER_SITE_MANAGER (api/operator/operator.guard.ts:57,81-89). An AGENT-only user lands on /bay (op/App.tsx:107). /bay works; /shift and the cash start need a seeded `Agent` row for the site; /agent/* needs an admin-created WalletAgent (api/agents/agents.service.ts:77-81) |
|  | Open and close a shift | **Split: REAL for card cash (/agent/shift); PLACEHOLDER for charge cash (/shift, seeded)** | api/agents/agents.service.ts:192,227 vs api/operator/operator.service.ts:175-228,334; operator Q-01 |
|  | Cash charge | REAL write plus SIMULATED charger | api/operator/operator.service.ts:320-393,675-712. Needs the seeded shift. No idempotency key |
|  | Start on a driver's behalf with the driver's MoMo | **Broken** (SIMULATED payment) | op/routes/StartPage.tsx:249-256 sends no `paymentId`, so the API re-runs the push branch (api/operator/operator.controller.ts:249-262) (re-verified) |
|  | Sell and top up a card | REAL (needs a WalletAgent) | api/cards/cards.service.ts:531,680; api/wallet/wallet.service.ts:136-229 |
|  | Cash receipt | Card cash: REAL (on screen plus SMS). Charge cash: MISSING | op/agent/Receipt.tsx:7-44; api/operator/operator.service.ts:364-370 is never shown (op/routes/StartPage.tsx:358-369) |
|  | Complaint | REAL | op/routes/ComplaintPage.tsx:68-76 |
|  | Till reconciliation | REAL for card cash (blind count, ledger variance); MISSING for charge cash | api/agents/agents.service.ts:242-272; operator Q-03 |
| **NOC / UZA operations (P1)** | Estate view | SIMULATED (charger) | api/noc/noc.service.ts:186-266 |
|  | Offline and fault alerts | **PARTIAL.** Offline status after 180 s, checked every 60 s. Incident auto-opened after **15 min**. No SMS or push to anyone | api/rules/catalogue.ts:84-85,815-822; api/uptime/watchdog.ts:22,35; api/uptime/availability.ts:175-180 (re-verified) |
|  | Raw OCPP log | REAL pipeline, simulator traffic | csms/gateway/ocpp.server.ts:1127-1150 → api/csms-gateway/csms-gateway.client.ts:429-449 → noc/routes/charger/MessagesTab.tsx:72 |
|  | Confirmed reset and diagnostics | REAL (hard reset confirmed with a reason; soft reset one click) | api/maintenance/maintenance.service.ts:285-293,366-380 |
|  | Test mode | SIMULATED (charger) | api/commissioning/commissioning.service.ts |
|  | Load management | SIMULATED (charger) | api/load/load.service.ts; the sweeper at api/load/load.sweeper.ts:38-44 |
|  | Complaints | REAL | api/complaints/complaints.controller.ts:146-192 |
|  | Manage bookings (mark no-show, cancel, extend) | API only; no NOC screen | api/bookings/booking-admin.controller.ts:39-58; api/bookings/booking-admin.service.ts:167-170 |
| **Finance (P1)** | Daily reconciliation: provider statement vs ledger vs payouts | **MISSING** (requery of open items is REAL but off by default) | api/payments/reconciliation.service.ts:10-17,72 |
|  | Refunds | REAL records and approvals; money SIMULATED | api/payments/refunds.service.ts:63-103 |
|  | Use the console as finance-only staff | **Broken** | The access probe calls /noc/estate (noc/session/operations.tsx:297-306), and OPERATIONS_ROLES excludes NETWORK_FINANCE and UZA_FINANCE (api/noc/noc.service.ts:66-74) (re-verified) |
| **Government / regulator (P2)** | RURA report per site | REAL | api/reports/w3.controller.ts:296-316 (owner), :454-480 (NOC, no site filter), :509-521 (regulator) |
|  | Read-only regulator view | **PARTIAL.** A role and a login exist; the view offers file downloads only | REGULATOR_VIEWER role (schema:532). RegulatorGuard (api/reports/regulator.guard.ts:40-46). The owner grants access per site (api/reports/w3.controller.ts:155-162; RegulatorSiteAccess at schema:2502). The NOC app routes regulator-only users to /regulator (noc/App.tsx:176-182). No live uptime, incident-timer or complaint-timer view (noc/routes/regulator/RegulatorPage.tsx:42-46) |
| **Investor / lender (P2)** | Read-only view of financed sites | MISSING | The INVESTOR role exists (schema:528) and is read-only (api/tenancy/read-only.ts:11). No endpoint and no screen. Owners cannot invite investors (api/auth/staff.service.ts:20-25) |
| **Fleet manager (P2)** | Fleet account, drivers and cards, budgets, statement | PARTIAL (engine only) | FLEET_POSTPAID funding (api/funding/funding.ts:62,525-561); FLEET id-token (api/csms/csms.service.ts:182-185); FLEET subscriber type (api/packages/packages.service.ts:52). FLEET_MANAGER role (schema:530) is never referenced in api/src. No screens |
| **Host (P2)** | Read-only sessions and host share | PARTIAL (API only) | GET /owner/host (api/owner/host-view.controller.ts:9-26; host-view.service.ts:44). Host share in settlement (api/settlement/settlement.ts:234). No screen. Owners cannot invite HOST |
| **White-label client (P3)** | Own branded network from configuration | PARTIAL | Network settings and branding are configurable (api/packages/packages.controller.ts:149-165; drv/network/branding.tsx:79). One API process serves one `API_NETWORK_ID` (api/config/configuration.ts:214-217). Running a second demo network was not verified |

### The booking row in detail (driver P1)

- **The window exists as a constant, not as configuration.** `BOOKING_POLICY = { graceBeforeMinutes: 2, graceAfterMinutes: 2, slotMinutes: 45, … }` at api/bookings/bookings.service.ts:42-52. Core rule 3 requires it in the rules registry.
- **The window is computed only when something is read.**
  - `arrivalWindow` and `phaseOf` (api/bookings/bookings.ts:125-133,196-216) label a booking "MISSED" in the driver's list.
  - The locator marks a gun RESERVED_SOON only during T−2 to T+2 (api/persistence/prisma.ts:1524-1531).
- **Auto-cancel is not scheduled anywhere.**
  - There is no cron, worker or interval for bookings. The only `setInterval` schedulers in the API are the digest (api/digest/digest.service.ts:105), reconciliation (api/payments/reconciliation.service.ts:72), the availability watchdog (api/uptime/watchdog.ts:35) and the load sweeper (api/load/load.sweeper.ts:38).
  - `isNoShow` (api/bookings/bookings.ts:230) and `mayStart` (:223) are never called outside tests.
  - EXPIRED_NO_SHOW is set only by a staff action (api/bookings/booking-admin.service.ts:170). That action has no owner or NOC screen.
  - Nothing sets ARRIVED, ACTIVE or HONOURED.
  - The only automatic release is of unverified holds, and only when someone tries to book the same gun again (api/bookings/bookings.service.ts:154).
- **The booking does not hold the gun.**
  - `preStart` passes `reservedSoon: false` (api/sessions/sessions.service.ts:257).
  - The operator bay does the same (api/operator/operator.service.ts:837).
  - Session start never looks at bookings (no booking reference in api/sessions).
  - A walk-up driver or an attendant can take a booked gun.
- **Knock-on effect: drivers get locked out.**
  - A missed booking stays BOOKED and counts as live for ever (api/persistence/prisma.ts:1099-1103).
  - After two, the driver gets TOO_MANY_LIVE (api/bookings/bookings.ts:333-336) and account deletion is refused.
- **Reachable from the app: yes.** The FindPage "Book" link appears when `site.bookingsEnabled` (drv/routes/FindPage.tsx:563-570) and leads to /book/:code. BookPage shows the window only after booking (drv/routes/BookPage.tsx:135-149).

### Verification of the "rows already checked on 1 Nov 2026"

| Claim | Verdict | Evidence |
|---|---|---|
| Booking uses a 2/2-minute window in `api/bookings` | **True as a hard-coded constant, but not enforced** (no auto-cancel, no hold on the gun) | api/bookings/bookings.service.ts:42-44; see above |
| Driver app has a web manifest and service worker | True | uza-charge-driver/public/manifest.webmanifest, public/sw.js; drv/pwa/pwa.ts:88 |
| Regulator reports exist in the owner portal and NOC | True | own/routes/RegulatorReportsPage.tsx:49,70; noc/routes/ops/CompliancePage.tsx:597-664; also /regulator/* |
| No investor screen in the owner portal | True | no route in own/App.tsx:100-133; no investor endpoint |
| **No government role exists** | **False** | REGULATOR_VIEWER at schema:532; api/reports/regulator.guard.ts:30-59; regulator-only routing at noc/App.tsx:176-182. It covers regulator file downloads only, not a live view |
| Fleet support is partial | True | Funding engine and token only; no FLEET_MANAGER usage, no screens |

### Production-refusal guard (rule 2): what it covers today

`assertUsable` (api/config/configuration.ts:201-245) already refuses all of these in production:
- the memory store;
- `SIMULATE_PAYMENT_CONFIRMATION`;
- `ALLOW_DEV_DRIVER_IDENTITY`;
- `ALLOW_DEV_STAFF_IDENTITY`;
- sandbox or partial payment rails.

Codes on screen are blocked in production a different way: `devCodesAllowed` checks NODE_ENV at request time (api/verification/verification.service.ts:224-229). `ALLOW_DEV_VERIFICATION_CODE` is silently ignored rather than refused at boot.

Not covered:
- the simulator connecting in production;
- seed and demo accounts (scripts/seed-dev.ts);
- the gateway's own switches;
- app build switches (e.g. VITE_DEV_*).

These remain Stage 2 work.

---

*The code-trace defect list is folded into "Defects and their status" above.*
