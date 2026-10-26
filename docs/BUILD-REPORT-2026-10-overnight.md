# Build report — overnight build (25–26 October 2026)

*Follows `BUILD-REPORT-2026-10.md`. For whoever evaluates this work: what was asked, what was built, where it is, how it was proved, and what is still missing. **Nothing in this report has been pushed.** Every commit is local, waiting for the founder's review ("then we will push that").*

**Asked for (founder, 25 Oct 2026):**
- packages and pricing editable in the admin panel, for clients and stakeholders, per day, month, year and so on;
- products that can be sold in several forms to operators who already run stations, each with their own portal to manage their prices and feel safe;
- simple card payment, easy MoMo and Airtel settlement, and tap-and-go cards loaded for cash or MoMo by agents, to stop operators pocketing cash;
- GPS, slot booking, and live availability per station and per pile;
- "benchmark globally, produce the best management system, irresistible and customisable for each stakeholder."

Two founder decisions hold throughout:
- the interim sign-in (phone + SMS code, PIN for staff) is **pilot only**;
- **prices are set in the admin panel, never in code**.

---

## 1. Where everything is

| Repo (`C:\Users\HP\Desktop\…`) | Branch | Side | New tonight |
|---|---|---|---|
| `uza-charge-api` | `feat/sellable-admin` | Backend | Packages, payments, wallet and cards, compliance, reports, deployment (§2) |
| `uza-charge-csms` | `feat/onboarding-and-maintenance` | Backend (gateway) | One simulator fix |
| `uza-charge-noc` | `feat/admin-console` (new, from `feat/sellable-admin`) | Frontend | The **admin panel** and the compliance/uptime/incidents screens |
| `uza-charge-owner` | `feat/owner-portal` (new, from `feat/sellable-admin`) | Frontend | The owner's own portal: package, payouts, agents, export, compliance, incidents, reports, costs, P&L |
| `uza-charge-operator` | `feat/agent-cards` (new, from `feat/sign-in`) | Frontend | The cash agent's card flow |
| `uza-charge-driver` | `feat/map-wallet` (new, from `feat/sign-in`) | Frontend | Map with GPS, per-charger availability, wallet and cards |

**Separation.** Frontends still hold no business rule and no database client. Every new screen shows what the API returned, and the API's own sentence when it refuses. The API contract is one file, `uza-charge-api/docs/ADMIN_API.md`:

| Section | Covers |
|---|---|
| §8 | Packages, owners, network settings |
| §9 | Wallet, cards, agents |
| §10 | Uptime, compliance, incidents, reports |
| §11 | Payments, refunds, payouts |
| §12 | Branding, data export |

## 2. What was built

### Backend (`uza-charge-api`)

| Area | What it does | Waiting on |
|---|---|---|
| **Packages and pricing** (§8) | **Client and stakeholder packages.** Options per day, week, month, quarter or year. Price lines can be flat, per gun, revenue share (with cap and minimum), per kWh, per session, or setup. Prices are versioned, published with a confirmation, and quoted against an owner's real usage. Subscriptions keep the version they started on. Every package's whole price is described in plain words. **Starting defaults** are the §34.7.3 price card, all editable in the admin panel. | — |
| **Selling to operators** (§8) | `POST /admin/owners` signs a new owner on with their first administrator. The kind is chosen (hotel, fuel station, mall, fleet…) and so is the model: A, network-owned; B, managed; C, they run it on the platform. Each owner then runs their own portal. | — |
| **Trust** (§12) | **Full data export.** The owner can leave with their sites, chargers, prices and their history, every charge, settlements, staff and audit trail. Drivers' phone numbers are excluded. **White-label branding** per network. | — |
| **Payment rails** (§11) | MTN MoMo, Airtel Money, and card checkout (Flutterwave, behind a generic port). Provider callbacks are re-checked with the provider before anything changes. A reconciliation worker runs, and anything unresolved goes to an exceptions queue. **Refunds** above the support limit need a second person. **Owner payouts:** the fee and the amount that will land are shown before confirming, and payout numbers are verified by a second person. A payment counts as paid **only when the provider confirms it**. | **AWAITING CREDENTIALS** (no real money has moved) |
| **Wallet, tap-and-go cards, cash agents** (§9) | **Double-entry ledger** that cannot be edited (database trigger). **Cards:** the number has a check digit; the card's chip ID and activation secret are stored only as one-way hashes; lifecycle, block, replace, tiers. **Agents** load cash only out of a float. Shift close is a **blind count**: the attendant enters what they counted before seeing what was expected, and differences above the threshold are flagged. Float from credit needs a second approver. Tap to charge places a hold, captures the cost and returns the rest. Fraud rules: lock after repeated declines; block when one card appears at two sites far apart. | Tap-and-go is refused on every charger until its stop speed is measured on a bench (§7.3.5) |
| **Uptime, RURA compliance, incidents, reports** (§10) | **Measured uptime** from status history, with worst case, best case, and "undetermined" while unobserved time could change the verdict. A **RW-RURA-011-2026 obligations pack**: licence review, renewal and start-of-operations deadlines. **Incidents** with the 1 h, 48 h and 24 h RURA clocks and pre-filled report drafts. A regulator read-only role, only for sites whose owner allows it. Reports cover energy, peak, load profile, revenue, chargers and forecast. Cost book and **monthly P&L**, where unknown lines are named and kept out of subtotals. Monthly regulator file as CSV, HTML or PDF. | Pack must be checked against the RURA PDF once it is filed |
| **SMS** | Africa's Talking adapter. It is used only when credentials are set; otherwise the API logs the message in development and refuses to send in production. | **AWAITING CREDENTIALS** — without them nobody can sign in in production |
| **Deployment** | Container images and a one-server compose stack: Postgres with point-in-time recovery, Caddy for HTTPS, the four apps. Nightly encrypted backups with a monthly restore drill, plus CI. **Rate limits** count each real caller behind the proxy (`TRUST_PROXY_HOPS`). **Charger traffic** from the gateway is not rate limited. Guide: `deploy/README.md`. | Docker is not installed on this laptop, so no image has been built or started |

