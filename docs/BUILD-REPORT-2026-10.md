# Build report — the sellable working model (25 October 2026)

*For whoever evaluates this work. It says what was asked, what was built, where it is, how it was proved, and what is still missing. Nothing here is pushed to GitHub: every change sits on a local branch, listed below, for review first.*

**Asked for (founder, 25 Oct 2026):** use the Chinese hosted-CPMS benchmark (`docs/incoming/Benchmark.xlsx` and its USD 1,000–5,000 + 1,500/yr offer) to strengthen UZA Charge into a working model that can be sold to other operators in Rwanda — affordable enough for market penetration — by building the five steps proposed in `docs/16-benchmark-competitive-offer.md`: (1) charger onboarding, (2) admin management screens with search/filter/export, (3) maintenance console, (4) operations home and notifications, (5) real staff and driver sign-in. Keep frontend and backend strictly separate; keep the documentation easy to evaluate.

---

## 1. Where everything is

| Repo (local path `C:\Users\HP\Desktop\…`) | Branch | Role | Separation rule it keeps |
|---|---|---|---|
| `uzacharge` | `docs/benchmark-gap-analysis` | Specification (v2.1) + this report | Documents only |
| `uza-charge-api` | `feat/sellable-admin` | **Backend**: all business logic, all database access | The only service that touches the business database |
| `uza-charge-csms` | `feat/onboarding-and-maintenance` | **Backend**: OCPP 1.6J charger gateway | Protocol and evidence only; no money, no business rules |
| `uza-charge-owner` | `feat/sellable-admin` | **Frontend**: owner admin portal | HTTP to the API only |
| `uza-charge-noc` | `feat/sellable-admin` | **Frontend**: network operations console | HTTP to the API only |
| `uza-charge-driver` | `feat/sign-in` | **Frontend**: driver PWA | HTTP to the API only |
| `uza-charge-operator` | `feat/sign-in` | **Frontend**: site attendant console | HTTP to the API only |

How the separation is enforced, not just intended: frontends have no database client and no business rules — they render what the API returns and show the API's own sentence when it refuses. The API owns validation, permissions, tenancy, prices and money, and is the only caller of the gateway's internal API (Bearer service token). The gateway never prices anything. The contract between frontends and API is one document: `uza-charge-api/docs/ADMIN_API.md`. The contract between API and gateway is the gateway's `/internal/*` routes, listed in `uza-charge-csms/README.md`.

## 2. What was built, step by step

### Step 1 — Charger onboarding without an engineer (§17.6, §34.3 A-2–A-6)
- **Owner can:** create and edit a site (with maintenance contact); add a charger with its guns; receive the `wss://` connection address, charger ID and a generated password **shown once**; print QR labels with large short codes; issue a new password (old one stops working, charger disconnected); block or re-allow a charger with a reason; correct gun details (raising power warns that RURA approval is needed); see the history of every change.
- **Safety rules:** writes the asset first, registers with the gateway second, removes the asset if the gateway refuses — so a failure never leaves a machine that can connect but that nobody can see. Passwords are never logged or audited. Plain `ws://` addresses are never issued in production.
- **Where:** API `src/onboarding/`; gateway `src/gateway/onboarding.ts`, `credentials.ts`, `internal-api.ts`.

### Step 2 — Admin management with search, filter and export (§34.3 A-1, A-7, A-9)
- **One list toolkit** for chargers, sites, sessions and settlements: search, filters, sort, paging, column chooser, CSV export of exactly the filtered view. Columns are an allow-list (no masked field can be exported); CSV cells are formula-safe; unknown figures export blank, never 0; every export is audited. API `src/lists/`.
- **Price plans per owner:** owner default or per-site plans; drafts; a simple one-price form (default) or time-of-day; publish with confirmation; archive instead of delete. **Fixed a real defect:** prices used to be network-wide, so one owner publishing a price repriced every other owner's guns; and sessions were priced from "whatever is current" instead of the version they pinned. Now: site plan → owner default → network default, and live cost, final bills and receipts all read the pinned version (rule 12). API `src/tariffs/`, `src/pricing/tariff-resolution.ts`.

