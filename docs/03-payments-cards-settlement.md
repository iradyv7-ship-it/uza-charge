# Payments, wallet, NFC card programme, offline rules, settlement and payouts

*Module of the UZA Charge Master Build Prompt v2.1. Owns **Section 8**.*
*Core: [`../CLAUDE.md`](../CLAUDE.md) — load it in every session. Load this module when the sprint touches payment rails, the wallet/ledger, the card programme, agents and cash, offline authorisation, settlement splits, payouts, refunds or accessible payment routes.*
*One topic, one home (core §0 rule 7): if a rule in this section changes, edit it here and nowhere else.*

---

## 8. PAYMENTS, WALLET, UZA CARD, SETTLEMENT AND PAYOUTS

### 8.1 Payment rails

| Rail | Use | Status |
|---|---|---|
| MTN MoMo Collections API | Pay per session, wallet top-up | `AWAITING CREDENTIALS` |
| MTN MoMo Disbursements API | Refunds, owner payouts | `AWAITING CREDENTIALS` |
| Airtel Money (collections + disbursements) | Same as MoMo | `AWAITING CREDENTIALS` |
| Cash desk | Top-up or pay at a UZA office / partner site; agent records cash, prints/sends receipt | Build in Phase 2 |
| Fleet postpaid | Monthly invoice to approved companies | Phase 3 |
| Bank card (Visa/Mastercard) | **Not primary.** Optional later via a payment gateway | Not in scope now |

**Rules**
- Digital payment success requires authoritative verification using the provider's supported authentication mechanism and/or an authenticated status query. Validate provider account, amount, currency, reference and final status. Deduplicate callbacks and status results atomically; final success can be recovered even when callbacks are missing.
- Use internal idempotency keys on every money operation and provider idempotency where supported. An unknown transfer outcome is queried/reconciled before any resend; never retry an uncertain payout as a new payment. Escalate unresolved items within a configured deadline.
- Daily automatic **reconciliation**: provider statements vs ledger; mismatches go to the finance queue.
- Payment fees are recorded per transaction as their own ledger lines.

### 8.2 Wallet and ledger (lives in the UZA spine)

- One wallet per person and per organisation, shared across UZA products.
- Double-entry ledger with accounts per wallet, per owner, UZA revenue, UZA payment-fee expense, VAT payable, RURA levy accrual, provider float accounts, refunds clearing, holds.
- Holds: an amount reserved for an in-progress session cannot be spent elsewhere.
- Negative customer balances are not the normal fallback. Offline and stop-overshoot exposure uses the approved liability policy. Collection from later top-ups requires disclosed, authorised terms; operator-caused loss must not be silently recovered from the driver.
- Wallet withdrawal (return unused balance to MoMo) per policy, with any fee shown before confirming.

### 8.3 The NFC charging card programme — tap and charge, no bank

The card is the simplest way to charge: **tap, plug, drive away**. No smartphone, no data bundle, no bank. It must be **easy to get, easy to load, and accepted at every partner site**.

#### 8.3.1 Core principle — the card is a key, not a purse
- The card identifies an authorised account; money lives in the ledger. A copied UID can still spend existing credit if the reader only checks UID. Record the verified reader authentication level; block centrally immediately and track propagation to each charger. Offline readers may retain stale authorisations until reconnect or expiry. Replacement rebinds the wallet credential, preserving balances and transaction history.
- Because the balance is online, the same card works at **every site of every owner in the network**, and at roaming partner networks (17.7), with no reconfiguration of the card.

#### 8.3.2 Card forms and technology
| Form | Use |
|---|---|
| Standard NFC card (ISO 14443A, credit-card size, printed number + QR on back) | Default for drivers |
| Key fob | Taxi and moto drivers, fleets |
| NFC sticker | Stuck on phone or dashboard |
| Fleet card (company-branded, per vehicle or per driver) | Fleets with limits and reports |
| **Virtual card in the app** (QR now; phone NFC/HCE later if charger readers support it) | Smartphone users |

