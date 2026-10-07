# Evidence vault — source documents for `VERIFIED_EXTERNAL` rules

*Referenced by [`../13-configuration.md`](../13-configuration.md) (§19.5) and [`../07-operations-compliance.md`](../07-operations-compliance.md) (§15).*

A configuration value may carry status `VERIFIED_EXTERNAL` **only** when the source document that establishes it is stored here and named in the value's `source` field. `assertUsableInProduction()` in [`../../src/config/policy.ts`](../../src/config/policy.ts) rejects a `VERIFIED_EXTERNAL` value whose `source` is missing.

A founder decision never verifies a regulation (core §0 rule 3). `FOUNDER_DECIDED` values need no document here.

## Expected documents

| File | Document | Status |
|---|---|---|
| `rura-011-2026.pdf` | Regulations No 011/ENERGY/RURA/2026 governing electric vehicle charging infrastructure and battery swapping stations. Board approval 23/06/2026; signed 29/06/2026 by the Chairperson of the Regulatory Board (Dr Carpophore Ntagungira); in force on signature per Art. 39. | **NOT YET IN THIS REPO** — the founder holds the text (§15 was written from it). Add the PDF before any RURA rule is relied on in production. |

## Still to obtain (each blocks the capability named, not the whole release)

| Evidence | Authority | Blocks |
|---|---|---|
| Turnover levy **rate** (Art. 18(2) Regulatory Board Decision) | RURA | Levy accrual engine — `RURA_TURNOVER_LEVY_BPS` stays `null`, reports read "Rate not yet confirmed — not accrued" (§15.2) |
| Report template and frequency (Art. 25(3)) | RURA | Fixed RURA report format; configurable generator until then |
| Whether any uptime exclusions are accepted | RURA | Adjusted uptime as a compliance figure; raw uptime is reported meanwhile (§15.1) |
| Model B licensee treatment (who is licensee) | RURA | D-04, seller of record, VAT and levy attribution |
| Stored value across independent owners; payment aggregation; card KYC levels; dormant balances | BNR | Card spending at third-party sites (`feature.networkWallet`), fund-holder model D-16 (§8.3.9) |
| EBM invoicing and seller of record | RRA | Tax invoices — receipts only until then (§7.5) |
| Personal-data hosting outside Rwanda | NCSA | Any offshore hosting (core §5.5) |
| Charger type approval / conformity for the Wicen units | RSB | Equipment conformity record; note the order form's "Level 2.0" meter accuracy fails Annex I class 1 (§15) |
| MTN MoMo and Airtel Money production credentials | MTN / Airtel | Every payment rail — all `AWAITING CREDENTIALS` (§8.1) |

Record each arrival in [`../../OPEN_QUESTIONS.md`](../../OPEN_QUESTIONS.md) and set the value's `source`, reviewer and effective date in the configuration registry.
