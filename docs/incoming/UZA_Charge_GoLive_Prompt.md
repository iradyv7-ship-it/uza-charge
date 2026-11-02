# UZA Charge — GO-LIVE PROGRAMME PROMPT (v2)
### From "runs on one laptop against a simulator" to a working platform that every stakeholder can use, proven in stages

**Use:** open Claude Code in `C:\Users\HP\Desktop` (the folder that holds all eight UZA Charge repositories side by side). Paste this whole file as the first message. Copy it into the specification repo as `docs/GO-LIVE.md`. Start every later session with: *"Continue the go-live programme from uzacharge/docs/GO-LIVE.md and uzacharge/docs/GO-LIVE-LOG.md."*
**Programme owner:** Gad (Head of UZA Nexus). Claude does the engineering. Gad's team reviews and merges every change. Yves decides anything commercial, regulatory or about money.
**Version:** 2 · 1 November 2026. v1 is kept beside this file as `UZA_Charge_GoLive_Prompt.v1.md`.

**What v2 changes, and why:** v1 jumped from the code to a six-week go-live. It had nothing to show Gad in the meantime, it asked for a `DEMO_MODE` switch the API already has in a better form, it ignored the government, investor and fleet stakeholders, and it used the GitHub folder names instead of the local ones. v2 adds a **Stage 4 "Gad demo"**: a working platform on a real server that Gad and others can use from their own phones, with real payment and SMS integrations in their sandboxes and real OCPP traffic. Only the charger hardware and real money remain simulated, and both are labelled. v2 also adds a **Stage 5 stakeholder completion** and fixes the paths and rules.

---

## 0. Who you are and what "working" means

You are the senior engineer taking UZA Charge from a laptop demo to a live pilot. The code is already large: seven code repositories plus the specification, more than 2,400 automated tests, and screens for drivers, owners, attendants and the NOC. **It has never run on a server, met a real charger, taken real money or sent a real SMS.** Your job is to close those gaps one proven step at a time. Do not grow the feature list for its own sake.

Gad reviewed the old Lovable prototype and found that some features were not functional and the "live data" was imagined. Assume he will test the new platform the same way: he will click everything, look for hard-coded numbers and try to break it. **Every claim you make must survive that.**

Three levels of "working". Never present a lower level as a higher one:

| Level | What it means | Where |
|---|---|---|
| **L1 Demo-on-laptop** | Everything runs locally; charger and payments simulated | Today |
| **L2 Working platform (sandbox)** | On a real server with HTTPS. Persistent database. Reachable from any phone. Real OCPP over the internet from a simulated charger that someone runs from their own laptop. Real MTN MoMo **sandbox** API calls. Real SMS **sandbox**. Every simulated thing labelled on screen. | End of Stage 4: what Gad sees |
| **L3 Live pilot** | Real Wicen charger, real driver, real money, real owner, real attendant, NOC on watch | End of Stage 8 |

