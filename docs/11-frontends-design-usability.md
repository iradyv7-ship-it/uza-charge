# Frontend apps, design system, languages and usability acceptance

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 13, 19.3–19.4 and 32.1**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches any of the five frontend apps, the design system and tokens, languages and i18n, or practical usability testing.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 13. THE FRONTEND APPS

### 13.1 Driver app + public map (`uza-charge-driver`, PWA)
Map & locator (Section 11) · scan to charge · bookings · live session · wallet (balance, top-up, history, withdraw) · UZA cards (link, block, replace, limits) · vehicles (plate, model, VIN optional, default vehicle) · history and receipts · ratings · complaints and fault reports with status tracking · favourites · help/FAQ and how-to-charge guides · profile, language, notifications, account deletion. Installable, works on weak data, minimal JavaScript on the scan-to-charge path (must load fast from a QR scan on 3G).

### 13.2 Owner portal (`uza-charge-owner`)
Section 12, plus onboarding wizard (Section 17.6).

### 13.3 UZA Control Room (`uza-charge-control`)
- **NOC**: network-wide live board (uptime headline first), alarms queue, all chargers, all sessions, abnormal-session queue, command console, raw OCPP message viewer per charger (filter, search, export), vendor error dictionary, firmware library and rollout campaigns.
- **Incidents & field service** (Section 14).
- **Finance**: ledger explorer, reconciliation, payouts and float, refunds approval, subscription billing, invoices, revenue reports by model A/B/C.
- **Support**: driver/owner lookup, session disputes, card management, complaint queue with RURA timers.
- **Network admin**: owners/tenants, contracts and fee terms, sites, compliance documents, card inventory, promotions, versioned configuration viewer (read-only, shows decision status and source), feature flags, audit log.
- **Regulatory**: RURA report generator and submission log (Section 15).
- **Network analytics**: total sessions, kWh, GMV, active drivers, sites, uptime, utilisation, growth — for UZA management, grants and investors (real data only).

### 13.4 Technician app (`uza-charge-tech`, PWA, offline-tolerant)
Assigned job cards, site checklists (commissioning, preventive maintenance, earthing test, fire safety check), live charger diagnostics and remote commands permitted to technicians, photos before/after, parts used (from stock), time on site, customer/owner sign-off, sync when back online.

### 13.5 Agent app (`uza-charge-agent`, PWA, Android-first)
Sell and activate cards (scan the printed QR or type the card number by default; optional Web NFC serial-number lookup on tested Android devices — Section 8.3.3), cash top-ups against the agent's float, voucher sales, balance check for a customer's card, block a lost card, receipts by SMS, float balance and top-up of float by MoMo, daily reconciliation, commission earned. Works on a cheap Android phone; every cash action requires the driver's OTP or the agent's PIN.

### 13.6 Platform admin (inside `uza-charge-control`, UZA super-admins only)
Create and configure networks, country and regulatory packs, licences and entitlements, usage metering and platform invoices, roaming agreements and clearing, private-deployment licence keys, demo network and sandboxes, platform health.

---

## 19. DESIGN AND LANGUAGES (part)

### 19.3 Design (match UZA Mobility)
- "Quiet institutional confidence": infrastructure-grade, clean grid, generous whitespace, restrained motion.
- UCN theme: brand palette and Syne headings matched to approved UZA Mobility assets (off-white canvas, deep forest green, lime accent). All colours as HSL CSS variables + semantic Tailwind tokens; dark mode mandatory (the NOC Control Room defaults to dark).
- **Every measured value (kW, kWh, RWF, %, °C, V, A) in tabular monospace figures** — numbers are the hero.
- Status: GREEN available/on track · AMBER at risk/reserved · RED faulted/blocked · GREY offline/never connected — always with icon and text, never colour alone. WCAG AA.
- shadcn/ui, lucide-react icons, no emoji as UI icons.
- RWF formatted `RWF 22,500,000`. UCN dates `06 Oct 2026, 14:30` (Africa/Kigali time); other networks use configured locale/timezone. Store UTC and retain event timezone context. Support daylight-saving transitions where relevant; 48 half-hour labels are not a universal UTC-day model.
- Every view handles loading, error and empty states honestly.

### 19.4 Languages
- English-first build with i18n fully scaffolded (no hard-coded copy). **Driver-facing flows Kinyarwanda-first** at launch; French after.
- Kinyarwanda copy written natively and **reviewed by the founder** — never machine-translated in production.

---

## 32. PRODUCT ACCEPTANCE (part)

### 32.1 Practical usability tests
Observe drivers, station owners, cash agents, technicians and investors on representative phones/connectivity. Proposed targets become approved acceptance thresholds after baseline testing:
- Driver understands total price and starts without mandatory installation; pending payments have a clear remedy.
- Owner finds a fault, understands payout status and assigns follow-up without interpreting OCPP codes.
- Agent activates through QR/manual fallback and cannot exceed float or double-credit after a retry.
- Investor identifies invested capital, personal entitlement, paid distributions and report gaps without confusing them with station sales.
- Technician records work offline and syncs without duplicating parts usage or overwriting another diagnosis.

Test time to complete, success/error rate, support requests and native-language comprehension. Retain pilot findings and adjustments; attractive screens alone do not pass.
