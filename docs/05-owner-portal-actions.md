# Owner portal, reports, P&L, action centre, automation and notifications

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Sections 12, 24 and 16**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches the owner portal, reporting, the P&L and cost book, the action centre, controlled automation or notifications.*
*One topic, one home (core §0 rule 7): if a rule in these sections changes, edit it here and nowhere else.*

---

## 12. OWNER PORTAL — RUN THE BUSINESS WITHOUT VISITING

The product we sell. Must work on a phone first, desktop second. Every number in monospace/tabular figures.

### 12.1 Home (today at a glance and action centre)

- Live tiles: guns charging now / available / faulted / offline; kW being delivered right now; today's sessions, kWh, gross revenue, net to owner; uptime today; open incidents.
- Live site map with each charger's state.
- Action centre: prioritised by safety, customer impact, money exposure, deadline and age. Each item shows evidence, impact, assignee, next action and resolution state. Correlate site-wide faults into one parent incident (Section 24).

### 12.2 Live view per site / charger / gun

- Charger page: identity (brand, model, serial, firmware, SIM), Data Capability Score, connection status and history, current configuration, each gun's live state.
- Gun page: live session (kW, kWh, SoC, voltage, current, temperature, cost so far, driver type — never personal data to owner staff without permission), power curve chart, last 20 sessions, faults.
- **Remote controls** (permission-checked, confirmed, audited): Remote start (for a cash customer), Remote stop, Unlock connector, Soft reset, Hard reset, Make unavailable / available, Trigger status, Request diagnostics, Update firmware (owner admin or UZA only), Change price.

### 12.3 Reports (all filterable by period, site, charger, gun; all exportable to PDF/Excel/CSV)

**Activity**
- Sessions (count), unique drivers, returning drivers, new drivers
- kWh delivered — by hour, day, week, month, tariff tier, gun, connector type
- Average kWh, duration, power per session; charging curves
- Busy-hours heatmap (hour × weekday)
- Failed starts (count, reasons), abandoned sessions

**Asset performance**
- **Utilisation:** publish both charging time ÷ scheduled service time and charging time ÷ technically serviceable time. Fix denominators by metric version; downtime must not artificially improve headline utilisation
- **Occupancy:** evidence-based occupied time ÷ scheduled service time; source and unknown time shown separately. Idle occupancy uses validated completion evidence, not presumed battery fullness
- Actual delivered power vs rated power, per vehicle type
- Revenue per gun, per kW installed, per hour available

**Reliability (RURA Art. 26)**
- Uptime % per charger, site, month (definition in 15.1) vs 97% minimum
- Faults by code, frequency, duration; mean time between failures; mean time to repair; repairs over 24 h
- Offline periods; estimated lost contribution margin using comparable demand periods, spare capacity and displaced sessions. Label assumptions and confidence; historical averages are estimates, not measured lost sales

**Energy**
- Energy reconciliation using complete, aligned meter boundaries: grid/PV/storage flows, other loads and delivered charging energy. Separate physical conversion/storage losses from unknown residuals and incomplete meters (Section 28)
- Energy by tariff tier (time-of-use)
- Solar sites: PV produced, self-consumed, battery in/out, grid import (when EMS connected)
- Power factor and grid quality evidence (where measured)

**Customers**
- Payment method mix (MoMo, Airtel, card, cash, fleet)
- Vehicle mix and arrival/departure SoC (where reported)
- Ratings and complaints

**Money**
- Gross revenue by component (energy, service, idle, booking fees)
- Discounts and refunds
- Settlement split: payment fees, UZA fees, host share, VAT, levy, owner net
- Payouts: sent, pending, failed; settlement statements

**Benchmark (opt-in, anonymised)**
- "Your utilisation vs UCN network median", "your uptime vs network", "your price vs area average". A strong reason for owners to join and stay.

### 12.4 Profit & Loss (monthly, with year-to-date and since-start)

| Line | Source label |
|---|---|
| Charging revenue (energy + service), net of collected tax where applicable | Calculated from metered energy, tariff and invoice evidence |
| Idle, booking and no-show fees | Measured |
| Less discounts and refunds | Measured |
| **Net revenue** | Calculated |
| Electricity cost (REG) — from site meter × owner's REG tariff, or uploaded REG bill | Measured / Entered |
| Payment provider fees | Measured |
| UZA fees (subscription, network fee, management fee) | Calculated |
| Host share / site rent | Calculated / Entered |
| RURA levy, other regulatory fees | Calculated |
| **Gross margin** | Calculated |
| Maintenance and spare parts (linked to job cards) | Entered / Measured |
| Staff, security, cleaning | Entered |
| Insurance | Entered |
| Connectivity (SIM data) | Entered |
| Other operating costs | Entered |
| **EBITDA** | Calculated |
| Depreciation (equipment cost ÷ useful life, per policy or owner input) | Calculated from Entered |
| Loan interest | Entered |
| **Net profit (before income tax)** | Calculated |

