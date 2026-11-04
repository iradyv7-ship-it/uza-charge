# UZA Charge: go-live log

One entry per working session, newest first, in the format of `GO-LIVE.md` §4. Problems come first.

---

## 4 Nov 2026 (later) · DECISION RECORDED: the commission model · GATE 1: OPEN · LEVEL reached: L1

**Decision (Yves, from `docs/incoming/OCPP EV Charging Station Management Platform.pdf`)**
- The platform earns a commission on every successful charging transaction: **15% to the network, 85% to the station owner**, by default.
- The commission is a percentage of **what the driver paid**. The owner carries the payment provider's collection fee. For example, a charge paid at 10,000 with a 200 fee gives 1,500 to the network and 8,300 to the owner.
- An owner's own agreement may set another rate. The network admin types it when approving the application; left empty, the default applies.
- **Flutterwave is not chosen yet.** It stays a proposal until Flutterwave confirms the points in §8 of that document: split payments for Rwanda, owner settlement to MoMo or bank, fees and onboarding.

**What changed in the code** (API, NOC; tested on PostgreSQL)
- New rules, both FOUNDER_DECIDED, visible in the NOC's Rules screen:
  - `PLATFORM_COMMISSION_BPS` = 1500;
  - `PLATFORM_COMMISSION_BASIS` = AMOUNT_PAID.
- Settlement and card charging take the commission from the amount paid, before deductions. A charge whose fees exceed the owner's side is refused, not paid negative.
- Approving an owner writes their commission: the default, or the rate typed. The NOC approval form has the field.
- **Fixed on the way:** an owner with no commission recorded was settled at 0% to the network, while the owner screens read the same owner as 0% to the owner. Both now use the network default.

**Still open:**
- The management fee for Model B.
- Who pays payout (disbursement) fees: `PAYOUT_FEE_PAID_BY`, still PROPOSED as OWNER.
- Exposure limits.
- Seller of record.

---

## 4 Nov 2026 · STAGE 1 (remaining defects) · GATE 1: OPEN · LEVEL reached: L1

**Problems first**
- **Not re-walked in a browser.** These fixes are proven by tests, including the whole API suite on PostgreSQL. The browser walkthrough of 2 Nov has not been repeated on top of them. It should be, on the staging host.
- **Two new questions for Gad, both written into the code as the safe choice:**
  - Cash an attendant owes back to a driver (a charge that never started, or change) stays on the ledger as owed until something records it was handed back (operator Q-03).
  - Finance-only staff see Admin and complaints, not the live estate.
- **Eleven new rules are PROPOSED values** (booking policy, prepaid min/max, two NOC thresholds). They are the old hard-coded values, now editable. Nobody has decided them.

**PROVEN** (tests)
- All 33 audit defects are now fixed. These were the last nine:
  - 6: attendant cash on the ledger;
  - 9: finance staff can use the console;
  - 13: cash idempotency;
  - 18: hard-coded values moved to rules;
  - 20: P&L unknown costs;
  - 21: charger time in the OCPP log;
  - 22: report site filter and stale docs;
  - 31: simulator power cap;
  - 33: re-alert on a recurrence.
- `uza-charge-api`: 1,474 passing on PostgreSQL, none skipped; lint, typecheck and `openapi:check` clean.
- `uza-charge-csms` 437, `uza-charge-operator` 96, `uza-charge-noc` 211 passing; each typechecks, lints and builds.

**BLOCKED**
- Unchanged: a staging host and domain, MoMo and Airtel accounts, an SMS provider, the real charger, and the business values (float, booking fee, the four paid-launch decisions).

**Pull requests** (updated, plus one new)
- API, attendant and NOC: the existing `#2` in each repo now carries these fixes.
- Gateway (new): https://github.com/iradyv7-ship-it/uza-charge-csms/pull/2

**NEXT 3 ACTIONS**
1. Gad reviews the PRs, API first, then the gateway. Owner: Gad.
2. Provide a staging host; repeat the browser walkthrough there from phones. Owner: Gad.
3. Decide or confirm the PROPOSED values in the NOC's Rules screen, starting with the attendant float. Owner: Yves.

---

## 3 Nov 2026 · STAGE 3 (local rehearsal) · GATE 3: OPEN · LEVEL reached: L1

**Problems first**
- **The four app images are not built yet.** Their last step needs the nginx base image. Docker Hub, and later Amazon's mirror (public.ecr.aws), refused connections through the VPN. The apps' production builds (`npm run build`) pass on this machine; only the image packaging waits on the network. On a server in a data centre this does not apply.
- **Builds behind EonVPN need a workaround.** The VPN's MTU is 1380, while containers use 1500, so large downloads stalled. Building with `--network host` fixed it (recorded in `deploy/README.md`).
- **Low memory on the laptop.** Claude Code stopped the local demo stack and Postgres while the session was idle. No data was lost; they restart with `node start.mjs` and `scripts/demo.sh`.

**PROVEN** (Docker on this laptop)
- Images built for the API, the gateway and both tools images.
- Production Postgres started healthy, and its init script created both databases and roles.
- Both migrations ran from the images. `bootstrap.sh` created the network, the first owner and the network admin.
- The API and gateway started in production mode. The gateway reported healthy, and the API served the bootstrapped network.
- Production refuses simulated payments, and now on-screen sign-in codes too. New tests in `src/config/production-guard.test.ts` cover every refusal.
- Two more audit defects fixed (19: booking day in Kigali time; 23: unknown regulatory pack refused).
- All six PRs updated.

