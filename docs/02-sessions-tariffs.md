# Charging sessions, billing evidence, tariffs and fees

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 7 and 9**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches session start/stop, billing evidence, prepaid exposure, tariffs, promotions or receipts.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 7. CHARGING SESSIONS — HOW A DRIVER STARTS, CHARGES AND PAYS

### 7.1 Ways to start

| Method | Flow | Needs app? | Needs bank? |
|---|---|---|---|
| **QR + MoMo/Airtel (pay per session)** | Scan QR on the gun → web page opens → choose amount or "full" → MoMo/Airtel prompt → API confirms → RemoteStart | No (web) | No |
| **QR + UZA wallet** | Scan → logged-in driver → confirm → RemoteStart, debiting wallet | App or web login | No |
| **Tap UZA card** | Tap card on the charger reader → Authorize(card UID) → server checks wallet → Accepted → StartTransaction | No | No |
| **App remote start** | Choose gun in app → start | Yes | No |
| **Booking start** | Booked driver arrives in window → tap card / scan QR / "I'm here" in app | Optional | No |
| **Fleet card** | Tap → fleet wallet or postpaid account with limits | No | No |
| **Operator start** | NOC/owner starts for a walk-in cash customer (cash receipt recorded) | No | No |

The gun's QR code encodes a short URL `https://<domain>/c/{connectorCode}` — works with any phone camera, no app required. Each connector has a printed short code (e.g. `KGL-014-2`) for typing if the QR is damaged.

### 7.2 Pre-start screen (driver sees before paying)

Site name, gun type (GB/T or CCS2), rated power, **expected power** (lower if the other gun is in use), the **current price per kWh** (energy + service shown as one total, with breakdown on tap), any start fee, the idle-fee rule, and an estimate: "RWF 10,000 ≈ 31 kWh ≈ 25–35 min". Price display satisfies RURA Art. 27 (tariffs clearly displayed).

### 7.3 Billing evidence, prepaid limits and stopping control

OCPP 1.6 remote stopping is not a guaranteed money cap. Implement a tested exposure controller:

1. Reserve prepaid credit atomically before authorising a start. Check vehicle/card/fleet limits and prevent competing reservations from spending the same balance.
2. Pin the tariff version, currency, tax treatment and contract fee version. The pinned tariff contains its time schedule: pinning a version does not freeze the initial time-of-day price.
3. Bill from validated cumulative energy registers; retain original samples and normalised units. Use fixed-precision decimal/integer energy and rational rates, round once at the defined billing boundary, and document fee/tax rounding. Never use binary floating-point money arithmetic.
4. For time-of-use boundaries, use validated boundary samples where available. Otherwise allocate interval energy under a documented method and mark it estimated. Preserve trusted device event time, server receive time and clock-quality evidence. Queued offline energy is not priced at reconnect time. Material uncertainty enters correction/dispute review.
5. Compute a dynamic stopping reserve: `ceil(power_upper_bound_kW × maximum_applicable_rate_per_kWh × exposure_window_seconds / 3600) + accrued_fixed_fees + configured_uncertainty_buffer`. The exposure window covers maximum expected sample age, processing/command latency and charger stopping latency. Test it per model; use conservative power bounds and watchdogs.
6. Example only: 240 kW at RWF 500/kWh can deliver RWF 1,000 in 30 seconds. A fixed RWF 200 margin cannot cover that interval. The example is not a tariff or hardware measurement.
7. Stop before the remaining hold falls below the required reserve. If prepaid credit cannot cover a safe minimum session, explain the minimum or offer a validated lower power limit. Never initiate a monetary-limited session on hardware unable to enforce the approved risk policy.
8. Loss of telemetry/command connectivity triggers the model's tested fallback: charger-enforced limit where supported, local controller, or an explicitly contracted bounded exposure. Hardware safety protections remain local and independent of this backend.
9. Record overshoot separately. Do not silently charge beyond the driver's authorised maximum. Apply the disclosed driver-consent and operator/network liability policy; unknown liability is a production blocker.
10. StopTransaction is reconciled with start and interval evidence. A missing/invalid final register creates a provisional bill, not a fabricated final meter value. Later corrections use adjusting entries and revised receipts; never rewrite paid history.

Driver targets: fixed amount, fixed kWh, reported SoC target when supported, or until vehicle completion. Explain estimates and unsupported options. Release unused wallet holds or refund unused prepayment to the original rail after evidence-based finalisation; distinguish pending from confirmed refunds.

Session states, payment states and settlement states are separate state machines linked by IDs. A refunded start attempt may still require investigation of a late charger transaction.

### 7.4 Separate lifecycle states

- Charging: `authorised → starting → charging ⇄ suspended_ev / suspended_evse → finishing → stopped`, with `unknown_start`, `failed_to_start`, `recovery_required` and `abnormal` exceptions.
- Payment: `created → pending_provider → confirmed | failed | unknown`; refunds have their own pending/confirmed/failed states and references.
- Billing/settlement: `unbilled → provisional → finalised → allocated`, with dispute hold and adjusting revisions.
- Payout: the Section 8.5 state machine; never infer paid cash from a settled session.

Transitions carry timestamp, event/receive time, cause, actor and correlation IDs. The driver sees supported live kWh/kW/SoC, elapsed time, cost, freshness and estimated target time. Missing data stays unknown. Each state machine recovers independently without duplicating money or equipment actions.

### 7.5 After the session

- Receipt (in app, SMS link, downloadable PDF): site, gun, start/stop times, kWh, tariff periods used, energy cost, service fee, idle fee, discounts, total, payment method, receipt number.
- **Tax invoice via RRA EBM** for VAT-registered sellers — `REQUIRES OFFICIAL VERIFICATION`: confirm with RRA how EBM invoices are issued when UZA collects on behalf of an owner (who is the seller of record per model A/B/C). Until verified, issue receipts only and label tax invoices "Coming soon".
- Rate the session (1–5 + comment + photo). Report a problem (links to the exact session and gun).
- Send unplug/move reminders and idle-fee countdown only after a validated completion/occupancy event under Section 10; SuspendedEV may be a temporary vehicle pause.

---

## 9. TARIFFS, FEES AND PROMOTIONS

- **Tariff structure** (kept from the prototype spec, matching Yunkuaichong's model): 48 half-hour segments per day (index 0–47), each mapped to one of four tiers — **sharp / peak / standard / valley** — and each tier priced as **energy RWF/kWh + service RWF/kWh**. Optional: start fee per session, minimum charge, different weekday/weekend maps.
- Owners set their own prices per site or per connector, within RURA's fair/transparent/non-discriminatory rule (Art. 27). The driver always sees one clear total price per kWh before starting.
- **Idle fee:** starts after the disclosed grace period following a validated charging-completion event while the connector/bay remains occupied. SuspendedEV, low charging power or target SoC alone are insufficient. Define charger capability, completion evidence, notification, exemptions and dispute remedy before activation; parking fees are separately disclosed.
- **Booking fee** and **no-show fee** (Section 10): per site, owner-configurable within policy.
- **Promotions**: site discounts (energy or service, by time period and weekday), coupons (platform-wide or site-specific, validity, stock, per-user limits), first-charge offers, fleet rates. Promotions cost is attributed to whoever funds it (UZA or owner) in the settlement split.
- **Tariff versioning**: every change creates a new version with author and effective time; sessions pin their version; full history visible and auditable.
- **REG electricity cost profile** per site (owner's own purchase tariff, by time of day where applicable) — used for margin and P&L, never shown to drivers.
