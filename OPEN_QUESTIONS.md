# OPEN QUESTIONS

Required by core rule 5: *"If this document set and the prototype disagree, this set governs the intended design. Record missing facts in `OPEN_QUESTIONS.md` and continue with reversible engineering choices."*

Opened **7 October 2026**, when the v2.1 document set was first written into this repo (`CLAUDE.md`, `docs/`, `src/config/policy.ts`). Everything below is a divergence or gap found while doing that — not a plan, and not a list of work already agreed.

Status key: **OPEN** — needs a decision · **BLOCKED** — needs outside evidence · **TRACKED** — decided, migration outstanding.

---

## Q-01 — Money is stored in RWF × 100, but core rule 8 says integer RWF · OPEN

**The conflict.** Core rule 8: *"All money in integer RWF (RWF has no minor unit in practice — store integer RWF; if a currency with minor units is ever added, store minor units)."* The working prototype stores **RWF × 100** everywhere: `CURRENCY.minorUnitsPerUnit = 100` in `src/config/policy.legacy.ts`, and every amount in `src/lib/pricing.ts`, `src/lib/money.ts`, `src/lib/empower.ts`, the settlement and subscription maths, the database columns and 118 passing tests.

**What was done instead of changing it.** `CONFIG.MONEY_MINOR_UNITS_PER_UNIT` is seeded at `100` with status `PROPOSED` and a note naming this conflict. Every `*_AMOUNT` value in the new registry is expressed in the same minor units as the prototype, so the two agree. Nothing was silently re-scaled — doing so would have broken correct money maths (core rule 6).

**Decision needed.** Either (a) amend rule 8 to allow a 2-decimal working precision for RWF, or (b) migrate storage to integer RWF. (b) is a data migration touching every money column, every pure function and its tests, plus any seeded rows. Until decided, do not mix conventions: read the scale from `MONEY_MINOR_UNITS_PER_UNIT`, never assume it.

**Owner:** founder + whoever owns the ledger contract (D-01).

---

## Q-02 — 21 modules still read the v1.1 policy file · TRACKED

`src/config/policy.ts` is now the v2.1 registry. The v1.1 constants were moved to `src/config/policy.legacy.ts` (unchanged except renamed type exports) and are re-exported from `policy.ts`, so these importers compile and behave exactly as before:

```
src/components/uza/BookingPanel.tsx     BOOKING
src/components/uza/MoneyPanel.tsx       EMPOWER
src/lib/control-room.functions.ts       OCPP, UPTIME_TARGETS
src/lib/empower.functions.ts            EMPOWER
src/lib/empower.test.ts                 EMPOWER
src/lib/empower.ts                      EMPOWER, REVENUE_SPLIT_DEFAULTS
src/lib/forecast.ts                     FORECAST, INVESTMENT_HEALTH
src/lib/money.ts                        CURRENCY
src/lib/ocpp/handler.server.ts          OCPP, PREAUTH_AMOUNT_MINOR, TARIFF_DEFAULTS, TouTier
src/lib/owner.functions.ts              SUBSCRIPTION_DEFAULTS, TIMEZONE, UPTIME_TARGETS
src/lib/payments.functions.ts           PREAUTH_AMOUNT_MINOR
src/lib/pricing.test.ts                 TARIFF_DEFAULTS, UPTIME_TARGETS
src/lib/pricing.ts                      REVENUE_SPLIT_DEFAULTS, TARIFF_DEFAULTS, TOU_TIER_MULTIPLIER, TouTier
src/lib/report-export.ts                TIMEZONE
src/lib/reporting.functions.ts          TIMEZONE
src/lib/reservations.functions.ts       BOOKING, PREAUTH_AMOUNT_MINOR
src/lib/reservations.ts                 BOOKING
src/lib/settlement.server.ts            TOU_TIER_MULTIPLIER
src/lib/time.ts                         TIMEZONE
src/lib/uptime.ts                       UPTIME_TARGETS
src/routes/api/public/ocpp/$identity.ts OCPP
```

Migrating a consumer to `CONFIG` means accepting the v2.1 **value**, not just the key — see Q-03. Do it per feature, with its tests, not in one sweep. `POLICY_KEY_MIGRATION` maps every v1.1 key and `src/config/policy.test.ts` fails CI if one is forgotten.

---

## Q-03 — v2.1 values that differ from what the prototype currently runs · OPEN

Each of these is live behaviour today. The registry carries the v2.1 value; the running code still carries the v1.1 one. Switching each is a behaviour change that needs its own decision and test.

