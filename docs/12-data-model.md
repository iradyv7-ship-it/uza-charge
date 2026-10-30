# Data model — core entities and extensions

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Section 18** (including the former Section 32.2, now 18.1).*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module whenever the sprint adds or changes a table, a relationship, a scope column or a money column.*
*One topic, one home (core §0 rule 7): if an entity definition changes, edit it here and nowhere else.*

---

## 18. DATA MODEL (core entities — Prisma)

Spine (existing/extended): `User`, `Organisation`, `Membership` (user × org × role × optional site scope), `Wallet`, `LedgerAccount`, `LedgerTransaction`, `LedgerEntry`, `Hold`, `PaymentIntent`, `ProviderCallback`, `Payout`, `PayoutAccount`.

Charging domain:
- `Owner` (links to Organisation; model A/B/C; contract terms: fees %, payout mode, host share)
- `Site` (owner, GPS, address, hours, amenities, photos, licence category, public flag, verified flag, booking settings, REG tariff profile)
- `Station` (site, power limits, transformer kVA, EMS link)
- `ChargePoint` (station, OCPP identity, credentials hash, vendor, model, serial, firmware, SIM, meter serial, capability record, data capability score, status, first/last seen)
- `Connector` (charge point, OCPP connectorId, type GB/T/CCS2/Type2, rated kW, short code, QR, status, current session)
- `ChargerConfigSnapshot`, `ChargerCapability`, `VendorErrorCode`
- `OcppMessageRaw` (append-only, partitioned by month), `ChargerEvent` (inbox), `ChargerCommand` (outbox)
- `StatusChange` (connector, status, errorCode, vendor codes, from/to time)
- `MeterSample` (TimescaleDB hypertable)
- `VehicleIdentity`, `BmsSnapshot`, `ModuleHealth` (from vendor DataTransfer)
- `Session` (connector, id_token, driver/fleet, booking, tariff version, meter start/stop, kWh, timestamps, state, stop reason, cost breakdown, settlement link, flags)
- `IdToken` (type: card/qr/app/fleet, value hash, wallet, status, limits)
- `Card` (UID, printed number, batch, status, holder, limits, history)
- `Tariff`, `TariffVersion` (48-segment map, tier prices, fees), `Promotion`, `Coupon`, `CouponRedemption`
- `Booking` (connector, driver, T, slot length, window start/end, fee, state, ReserveNow id, linked session)
- `SettlementSplit` (per session: gross, VAT, provider fee, UZA fee, host share, levy, owner net)
- `Incident`, `Alarm`, `JobCard`, `SparePart`, `StockMovement`, `MaintenancePlan`, `Asset`
- `ComplianceItem` (site, type, document, issue/expiry, status), `LicenceRecord`, `RuraReport`, `Complaint`
- `CostBookItem` (owner, site, category, amount, recurrence, start/end, capex life), `Loan`
- `SiteMeterReading`, `EmsSample` (later)
- `Subscription`, `Plan`, `SaasInvoice`
- `NotificationTemplate`, `NotificationLog`, `AuditLog`, `FeatureFlag`

Platform and productisation:
- `Network` (brand, domain, country pack, regulatory pack, fund holder, status), `NetworkConfig` (versioned), `CountryPack`, `RegulatoryPack`
- `ProviderAccount` (network, adapter type, credentials reference in secret store, limits, float level), `ProviderTransaction`
- `Licence` (network or owner, edition, connector limit, modules, term, price terms), `Entitlement`, `UsageMeter`, `PlatformInvoice`
- `RoamingAgreement` (network A ↔ network B, terms), `RoamingSession`, `ClearingEntry`, `ClearingStatement`
- `Deployment` (for private installs: version, licence key fingerprint, last check-in)

NFC card programme:
- `CardProgramme` (network, prefix, card types, limits, fees, KYC levels, dormant rules), `CardBatch` (supplier, chip type, quantity, UID list hash), `Card` (as above + programme, KYC level), `CardEvent` (activation, block, replace, top-up, decline)
- `Agent` (network, type, location, float account, commission terms, status), `AgentFloatMovement`, `CashTopUp`, `AgentReconciliation`
- `Voucher` (code hash, value, batch, status), `VoucherRedemption`
- `TopUp` (card/wallet, channel, provider reference, agent, amount, status)
- `ChargerModelCardSupport` (charger model → supported card chip types)

Every table: `id`, `created_at`, `updated_at`, `created_by` where meaningful; every domain row carries `network_id`; soft delete only where business rules allow; money columns are integers in the network currency's smallest unit, named `*_amount` with a `currency` column (for UCN: whole RWF).

### 18.1 Extensions (merged from v2 Section 32.2)
Add as appropriate to the chosen architecture:
- `ConfigDefinition`, `ConfigVersion`, `PolicyEvidence`, `RegulatoryObligation`, `RuleReview`, `RetentionPolicy`.
- `StartAttempt`, `CommandIntent`, `CommandAttempt`, `ObservedCommandEffect`, `ProtocolInboxReply`, `BillingEvidence`, `SettlementRevision`, `ReconciliationCase`.
- `ReaderCapability`, `OfflineAllowance`, `RevocationDelivery`, `ExposurePolicy`, `OccupancyObservation`.
- `ActionItem`, `AutomationRuleVersion`, `AutomationExecution`, `Escalation`, `DmsDelivery`.
- `InvestmentVehicle`, `InvestmentAgreementVersion`, `InvestorMembership`, `CapitalCommitment`, `CapitalCall`, `FundingReceipt`, `CapitalDeployment`, `DistributionRuleVersion`, `DistributionRun`, `DistributionAllocation`, `FinancialClose`, `ReportSnapshot`, `ForecastScenario`.
- `MigrationPlan`, `ImportBatch`, `OpeningBalanceApproval`, `CompatibilityTest`, `ModelFirmwareCapability`, `CommissioningAcceptance`.
- `FleetContract`, `FleetAllowance`, `CreditApproval`, `Campaign`, `CampaignResult`, `DemandObservation`.
- `SiteProject`, `FeasibilityScenario`, `ProjectMilestone`, `EnergyBoundary`, `EnergyReconciliation`.
- `SupportAccessGrant`, `BreakGlassEvent`, `ExportJob`, `ServiceCostAllocation`, `CustomerPromiseEvidence`.

Use network/owner/site scope where semantically correct. Platform-level protocol definitions and generic packs need platform scope, not a fictitious customer `network_id`. Tenant rows require non-null scope and constrained relationships; investors get explicit cross-owner memberships, never implicit global access. References and uniqueness constraints prevent attaching one tenant's session, file or ledger account to another. Financial/date precision and immutable versions are part of schema design.
