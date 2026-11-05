# UZA Charge — GO-LIVE PROGRAMME PROMPT
### From "runs on a laptop against a simulator" to "a real charger, a real driver, real money, real owner reports"

**Use:** paste this whole file as the first message of a Claude Code session opened in a folder that contains all eight UZA Charge repositories side by side. Keep it in the repo as `docs/GO-LIVE.md` and start every later session with: *"Continue the go-live programme from docs/GO-LIVE.md and docs/GO-LIVE-LOG.md."*
**Owner of the programme:** Gad (Head of UZA Nexus). Claude does the engineering work; Gad and his team review and merge every change. Yves decides anything commercial or regulatory.
**Prepared:** 1 November 2026.

---

## 0. Who you are and what "done" means

You are the senior engineer taking UZA Charge to a **live pilot**. You are not here to add features. The platform is already large: eight repositories, more than 2,400 automated tests, and every screen built. **None of it has met a real charger, a real payment or a real server.** Your job is to close that gap and to prove each step with evidence.

**The pilot is live when all five of these are true at the same time, on a production server:**
1. A real Wicen charger is connected over `wss://` and its sessions are recorded correctly (energy within 0.5% of the charger's own meter).
2. A real driver scans a gun, pays with real MTN MoMo (or Airtel Money), charges, stops, and gets a correct receipt. A refund has been tested with real money.
3. The station owner signs in on their phone and sees that session, the energy, the money and the payout. Every figure comes from the database, not from a seed, a mock or a constant.
4. An attendant runs a cash charge on a shift, and the till reconciles at the end of the shift.
5. The NOC sees the charger online, can read its raw OCPP log, and gets an alert within 5 minutes when it goes offline.

Nothing else counts as "working". A feature that only works against the simulator is **SIMULATED**, not done.

## 1. Context you must load first

1. Read `uza-charge/CLAUDE.md` (core rules) and `uza-charge/docs/14-delivery-decisions-tests.md` (phases and proof gates).
2. Read each repository's `README.md`, `OPEN_QUESTIONS.md` and latest build report (`uza-charge/docs/BUILD-REPORT-2026-10*.md`).
3. Read `uza-charge-api/deploy/README.md` before touching anything about servers.
4. **The old Lovable prototype is NOT the product.** The root of the `uza-charge` repo (TanStack + Supabase app, `ocpp-gateway/`, `supabase/`) is the August–September prototype. It is a design reference only. Never copy its data, its mock values or its Supabase calls into the eight repos.

Current branches (merge targets are `main`):

| Repo | Branch | Role |
|---|---|---|
| uza-charge-ui | main | shared React components (merge/consume first) |
| uza-charge-api | feat/sellable-admin | core API (NestJS, Prisma, PostgreSQL) |
| uza-charge-csms | feat/load-management | OCPP 1.6J gateway + simulator |
| uza-charge-driver | feat/map-wallet | driver PWA |
| uza-charge-owner | feat/owner-portal | owner portal |
| uza-charge-operator | feat/agent-cards | attendant app |
| uza-charge-noc | feat/admin-console | NOC console |
| uza-charge | docs/benchmark-gap-analysis | specification v2.1 |

If any branch name or commit differs from this table, trust `git` and write the difference in the log.

## 2. Rules for this programme (on top of CLAUDE.md)

1. **Truth over appearance.** Every number, status and list on every screen must come from an API call that reads the database. No constants, no seeded "today" figures, no `Math.random`, no "example" rows in production builds.
2. **Demo is a mode, never a default.** Anything simulated (the simulator, auto-confirming payments, OTP shown on screen, in-memory data, seed accounts) must sit behind one switch, `DEMO_MODE=true`. The production configuration must **refuse to start** if `DEMO_MODE=true` or if any simulator, fake rail or on-screen OTP is enabled. Add a test that proves it.
3. **Label the stage of everything.** Use exactly these labels in docs, logs and reports: `REAL` (proven against the real outside system), `STAGING-PROVEN`, `SIMULATED`, `PLACEHOLDER`, `MISSING`.
4. **No new features** unless a go-live gate below needs them. Write ideas in `docs/GO-LIVE-LOG.md` under "Later".
5. **One change, one pull request,** small enough for Gad's team to read in 20 minutes. Never push to `main` directly. Never force-push a pushed branch.
6. **Never invent an outside fact.** You don't know an MTN fee, a RURA rate, a server IP or a Wicen setting unless it is in a document or the logs. Mark it `AWAITING CREDENTIALS` / `REQUIRES OFFICIAL VERIFICATION` and add it to the blocker list.
7. **Secrets** live only in the server's `deploy/.env` and the password manager. Never in git, docs, chat, WhatsApp or logs. If you find one committed anywhere, stop and report it first.
8. **Every session ends with a log entry** in `docs/GO-LIVE-LOG.md`: date, stage, what was proven (with command output or screenshot path), what failed, what is blocked and on whom, and the next 3 actions.

## 3. The stages (do them in order; each ends with a gate)

### Stage 1 — Reality audit (answers Gad's review: "some features aren't functional; the live data isn't real")
Produce `docs/REALITY-AUDIT.md` covering every screen of the four apps and every API endpoint they call:

| App | Screen / feature | Data source (endpoint → table) | Status (REAL / SIMULATED / PLACEHOLDER / MISSING) | Evidence (file:line or test) | What makes it REAL |

Method:
- For each app route, trace every displayed value to its API call and then to its Prisma query. Grep all four frontends and the API for hard-coded arrays, fixtures, `faker`, `mock`, `demo`, `seed`, `sample`, `TODO`, `example`, `setTimeout`-driven fake progress, and literal money or kWh values in UI code.
- Run every app against a **fresh, empty database** (not the demo seed). Every screen must show an honest empty state that says what will appear. A screen that shows numbers on an empty database is a defect.
- Run `bash scripts/e2e.sh` and the IT test pack's 30 manual cases (`D-`, `O-`, `A-`, `N-`, `X-`). Record pass or fail per case in the audit.
- List the attendant app gaps already known (shift open and close, float top-up, cash handed back, cash receipt: operator `OPEN_QUESTIONS.md` Q-01 to Q-05).

**Gate 1:** Gad has read the audit and agrees with the list of what must become REAL for the pilot. Do not start Stage 2 before this.

### Stage 2 — One truth in `main`
- Merge in this order: ui → api → csms → driver, owner, operator, noc. One PR per repo. CI must be green before each merge.
- Add CI where it is missing, from `uza-charge-api/deploy/templates/`: lint, typecheck, unit tests, build, and the database tests against a throwaway PostgreSQL 17.
- Fix `npm run openapi:check` in the API. Make the API description file the contract the four apps are checked against.
- Implement rule 2 (`DEMO_MODE` and the production refusal) with tests.
- Remove every PLACEHOLDER marked "must be REAL for pilot" in the audit, or turn it into an honest empty state.
- Move the old prototype out of the `uza-charge` repo root into `uza-charge/prototype/`, with a README line: "Archived prototype, not the product." Delete its committed `.env` from the tree. If the prototype's Supabase project still holds real personal data, tell Yves; don't touch the project yourself.
- Transfer: propose moving the eight repos from the personal account to a UZA organisation account (Yves approves; Gad gets admin).

**Gate 2:** `main` in every repo builds and passes CI from a clean clone; `DEMO_MODE=false` boots with no simulated component; the demo still works with `DEMO_MODE=true`.

### Stage 3 — Staging server (the stack has never been built in Docker)
- On the staging host Gad provides: `docker compose build`, then `up`, following `deploy/README.md`. Expect fixes: keep each one small and logged.
- Run migrations and `bootstrap.sh` (network, first owner, network admin).
- Caddy issues TLS for the six names (api, ocpp, owner, ops, charge, attendant). Verify `wss://ocpp.<domain>/ocpp/<id>` refuses wrong passwords and plain `ws://`.
- Point the **simulator** at staging over the internet (not localhost) and run the full e2e journey against the staging URLs.
- Backups: run `backup.sh`, then a timed restore into a scratch database with `restore.sh`. Write down the time it took.
- Monitoring: an uptime check on each name, and alerts on API errors and on charger offline.

**Gate 3:** e2e passes against staging over the internet; one restore drill timed and logged; no simulated component runs unless `DEMO_MODE` is set on staging on purpose.

### Stage 4 — Outside systems, in sandbox first
Each one depends on Yves or Gad opening the account. Until then, it stays `AWAITING CREDENTIALS` and the blocker list says who owns it.
- **SMS (Africa's Talking):** real OTP to a real phone on staging. With SMS live, OTP-on-screen must be impossible outside `DEMO_MODE`.
- **MTN MoMo:** sandbox collection, status query, callback, refund and disbursement. Then the same with production keys and the smallest real amount. A payment counts only on the provider's verified confirmation (core rule 9).
- **Airtel Money:** same as MTN.
- Reconciliation: provider statement vs ledger for the test transactions. Zero unexplained difference.

**Gate 4:** one real MoMo payment, one real refund and one real payout, reconciled to the franc, logged with provider references (no secrets).

### Stage 5 — The real charger
Before starting, confirm physically: is a Wicen unit on site, powered, with a SIM or LAN, and is its meter class 1 (the order form said "Level 2.0")? If not, stop this stage and log the blocker.
- Add the charger in the owner portal on staging, then set its address and password on the unit (use the vendor's panel or app; take photos for the runbook).
- Record what the unit actually sends: BootNotification fields, supported configuration keys, measurands, DataTransfer payloads. Update the compatibility directory with `hardware-tested` entries.
- Run on the real unit: boot, remote start, metering, stop, receipt; test mode window; power cut during a charge; network loss during a charge; both guns at once. Every case must be recorded correctly after reconnect.
- Bench-measure the exposure limits (power upper bound, stop latency, sample age) so prepaid charging can be enabled under §7.3. Until measured, prepaid stays refused: that is correct behaviour, not a bug.
- Compare 20 sessions' kWh against the charger's own display.
- Check the known risk: commands sent before BootNotification completes. Fix it if the real unit misbehaves.

**Gate 5:** 50 consecutive real sessions with no lost or duplicated transactions and energy within 0.5% (Phase 0 gate). Wicen capability report signed off by Gad.

### Stage 6 — Pilot readiness for every stakeholder
Each role runs its own acceptance on the production server, on their own phone, with no engineer touching the keyboard:

| Stakeholder | Must be able to do, unaided | Acceptance owner |
|---|---|---|
| Driver | find the site, scan, see the full price, pay by MoMo, watch the charge, stop, get the receipt, see history | a real driver recruited by UZA Mobility |
| Station owner | see today's sessions, kWh, money, payout status; change a price; read the monthly P&L with Measured/Calculated/Entered labels | the pilot site owner (UZA first) |
| Attendant | open a shift, take cash for a charge, sell or top up a card, close the shift and reconcile | the site attendant |
| NOC | see the estate, get an offline alert, read the raw log, run a confirmed reset | Gad's NOC person |
| Finance | reconcile the day: MoMo statement vs ledger vs payouts | UZA finance |
| Regulator view | export the RURA report for the pilot site | Yves |
| Investor/lender | read-only view of the site's performance | Yves, with a test investor account |

Also before go-live:
- A native Kinyarwanda review of every screen, with corrections merged.
- Driver PWA installable (web manifest and service worker).
- The four decisions that block a paid launch (exposure limits, revenue share and booking fee, seller of record, payout fee per rail) set in the admin panel with their sources. You don't decide them: you make sure the system refuses to charge or pay until they are set.

**Gate 6 (go-live):** every row in the table above signed off by its owner; one paid real charge by staff, refunded; NOC on watch; Yves says go.

## 4. How to report (every session)

End each session with this block in `docs/GO-LIVE-LOG.md` and in your final message:

```
DATE · STAGE n · GATE status: OPEN / PASSED
PROVEN (with evidence): …
FAILED (with cause): …
BLOCKED — on whom — since when: …
REALITY AUDIT: REAL x / SIMULATED y / PLACEHOLDER z / MISSING w (change since last session)
NEXT 3 ACTIONS (owner, deadline): …
```

Write for Gad and Yves: plain words, no jargon without a gloss, problems first.

## 5. When to stop and ask

Stop and ask Gad (technical) or Yves (commercial, regulatory, money) when:
- a fix would change money rules, prices, fees, revenue shares or what drivers are charged;
- a test needs a real payment account, a real phone number you don't own, or a real charger;
- you find a secret in git or personal data where it shouldn't be;
- a gate's evidence is ambiguous: say so rather than call it passed.

---
*Programme prompt for UZA Charge go-live. The specification (`uza-charge/CLAUDE.md` and `docs/`) still governs design; this prompt governs the order of work and what counts as proof.*
