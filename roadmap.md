# UZA Charge Network — roadmap

Approved plan: `.lovable/plan/` (archived). This file tracks open work only.

## This pass (in progress)
- [x] UZA design system tokens in HSL with token-level dark/light mode
- [x] `src/config/policy.ts` — business constants tagged CONFIRMED / ASSUMED
- [x] `src/lib/pricing.ts` — pure money maths in integer minor units + unit tests
- [x] Strict data model: owner → site → station → charge_point → connector → session
- [x] RLS + GRANTs on every new table, owner-scoped
- [x] Append-only `ocpp_events` audit table
- [x] OCPP 1.6-J endpoint (BootNotification … StopTransaction + remote commands)
- [x] Operator control room with uptime as headline KPI

- [x] Owner portal — measured dashboard, daily report, forecast (labelled an
      estimate), investment health score, settlement statements, payouts,
      subscription plan + invoices, public-listing opt-in
- [x] Subscription billing tables and pure invoice maths (prices ASSUMED)

## Remaining (next passes, ordered)
1. Payments for real: MoMo/Airtel pre-auth → reconcile → capture/refund, wallet
   top-up, RFID/QR start, post-paid fleet accounts, itemised receipts.
   (Done already: the OCPP Authorize/StartTransaction gate refuses a session
   without wallet cover or a fleet account, and StopTransaction writes an
   itemised receipt.)

2. [x] Driver app rebuild at 360px (Kinyarwanda-first i18n, Leaflet map,
   favourites, history, wallet) — done this pass
2b. Driver app rebuild at 360px with real i18n (English-first, RW/FR drop in as data), map,
   favourites, history + receipts.
3. Utility-grade exports: CSV + PDF for energy per site, peak demand, session
   profiles.
4. Finish pass: password reset, responsive sweep 360/768/1440, per-route SEO
   head metadata, console-error sweep.

## Requested 3 Sep 2026 (this pass)
- [x] Password reset (request link on /auth + /reset-password) and sign-out on every surface
- [x] Real sitemap at /sitemap.xml + robots reference
- [x] MTN MoMo + Airtel Money pre-authorisation → reconcile → capture/refund wired into `payments`
      Real Collections/Disbursement calls in src/lib/payments.server.ts; server fns preauthoriseSession,
      pollPayment, reconcileSession, railStatus; callbacks at /api/public/momo-callback and
      /api/public/airtel-callback (callback is a hint only — status is re-queried from the provider).
      Append-only payment_events audit table. NO merchant credentials are configured yet, so every rail
      call returns configured:false and rows stay `pending` — the app never claims money moved.
      Secrets still required: MTN_MOMO_SUBSCRIPTION_KEY, MTN_MOMO_API_USER, MTN_MOMO_API_KEY,
      MTN_MOMO_TARGET_ENV, MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY, AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET.
- [x] Regulator exports: CSV + PDF with energy per site, coincident peak demand, half-hourly
      demand profile and session profiles. Pure maths in src/lib/reporting.ts (13 tests),
      RLS-scoped read in src/lib/reporting.functions.ts, browser builders in src/lib/report-export.ts,
      panel src/components/uza/RegulatorExports.tsx mounted on /owner and on the /ops settlement tab.
      Unmetered figures print "not metered", never 0.
- [x] Owner portal shows measured non-zero data: uzasolutionsltd@gmail.com linked to Kigali PowerDrive
      as owner_admin; 3 sites reporting, 22 sessions, 394.7 kWh, RWF 82,030, 208.8 kW coincident peak,
      604 meter samples over the last 30 days. Telemetry is simulator-sourced and labelled as such.
- [x] Responsive sweep: /, /auth, /reset-password, /driver, /ops, /owner, /admin all verified at
      360 / 768 / 1440 — no horizontal overflow, no console errors. Fixed by adding min-w-0 to grid
      columns on /owner and the home station cards, and scroll wrappers on the admin tables.

## Requested 8 Sep 2026 (this pass)
- [x] Regulator export filters: exact From/To dates (local Kigali days), owner selector on the
      network view, and per-site toggles. Every figure, CSV and the PDF follow the same filter.
- [x] One-click CSVs per export type (energy per site, peak demand, demand profile, session
      profiles) built from the exact dataset on screen.
- [x] PDF now draws three charts: peak coincident demand per site, half-hourly profile
      (mean bars + metered maximum line) and a session duration-vs-power scatter.
- [x] Regression tests in src/lib/reporting.regression.test.ts reconcile energy, kWh, RWF and
      session-profile aggregation against a seeded meter dataset (11 tests; 96 total).

## Booking a pile (done 2026-09-08)
- [x] Booking rules in src/lib/reservations.ts, 17 unit tests (tolerance window, collisions, no-show, free slots)
- [x] BOOKING constants in src/config/policy.ts, all tagged ASSUMED
- [x] Server functions: my bookings, free slots per pile, create, cancel; database overlap constraint is final word
- [x] Driver Book tab: station -> pile -> slot -> minutes, live/past bookings, start charging inside the window
- [x] English + Kinyarwanda copy for every booking string

## OCPP gateway (added 2026-09-10)
- [x] Standalone `ocpp-gateway/` process owns charger WebSockets; API keeps all DB writes.
- [x] API accepts `{"drain":true}` for command pickup and CALLRESULT acks over HTTP.
- [ ] Deploy the gateway to a container host (Fly/Render/VPS) and point chargers at it.
- [ ] Optional shared-secret check (`x-gateway-token`) enforced on the API side.