**Investment view:** link to Section 25: committed/paid/deployed capital, station economics, investor-specific entitlements, distributions and forecast scenarios. Report accounting profit, operating cash flow and investor return separately. Break-even uses contribution margin and fixed costs; if contribution is non-positive, show no finite break-even under the current assumptions. Run-rate payback is an estimate, not a guaranteed date.

**Entered costs** are set once in a **cost book** (recurring monthly items, one-off items, capex with useful life, loan with schedule) and carried forward automatically. Every line shows its label; projections are always labelled as projections.

### 12.5 Scheduled reports and digests

- **Morning digest** (WhatsApp Business / SMS / email, owner's choice, at their chosen time): yesterday's sessions, kWh, gross, net to owner, uptime, faults, top issue, payouts sent.
- **Weekly summary** (Monday) and **monthly pack** (1st of month): P&L PDF, settlement statement, reliability report, RURA report draft.
- **Investor pack** (Model B): monthly PDF for the investor — performance, cash returned, payback progress.

### 12.6 Owner settings

Organisation profile, legal documents, payout accounts (MoMo/Airtel/bank) with OTP verification on change, payout mode, staff and roles, sites, tariffs, booking settings, idle fees, promotions, notification preferences, cost book, subscription and invoices, data export.

---

## 24. OWNER ACTION CENTRE AND CONTROLLED AUTOMATION

The default owner experience answers four questions: **Are my stations working? Where is my money? What needs action? Is the business improving?** Detailed reports sit behind those answers.

### 24.1 Action cards
Each action has category, severity, evidence/freshness, affected sites/customers, estimated impact with assumptions, assignee, next step, deadline, status and audit history. Examples are explanatory templates, never seeded as live facts:
- Repeated failed starts: correlate charger faults/payment attempts, create one incident, assign the responsible team and contact affected drivers under the messaging policy.
- Payout delayed: identify confirmed funds, provider status and next resolution step; do not advise a duplicate transfer.
- Site below break-even: show energy contribution, missing cost inputs and budget variance; offer a cost review or measured demand experiment.
- Capacity constrained: show queues, utilisation, shared cabinet power and grid headroom before suggesting expansion.
- Compliance document due: show reviewed obligation, owner, required evidence and submission status.

Prioritise safety and immediate service disruption first, then funds at risk, deadline breaches and economic opportunities. Suppress duplicate child alerts during a site-level incident; retain full underlying events. Acknowledged does not mean resolved. Record whether the action changed its intended outcome.

### 24.2 Automation levels
| Level | Examples | Control |
|---|---|---|
| Observe/explain | Summaries, trend explanation, evidence links | No side effects; confidence and data gaps visible |
| Routine deterministic workflow | Incident assignment, report generation, due reminders, reconciliation matching | Approved versioned rules, rate limits and audit |
| Bounded operational control | Tested power allocation, authorised prepaid stop, supported soft recovery | Model/site eligibility, local safety envelope, watchdog and rollback |
| Approval-required action | Pricing change, payout-account change, exceptional refund, firmware rollout, investor distribution | Role check, confirmation or maker-checker, scoped command and audit |

AI is optional. It may explain the same validated figures the user can inspect, draft communications and propose actions. It cannot invent readings, compute authoritative ledger balances, certify compliance, infer approved credit or bypass permission controls. Tenant information must not enter another tenant's answers or training data without the approved arrangement. Measure helpfulness, false suggestions and operational benefit before expanding automation.

### 24.3 Workflow and support handoff
Every task has responsible organisation and person, escalation path, response target and accepted handoff. Link internal UZA work to the UZA task/document management system ("DMS" in v2 — confirm which system) through an outbox/webhook integration with acknowledgements and deduplication; the charging incident remains the service record. External operators use their own team or contracted support; joining UCN does not silently appoint UZA as their operator.

---

## 16. NOTIFICATIONS

Channels: in-app, web push (PWA), SMS, WhatsApp Business (`AWAITING CREDENTIALS`), email. Users choose channels per category; critical alerts can't be fully muted for owner admins and NOC.

| Audience | Messages |
|---|---|
| Driver | OTP, payment confirmed (only after API callback), session started, 80%/target reached, session ended + receipt, idle fee starting, booking confirmed/reminders/expired, card blocked, low balance, refund sent, complaint updates |
| Owner | Morning digest, weekly/monthly packs, charger offline/faulted, incident timers, payout sent/failed, price change applied, compliance expiries, new review |
| UZA NOC / finance | All alarms, abnormal sessions, reconciliation mismatches, float low, security events, RURA deadlines |

All templates in English and Kinyarwanda (French later), stored as data, reviewed by the founder before use.
