# UZA Charge Master Build Prompt — Changelog

*Core: [`../CLAUDE.md`](../CLAUDE.md). Version changes record scope, reason, reviewer and evidence (§33.3).*

## v2.1 addendum — 25 October 2026
**Addition:** new module `docs/16-benchmark-competitive-offer.md` (Section 34), written from a hosted Chinese CPMS feature list (`docs/incoming/Benchmark.xlsx`, 82 features) and that vendor's pricing offer. Records a feature-by-feature comparison against the spec, the rebuild and the prototype; 21 additions (A-1–A-21), each phase-gated under Section 20; seven deliberate differences; the definition of a sellable working model; Rwanda positioning and pricing reference for D-02/D-03/D-13. No existing rule changed. New open question Q-09. Reviewer: founder (pending).

## v2.1 — 7 October 2026
Base: v2.0 (7 Oct 2026). All v2.0 content retained unless listed here.

**Corrections**
- **RURA (Section 15, `policy.ts`):** v2.0 marked every RURA rule `PENDING_VERIFICATION`, stating the official text had not been verified. The founder supplied the regulation (No 011/ENERGY/RURA/2026, Board approval 23/06/2026, signed 29/06/2026). Section 15 is rewritten from the text, with article-level mapping, and the rules are now `VERIFIED_EXTERNAL` with the PDF in `docs/evidence/`. Added obligations v2.0 lacked: per-site licensing (Art. 4), RDB trade registration must list EV charging (Art. 8), Annex I minimum 50 kW DC per gun and two charging technologies, amenities for public stations, the RWF 1,000,000 fines (Art. 36), the 12-month transition (Art. 37), and the Wicen class-2 meter conflict. Still pending: levy rate, report template, uptime exclusions, Model B licensee treatment.
- **Phase 1 gate (Section 20):** 97% availability now cites RURA Art. 26(a) as verified raw uptime.
- **Card activation (Sections 8.3.3, 13.5):** removed the contradiction between the two sections. QR/manual is the default; Web NFC is an optional, device-tested serial-number lookup; it cannot provision DESFire keys.
- **Team (Section 20):** flagged as PROPOSED. Abijuru is on record as the website designer; role to be confirmed. Scorah, Tresor, Kagabo and "DMS" carried from v2.0 for founder confirmation.

**Restructure**
- Split into `CLAUDE.md` (core, loaded every session) + 15 module files in `docs/`, loaded per sprint. Section numbers kept as stable IDs so cross-references stay valid.
- Additions that v2.0 placed after the sprint prompt were moved to their home topics: 32.2 → data model (18.1); 33.1 → founder decisions (21); 32.1 → frontends/usability; 32.3 → release tests; 30.1 → gateway module; 26 → gateway module; 24 → owner portal; 29 and 31 → platform module. The sprint prompt is now its own file.
- New rule (Section 0, item 7): one topic, one home — no partial duplicate rules in other files.

**Configuration**
- `src/config/policy.ts` restored as typed code: four statuses, unit, currency, scope, source, mandatory flag, override ranges; `null` = unknown; v1.1 → v2.1 key migration map (`POLICY_KEY_MIGRATION`); `assertUsableInProduction()` guard. The v1.1 fixed stop margin and offline balance threshold are marked REMOVED. All `policy.*` references in the documents updated to the new key names. Typechecks under `tsc --strict`.

## v2.0 — 7 October 2026 (earlier the same day)
External revision of v1.1: investor workspace, action centre, migration/compatibility directory, energy boundaries, operator neutrality, commercial evidence register; corrected stop reserve, offline authorisation, card security, payout states, reservation and occupancy evidence.

## v1.1 — 7 October 2026
Sell/lease productisation, bank-free routes, NFC card programme.

## v1.0 — 6 October 2026
Initial build specification.
