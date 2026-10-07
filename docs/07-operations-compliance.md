# Operations, incidents, maintenance and RURA compliance

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 14 and 15**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches alarms, incidents, job cards, spare parts, the asset register, firmware rollout, the RURA regulatory pack, licences and permits, or the uptime definition.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 14. OPERATIONS, INCIDENTS AND MAINTENANCE

- **Alarm rules** (configurable, per severity): charger offline > `policy.OFFLINE_ALERT_AFTER`; Faulted status; repeated failed starts; temperature above threshold; abnormal session; meter anomaly; clock drift; firmware failure; security event; site power loss (all chargers offline together).
- **Incident lifecycle**: `open → acknowledged → assigned → on_site → resolved → closed`, with timestamps. Each incident links to charger, gun, alarms, sessions affected, job card, parts, cost.
- **RURA timers built in**: flash report due **1 hour** after an incident affecting service; detailed report due **48 hours** after if downtime > 1 hour; repair target **24 hours**. Countdown visible; escalation to owner and UZA management before breach.
- **Job cards** (also used for UZA's garage-partner structure): problem, diagnosis, actions, parts, technician, times, photos, sign-off.
- **Preventive maintenance** schedules per model (e.g. filter cleaning, cable inspection, earthing test), auto-generated job cards.
- **Spare parts** inventory per location (RURA: spare parts must always be available): stock levels, minimum levels, reorder alerts, parts consumption per charger.
- **Asset register**: every charger, its components, serials, warranty dates, firmware history, maintenance history, meter calibration dates.
- **Firmware management**: upload package per model, staged rollout (1 charger → 10% → all), automatic halt on failures.
- **Who does what by model**: Model A and B incidents go to the UZA NOC and UZA technicians; Model C incidents go to the owner's own team, with "Request UZA technician" as a paid option.

---

## 15. RURA COMPLIANCE MODULE (Regulation No 011/ENERGY/RURA/2026)

**Evidence status (v2.1): `VERIFIED_EXTERNAL` — source document held.** The founder supplied the regulation text: *Regulations No 011/ENERGY/RURA/2026 governing electric vehicle charging infrastructure and battery swapping stations*, approved by the RURA Regulatory Board on 23/06/2026 and signed on 29/06/2026 by the Chairperson of the Regulatory Board (Dr Carpophore Ntagungira). Per Art. 39 it entered into force on signature. Every article and number below was taken from that text. Store the copy at `docs/evidence/rura-011-2026.pdf` and reference it from every rule in the Rwanda regulatory pack.

What is verified and what is not:
- **Verified (from the text):** obligations, deadlines and technical thresholds in the table and in `src/config/policy.ts` keys marked `VERIFIED_EXTERNAL`.
- **Still `PENDING_VERIFICATION`:** (1) the turnover levy *rate* (Art. 18(2) defers it to a separate Regulatory Board Decision); (2) RURA's report template and frequency (Art. 25(3) "as prescribed by the Authority"); (3) whether any uptime exclusions are accepted (the regulation is silent); (4) how RURA treats Model B managed sites (who is licensee — D-04).
- **Per-site applicability** is still a reviewed step: the obligations differ by category (public station — Annex I; public point on private property — Annex II; battery swapping — Annex III; private/home use — registration only, Arts. 5, 15, 17). The site's category is recorded with reviewer and date before its rules activate.
- Compliance support is a product feature. Software helps an operator meet and evidence obligations; it does not guarantee a licence or replace inspection. Never market "RURA-compliant out of the box".

| Article | Obligation (from the text) | Feature |
|---|---|---|
| Art. 4, 6 | Commercial operation of public stations, public points on private property and charging battery-swap stations needs a RURA licence, **issued per site** | Site licence record: category, number, issue date, licensee entity, document upload; site cannot go live commercially without it |
| Art. 5, 15, 17 | Private-use, home-use and non-charging swap: registration, not licence (utility notification / grid approval) | Category "private/fleet" with registration record; no public listing |
| Art. 7–8, Annex IV–V | Construction permit (greenfield) or non-objection (existing premises) from CoK/District; documents: land title/lease, RDB trade registration **listing EV charging as an activity**, ESIA (greenfield, RDB), project design, grid connection approval (REG/EUCL), equipment type approval/conformity certificate (RSB); occupation permit after works; then RURA licence | **Permit checklist per site** in that order, with document vault, issuer, status, expiry, responsible person |
| Art. 9, 11 | Permitted locations (roads/corridors, petrol stations, parking, transport hubs, tourism sites, events; malls, hotels, offices, private parking, residential) | Location type field; checklist adapts |
| Art. 18 | No application/licence fee now (RURA may introduce later); regulatory fee on annual turnover per Board Decision | Levy accrual engine **disabled** until the rate is obtained (`RURA_TURNOVER_LEVY` = null) |
| Art. 19 | Licence valid 5 years; lapses if operations don't start within 6 months of issue | Expiry tracking; alert if no commercial session within the start window |
| Art. 20 | Renewal application ≥ 180 days before expiry; subject to business viability assessment on **audited financial statements** | Reminders at 240/200/180 days; financial pack export |
| Art. 21, 25(5) | Transfer/sale/lease of licensed assets or activities needs prior written approval | Ownership-change workflow blocks until approval recorded |
| Art. 23 | Public stations must have smart charging: load balancing and peak management, remote monitoring and control, demand response where required | Remote control (Phase 1), site power caps (Phase 1, for safety), demand-response command log and load engine (Phase 3) |
| Art. 24 | Equipment must meet RSB standards; RICA market surveillance and verification of import certificates | Equipment conformity documents per charger model in the compatibility directory |
| Art. 25(2)(3) | Accurate records; technical, operational and financial reports in the form/frequency RURA prescribes | Permanent records; **report generator** with configurable template until RURA publishes one |
| Art. 25(6)(7), 36(3)(4) | Notify before relocation; approval before material changes; utility approval before load/capacity changes; RWF 1,000,000 fine for unapproved expansion or relocation | Adding a charger or raising capacity triggers "RURA + REG approval required" before it can go live |
| Art. 25(8) | Incident affecting service: flash report within **1 hour**; detailed report within **48 hours** if downtime > 1 hour or RURA requires (cause, impact, corrective actions, mitigation) | Incident timers, prefilled report templates, submission log |
| Art. 26 | **≥ 97% charger uptime** around the clock; **repair ≤ 24 h**; spare parts always available; defective batteries handled per environmental law; **complaints resolved ≤ 24 h** (or status update where investigation is needed); swap wait ≤ 20 min | Uptime engine (15.1), repair timers, spare-parts minimums, e-waste log, complaint timers |
| Art. 27 | Tariffs fair, transparent, non-discriminatory, cost-reflective; **displayed at the facility**; accurate billing and transaction records; billing dispute mechanism | Price shown before start, on map and on-site QR page; receipts; dispute workflow |
| Art. 28 | Accessible complaint mechanism; users informed of channels; escalation to RURA; complaint records submitted on request | Complaint module with full history and export |
| Art. 30 | Announced and unannounced inspections; waste/decommissioning monitoring even after licence expiry | One-click **inspection pack** per site |
| Art. 31–33, 35 | Suspension/revocation grounds and procedure; appeals to DG then Board | Regulatory correspondence log per site |
| Art. 34, 36(5) | Surrender: written notice ≥ 180 days with reasons, timeline and transition plan (customer credits, subscriptions); cessation without 6 months' notice: RWF 1,000,000 fine | Decommission workflow; customer-balance settlement plan |
| Art. 36(1)(6) | Operating without licence, or converting a free station to commercial without licence: RWF 1,000,000 fine | Commercial charging blocked on sites without a recorded licence |
| Art. 37 | Operators existing before the regulation: comply within 12 months (by end of June 2027) | Onboarding gap-analysis for new SaaS customers with deadline |
| Annex I (public stations) | Zoning per master plan; parking slot 2.5 m × 5 m; paved, with offices, grab-and-go retail and toilets incl. accessible; MV 15/30 kV or LV 400/230 V ±10%, 50 Hz ±1%; **power factor ≥ 0.9**; **THD < 3%**; **at least one DC system ≥ 50 kW per gun**; shared cabinets need sufficient capacity + dynamic load management; **at least two most prevalent charging technologies**; RSB standards; utility approval; earthing **< 5 Ω**, surge/lightning protection; fire safety and emergency shutoff; first aid, signage, emergency plan, security; OHS-trained staff with PPE; environmental/social and waste plans; **class 1 (≤ ±1%) certified tamper-proof meters, recalibrated at least every 5 years** | Site/asset checklists with due dates and evidence: amenities, electrical tests, power-quality evidence, calibration certificates, training records, plan uploads. Note: the Wicen order form lists meter accuracy "Level 2.0" — fails class 1 until corrected |
| Annex II (public points on private property) | As Annex I for electrical, safety, environmental and metering; **no amenities requirement**; designated parking | Lighter checklist variant |
| Annex III (swap stations) | Location, parking for 5 motorcycles, 1.2 m bay spacing, 10 m separation at petrol stations, ventilation/AC | Checklist variant (not in current UZA scope) |

### 15.1 Uptime definition (write it down, compute it the same way everywhere)

`Uptime % = (minutes in period − minutes Unavailable/Faulted/Offline attributable to the operator) ÷ minutes in period × 100`, per connector, aggregated to charger and site by time-weighted average. The 97% threshold is verified (Art. 26(a)); the regulation says "around the clock" and names no exclusions. Until RURA confirms any exclusion (e.g. proven grid outage, announced maintenance), report **raw uptime as the compliance figure** and show any adjusted uptime separately and clearly labelled. Unknown observation periods are shown as unknown, never as up (see Section 30.2).

### 15.2 Regulatory fees

Art. 18(1): no application or licence fees at present; RURA may introduce them later after consultation. Art. 18(2): licensees pay regulatory fees on annual turnover per a separate Regulatory Board Decision. Obtain that decision before enabling any levy accrual; record the leviable base, licensee, effective period and source. Until then, the levy line in reports reads "Rate not yet confirmed — not accrued".