| What | Prototype runs | v2.1 says | Note |
|---|---|---|---|
| Booking arrival window | 10 min before / 10 min after (`BOOKING.graceBefore/AfterMinutes`) | **2 / 2** — a 4-minute window, `FOUNDER_DECIDED` (§10.1) | Largest behavioural gap. Covered by the 17 tests in `src/lib/reservations.test.ts` (window, collisions, no-show, free slots). |
| Booking slot length | 30 min | 45 min, `PROPOSED` (D-06) | |
| Pre-authorisation hold | Fixed RWF 15,000 (`PREAUTH_AMOUNT_MINOR`) | **Removed.** Dynamic stopping reserve per §7.3.5 | Key is marked removed; `resolvePolicyKey` throws with the reason. Three modules still read it (`ocpp/handler.server.ts`, `payments.functions.ts`, `reservations.functions.ts`). The reserve needs `STOP_EXPOSURE_WINDOW_SECONDS`, which is per-model and unmeasured — see Q-05. |
| Idle fee | RWF 100/min, 10 min grace | 0 / 10 min (D-08 placeholder), and only after **validated completion evidence** (§9) | SuspendedEV alone is not completion. Prototype has no completion-evidence concept. |
| Uptime target | Green ≥ 98%, amber ≥ 95% | RURA minimum is **97%**, `VERIFIED_EXTERNAL` (Art. 26(a)) | Kept separate on purpose: 98/95 are UZA's internal thresholds, 97 is the rule. Both are in the registry. |
| Offline charging | not implemented | **Disabled by default**, mandatory (§8.4) | Registry default is correct; nothing to change yet. |
| Revenue split | host 70% / platform 30%, energy cost RWF 215/kWh — all `ASSUMED` | `PENDING_VERIFICATION` (D-03) | v1.1 assumptions were not decided prices; they are not carried forward as if they were. |
| Investment health score | composite 0–100 score | **Removed.** §25.2 requires three distinct views instead | `src/lib/forecast.ts` computes the old score. |

---

## Q-04 — The prototype's architecture is not the specified architecture · OPEN

Core rules 1, 2 and 5 and §5.2 specify: NestJS + Prisma + PostgreSQL backend, React frontends that **never touch the database**, a separate always-on CSMS gateway, and no runtime dependency on Lovable or Supabase. This repo is a TanStack Start + Vite app with `@supabase/supabase-js` and `@lovable.dev/cloud-auth-js` as runtime dependencies, server functions reading the database directly, and RLS as the isolation mechanism.

This is expected — §1.2 calls the prototype *"a design and data-model reference, not the production system"* — but it means **this repo is not where Phase 0 ships**. §5.4 lists eight separate repos. The document set has been placed here so the prototype carries its source of truth (§33.3 asks for it in each repo); it does not make this repo the production target.

**Decision needed:** whether `uza-charge-csms` and `uza-charge-api` are scaffolded fresh per §5.4, or grown out of `ocpp-gateway/` here. Note `ocpp-gateway/` already owns charger WebSockets and the API keeps DB writes, which matches the §5.3 inbox/outbox seam.

---

## Q-05 — Evidence and credentials not in hand · BLOCKED

Each blocks the capability named, not the whole release (§21: *"An unavailable optional USSD code must not block QR charging"*). Full list and detail in [`docs/evidence/README.md`](docs/evidence/README.md).

| Missing | Blocks | Registry effect |
|---|---|---|
| **The RURA regulation PDF itself** | Every RURA rule relied on in production | §15 was written from the text the founder supplied, and the keys are `VERIFIED_EXTERNAL`, but `docs/evidence/rura-011-2026.pdf` **is not in this repo**. Add it, or the `source` references point at nothing. |
| RURA turnover levy rate (Art. 18(2)) | Levy accrual | `RURA_TURNOVER_LEVY_BPS` = null; reports read "Rate not yet confirmed — not accrued" |
| RURA report template (Art. 25(3)) | Fixed report format | `RURA_REPORT_TEMPLATE` = null |
| RURA uptime exclusions | Adjusted uptime as a compliance figure | `RURA_UPTIME_EXCLUSIONS` = null; raw uptime is reported |
| RURA Model B licensee (D-04) | Seller of record, VAT, levy attribution | `RURA_MODEL_B_LICENSEE` = null |
| BNR position on stored value across owners (§8.3.9, D-16) | Card spending at third-party sites | `FUND_HOLDER` = null, mandatory |
| RRA EBM / seller of record | Tax invoices | `VAT_RATE_BPS` = null; receipts only, invoices labelled "Coming soon" |
| NCSA data-hosting position | Any offshore hosting | — |
| RSB type approval for the Wicen units | Equipment conformity | Note the order form's meter accuracy **"Level 2.0"** fails Annex I class 1 (`RURA_METER_ACCURACY_CLASS` = 1, mandatory). Raised with the supplier before acceptance (D-28). |
| MTN MoMo + Airtel production credentials | Every payment rail | All rails `AWAITING CREDENTIALS`; `src/lib/payments.server.ts` already returns `configured:false` and leaves rows `pending` |
| Per-model stop latency and power bounds | Any monetary-limited session | `STOP_EXPOSURE_WINDOW_SECONDS`, `STOP_UNCERTAINTY_BUFFER_AMOUNT`, `OVERSHOOT_LIABILITY` all null. §7.3.9: *"unknown liability is a production blocker"* |

