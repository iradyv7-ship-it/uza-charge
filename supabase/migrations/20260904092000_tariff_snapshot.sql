-- Brief section 2 (non-negotiable): "Every historical tariff, contract and revenue-share
-- calculation must remain reproducible." compute_session_cost() already prices every
-- meter-value delta against `tariff_rates` at the time it is CALLED, but it only wrote the
-- resulting amount per tier into transactions.tier_breakdown — never the rate figures used
-- to get there. If an operator edits a tariff_rates row after a session settles, the old
-- transaction's tier_breakdown is silent about what actually produced its total: there is
-- no way to answer "what rate did this customer actually pay?" without trusting that
-- tariff_rates never changed, which is exactly the assumption a live pricing console makes
-- false the first time someone uses it.
--
-- Fix: embed the rate figures alongside the amount, per tier, in the same jsonb column —
-- no new table needed, this is what tier_breakdown was always meant to hold. Old rows keep
-- their old (amount-only) shape; nothing here rewrites history, because the actual rate
-- that applied to an old session before this migration was genuinely never recorded and
-- cannot be reconstructed after the fact.

create or replace function public.compute_session_cost(_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _tariff uuid;
  _rec record;
  _prev numeric := null;
  _breakdown jsonb := '{}'::jsonb;
  _total numeric := 0;
  _kwh numeric := 0;
begin
  _tariff := public.session_tariff_id(_session_id);
  if _tariff is null then
    return jsonb_build_object('total_rwf', 0, 'total_kwh', 0, 'tiers', '{}'::jsonb);
  end if;
  for _rec in select mv.ts, mv.kwh from public.meter_values mv where mv.session_id = _session_id order by mv.ts loop
    if _prev is not null then
      declare
        _d numeric := greatest(coalesce(_rec.kwh,0) - _prev, 0);
        _tier text;
        _energy_rate numeric;
        _service_rate numeric;
        _amt numeric;
        _existing jsonb;
      begin
        _tier := public.tier_for_ts(_tariff, _rec.ts);
        if _tier is not null and _d > 0 then
          select energy_rwf_per_kwh, service_rwf_per_kwh into _energy_rate, _service_rate
          from public.tariff_rates where tariff_id = _tariff and tier = _tier limit 1;
          _amt := _d * (coalesce(_energy_rate, 0) + coalesce(_service_rate, 0));
          _total := _total + _amt;

          -- Snapshot the rate that applied, not just the running amount, so this record
          -- answers "what rate did this session actually pay?" on its own, even years
          -- after tariff_rates has moved on.
          _existing := coalesce(_breakdown->_tier, jsonb_build_object(
            'amount_rwf', 0, 'kwh', 0,
            'energy_rwf_per_kwh', _energy_rate, 'service_rwf_per_kwh', _service_rate
          ));
          _breakdown := jsonb_set(_breakdown, array[_tier], jsonb_build_object(
            'amount_rwf', round(coalesce((_existing->>'amount_rwf')::numeric, 0) + _amt),
            'kwh', round(coalesce((_existing->>'kwh')::numeric, 0) + _d, 3),
            'energy_rwf_per_kwh', _energy_rate,
            'service_rwf_per_kwh', _service_rate
          ), true);
        end if;
      end;
    end if;
    _prev := coalesce(_rec.kwh, 0);
    _kwh := coalesce(_rec.kwh, 0);
  end loop;
  return jsonb_build_object('total_rwf', round(_total), 'total_kwh', round(_kwh, 3), 'tiers', _breakdown);
end;
$$;

-- Grants were already narrowed to service_role only in earlier migrations; replacing the
-- function body with CREATE OR REPLACE preserves them, but restate explicitly so this
-- migration is correct read alone, without relying on migration order for its security.
revoke all on function public.compute_session_cost(uuid) from public, anon, authenticated;
grant execute on function public.compute_session_cost(uuid) to service_role;
