-- Brief section 9 (Multi-Tenant Security): "Changing a resource ID must never expose
-- another organization's data." Today it does: `is_staff(auth.uid())` is `role in
-- ('operator','admin')` with no operator_id anywhere in the check, so any user holding
-- the global `operator` role can read another operator's chargers' event log, queue a
-- remote command on another operator's charger, read another operator's session/payment
-- history, and settle another operator's payment — via RLS and via the `queueCommand`/
-- `settlePayment` server functions, both of which only check `is_staff()`.
--
-- Fix: an explicit `operator_staff` join table (which operator each operator-role user
-- actually works for), an `is_operator_staff(user, operator)` check that admin always
-- satisfies, and a handful of `operator_for_*` resolvers so a policy on `sessions` or
-- `charger_events` can ask "does this row's operator match a table this user is staff
-- of?" instead of "is this user staff of anything?".
--
-- Backward-compatible on purpose: every existing (user, 'operator') pair is backfilled
-- into `operator_staff` against EVERY current operator, preserving today's behaviour for
-- anyone already using the app. The gap this closes is in ONBOARDING a new operator's
-- staff going forward, not in silently narrowing what today's demo/seed accounts can see.
--
-- Deliberately NOT scoped by operator: `drivers` and `rfid_cards`. A driver profile is not
-- owned by a single operator (the same driver charges across the network), so "which
-- operator may see this driver" has no clean answer via a foreign key the way a session
-- or a charger does. Read access to a driver's name/phone/wallet stays staff-wide, same as
-- today; only session/energy/revenue data (the actually sensitive, actually operator-
-- specific data) is scoped by this migration.

create table public.operator_staff (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (operator_id, user_id)
);
alter table public.operator_staff enable row level security;
grant select on public.operator_staff to authenticated;
grant all on public.operator_staff to service_role;

-- Staff can see who else is on their own operator's roster; admin sees every roster.
create policy "operator_staff_read_own_or_admin" on public.operator_staff for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (select 1 from public.operator_staff s2 where s2.operator_id = operator_staff.operator_id and s2.user_id = auth.uid())
  );

insert into public.operator_staff (operator_id, user_id)
select o.id, ur.user_id
from public.operators o
cross join (select distinct user_id from public.user_roles where role = 'operator') ur
on conflict (operator_id, user_id) do nothing;

create or replace function public.is_operator_staff(_user_id uuid, _operator_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    _operator_id is not null
    and (
      public.has_role(_user_id, 'admin')
      or exists (
        select 1 from public.operator_staff
        where user_id = _user_id and operator_id = _operator_id
      )
    )
$$;
revoke all on function public.is_operator_staff(uuid, uuid) from public, anon;
grant execute on function public.is_operator_staff(uuid, uuid) to authenticated, service_role;

create or replace function public.operator_for_station(_station_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select operator_id from public.stations where id = _station_id
$$;

create or replace function public.operator_for_charger(_charger_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select st.operator_id from public.chargers ch
  join public.stations st on st.id = ch.station_id
  where ch.id = _charger_id
$$;

create or replace function public.operator_for_connector(_connector_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.operator_for_charger(c.charger_id) from public.connectors c where c.id = _connector_id
$$;

create or replace function public.operator_for_session(_session_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.operator_for_connector(s.connector_id) from public.sessions s where s.id = _session_id
$$;

-- Null-session payments (wallet top-ups) have no operator — resolves to null, which
-- is_operator_staff() treats as "nobody but admin", correctly: a top-up isn't any
-- operator's business.
create or replace function public.operator_for_payment(_payment_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.operator_for_session(p.session_id) from public.payments p where p.id = _payment_id
$$;

revoke all on function public.operator_for_station(uuid) from public, anon;
revoke all on function public.operator_for_charger(uuid) from public, anon;
revoke all on function public.operator_for_connector(uuid) from public, anon;
revoke all on function public.operator_for_session(uuid) from public, anon;
revoke all on function public.operator_for_payment(uuid) from public, anon;
grant execute on function public.operator_for_station(uuid) to authenticated, service_role;
grant execute on function public.operator_for_charger(uuid) to authenticated, service_role;
grant execute on function public.operator_for_connector(uuid) to authenticated, service_role;
grant execute on function public.operator_for_session(uuid) to authenticated, service_role;
grant execute on function public.operator_for_payment(uuid) to authenticated, service_role;

-- Replace the blanket-staff branch on every policy that guards operator-specific
-- session/energy/revenue/command data with the scoped check. `drop policy` + `create
-- policy` rather than `alter policy ... using` because Postgres has no ALTER POLICY USING
-- shorthand that reads cleanly here, and re-creating makes the new condition easy to diff
-- against the old one below in review.

drop policy if exists "sessions_read_own_or_staff" on public.sessions;
create policy "sessions_read_own_or_staff" on public.sessions for select to authenticated
  using (
    public.is_operator_staff(auth.uid(), public.operator_for_session(sessions.id))
    or exists (select 1 from public.drivers d where d.id = sessions.driver_id and d.user_id = auth.uid())
  );

drop policy if exists "meter_values_read_own_or_staff" on public.meter_values;
create policy "meter_values_read_own_or_staff" on public.meter_values for select to authenticated
  using (
    public.is_operator_staff(auth.uid(), public.operator_for_session(meter_values.session_id))
    or exists (
      select 1 from public.sessions s join public.drivers d on d.id = s.driver_id
      where s.id = meter_values.session_id and d.user_id = auth.uid())
  );

drop policy if exists "transactions_read_own_or_staff" on public.transactions;
create policy "transactions_read_own_or_staff" on public.transactions for select to authenticated
  using (
    public.is_operator_staff(auth.uid(), public.operator_for_session(transactions.session_id))
    or exists (
      select 1 from public.sessions s join public.drivers d on d.id = s.driver_id
      where s.id = transactions.session_id and d.user_id = auth.uid())
  );

drop policy if exists "payments_read_own_or_staff" on public.payments;
create policy "payments_read_own_or_staff" on public.payments for select to authenticated
  using (
    public.is_operator_staff(auth.uid(), public.operator_for_payment(payments.id))
    or exists (select 1 from public.drivers d where d.id = payments.driver_id and d.user_id = auth.uid())
  );

drop policy if exists "charger_events_staff_read" on public.charger_events;
create policy "charger_events_staff_read" on public.charger_events for select to authenticated
  using (public.is_operator_staff(auth.uid(), public.operator_for_charger(charger_events.charger_id)));

drop policy if exists "charger_commands_staff_read" on public.charger_commands;
create policy "charger_commands_staff_read" on public.charger_commands for select to authenticated
  using (public.is_operator_staff(auth.uid(), public.operator_for_charger(charger_commands.charger_id)));