**The pilot (L3) is live when all five of these are true at the same time on the production server:**
1. A real Wicen charger is connected over `wss://` and its sessions are recorded correctly (energy within 0.5% of the charger's own meter).
2. A real driver scans, pays with real MTN MoMo or Airtel Money, charges, stops and gets a correct receipt. A refund has been tested with real money.
3. The station owner sees that session, the energy, the money and the payout on their own phone. Every figure comes from the database.
4. An attendant runs a cash charge on a shift, and the till reconciles at the close of the shift.
5. The NOC sees the charger online, can read its raw OCPP log, and is alerted within 5 minutes when it goes offline.

## 1. Context to load first

**Local folders** (Windows 11, Git Bash, Node 24, npm 11). The specification repo is `uzacharge` locally and `uza-charge` on GitHub.

| Local folder | Branch now | Role |
|---|---|---|
| `uza-charge-ui` | main | shared React components (merge first) |
| `uza-charge-api` | feat/sellable-admin | core API (NestJS, Prisma, PostgreSQL); `deploy/`, `scripts/` |
| `uza-charge-csms` | feat/load-management | OCPP 1.6J gateway + charger simulator |
| `uza-charge-driver` | feat/map-wallet | driver PWA (map, booking, pay, live charge, wallet, receipts) |
| `uza-charge-owner` | feat/owner-portal | owner portal (sites, chargers, prices, money, P&L, compliance, RURA reports) |
| `uza-charge-operator` | feat/agent-cards | attendant app (shift, cash starts, cards, complaints) |
| `uza-charge-noc` | feat/admin-console | NOC and network admin console |
| `uzacharge` | docs/benchmark-gap-analysis | specification v2.1, build reports, demo guide; the old Lovable prototype sits at its root |

Trust `git` over this table; record any difference in the log.

**Read before acting:**
1. `uzacharge/CLAUDE.md` (core rules), then `uzacharge/docs/14-delivery-decisions-tests.md` (phases and proof gates).
2. Each repo's `README.md` and `OPEN_QUESTIONS.md`; `uzacharge/docs/BUILD-REPORT-2026-10*.md`; `uzacharge/docs/DEMO-2026-10-28.md`.
3. `uza-charge-api/deploy/README.md` before anything to do with servers.
4. **The Lovable prototype at the root of `uzacharge` is NOT the product.** Its folders (TanStack + Supabase app, `ocpp-gateway/`, `supabase/`) are a design reference only. Never copy its data, mock values or Supabase calls into the seven code repos.

**Before your first change: protect uncommitted work.** On 1 Nov 2026, `uza-charge-api` had uncommitted files (`browser-e2e/steps/*`) and `uzacharge` had local changes. Run `git status` in all eight. If anything is uncommitted, ask who owns it before you touch it. Never discard it.

## 2. Programme rules (on top of `uzacharge/CLAUDE.md`)

1. **Truth over appearance.** Every number, status and list on every screen comes from an API call that reads the database. No constants or seeded "today" figures in UI code, no `Math.random`, no example rows in production builds, no `setTimeout`-driven fake progress.
2. **Simulation is explicit and refused in production.** The API already refuses to start in production with `SIMULATE_PAYMENT_CONFIRMATION`, the in-memory store, `ALLOW_DEV_DRIVER_IDENTITY`, `ALLOW_DEV_STAFF_IDENTITY` or a sandbox payment rail (`src/config/configuration.ts`). **Extend this guard rather than invent a new switch.** Prove with tests that it also covers:
   - sign-in codes shown on screen instead of sent by SMS;
   - the simulator connecting in production;
   - seed and demo accounts;
   - the equivalent switches in the gateway (`uza-charge-csms`) and in each app's build.
   Simulated chargers boot as vendor `UZA-SIMULATED` and are labelled in every app: keep that and test it.
3. **Label the stage of everything** with exactly these words: `REAL`, `SANDBOX`, `STAGING-PROVEN`, `SIMULATED`, `PLACEHOLDER`, `MISSING`.
4. **Scope:** finish and prove what exists first (Stages 1–4). New features only in Stage 5, and only from the stakeholder matrix (Stage 1), in its priority order. Anything else goes under "Later" in the log.
5. **One change, one pull request**, small enough to review in 20 minutes. Never push to `main` directly. Never force-push a pushed branch.
6. **Never invent an outside fact.** You do not know an MTN fee, a RURA levy rate, a server address, a Wicen setting or a revenue share unless a document or log says so. Mark it `AWAITING CREDENTIALS` or `REQUIRES OFFICIAL VERIFICATION` and add it to the blocker list with an owner.
7. **Secrets** live only in the server's `deploy/.env` and the password manager. Never in git, docs, chat or logs. Never open `Desktop\uza-deploy-secrets`: Yves hands its contents over separately. If you find a secret committed anywhere, stop and report it first.
8. **Test on phones.** Every user-facing check is also done at 360 px wide on a real Android phone over mobile data, not only in a desktop browser.
9. **Every session ends with a log entry** in `uzacharge/docs/GO-LIVE-LOG.md` (format in section 4).

## 3. The stages (in order; each ends with a gate that needs evidence)

### Stage 1 — Reality audit and stakeholder matrix (answers Gad's review head-on)

Write `uzacharge/docs/REALITY-AUDIT.md` with two tables.

**Table A: every screen and feature.** One row per route in the four apps and every API endpoint they call:

| App | Screen / feature | Data source (endpoint → table) | Status (REAL / SIMULATED / PLACEHOLDER / MISSING) | Evidence (file:line, test name) | What makes it REAL |

Method:
- Trace every displayed value to its API call, then to its Prisma query.
- Grep the four apps and the API for: hard-coded arrays, fixtures, `faker`, `mock`, `demo`, `seed`, `sample`, `example`, `TODO`, literal RWF or kWh values in UI code, and fake timers.
- Run every app against a **fresh, empty PostgreSQL database** (`API_STORE=prisma`), not the in-memory demo seed. Every screen must show an honest empty state. A screen showing numbers on an empty database is a defect.
- Run `bash scripts/e2e.sh` and the `browser-e2e` suite. Run the IT test pack's 30 manual cases (D-, O-, A-, N-, X-) and record pass or fail per case.

**Table B: stakeholder matrix.** For each stakeholder, the jobs they must be able to do, and today's status of each job (REAL / SIMULATED / PLACEHOLDER / MISSING) with evidence:

| Stakeholder | Jobs to be done (minimum) | Priority |
|---|---|---|
| **Driver** (anyone with an EV) | find a site with live free guns on the map; see the full price before paying; **book a gun** (4-minute arrival window: 2 min before / 2 min after, then auto-cancel); pay by MoMo or Airtel or wallet or card; watch the charge live; stop; receipt; history; wallet top-up; account deletion | P1 |
| **Station owner** (UZA first, then clients) | add a site and charger without an engineer; set prices; see today's sessions, kWh and money; payouts; monthly P&L labelled Measured / Calculated / Entered; incidents; staff; hide a site from the map | P1 |
| **Attendant** | open and close a shift; cash charge; sell and top up a card; cash receipt; complaint; till reconciliation (known gaps: operator Q-01 to Q-05) | P1 |
| **NOC / UZA operations** | estate view; offline and fault alerts; raw OCPP log; confirmed reset and diagnostics; test mode; load management; complaints | P1 |
| **Finance** | daily reconciliation: provider statement vs ledger vs payouts; refunds | P1 |
| **Government / regulator** (RURA, and later City of Kigali or the energy ministry) | RURA report per site; read-only regulator view of licensed sites, uptime against the 97% minimum, incidents with the 1 h / 48 h report timers, complaints with the 24 h timer | P2 |
| **Investor / lender** | read-only view of the sites they financed: performance, cash returned, documents. Spec §25: three distinct financial views, no public solicitation | P2 |
| **Fleet manager** (taxi and moto cooperatives, companies) | fleet account; drivers and cards under it; budgets; monthly statement | P2 |
| **Host** (site landlord) | read-only sessions and host share | P2 |
| **White-label client** (another operator) | their own branded network on the same platform, from configuration only (demo network) | P3 |

Rows already checked on 1 Nov 2026, to verify rather than assume:
- Booking uses a 2/2-minute window in `uza-charge-api/src/bookings`.
- The driver app has a web manifest and service worker.
- Regulator reports exist in the owner portal and NOC.
- No investor screen exists in the owner portal.
- No government role exists.
- Fleet support is partial.

**Gate 1:** Gad reads both tables and agrees with what must become REAL for the Gad demo (Stage 4) and for the pilot (Stage 8). Write his decisions into the audit.

### Stage 2 — One truth in `main`

- Merge in this order: ui → api → csms → driver, owner, operator, noc. One PR per repo; CI green before each merge.
- Add CI where it is missing, from `uza-charge-api/deploy/templates/`: lint, typecheck, unit tests, build, and database tests against a throwaway PostgreSQL 17.
- Fix `npm run openapi:check`. The OpenAPI file becomes the contract the four apps are checked against.
- Complete rule 2 (production refuses every simulated component) with tests, in the API, the gateway and the app builds.
- Fix every PLACEHOLDER that Gate 1 marked "must be REAL", or turn it into an honest empty state.
- Archive the prototype: move it into `uzacharge/prototype/` with a README line "Archived prototype — not the product". Remove its committed `.env` from the tree. If its Supabase project still holds personal data, tell Yves; do not touch that project yourself.
- Propose moving the repos from the personal GitHub account to a UZA organisation account. Yves approves; Gad gets admin.

**Gate 2:** a clean clone of `main` in every repo builds and passes CI. Production configuration boots with no simulated component. The laptop demo still works with the development configuration.

### Stage 3 — Staging server (the Docker stack has never been built)

- On the host Gad provides, follow `deploy/README.md`: `docker compose build`, then `up`. Expect fixes; keep each one small and logged.
- Run migrations, then `bootstrap.sh` (network, first owner, network admin).
- Caddy issues TLS for the six names (api, ocpp, owner, ops, charge, attendant). Verify that `wss://ocpp.<domain>/ocpp/<id>` refuses wrong passwords and plain `ws://`.
- Backups: run `backup.sh`, then a timed restore into a scratch database with `restore.sh`. Log the time.
- Monitoring: an uptime check on each name; alerts on API errors and on charger offline, sent to the NOC person's phone.
- Access: staging is not public. Protect it, for example with an IP allowlist or basic auth at Caddy for the staff apps, until the pilot.

**Gate 3:** all six names answer over HTTPS. One restore drill timed and logged. Alerts arrive on a phone.

### Stage 4 — The Gad demo: a working platform (L2), not a laptop show

Everything below runs on staging, reachable from phones, on a persistent PostgreSQL database. Data must build up over days, not reset.

1. **Real OCPP over the internet.** Gad adds a charger in the owner portal himself and gets its one-time password. Then, from **his own laptop**, he runs `bash scripts/connect-simulator.sh <identity> <password>` with `GATEWAY_URL=wss://ocpp.<domain>/ocpp`. The charger appears online in the owner portal and the NOC, and is labelled Simulated.
2. **A living estate.** Keep 3 sites and 6 simulated chargers connected around the clock (a small service on the staging host). Give them realistic daily patterns: morning and evening peaks, idle nights, an occasional fault and an occasional disconnect. Owner dashboards then fill with honest SIMULATED data that is generated, priced and stored by the real system, not seeded figures.
3. **MTN MoMo sandbox.** Open a developer account at the MTN MoMo developer portal (self-service, no business contract needed). Wire the existing rail (`src/payments/rails/mtn-momo.rail.ts`) to the sandbox. A payment is confirmed only by the sandbox API's status or callback, never by `SIMULATE_PAYMENT_CONFIRMATION`. Screens say "MTN sandbox — no real money".
4. **SMS sandbox.** Use an Africa's Talking sandbox for sign-in codes. Codes arrive through the provider's sandbox simulator, not on the sign-in screen.
5. **Gad's break-it session.** Gad and one more person each run the journey on their own phones:
   - **As a driver:** scan the QR label, see the price, pay (sandbox), watch the charge live, stop, read the receipt. Book a gun and miss the window: the booking cancels at +2 minutes.
   - **As an owner:** see the session appear with its kWh and money; change a price; read the P&L; export a RURA report.
   - **As NOC:** see the raw OCPP log, reset the charger, kill the simulator and receive the offline alert within 5 minutes.
   - **As an attendant:** run a cash charge, then close the shift.
   - Two owners must not see each other's data.
6. **Demo script:** write `uzacharge/docs/GAD-DEMO.md`. It sets out the 20-minute walkthrough, what is REAL, SANDBOX and SIMULATED at each step, and what Gad should try to break.

**Gate 4 (Gad demo passed):** Gad completes the break-it session without an engineer at the keyboard. Every defect he finds is logged and fixed, or accepted by him in writing. The reality audit shows zero PLACEHOLDER on the P1 journeys.

### Stage 5 — Stakeholder completion (P2 first, then P3)

Build only the MISSING or PLACEHOLDER rows of the stakeholder matrix, in priority order, following the specification sections:
- **Attendant gaps** (operator Q-01 to Q-05): shift open and close, float, cash handed back, cash receipt.
- **Government / regulator portal:** a `regulator_viewer` role (spec §4), owner-approved, read-only. Licence register, uptime against 97% (raw and adjusted, labelled), incidents with the 1 h / 48 h timers, complaints with the 24 h timer, RURA export (spec §15).
- **Investor / lender view:** read-only, scoped to the sites they financed. Three separate views: station performance, cash flow, the investor's own entitlement (spec §25). Never present a forecast as a promise.
- **Fleet workspace:** company account, drivers and cards, budgets, monthly statement (spec §27.2).
- **Host view:** check that it is complete.
- **P3 white-label demo network:** a second network with a different brand and currency, from configuration only (spec §17, rule 21).

Each item is accepted by its future user on a phone, then marked REAL or SANDBOX in the audit.

**Gate 5:** every P2 row is REAL or SANDBOX with evidence, or explicitly deferred by Yves.

### Stage 6 — Outside systems: from sandbox to production

Yves or Gad opens each account; until then it stays `AWAITING CREDENTIALS` with an owner in the blocker list.
- **SMS:** register the production sender ID. Real codes go to real phones; showing a code on screen becomes impossible in production.
- **MTN MoMo and Airtel Money:** apply for production collections and disbursements. Then the smallest real amount: payment, refund and payout.
- **Reconciliation:** provider statement vs ledger for the test transactions, with zero unexplained difference.

**Gate 6:** one real payment, one real refund and one real payout per rail, reconciled to the franc, logged with provider references (no secrets).

### Stage 7 — The real charger

First confirm physically that a Wicen unit is on site and powered, with a SIM or LAN connection, and that its meter is **class 1** (the order form said "Level 2.0", which fails RURA Annex I). If any of these is not true, stop and log the blocker.
- Add the charger in the owner portal. Set its address and password on the unit, and photograph each setting for the runbook.
- Record what the unit actually sends: boot fields, configuration keys, measurands and DataTransfer payloads. Update the compatibility directory to `hardware-tested`.
- Test on the real unit: boot, remote start, metering, stop, receipt; test mode; a power cut mid-charge; network loss mid-charge; both guns at once.
- Bench-measure the exposure limits (power bound, stop latency, sample age) so that prepaid charging can be enabled under spec §7.3. Until they are measured, prepaid stays refused. That is correct behaviour, not a bug.
- Compare 20 sessions' kWh with the charger's own display.
- Check the known risk: commands sent before BootNotification completes.

**Gate 7:** 50 consecutive real sessions with no lost or duplicated transactions, energy within 0.5%, and a Wicen capability report signed off by Gad.

### Stage 8 — Pilot acceptance and go-live

Each role accepts on the production server, on their own phone, with no engineer at the keyboard:

| Stakeholder | Acceptance owner |
|---|---|
| Driver | a real driver recruited by UZA Mobility |
| Station owner | the pilot site owner (UZA first) |
| Attendant | the site attendant |
| NOC | Gad's NOC person |
| Finance | UZA finance |
| Regulator view and RURA export | Yves |
| Investor view | Yves, with a test investor account |

Also before go-live:
- A native Kinyarwanda review of every screen, with the corrections merged.
- The four decisions that block a paid launch set in the admin panel, with their sources: exposure limits, revenue share and booking fee, seller of record, payout fee per rail. You do not decide them; you make sure the system refuses to charge or pay until they are set.
- Data protection: hosting location checked against Rwanda's data protection law (NCSA). A privacy notice in the driver app.

**Gate 8 (go-live):** every row signed off; one paid real charge by staff, refunded; NOC on watch; Yves says go.

## 4. Session report (every session, in the log and in your final message)

```
DATE · STAGE n · GATE: OPEN / PASSED · LEVEL reached: L1 / L2 / L3
PROVEN (with evidence: command output, test name, screenshot path): …
FAILED (with cause): …
BLOCKED — on whom — since when: …
REALITY AUDIT: REAL a / SANDBOX b / SIMULATED c / PLACEHOLDER d / MISSING e (change since last session)
STAKEHOLDER MATRIX: P1 x/y REAL-or-SANDBOX · P2 x/y · P3 x/y
NEXT 3 ACTIONS (owner, deadline): …
```

Write for Gad and Yves: problems first, plain words, no jargon without a short explanation.

## 5. When to stop and ask

Stop and ask Gad (technical) or Yves (commercial, regulatory, money) when:
- a change would alter prices, fees, revenue shares, payouts or what drivers are charged;
- a test needs a real payment account, a phone number you do not own, or a real charger;
- you find a secret in git, or personal data where it should not be;
- a gate's evidence is ambiguous. Say so; do not call the gate passed;
- you are about to present SIMULATED or SANDBOX as REAL anywhere: on a screen, in a doc or in a message.

---
*Go-live programme for UZA Charge, v2. The specification (`uzacharge/CLAUDE.md` and `uzacharge/docs/`) still governs the design; this prompt governs the order of work and what counts as proof.*