- **Chip target:** DESFire EV2/EV3 with diversified keys where readers implement the required authentication. Chip compatibility is not proof of secure authentication. Test card-reader-firmware behaviour and key provisioning/rotation before issuing production cards. UID-only operation needs explicit risk approval, low limits, monitoring and an online-only launch policy; storing money on the server does not remove cloning risk. Unsupported secure operations stay disabled.
- **Numbering**: every network has its own card prefix (e.g. UCN `UZA-` + 12 digits + check digit). The printed number is what people read out to support or type for top-up; the UID is what the charger sends. The platform maps one to the other.
- Card artwork, colours and logo are per network (white-label). UZA can supply printed cards to other networks as a product line.

#### 8.3.3 Getting a card
- **At an agent / partner site counter:** scan the printed QR or enter the pre-registered number, verify the activation secret/stock assignment and driver OTP, then bind the card. QR/manual entry is the default activation route. Web NFC (Chrome on Android) can expose the serial number of many NFC tags and may be used as an optional, device-tested convenience to look up a pre-registered card; it cannot perform DESFire authentication or key provisioning. Secure provisioning needs a native Android application or a dedicated reader. Measure the under-60-second usability target on actual devices.
- **Online**: order in the app; delivered or collected; activated by scanning the QR on the card.
- **Fleet**: bulk issue — upload a list (vehicle plate / driver phone), cards arrive pre-linked.
- **Anonymous (light) cards**: usable with just a phone number; lower limits (`policy.CARD_LIGHT_*`). **Registered cards** (name + ID verified) get higher limits. KYC levels follow BNR guidance once confirmed.

#### 8.3.4 Loading the card — every way people actually pay
| Channel | How it works | Needs smartphone? | Needs bank? |
|---|---|---|---|
| **MoMo / Airtel merchant payment with card number as reference** | Driver pays the network's merchant code from any phone (USSD), entering the card number as reference → API callback credits the card | No | No |
| **App / web top-up** | Choose card → amount → MoMo/Airtel prompt → callback credits | Yes | No |
| **Scan the card's QR** | Opens a top-up page with the card pre-filled (works for someone else's card — a parent, an employer) | Yes | No |
| **Cash at an agent / partner site** | Agent takes cash, enters amount in agent app → card credited instantly → SMS receipt to driver | No | No |
| **Voucher / scratch code** | Buy a printed or SMS voucher from an agent; redeem by USSD/SMS/app | No | No |
| **SMS top-up command** | `TOPUP <card> <amount>` to the network short code → MoMo prompt | No | No |
| **USSD menu** (`*xxx#`, `AWAITING CREDENTIALS` — needs a USSD code from MTN/Airtel) | Balance, top-up, block card, last sessions | No | No |
| **Fleet allocation** | Company loads its fleet wallet, then allocates amounts to each card (or sets automatic daily allowances) | No | No |
| **Transfer** | From another wallet in the same network (family, employer) | Either | No |
| **Promotional / loyalty credit** | Issued by the network or an owner (clearly labelled, may expire) | No | No |

- **Balance check without a smartphone**: SMS `BAL <card>`, USSD, the agent, or the charger screen (where the charger can display it — vendor-specific via DataTransfer).
- **Low-balance SMS** at `policy.CARD_LOW_BALANCE_AMOUNT`, with the merchant code and card number in the message so loading is one step.
- Every top-up shows on the card's history with channel, agent (if any), time and receipt number. A top-up is credited **only on the provider's API callback** (or the agent's recorded cash entry, against the agent's float).

#### 8.3.5 Using the card — tap and charge
1. Driver taps the card on the charger reader.
2. Charger sends `Authorize(UID)`; the CSMS looks up card → wallet → network → limits.
3. Approved if: card active, balance ≥ `policy.CARD_MIN_START_BALANCE_AMOUNT`, within daily limit, no other active session, the site accepts this network's cards (own network or roaming partner).
4. Driver plugs in; session starts; hold placed (7.3); stop automatically before balance runs out.
5. SMS (and app push) at start and at end: kWh, cost, new balance, receipt link.
- If declined, the charger shows the reason where the charger supports it, and the driver gets an SMS with the reason and how to fix it ("Balance RWF 1,200 — load with MoMo merchant code XXXXX, reference UZA-…").