### Step 3 — Maintenance console (§12.2, §13.3, §34.3 A-10–A-12)
- For owners (`/owner/chargers/:id/maintenance`) and network operations (`/noc/chargers/:id`): charger record from its boot message; configuration workbench comparing every key with the OCPP 1.6J standard and the UZA target, with plain-language descriptions, edit and revert; raw OCPP message log with filters; diagnostics uploads over single-use HTTPS links; commands — restart, hard reset, clear cache, trigger any of six messages, unlock, take a gun or charger out of service, firmware update.
- **Safety rules:** dangerous commands need a confirmation, a reason and a senior role; resets and firmware are refused while a driver is charging; firmware and diagnostics are HTTPS-only (no FTP); "accepted" is shown separately from "done"; nothing is retried blindly.
- **Where:** API `src/maintenance/`; gateway `src/ocpp/config-catalogue.ts`, `src/gateway/configuration-view.ts`, `diagnostics-uploads.ts`, new OCPP schemas and handlers.

### Step 4 — Operations home and notifications (§12.1, §12.5, §16, §34.3 A-17, A-19)
- Home: chargers and guns by state; today vs yesterday (sessions, energy, money split into energy and service) in the network's local day; site picker. Weekly (from Monday) and monthly (from the 1st) reports. Money is labelled Calculated, or Estimated while charges are still provisional; uptime stays Unknown until availability history exists; hosts never receive money figures.
- Notifications derived from live state — offline, faulted, never connected, site cannot trade, site has no price, payout failed or waiting — critical first, critical ones cannot be muted; per-person read marks.
- **Where:** API `src/operations/`.

### Step 5 — Real sign-in (core rule 18, §4, §30.4)
- **Drivers:** phone number + SMS code. Charging by QR still needs no account.
- **Staff:** phone + SMS code + six-digit PIN (two-step; guessable PINs refused; locks after 5 wrong tries; admin can reset). Roles are read from memberships on every request, so removing access takes effect immediately. 15-minute access tokens; refresh tokens rotate and a replayed one ends the session. Owner admins invite, list and remove staff by phone number; the last admin cannot be removed.
- **Where:** API `src/auth/` and the four guards; frontends below.
- **Interim:** identity should live in UZA ID (the spine, D-01); until it is reachable this API issues the tokens, with the phone number as subject (`uza-charge-api/OPEN_QUESTIONS.md` Q-10).

### Frontends
- **Owner admin portal** (`uza-charge-owner`, `feat/sellable-admin`): sign-in (phone → code → PIN); home with chargers by state, today vs yesterday, notifications bell; week/month reports; sites list and form; chargers list with search, status filter, column chooser and CSV export; the add-charger wizard ending in the one-time password and printable QR labels; charger page with setup, maintenance (configuration, message log, commands with confirm-and-reason for dangerous ones, "accepted is not done") and history; prices (simple form by default, time-of-day under Advanced, publish with confirmation, archive); charges and payouts lists; staff (invite, remove, reset PIN). Tests 58 → 136.
- **NOC console** (`uza-charge-noc`, `feat/sellable-admin`): staff sign-in; a five-tab page per charger — overview, configuration, raw message log, commands, diagnostics. Tests 53 → 90.
- **Driver PWA** (`uza-charge-driver`, `feat/sign-in`): Sign-in tab (phone → code), prompts only where an account is needed (history, bookings), returns to where the driver was; QR, pay, live session and receipt stay open to everyone. Tests 112 → 130.
- **Attendant console** (`uza-charge-operator`, `feat/sign-in`): phone → code → PIN; the API decides who may run a till. Tests 51 → 66.

## 3. Evidence

