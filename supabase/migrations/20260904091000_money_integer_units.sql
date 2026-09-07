-- Brief section 8: "Never use JS binary floating-point for authoritative money; use
-- integer minor units or safe decimal types." Postgres `numeric` already qualifies as a
-- safe decimal type — the actual gap is narrower and specific to RWF: the Rwandan franc
-- has no minor unit in circulation (the same fact uza-mobility-bn's loan-terms.ts already
-- documents — "There is no minor unit in circulation, and a displayed decimal invites
-- somebody to type one"). A `numeric` column happily stores 9600.37 RWF, which is not a
-- real amount anyone can be paid or charged. Storing these as whole-RWF `integer` makes
-- that state unrepresentable rather than merely unlikely.
--
-- Scoped to columns holding a SETTLED amount — money that has actually moved or is owed.
-- Deliberately NOT touching tariff_rates.energy_rwf_per_kwh / service_rwf_per_kwh: those
-- are pricing parameters (RWF per kWh), not settled amounts, and a tariff schedule
-- reasonably can carry fractional RWF/kWh precision. compute_session_cost() already
-- rounds every derived amount to a whole number before it reaches any of these columns
-- (see the existing `round(...)` calls it makes), so this migration changes storage, not
-- behaviour — no existing seed value here has a fractional part to lose.

alter table public.drivers
  alter column wallet_balance_rwf type integer using round(wallet_balance_rwf)::integer,
  alter column wallet_balance_rwf set default 0;

alter table public.sessions
  alter column cost_rwf type integer using round(cost_rwf)::integer,
  alter column cost_rwf set default 0;

alter table public.transactions
  alter column total_rwf type integer using round(total_rwf)::integer,
  alter column total_rwf set default 0;

alter table public.payments
  alter column amount_rwf type integer using round(amount_rwf)::integer;