### Frontend

| App | Screens added |
|---|---|
| **Admin panel** (NOC console) | **Selling:** packages with search and filters; the draft editor (all periods and price lines, publish with confirmation, version history, quote tool); subscriptions; sign a new owner on; network settings and brand preview. **Cards and agents:** cards and card batches (secrets shown once); agents, float approval and the exceptions queue. **Payments:** payment rails, exceptions, refunds, payouts and payout numbers. **Operations:** network uptime, incidents, the compliance review queue and regulator report downloads. |
| **Owner portal** | **Money:** my package; payouts (quote first, then confirm; payout number with its verification state); agents and cash differences. **Data:** "take my data and go" export. **Compliance:** the RURA checklist, licences and tasks, and regulator access. **Incidents:** with their clocks. **Analysis:** reports with simple charts, cost book, P&L, and regulator files. The price screen says plainly that the owner sets their prices there. |
| **Attendant app** | **Cards tab:** agent home (float, cash in hand, commission); open and close shift with the blind count; find a card by typing its number or by an NFC tap (Web NFC, falling back to typing); sell a card; cash top-up (one key per top-up so a retry never loads twice, receipt number shown large); daily report. |
| **Driver app** | **Map:** Leaflet with OpenStreetMap tiles, GPS "near me" with an explanation, and a fallback when location is refused. Markers are coloured by availability, and each station lists its guns under **Charger 1, Charger 2…** with live state, price, Directions, Book and Charge, plus a list sorted by distance. **Wallet:** balance, history, link a card, block a lost card, MoMo/Airtel top-up. Network branding. |

## 3. How it was proved

| Check | Result (final code, 26 Oct ~01:30) |
|---|---|
| API unit tests | 1,069 pass |
| API on PostgreSQL (fresh database, all migrations) | 1,180 tests; 1,179 passed and 1 failed on a race in the test itself. Fixed in `64e2c70`; that file then passed 3 runs out of 3. The full suite was not re-run after the fix. |
| Schema drift check (`migrate diff --exit-code`) | Clean on every merge |
| End-to-end: gateway + API + simulated charger, driver and admin journeys | **85/85 in memory, 85/85 on PostgreSQL** |
| Gateway tests | 421 pass |
| Admin panel / owner portal / attendant app / driver app tests | 144 / 196 / 89 / 158 pass; each also passes typecheck, lint and build |
| **Real-browser click-through** (headless Chrome, phone width) | Admin panel, owner portal (10 new screens) and driver map, all with no browser errors. It found 3 real bugs, all fixed: (1) admin tabs nested under the current page ("package not found"); (2) share-based packages listed as "RWF 0"; (3) a month with no charges showed revenue as "Not known". Also fixed: (4) a cramped gun label at 360 px. |

Four parallel API workstreams were merged into `feat/sellable-admin` mechanically: wallet, compliance, payment rails and deployment. Each kept its own migration timestamp, and every merge was re-tested on a fresh database.

## 4. Not done, and why

- **Nothing pushed**, by instruction. Four new frontend branches exist only on this laptop.
- **Waiting on outside parties** (labelled AWAITING CREDENTIALS in the code):
  - MTN MoMo, Airtel Money and card PSP accounts;
  - Africa's Talking SMS;
  - payout fee schedule — payouts are refused until it is set;
  - RURA levy rate;
  - the RURA regulation PDF, to check the obligations pack against.
- **Needs a physical step:**
  - tap-and-go needs each charger's stop speed measured on a bench;
  - NFC reading has only been tested with a fake reader;
  - no Docker image has been built.
- **Kinyarwanda:** every new string exists in Kinyarwanda but is unreviewed; the "pending founder review" notice stays on.
- **Not built:**
  - routing incidents by business model;
  - job cards and parts;
  - local authorisation lists for offline card taps;
  - card refunds (done in the PSP dashboard);
  - a site picker for agent registration — there is no admin route listing sites; the field is typed.
- **Port 3022** on this laptop is still held by an old test API (process 10000) a build agent started; stopping it was refused by the permission system. Stop it before using that port.

## 5. Run it yourself

See `BUILD-REPORT-2026-10.md` §7 and `uza-charge-api/scripts/e2e.sh`. To see the new admin panel:
- in `uza-charge-noc`, run `VITE_DEV_ROLE=NETWORK_ADMIN API_URL=http://127.0.0.1:<api port> npm run dev`;
- then open `/admin/packages`.