| What | Result |
|---|---|
| API unit + integration tests | **886 pass on PostgreSQL 17**, including 87 database tests (was 565 + 48) |
| Gateway tests | **453 pass** including 33 database tests on PostgreSQL 17 (was 331) |
| End-to-end, in-memory | `scripts/e2e.sh`: driver journey + operator journey (37 admin checks) — **all pass** |
| End-to-end, **both services on PostgreSQL** | Same script, 85 checks — **all pass**; a simulated charger connects with the password onboarding issued, is maintained, has its password rotated and is then refused with the old one |
| Driver / attendant apps | typecheck, tests (130 / 66), lint, build pass |
| Owner portal / NOC console | typecheck, tests (136 / 90), lint, build pass |
| **Real browser, against the running services** | Chrome at phone width (360 px): an owner signs in with SMS code and PIN, creates a site, adds a two-gun charger, gets the password once and the QR labels, a simulated charger connects with that password and the page turns to *Connected*, then maintenance, prices and staff; the NOC signs in and opens a charger; a driver opens a gun's QR page without an account. No browser errors. Screenshots: `docs/evidence/screens-2026-10-25/` (the password in 03 is redacted). One defect found and fixed: sign-in reused the bookings wording "book by calling the site" when codes ran out |
| Independent code review | A separate review of both backend branches found 12 issues — 2 high (roles carried from one owner to another; under PostgreSQL the newest owner plan became every owner's fallback price), 7 medium, 3 low. **All fixed**, each with a regression test; the two high ones also with PostgreSQL tests. After the fixes: API 886 tests on PostgreSQL, gateway 453, end-to-end 85/85 on fresh PostgreSQL databases and on the in-memory stores |

How to repeat it: see `uza-charge-api/README.md` ("Develop", "Running on PostgreSQL"). No Docker was available, so PostgreSQL 17 ran from the `embedded-postgres` npm package (checksum verified against the npm registry).

## 4. Affordability — the pricing analysis

`docs/16-benchmark-competitive-offer.md` §34.7. In short: the vendor charges per customer, so a one-station hotel pays about RWF 3.6 M in year one — roughly 23% of its charging revenue — while a 300-station operator pays almost nothing per station. Rwanda's operators are mostly small. Proposed (founder decision D-02/D-03/D-13): **free 3-month pilot; 2.5% of charging revenue, capped per gun, no setup fee, up to 5 stations; RWF 200,000/month flat from 6 to 25 stations; Network, Monitor-only and Managed plans above that.** Every number is reproducible from `docs/evidence/benchmark/pricing-model.py`, with its assumptions stated.

## 5. Not done, and why

| Item | Why | Next action |
|---|---|---|
| Real MTN MoMo / Airtel payments and payouts | Provider credentials not in hand | `AWAITING CREDENTIALS` everywhere; obtain sandbox keys |
| SMS provider | Not chosen | Codes go to the API log in dev; production refuses to pretend |
| Identity in UZA ID (spine) | Spine not reachable (D-01) | Interim provider; replace `auth-tokens.ts` + two tables |
| Commissioning (free test) sessions | Founder decision Q-09.1 | Test with a small real payment, as §17.6 says |
| Organisation picker for people with several organisations | `@uza/ui` cannot send `X-Owner-Id` without a change pushed to its GitHub repo | Push the shared-client change, then add a picker |
| Platform invoicing, P&L, cost book, RRA EBM | Later phase | §17.5, §12.4 |
| Real charger | None connected yet (§1.2) | Wicen unit on staging |
| Store-published app | Phase 4 (A-21) | — |
| Closing a charger's socket on *another* gateway node when its password is rotated | Needs a cross-node broadcast | Other nodes refuse at reconnect; the node holding the socket closes it (`uza-charge-csms` Q-09) |
| Kinyarwanda review | All new strings written in both languages; not yet reviewed by a native speaker | Each app's i18n file names the strings to read first |
| Test on a real phone and a printed label sheet | The browser test used desktop Chrome at phone size | Click through on a low-end Android on 3G; print one sheet of labels |

## 6. Decisions waiting for the founder

From `OPEN_QUESTIONS.md` Q-09 and `uza-charge-api/OPEN_QUESTIONS.md` Q-10: commissioning sessions; demoing the white-label product before Phase 4; store app as a paid extra and iOS scope; the price card in §34.7; staff email + password sign-in; whether the interim identity provider may serve a pilot; and when to push these branches to GitHub (the spec repo `uzacharge-master` is public).

## 7. Run it yourself

```bash
# 1. Gateway (in uza-charge-csms)
CSMS_PERSISTENCE=memory OCPP_ALLOW_INSECURE_WS=true OCPP_GATEWAY_PORT=9220   CORE_API_BASE_URL=http://127.0.0.1:3017/api/v1 CORE_API_SERVICE_TOKEN=local-api-token   CSMS_INTERNAL_API_TOKEN=local-gateway-token CSMS_DEV_NETWORK_ID=ucn npx tsx src/main.ts

# 2. API (in uza-charge-api; npm run build first)
PORT=3017 API_STORE=memory ALLOW_MEMORY_STORE=true ALLOW_DEV_VERIFICATION_CODE=true   SIMULATE_PAYMENT_CONFIRMATION=true DEV_PUBLIC_BASE_URL=http://localhost:5173   CSMS_GATEWAY_URL=http://127.0.0.1:9220 CSMS_INTERNAL_API_TOKEN=local-gateway-token   API_INTERNAL_TOKEN=local-api-token API_NETWORK_ID=ucn node dist/main.js

# 3. Owner portal (in uza-charge-owner): API_URL=http://127.0.0.1:3017 npm run dev  -> http://localhost:5174
#    Sign in as 0788000001; the code is shown on screen in dev; choose any PIN that is not 123456-like.

# Or everything, checked automatically (85 checks):
API_PORT=3017 bash scripts/e2e.sh        # in uza-charge-api
```
