# Bookings, public map, driver journey, fleets and growth

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 10, 11 and 27**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches bookings and reservations, the public network map, the driver journey, fleet workspaces or growth/retention measurement.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 10. BOOKINGS — RESERVE A GUN WITH A 4-MINUTE ARRIVAL WINDOW

### 10.1 The UCN default (FOUNDER_DECIDED)

A driver books a specific **gun** at a specific time **T**. The arrival window is **T − 2 min to T + 2 min** (4 minutes in total). The driver must **present a valid start request inside that window** (tap card, scan QR or press "I'm here" and plug in). If no valid arrival/start attempt happens by **T + 2 min**, the booking is **automatically cancelled** and the gun is released to everyone.

### 10.2 How it works

1. **Search and book**: map → site → choose gun (GB/T or CCS2, power) → choose a free slot → see booking fee, no-show rule and slot length → pay booking fee from wallet or MoMo → booking `confirmed`.
2. **Slot length**: each booking reserves the gun from T for `policy.BOOKING_SLOT` (founder decision D-06, `PROPOSED 45`). Only free slots are offered.
3. **Protecting the slot:** use walk-in admission estimates, a turnover buffer and physically managed bays. A scheduled remote stop is optional only with explicit advance consent; it cannot guarantee departure. Estimate whether the remaining session plus bay clearance fits before the booking, otherwise route walk-ins to another compatible gun. Avoid sacrificing substantial utilisation merely to protect unconfirmed arrivals.
4. **At T − 2 min**: server sends `ReserveNow` (connectorId, idTag = booking holder's token, expiryDate = T + 2 min). The gun shows **Reserved** on the charger and on the map. Only the holder's card/QR/app token can start it.
5. **If the gun is still occupied at T − 2 min** (previous car still plugged in): offer the holder the other gun if free; otherwise notify the holder immediately, refund the booking fee in full and apply `policy.BOOKING_FAILURE_CREDIT_AMOUNT` as an apology credit. Never leave a driver arriving to an occupied gun without warning.
6. **Holder presents valid start request in window:** record `arrived/starting`, allowing a configured charger-start grace period. Backend/payment/charger latency must not create a customer no-show. On StartTransaction, mark fulfilled. Credit booking fees to the bill only when that policy is enabled. Allow staff-assisted arrival with an audit trail.
7. **T + 2 min with no valid arrival/start attempt** → server sends `CancelReservation`, booking `expired_no_show`, gun released, no-show fee applied per policy (D-07), the driver is notified.
8. **Driver cancels**: free until `T − policy.FREE_CANCEL_LEAD`; after that, a tiered fee per policy.
9. **Reminders**: push/SMS at T − 30 min and T − 10 min with a one-tap "Navigate" link and a "Running late? Cancel" button.
10. **Server is the source of truth**: timers run in the job queue, not only on the charger. If Reservation is unsupported, Authorize in OCPP 1.6 is not a reliable connector-specific reservation gate and local authorisation may bypass the server. Offer a non-guaranteed queue or staff-managed bay; mark hard reservations unsupported unless another tested model-specific mechanism exists.

### 10.3 Booking settings per site (owner controls)

Enable/disable bookings; which guns are bookable; maximum share of guns bookable at once (keep some walk-in capacity — `PROPOSED 50%`); opening hours; booking fee; no-show fee; slot length options.

### 10.4 Physical occupancy, reassignment and learning

Keep the original ±2-minute window as the UCN founder-decided default, with audited per-site overrides. Report no-shows, late-arrival distribution, successful starts, displaced walk-in revenue and bay turnover. Occupancy may come from plug state, staff check-in or optional sensors; always show source and freshness. Reassignment must check connector type, access, expected shared power and driver acceptance. Never promise a guaranteed physical bay based only on an OCPP reservation. Fleet and public bookings may use different profiles.

---

## 11. PUBLIC NETWORK MAP AND LOCATOR

The public face of UCN — "never worry about finding a charger".

- **Map** (no login needed): every UCN site with live state. Cluster pins when zoomed out. Pin colour + icon + text (never colour alone): **Available**, **In use**, **Reserved soon**, **Out of service**, **Offline**, **Never connected**.
- **Site card**: name, photos, address, distance, opening hours, amenities (toilets, café, Wi-Fi, security, shade), **per-charger and per-gun status** ("Charger 1: GB/T available · CCS2 in use, ~18 min left"), gun types, power, **price per kWh now** and at other times, idle-fee rule, parking fee, booking available yes/no, rating.
- **Filters**: connector type (GB/T / CCS2 / Type 2), minimum power, available now, bookable, open now, price ceiling, amenities.
- **Search**: by name, area, road.
- **Directions**: one tap to Google Maps.
- **Estimated wait**: from live sessions (SoC and power) — "free in about 12 min". Shown as an estimate, never as a promise.
- **Verified badge** for sites that meet UZA's standards (tested service performance, response process and reviewed applicable documents; criteria/version/date visible, not a regulatory certification).
- **Report a problem** from the map (photo + description) without an account (phone number + OTP).
- **Share link** for each site; embeddable map widget for partners' own websites.
- Data freshness shown: "Updated 20 s ago". If a site is offline, say so.
- A site appears on the map only when its owner enables "Public on UCN" and its required compliance documents are reviewed under the applicable verified requirements (Section 15).

---

## 27. DRIVER EXPERIENCE, FLEET DEMAND AND RETENTION

### 27.1 Core driver journey
Find a compatible/open site → inspect price and reliable availability → arrive/scan/tap → authorise payment → receive clear start outcome → charge → stop → receipt/refund status. No compulsory app for ad-hoc charging. Require login/OTP only when the action needs it; minimise repeated entry.

Provide plain failure recovery: pending payment, no charging start, incompatible gun, occupied bay, lost connection, stop delayed and refund pending. Each explains next action and a session-linked support route. Published prices include total applicable components and the distinction between estimated time and guaranteed service. Record map freshness and unknown availability. Support screen readers, readable contrast and text alongside colour; test native Kinyarwanda comprehension with drivers.

### 27.2 Fleet workspace
Fleet companies may use prepaid or separately approved postpaid credit. Configure vehicles/drivers, cards, authorisation, per-session/day/month budgets, site/time restrictions, reporting rights, invoice period and funding responsibility. A phone or plate is not proof of vehicle identity; verified hardware identity is optional with disclosed confidence.

Allocations restrict an existing funded fleet balance; they do not create money. Postpaid credit has signed terms, limit, reviewer, ageing, suspend-new-start policy and collections workflow. Existing charging stops only under its safety/payment rules. Fleet booking schedules are demand plans, not proof of a guaranteed bay.

Link prospective fleet commitments, charging windows and anticipated kWh to demand planning. Separate signed commitments from verbal interest and forecasts. Show actual consumption against commitments and utilisation of discounts; never promise vehicle deliveries create guaranteed station demand without an agreement.

### 27.3 Measured growth tools
- First-to-second charge conversion, repeat rate, cohort retention and payment/start abandonment.
- Search demand, unavailable compatible connectors, queues and turned-away attempts; count only observable events and disclose partial coverage.
- Campaign owner, budget, eligibility, effective dates, caps, fraud rules and consent-based messaging. Compare incremental contribution after discounts, fees and service costs; avoid attributing all repeat sessions to a coupon.
- Loyalty credit is a separately tracked promotional liability/expense with disclosed eligibility and expiry, never mixed invisibly with cash credit.
- Optional anonymised regional planning and route coverage with minimum aggregation size and owner permissions. No rival customer-list sharing.