---

## Q-06 — Specification gaps noticed while transcribing · OPEN

Small things the document set does not settle. None blocks work; each will otherwise be decided accidentally by whoever writes the code first.

1. **`OFFLINE_AFTER` changed shape.** v1.1 expressed it as a multiplier on the heartbeat interval (2 missed heartbeats). §6.2 refers to it as an absolute duration. Seeded at **600 s**, `FOUNDER_DECIDED` — which equals 2 × the 300 s heartbeat, so behaviour is unchanged. Confirm the absolute form is intended.
2. **Tier multipliers vs explicit tier prices.** §9 prices each of the four tiers as *energy + service per kWh*. The prototype uses a multiplier on one base rate. Both are in the registry (`TARIFF_TIER_MULTIPLIER_*` as `PROPOSED`); §9's shape should win, but the migration is unscoped.
3. **48 half-hour segments and timezones.** §19.3 warns that *"48 half-hour labels are not a universal UTC-day model"*, but §9 fixes the 48-segment structure. For Africa/Kigali (UTC+2, no DST) this never bites; for a network with DST it does. No rule says what happens on a 23- or 25-hour day.
4. **"DMS"** (§24.3) is still unnamed — the spec itself flags it for confirmation.
5. **Team roles** (§20) are `PROPOSED` and explicitly await founder confirmation before circulation.
6. **`EMPOWER`** (driver financing: vehicle price, bank deposit, loan term, savings pots) exists in the prototype and in `policy.legacy.ts` but appears nowhere in v2.1. It is a different UZA product. Confirm it stays out of `uza-charge` scope — it is currently re-exported unchanged and untouched.

---

## Q-07 — Deployment work already open before v2.1 · TRACKED

Carried from `roadmap.md`, unaffected by this document set:

- Deploy `ocpp-gateway/` to a container host and point chargers at it.
- Enforce the shared-secret check (`x-gateway-token`) on the API side.

---

## Q-09 — Decisions raised by the competitive benchmark (Section 34) · PARTLY DECIDED

**Decided 25 October 2026 (founder):**
- **Sign-in is pilot-only.** The interim sign-in (phone + SMS code; staff add a PIN) may serve the pilot. Before general release, identity moves to UZA ID (D-01). See `uza-charge-api/OPEN_QUESTIONS.md` Q-10.
- **Prices are set in the admin panel, never in code** (item 4 below). Each owner sets what drivers pay on the owner portal's Prices page (built). The platform price card in §34.7.3 holds starting defaults that UZA configures in the platform admin (not built yet; meanwhile the `plans` table).
- **Push to GitHub:** done, including the public mirror `uzacharge-master` (consistent with Q-08).

Opened **25 October 2026**. Each item is a founder decision; the reversible default is what will be built if work starts before an answer.

1. **Commissioning sessions (A-14).** The benchmark offers "test mode: charge without payment". §6.7 forbids free, untracked transactions. Proposal: a time-boxed (≤ 24 h) per-charger commissioning mode, owner-admin enabled, every session priced at zero with reason `COMMISSIONING`, ledgered at zero, excluded from revenue and uptime. *Default until decided:* not built; commissioning uses a small real MoMo payment as §17.6 says.
2. **Selling the white-label product before Phase 4.** §20 places the first paid white-label customer in Phase 4. Answering the vendor's offer now means demonstrating a branded demo network (a Phase 2A gate item) and selling on it. Confirm that demos and letters of intent may start in Phase 1–2A while the paid launch stays gated. *Default:* build the demo network; make no paid white-label commitment.
3. **Store-published app (A-21).** Confirm whether the store app is a paid add-on (proposed) and whether an iOS build is in scope at all. *Default:* PWA only.
4. **Pricing against the benchmark (D-02, D-03, D-13)** — *decided 25 Oct 2026: set in the admin panel; the §34.7.3 figures are starting defaults.* Vendor: USD 1,000–5,000 once + USD 1,500 / year for ≤ 300 stations. Proposal in §34.7: no setup fee for the branded web app with the Network edition. *Default:* prices stay `null`.
5. **Staff sign-in method.** Rule 18 makes phone + SMS OTP primary for everyone; the benchmark and many business buyers expect login ID/email + password for staff. Proposal: staff sign in with phone + OTP or email + password, always with a second factor (§4); drivers stay password-free. *Default:* phone + OTP with second factor for staff.
6. **Data-residency claim (§34.6).** Verify Law No 058/2021's conditions for storing personal data outside Rwanda (NCSA) before using it against offshore-hosted competitors. · BLOCKED on legal review.

*Add an entry whenever the specification and the code disagree, or an outside fact is missing. Record the arrival of each piece of evidence here and set the value's `source`, reviewer and effective date in the configuration registry.*
