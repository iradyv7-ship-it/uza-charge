# Versioned configuration and decision provenance

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Section 19.5**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module whenever the sprint reads, adds or changes a business rule value, a status, a source reference or an override.*
*Seed file: [`../src/config/policy.ts`](../src/config/policy.ts). Evidence: [`evidence/`](evidence/).*
*One topic, one home (core §0 rule 7): if a rule in this section changes, edit it here and nowhere else.*

---

## 19. CONFIGURATION (part)

### 19.5 Versioned configuration and decision provenance

Defaults, types, statuses and validation live in **`src/config/policy.ts`** (shipped with this document set — use it as the seed file). Production values live in approved, versioned configuration records. Resolution order: platform safety constraints → country/regulatory pack → network → contract/owner → permitted site override. Overrides cannot weaken a value marked `mandatory`. Sessions pin their resolved billing rules; investment and payout calculations pin contract versions.

Each value carries key, type, unit or currency, scope, value, status, source reference, decision/reviewer, effective dates, version and permitted override range. Statuses:
- `FOUNDER_DECIDED` — UZA product choice; not an external verification.
- `PROPOSED` — engineering/commercial placeholder; test environments only until an approved registry record exists.
- `VERIFIED_EXTERNAL` — regulator/provider rule with the source document retained (e.g. the RURA regulation, Section 15).
- `PENDING_VERIFICATION` — outside claim awaiting authoritative evidence; never drives production behaviour.

Rules: `null` means unknown, never zero — the dependent feature stays disabled and shows a setup task. Money keys are currency-neutral `*_AMOUNT` with explicit currency. `POLICY_KEY_MIGRATION` maps every v1.1 key; referencing an unknown key fails CI. `assertUsableInProduction()` blocks nulls, pending values and "verified" values without a source. A regulatory pack needs a source document and reviewer for each activated rule. Store superseded rules; never alter historical reporting retroactively.

Still to add as the relevant modules are built (keys exist as `null` placeholders where known): billing rounding and energy precision, stop-latency bounds per model, overrun liability, time-quality fallback, booking start grace and turnover, completion/occupancy evidence, report close tolerance, provider resolution timeout, maker-checker thresholds, support-access expiry, retention schedule, recovery objectives, offline allowance and expiry, snapshot completeness, distribution reserves and approvals, funded roaming credit cap.
