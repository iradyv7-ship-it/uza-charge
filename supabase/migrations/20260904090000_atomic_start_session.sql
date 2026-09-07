-- The race the brief calls out explicitly (section 7): "Use backend/database locking or
-- constraints to prevent overlapping confirmed reservations." `startSession` in
-- driver.functions.ts currently does read-status → insert session → update connector as
-- three separate round trips with no lock between them. Two drivers hitting "Start" on the
-- same connector within the same few milliseconds can both read `status = 'available'`
-- before either write lands, producing two concurrent sessions on one physical connector.
--
-- Fixed with a single SECURITY DEFINER function that takes an advisory transaction lock on
-- the connector (and separately on the driver, so one driver double-clicking Start cannot
-- open two sessions either) before re-checking anything. The lock is released automatically
-- when the transaction ends, so a crash mid-function cannot leave it held.
--
-- Not exposed to `anon`/`authenticated` — same hardening pattern as compute_session_cost
-- and friends (see 20260801071226 / 20260802074530). Only the service-role server function
-- calls this, same as today.
--
-- Returns the session PLUS an explicit `already_charging` flag rather than making the
-- caller infer it from the row — the driver already had an open session (a genuinely
-- different outcome from starting a new one) is exactly the ambiguity a composite return
-- type exists to remove.

create type public.start_session_result as (
  session public.sessions,
  already_charging boolean
);

create or replace function public.start_charging_session(
  _driver_id uuid,
  _connector_id uuid,
  _start_method text,
  _vin text default null
)
returns public.start_session_result
language plpgsql
security definer
set search_path = public
as $$
declare
  _connector record;
  _charger_status text;
  _existing_open uuid;
  _session public.sessions;
begin
  if _start_method not in ('app', 'rfid', 'vin') then
    raise exception 'invalid start_method: %', _start_method using errcode = '22023';
  end if;

  -- Lock scope: one advisory key per driver, one per connector. Postgres advisory locks
  -- take a bigint; hashtext() on the uuid text gives a stable, even distribution.
  perform pg_advisory_xact_lock(hashtext('start_session:driver:' || _driver_id::text));
  perform pg_advisory_xact_lock(hashtext('start_session:connector:' || _connector_id::text));

  -- Re-check everything AFTER acquiring both locks — anything read before the lock could
  -- already be stale by the time we hold it.
  select id into _existing_open
  from public.sessions
  where driver_id = _driver_id
    and status in ('preparing', 'charging', 'finishing')
  limit 1;

  if _existing_open is not null then
    select * into _session from public.sessions where id = _existing_open;
    return (_session, true)::public.start_session_result;
  end if;

  select c.id, c.status, c.charger_id, ch.status as charger_status
  into _connector
  from public.connectors c
  join public.chargers ch on ch.id = c.charger_id
  where c.id = _connector_id
  for update of c;

  if not found then
    raise exception 'connector not found: %', _connector_id using errcode = 'P0002';
  end if;
  if _connector.charger_status <> 'online' then
    raise exception 'charger is not online' using errcode = '22023';
  end if;
  if _connector.status not in ('available', 'preparing') then
    raise exception 'connector is not available' using errcode = '22023';
  end if;

  insert into public.sessions (connector_id, driver_id, start_method, status, soc_start, vin)
  values (
    _connector_id,
    _driver_id,
    _start_method,
    'charging',
    (18 + floor(random() * 32))::int,
    _vin
  )
  returning * into _session;

  update public.connectors set status = 'charging' where id = _connector_id;

  insert into public.charger_events (charger_id, type, payload)
  values (
    _connector.charger_id,
    'StartTransaction',
    jsonb_build_object('session_id', _session.id, 'id_tag', _driver_id, 'start_method', _start_method)
  );

  return (_session, false)::public.start_session_result;
end;
$$;

revoke all on function public.start_charging_session(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.start_charging_session(uuid, uuid, text, text) to service_role;