**BLOCKED**
- Unchanged from 2 Nov: a staging host and domain, MoMo and Airtel accounts, an SMS provider, and the real charger.
- New: the app images need either a connection without the VPN, or the server itself.

**NEXT 3 ACTIONS**
1. Gad reviews the PRs (API first). Owner: Gad.
2. Provide a staging host. There, `docker compose build && up` should now go through, because each step was rehearsed here. Owner: Gad.
3. MTN MoMo developer sandbox and Africa's Talking sandbox. Owner: Yves.

---

## 2 Nov 2026 · STAGE 1 (+ fixes to P1 journeys) · GATE 1: OPEN · LEVEL reached: L1

**Problems first**
- **The overnight session of 1 Nov left no log, no audit and no pull requests.** It stopped part-way through the browser checks: the driver's MoMo case (D-02) failed, and D-03 and D-04 were blocked behind it. This entry covers that gap.
- **Several P1 journeys did not actually work on PostgreSQL**, even though every unit test passed:
  - a refused start left the gun "in use" with no refund;
  - bookings never expired and never held a gun;
  - nothing could turn bookings on;
  - an attendant could not open a shift;
  - an attendant's mobile money start never started the charge;
  - a driver's history was always empty.

  All are fixed (REALITY-AUDIT.md, "Defects and their status"). The cause was the same each time: unit tests on the in-memory store, which hands out live objects, could not see a missing save.
- **The attendant's cash for charges is still not on the ledger.** Shifts, counts, change due and handback now work, but the cash is reconciled per shift, not posted. This is defect 6, for Gad.
- **Kinyarwanda for tonight's new strings was written by the engineer and is unreviewed**, like the rest of the copy.

**PROVEN** (headless Chrome at 390 px, on an empty PostgreSQL database, real OCPP over a socket; step scripts in `uza-charge-api/browser-e2e/steps/`)
- A business applies at `/apply`, a network admin approves it in the NOC, and the new owner signs in.
- The owner adds a site and a charger. The charger connects with its one-time password.
- Licence and the 24-item RURA checklist go through owner evidence and NOC approval. The site goes on the map.
- A driver books a gun. Nobody arrives, and the booking is released automatically at T+2 (window closed 04:47, released 04:47:39).
- A driver pays (simulated MoMo), charges with live figures, stops, and gets a receipt and a History entry.
- An attendant is added by the owner. They open a shift (refused until a float is set), take cash, start a charge, show the driver a QR, stop, and close the shift: expected 3,000, counted 3,000.
- An offline incident and an over-power incident opened automatically.
- Tests:
  - `uza-charge-api`: 1,456 passing with `TEST_DATABASE_URL` (PostgreSQL); lint, typecheck and `openapi:check` clean.
  - Apps: driver 203, owner 231, operator 96, NOC 208 passing. Each typechecks, lints and builds.

**FAILED** (with cause)
- No live alert SMS on re-offline. The charger's offline incident from 01:57 was still open, so no second incident and no second alert followed (defect 33, by design for now).

**BLOCKED — on whom — since when**
- Staging server and domain: Gad / Yves, since 1 Nov. The Docker stack has still never been built on a host.
- MTN MoMo and Airtel accounts (sandbox, then production): Yves, since 1 Nov.
- Africa's Talking SMS: Yves, since 1 Nov.
- A real Wicen charger with a class 1 meter: Yves / Gad.
- Business values the system now refuses without:
  - the attendant float (`ATTENDANT_SHIFT_FLOAT_AMOUNT`);
  - a booking fee, if any (until then, "booking is free");
  - the four paid-launch decisions.

  Owner: Yves.

**REALITY AUDIT:** the code trace before the fixes counted 127 screens: REAL 72 / SIMULATED 33 / PLACEHOLDER 5 / MISSING 17. Since then:
- 22 of the 33 listed defects are fixed;
- 9 are open with an owner;
- 2 are partly fixed (attendant cash not yet on the ledger; the cash idempotency key).

The per-screen recount comes after Gad's Gate 1 review.

**STAKEHOLDER MATRIX** (P1 = driver, owner, attendant, NOC, finance)
- Driver, owner, attendant and NOC P1 journeys work end to end, SIMULATED only where a real charger, payment or SMS is needed.
- Finance: OPEN. Reconciliation exists; finance-only staff cannot reach the NOC console (defect 9).
- P2 and P3: not started this session (Stage 5).

**Pull requests** (review in this order; each targets that repo's current feature branch)
1. API: https://github.com/iradyv7-ship-it/uza-charge-api/pull/2 (merge first)
2. Driver: https://github.com/iradyv7-ship-it/uza-charge-driver/pull/2
3. Owner: https://github.com/iradyv7-ship-it/uza-charge-owner/pull/2
4. Attendant: https://github.com/iradyv7-ship-it/uza-charge-operator/pull/2
5. NOC: https://github.com/iradyv7-ship-it/uza-charge-noc/pull/2
6. Spec and these docs: https://github.com/iradyv7-ship-it/uza-charge/pull/2

**NEXT 3 ACTIONS**
1. Gad reviews and merges the five PRs, and reads REALITY-AUDIT.md for Gate 1. Owner: Gad. By 6 Nov.
2. Provide a staging host and domain. Then the Docker stack is built, Caddy issues TLS, and the walkthrough is repeated from phones (Stage 3 and Stage 4). Owners: Gad for the host, engineer for the build. By 9 Nov.
3. Open the MTN MoMo developer sandbox and an Africa's Talking sandbox, so payments and SMS become SANDBOX instead of SIMULATED. Owner: Yves. By 9 Nov.
