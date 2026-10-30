# Site planning, energy boundaries, load management and battery insights

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Section 28**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches site feasibility and project workspaces, energy metering boundaries and reconciliation, load management and fail-safe behaviour, or battery and environmental insights.*
*One topic, one home (core §0 rule 7): if a rule in this section changes, edit it here and nowhere else.*

---

## 28. SITE PLANNING AND ENERGY MANAGEMENT

### 28.1 Feasibility before investment
Create a project workspace with land rights/lease, public access, parking/turnover, security, opening hours, nearby fleet demand, grid capacity/connection lead and cost, tariff, competing capacity, expansion land, equipment, civil works, transformer, permits, service team and funding readiness. Each input has evidence, date, owner and confidence. Planning assumptions do not become live operating readings.

Compare candidate configurations and phased investment, including charger/cabinet power sharing, compatible gun mix, transformer/grid limits, site loads, solar area/yield and BESS use. An electrical professional validates design, kVA/kW/power factor, protections and cable limits; software recommendations are not installation approval. Include imported hardware/logistics, spares, connectivity, warranty support and replacement reserves in costs.

Connect approved project milestones: feasibility → design → permits/grid → procurement → installation → commissioning → go-live → measured review. Compare actual construction and operation with the approved baseline. Recommend expansion only when evidence identifies the bottleneck and affordable grid/site capacity.

### 28.2 Energy boundaries and reconciliation
Synchronise meter clocks/intervals, units, direction and boundaries. Illustrative bus balance:
`grid import + metered PV generation + battery discharge = charger input + other site loads + battery charge + grid export + measured/estimated residual`.

Compute charger conversion loss from metered charger input versus delivered vehicle energy; storage loss from storage boundary measurements; whole-site residual separately. Do not subtract both charger input and vehicle output in one balance. Meter positions determine whether a loss is already included. Missing PV/storage/other-load meters make a true loss percentage unavailable; present a partial balance and unknown residual, not an invented efficiency.

Solar/storage avoided cost compares a declared counterfactual with actual grid expenditure and storage/PV operating costs. Include battery cycling/degradation and replacement assumptions. Do not claim capacity-charge savings if the actual utility tariff lacks those charges. Energy/impact forecasts retain weather/yield assumptions and scenario sensitivity.

### 28.3 Load management and fail-safe behaviour
Enforce site, cabinet, connector, transformer and phase limits as applicable. A grid kVA limit cannot be treated as kW without validated power factor and other loads. Native electrical protection remains authoritative during platform/network failure. Configure local fallback, minimum vehicle power, fairness/priorities, customer disclosure and restore ramp. Use only tested charger/EMS functions; log requested and observed limits.

Advanced allocation optimises cost and demand within that envelope, including fleet departure needs, PV surplus, storage SoC and reserve. V2G/bidirectional charging is a separate capability requiring compatible vehicles/hardware, utility arrangements and validation; a shared vendor name does not establish support.

### 28.4 Battery and environmental insights
Present reported SoC, charging curves, temperatures and anomalies with source, coverage and limitations. Battery state-of-health, certified used-EV scoring or financing eligibility requires separate validated diagnostic evidence and an approved methodology. Keep research insights out of authoritative credit decisions until that gate passes.

Impact reports can include metered energy, service availability, utilisation, jobs/training and estimated emissions with methodology, factor source/year, baseline and uncertainty. Renewable claims and avoided emissions must not be double-counted across owner, investor and grant reports.