#### 8.3.6 Accepted at all partners
- Every owner who joins the network accepts the network's cards automatically — no per-site setup.
- Settlement credits follow verified session finalisation and available-funds rules (8.5), whichever site the card was loaded at. The money loaded at an agent in Kigali can pay a charger owned by a hotel in Rubavu; the ledger moves it from the card wallet to that owner.
- Roaming partner networks accept the card under their roaming agreement (17.7); the driver sees the partner's price before starting.

#### 8.3.7 Card lifecycle and management
- Statuses: `in_stock → allocated_to_agent → sold → active → blocked (lost/stolen/fraud) → replaced → retired`.
- **Block**: driver (app, USSD, SMS `BLOCK <card>`), support, agent, or automatically by fraud rules. Blocking queues a Local Authorisation List update to applicable chargers and records acknowledgement; disconnected chargers cannot receive it immediately.
- **Replace**: new credential linked to the same authorised wallet; old credential retired, local-list revocation tracked; no duplicate balance or unnecessary inter-wallet transfer.
- **Inventory**: batches per network, which agent holds which stock, sales per agent, stock alerts.
- **Card PIN** (optional, fleets): only where the charger supports PIN entry; otherwise app confirmation.
- **Dormant cards**: balance rules for long-inactive cards follow BNR/consumer-protection guidance — never silently forfeited.

#### 8.3.8 Fraud and risk controls
- Same card used at two sites too far apart in too short a time → auto-block + review.
- Many declined taps → temporary lock.
- Limits per card per day/session; lower for anonymous cards.
- Agent controls: each agent has a **float** (prepaid by the agent via MoMo, or credit limit set by the network). Cash top-ups reduce the agent float — an agent can never credit more than their float. Daily agent reconciliation; commission per top-up (`policy.AGENT_COMMISSION`).
- Card-batch UIDs registered before sale; unknown UIDs are never accepted.

#### 8.3.9 Regulatory gate
> ⚠ **`REQUIRES OFFICIAL VERIFICATION` (BNR):** a stored balance spent at **many independent owners**, with the operator settling those owners, may be treated by BNR as e-money issuance or payment aggregation. Options to put to BNR: (a) closed-loop prepaid for charging services only, with low limits; (b) partnering with a licensed e-money issuer / PSP who holds the funds (MTN MoMo, Airtel Money, or a licensed PSP) while UZA runs the platform; (c) UZA obtaining its own licence via the planned BNR path (Category III → sandbox → UZA Pay). **Build the card programme so the money-holder is configurable** (`network.fund_holder = operator | licensed_partner`) — this also makes it sellable in other countries with different rules. Until BNR confirms in writing: cards work at **UZA-owned sites** and **pay-per-session MoMo** works everywhere; card spending at third-party sites stays behind `feature.networkWallet`.

### 8.4 Offline charging and recovery

Offline charging is **disabled by default** for monetary-limited consumer cards until the hardware and exposure gate passes. A local authorisation list stores identities, not a synchronised wallet balance. Two offline sites cannot reliably enforce a single concurrent-spend limit through the cloud.

- Define a risk policy per network and charger model: eligible credentials, reserved allowance, allowed site/charger, expiry, maximum kWh/time/cost, maximum offline age and total network exposure. Network-wide caps are monitored centrally but cannot be guaranteed during disconnection; allocate bounded allowances in advance where enforcement is supported.
- Hardware must demonstrate local limit enforcement and persistent queued transaction recovery; if it cannot, do not advertise a hard prepaid offline cap. Approved fleet postpaid or tightly limited contractual credit may be a separate pilot.
- Revocation has central time, dispatch time and charger acknowledgement time. Expired lists or credentials must fail closed under the approved policy. Disable unknown offline IDs and unapproved local pre-authorisation.
- Reconcile offline sessions idempotently on reconnect, including conflicting use, stale tariff data and clock drift. Preserve evidence and allocate liability according to the approved contract; no automatic hidden overdraft.
- Test simultaneous offline use, a card blocked while offline, power loss, local clock manipulation, allowance exhaustion and reconnection storms. Publish the recovery runbook and customer support remedy.
- Connectivity resilience may include dual-network SIMs and local controllers; evaluate cost against avoided downtime. Availability status distinguishes backend reachability, locally observed charging and unknown state.

