# Investor, lender and portfolio workspace; financial close

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Section 25**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches investment records, capital stages, distributions and waterfalls, investor reporting, forecasting, portfolio views or month-end financial close.*
*One topic, one home (core §0 rule 7): if a rule in this section changes, edit it here and nowhere else.*

---

## 25. INVESTOR, LENDER AND PORTFOLIO WORKSPACE

Investors receive a clear view of assets, agreements, performance and their own cash entitlement. One owner may have several investors with different rights; one investor may participate across owners or sites. Read access does not confer operating authority or ownership.

### 25.1 Investment records
Record investment vehicle/legal entity, linked assets, investor identity, instrument (equity, debt, revenue/profit share, equipment lease or grant), currency, committed capital, drawdowns paid, deployed expenditure, ownership/entitlement terms, effective contract, term, distribution frequency, reserve requirements, approval rights and permitted reporting access. Store reviewed agreements; percentages alone are not a complete distribution contract.

Capital stages: committed → called → received → allocated → deployed. Link expenditure to supplier invoice, payment, asset and commissioning evidence; retain pending liabilities and unspent cash. Grant restrictions and debt/equity funding remain separately identifiable.

### 25.2 Three distinct financial views
| View | Includes | Avoid |
|---|---|---|
| Station operating performance | Net revenue, energy cost, site expenses, EBITDA, depreciation, interest, applicable tax | Treating gross collections/VAT as profit |
| Station cash flow | Operating receipts/payments, working capital, capex, debt principal/interest, reserves and available cash | Treating depreciation as a cash payment or principal as P&L expense |
| Investor return | Contractual entitlement, approved distribution, paid cash, remaining claim and scenario returns | Equating station profit to investor money received |

Allocate shared staff, NOC, platform, insurance and multi-site costs through a versioned disclosed method; distinguish cash paid, accrued expense and missing cost. Include transformer/grid connection, civil works, charger installation, meters, permits, professional fees, communications, rent/deposit, solar/BESS and commissioning in the applicable investment budget.

### 25.3 Distributions and controls
Create a contract-specific waterfall with eligible distributable cash, taxes/liabilities, maintenance reserve, debt obligations, agreed fees and investor allocations. Represent preferred returns, capital recovery or priority tiers only when present in the reviewed agreement. Enforce percentages/tier consistency and detect insufficient funds. Maker creates draft distribution → reviewer approves → reserved liability → confirmed payout. An investor payment is traceable to its period, agreement, calculation and provider evidence. Reversals and corrections are new entries.

Do not provide public investment solicitation, tradable ownership tokens, secondary trading or automated securities issuance under this module. Such products require a separately approved scope and applicable authorisations. This workspace records existing private agreements and reporting rights.

### 25.4 Performance, forecasting and portfolio
- Budget versus actual sessions, energy, revenue, contribution, operating cash flow and distributions.
- Capital returned to date with an explicit definition; report total distributions separately when they include income and capital.
- Payback, investor cash-on-cash return, NPV/IRR and debt-service coverage where appropriate. Show formula/version, cash-flow dates, currency and assumptions. Multiple/no IRR solutions or non-positive debt-service denominator are reported honestly.
- Conservative/base/growth scenarios for demand ramp, downtime, tariff, grid/energy cost, fees, opex, capex, replacement, financing, solar yield and battery degradation. Do not assume a constant run-rate indefinitely or guarantee forecast returns.
- Distinguish observed, estimated and scenario inputs; forecast date, history length and sensitivity visible. Prevent double-counting tariff revenue, solar savings or subsidies.
- Portfolio totals by site, owner, instrument and risk. Do not add different currencies without a disclosed exchange-rate source and date. Preserve native-currency results; FX forecasts remain assumptions.
- Restricted document room: contracts, title/lease, invoices, warranty, insurance, commissioning tests, approved licences, financial packs, budgets and investment decisions. Record missing/expired evidence and access.
- Lender views are granted separately and limited to authorised loan/site evidence; no automatic driver-level financial access.

### 25.5 Financial close and confidence
Month-end checklist: sessions final/provisional, provider reconciliation, cash/agent float, owner payouts, refunds/disputes, electricity bills, costs/accruals, tax/levy treatment and contract allocations. Snapshot approved reports with version, reviewer and data cutoff. Late invoices or telemetry create a new snapshot with a reconciliation bridge, never silently alter an already distributed pack.

Show a completeness checklist: source coverage, missing bills/costs, provisional sessions, unmatched funds and stale meters. A pack with missing expenses cannot label its profit fully final. Acceptance: a reviewer follows a sampled investor distribution back through contract terms, ledger, payment and session evidence; cross-investor/owner access tests pass.