### 8.5 Session settlement, owner balances and confirmed payouts

At the moment a session is **settled**, the engine creates one ledger transaction that splits the money:

```
Driver paid (gross)
 − VAT (if applicable, per seller-of-record rules)
 − Payment provider fee (actual)
 − UZA network/transaction fee (Model C) or management fee (Model B) — % from the owner's contract
 − Host share (if the site is on a host's property and the contract says so)
 − RURA turnover levy accrual (if UZA is licensee for that site)
 = Owner net share  → credited to the owner's wallet IMMEDIATELY
```

- Show separate balances: **earned/provisional**, **settled**, **available to withdraw**, **reserved**, **payout pending**, **payout confirmed**. Ledger credit is not evidence of a successful external transfer. Every number links to its underlying entries.
- **Payout options** (owner chooses, per policy limits): **accelerated where supported** (eligible available funds request a disbursement above the configured minimum; provider confirmation still determines success), **daily sweep** at a set hour, **weekly**, or **on demand** ("Withdraw now" button). Bank transfer optional for owners who want it — never required (8.7).
- Disbursement fees: who pays is a founder decision (D-05); the cost is shown to the owner before they choose a payout mode.
- Maintain the verified settlement/fund-holder arrangement and sufficient payout liquidity. Forecast upcoming liabilities and provider limits; reconcile provider balances. Ring-fence customer obligations from UZA operating income. Float shortfalls pause new accelerated payout promises and trigger finance action, not appropriation of another tenant's funds.
- Payout states: `requested → approved/reserved → submitted → pending_provider → confirmed | failed | unknown → reconciled`. Unknown outcomes are checked before resubmission. Each payout has an immutable internal ID, provider references and an itemised statement; fees and reserves are disclosed.
- Disputes: a disputed session's owner share is held (not paid) until resolved; resolution creates reversing entries — never edits.

### 8.6 Refunds and disputes

- Automatic refunds: failed start, unused prepaid amount, double charge detected by reconciliation.
- Manual refunds by support up to `policy.SUPPORT_REFUND_LIMIT_AMOUNT`; above that, finance approval (two-person rule).
- Every refund links to the original payment and session; refunds go back to the original rail where possible.

### 8.7 Accessible payment routes and provider constraints

No personal bank account should be necessary for core driver charging. Supported owners and agents can use verified business mobile-money routes. Corporate onboarding, safeguarding and some countries' settlement arrangements may require banking infrastructure; those are partner dependencies, not unfinished software.

| Flow | Intended accessible route | Production condition |
|---|---|---|
| Pay/top up | MoMo/Airtel or authorised cash agent | Confirm provider product, reference handling and limits |
| Card/cash credit | Atomic debit of funded agent float and credit of customer liability | Approved fund-holder and cash reconciliation |
| Owner payout | Verified MoMo/Airtel business disbursement; bank transfer optional where available | Payee verification, funds, limits and provider finality |
| Refund | Original payment rail where supported | Confirm refund versus disbursement capabilities and fees |
| Subscription | MoMo/Airtel, opt-in deduction of available owner funds, or corporate transfer | Explicit contract and consent |
| Agent commission | Separate earned commission then supported payout | Commission policy and reconciliation |

Provider capability records specify collection, merchant references, callbacks/status checks, refunds, payouts, reconciliation statements, currencies and limits. An adapter cannot manufacture an unsupported merchant reference field or refund API.

Do not automatically split payments to evade limits. Scheduling or authorised batching must follow documented provider terms and applicable requirements. During outages, queue safe work, explain pending states, preserve receipts and offer other genuinely available methods. Customer funds, loans and savings are never used as operating float without an authorised arrangement.
