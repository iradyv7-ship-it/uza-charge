-- =====================================================================
-- UZA CHARGE NETWORK — strict ownership hierarchy, effective-dated
-- tariffs, versioned revenue splits, append-only OCPP audit log,
-- settlement. Additive: nothing existing is dropped.
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------------------------------------------------------------------
-- 1. OWNERS  (the entity that owns stations — third party or UZA)
-- ---------------------------------------------------------------------
create table public.owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'private_operator'
    check (kind in ('uza','private_operator','hotel','fuel_station','mall','fleet','property_owner','institution')),
  country_code text not null default 'RW',
  city text,
  tin text,
  momo_merchant_id text,
  airtel_merchant_id text,
  payout_schedule text not null default 'monthly'
    check (payout_schedule in ('weekly','fortnightly','monthly')),
  contact_email text,
  contact_phone text,
  legacy_operator_id uuid references public.operators(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.owners to authenticated;
grant all on public.owners to service_role;
alter table public.owners enable row level security;
create trigger owners_updated_at before update on public.owners
  for each row execute function public.set_updated_at();

create table public.owner_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner_admin' check (role in ('owner_admin','owner_viewer','finance')),
  created_at timestamptz not null default now(),
  unique (owner_id, user_id)
);
grant select on public.owner_members to authenticated;
grant all on public.owner_members to service_role;
alter table public.owner_members enable row level security;
create policy owner_members_read_own on public.owner_members
  for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- Owner scoping helper. Security definer so it can read owner_members
-- regardless of the caller's own row-level visibility.
create or replace function public.has_owner_access(_owner_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid())
      or exists (select 1 from public.owner_members m
                 where m.owner_id = _owner_id and m.user_id = auth.uid())
$$;
revoke all on function public.has_owner_access(uuid) from public, anon;
grant execute on function public.has_owner_access(uuid) to authenticated, service_role;

create policy owners_read_scoped on public.owners
  for select to authenticated using (public.has_owner_access(id));

-- ---------------------------------------------------------------------
-- 2. SITES  (a physical location belonging to one owner)
-- ---------------------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete restrict,
  name text not null,
  country_code text not null default 'RW',
  city text,
  area text,
  address text,
  gps_lat numeric,
  gps_lng numeric,
  grid_connection_kva numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sites_owner_idx on public.sites(owner_id);
grant select on public.sites to authenticated;
grant all on public.sites to service_role;
alter table public.sites enable row level security;
create policy sites_read_scoped on public.sites
  for select to authenticated using (public.has_owner_access(owner_id));
create trigger sites_updated_at before update on public.sites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. STATIONS re-parented under site + owner
-- ---------------------------------------------------------------------
alter table public.stations
  add column if not exists site_id uuid references public.sites(id) on delete restrict,
  add column if not exists owner_id uuid references public.owners(id) on delete restrict,
  add column if not exists country_code text not null default 'RW',
  add column if not exists city text;

-- Back-fill: every existing operator becomes an owner, every station a site.
insert into public.owners (name, kind, legacy_operator_id, momo_merchant_id, city)
select o.name,
       case when o.name ilike '%uza%' then 'uza' else 'private_operator' end,
       o.id, o.momo_merchant_id, 'Kigali'
from public.operators o
where not exists (select 1 from public.owners w where w.legacy_operator_id = o.id);

insert into public.sites (owner_id, name, city, area, gps_lat, gps_lng)
select w.id, st.name, 'Kigali', st.area, st.gps_lat, st.gps_lng
from public.stations st
join public.owners w on w.legacy_operator_id = st.operator_id
where st.site_id is null;

update public.stations st
set owner_id = w.id,
    city = coalesce(st.city, 'Kigali'),
    site_id = s.id
from public.owners w
join public.sites s on s.owner_id = w.id
where w.legacy_operator_id = st.operator_id
  and s.name = st.name
  and st.site_id is null;

-- ---------------------------------------------------------------------
-- 4. CHARGE POINTS  (public.chargers is the charge-point level; each
--    pile stays independently identifiable and tied to station + owner)
-- ---------------------------------------------------------------------
alter table public.chargers
  add column if not exists ocpp_identity text,
  add column if not exists ocpp_protocol text not null default 'ocpp1.6',
  add column if not exists last_seen_at timestamptz,
  add column if not exists boot_at timestamptz,
  add column if not exists heartbeat_interval_s integer not null default 300,
  add column if not exists power_type text not null default 'dc' check (power_type in ('ac','dc')),
  add column if not exists rated_power_kw numeric,
  add column if not exists is_simulated boolean not null default true,
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists firmware_status text;

update public.chargers set ocpp_identity = coalesce(ocpp_identity, serial) where ocpp_identity is null;
alter table public.chargers alter column ocpp_identity set not null;
create unique index if not exists chargers_ocpp_identity_key on public.chargers(ocpp_identity);

-- Honesty: a pile that has never reported is "never connected", not available.
update public.chargers set status = 'never_connected'
where last_seen_at is null and last_heartbeat is null;
update public.connectors c set status = 'unknown'
where exists (select 1 from public.chargers ch
              where ch.id = c.charger_id and ch.status = 'never_connected');

-- Canonical name for the level, without disturbing existing readers.
create or replace view public.charge_points
with (security_invoker = true) as
  select ch.id, ch.station_id, st.site_id, st.owner_id,
         ch.ocpp_identity, ch.serial, ch.vendor, ch.model, ch.status,
         ch.power_type, ch.rated_power_kw, ch.connector_count,
         ch.firmware_version, ch.firmware_status, ch.last_seen_at,
         ch.heartbeat_interval_s, ch.max_output_pct, ch.is_simulated,
         ch.created_at
  from public.chargers ch
  join public.stations st on st.id = ch.station_id;
grant select on public.charge_points to authenticated;

-- Measured, not invented: every status transition is recorded.
create table public.charge_point_status_history (
  id bigserial primary key,
  charger_id uuid not null references public.chargers(id) on delete cascade,
  connector_id uuid references public.connectors(id) on delete cascade,
  status text not null,
  source text not null default 'ocpp' check (source in ('ocpp','simulator','operator','watchdog')),
  changed_at timestamptz not null default now()
);
create index cpsh_charger_idx on public.charge_point_status_history(charger_id, changed_at desc);
grant select on public.charge_point_status_history to authenticated;
grant all on public.charge_point_status_history to service_role;
alter table public.charge_point_status_history enable row level security;
create policy cpsh_read_scoped on public.charge_point_status_history
  for select to authenticated using (
    exists (select 1 from public.chargers ch
            join public.stations st on st.id = ch.station_id
            where ch.id = charge_point_status_history.charger_id
              and public.has_owner_access(st.owner_id))
  );

-- ---------------------------------------------------------------------
-- 5. TARIFFS — effective-dated, never retroactive
-- ---------------------------------------------------------------------
create table public.tariff_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  station_id uuid references public.stations(id) on delete cascade,
  name text not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  energy_minor_per_kwh bigint not null,
  time_minor_per_minute bigint not null default 0,
  session_fee_minor bigint not null default 0,
  idle_fee_minor_per_minute bigint not null default 0,
  idle_grace_minutes integer not null default 10,
  currency text not null default 'RWF',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tariff_versions_owner_idx on public.tariff_versions(owner_id, effective_from desc);
grant select on public.tariff_versions to authenticated;
grant all on public.tariff_versions to service_role;
alter table public.tariff_versions enable row level security;
create policy tariff_versions_read_scoped on public.tariff_versions
  for select to authenticated using (public.has_owner_access(owner_id));
create trigger tariff_versions_updated_at before update on public.tariff_versions
  for each row execute function public.set_updated_at();

create table public.tariff_tou_windows (
  id uuid primary key default gen_random_uuid(),
  tariff_version_id uuid not null references public.tariff_versions(id) on delete cascade,
  half_hour_index integer not null check (half_hour_index between 0 and 47),
  tier text not null check (tier in ('valley','standard','peak','sharp')),
  multiplier numeric not null default 1,
  unique (tariff_version_id, half_hour_index)
);
grant select on public.tariff_tou_windows to authenticated;
grant all on public.tariff_tou_windows to service_role;
alter table public.tariff_tou_windows enable row level security;
create policy tariff_tou_read_scoped on public.tariff_tou_windows
  for select to authenticated using (
    exists (select 1 from public.tariff_versions v
            where v.id = tariff_tou_windows.tariff_version_id
              and public.has_owner_access(v.owner_id))
  );

-- ---------------------------------------------------------------------
-- 6. REVENUE SPLIT RULES — versioned per owner
-- ---------------------------------------------------------------------
create table public.revenue_split_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  version integer not null,
  energy_cost_minor_per_kwh bigint not null,
  host_share_bps integer not null check (host_share_bps between 0 and 10000),
  platform_share_bps integer not null check (platform_share_bps between 0 and 10000),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (owner_id, version)
);
grant select on public.revenue_split_rules to authenticated;
grant all on public.revenue_split_rules to service_role;
alter table public.revenue_split_rules enable row level security;
create policy revenue_split_read_scoped on public.revenue_split_rules
  for select to authenticated using (public.has_owner_access(owner_id));

-- ---------------------------------------------------------------------
-- 7. SESSIONS pin the rules they settled under + itemised money
-- ---------------------------------------------------------------------
alter table public.sessions
  add column if not exists tariff_version_id uuid references public.tariff_versions(id),
  add column if not exists split_rule_version integer,
  add column if not exists energy_minor bigint not null default 0,
  add column if not exists time_minor bigint not null default 0,
  add column if not exists session_fee_minor bigint not null default 0,
  add column if not exists idle_minor bigint not null default 0,
  add column if not exists total_minor bigint not null default 0,
  add column if not exists idle_minutes integer not null default 0,
  add column if not exists charging_minutes integer not null default 0,
  add column if not exists ocpp_transaction_id bigint,
  add column if not exists id_tag text;

-- ---------------------------------------------------------------------
-- 8. OCPP RAW AUDIT LOG — append only
-- ---------------------------------------------------------------------
create table public.ocpp_events (
  id bigserial primary key,
  charger_id uuid references public.chargers(id) on delete set null,
  ocpp_identity text not null,
  direction text not null check (direction in ('inbound','outbound')),
  message_type integer not null check (message_type in (2,3,4)),
  message_id text,
  action text,
  payload jsonb not null default '{}'::jsonb,
  valid boolean not null default true,
  error text,
  received_at timestamptz not null default now()
);
create index ocpp_events_identity_idx on public.ocpp_events(ocpp_identity, received_at desc);
create index ocpp_events_charger_idx on public.ocpp_events(charger_id, received_at desc);
grant select on public.ocpp_events to authenticated;
grant insert, select on public.ocpp_events to service_role;
alter table public.ocpp_events enable row level security;
-- Read only, and only within your own network. No UPDATE or DELETE policy
-- exists for any role, which makes the log append-only.
create policy ocpp_events_read_scoped on public.ocpp_events
  for select to authenticated using (
    public.is_staff(auth.uid())
    or exists (select 1 from public.chargers ch
               join public.stations st on st.id = ch.station_id
               where ch.id = ocpp_events.charger_id
                 and public.has_owner_access(st.owner_id))
  );

create or replace function public.ocpp_events_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'ocpp_events is append-only';
end; $$;
create trigger ocpp_events_no_update before update or delete on public.ocpp_events
  for each row execute function public.ocpp_events_append_only();

-- ---------------------------------------------------------------------
-- 9. RECEIPTS
-- ---------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  owner_id uuid references public.owners(id) on delete set null,
  tariff_version_id uuid references public.tariff_versions(id),
  number text not null unique,
  energy_kwh numeric not null default 0,
  duration_minutes integer not null default 0,
  idle_minutes integer not null default 0,
  lines jsonb not null default '[]'::jsonb,
  energy_minor bigint not null default 0,
  time_minor bigint not null default 0,
  session_fee_minor bigint not null default 0,
  idle_minor bigint not null default 0,
  total_minor bigint not null default 0,
  currency text not null default 'RWF',
  issued_at timestamptz not null default now()
);
grant select on public.receipts to authenticated;
grant all on public.receipts to service_role;
alter table public.receipts enable row level security;
create policy receipts_read_own_or_scoped on public.receipts
  for select to authenticated using (
    public.is_staff(auth.uid())
    or exists (select 1 from public.drivers d where d.id = receipts.driver_id and d.user_id = auth.uid())
    or (receipts.owner_id is not null and public.has_owner_access(receipts.owner_id))
  );

-- ---------------------------------------------------------------------
-- 10. SETTLEMENT RUNS + PAYOUTS  (per owner)
-- ---------------------------------------------------------------------
create table public.settlement_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  session_count integer not null default 0,
  total_kwh numeric not null default 0,
  gross_minor bigint not null default 0,
  energy_cost_minor bigint not null default 0,
  host_minor bigint not null default 0,
  platform_minor bigint not null default 0,
  split_rule_version integer,
  status text not null default 'draft' check (status in ('draft','issued','paid','disputed')),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index settlement_runs_owner_idx on public.settlement_runs(owner_id, period_end desc);
grant select on public.settlement_runs to authenticated;
grant all on public.settlement_runs to service_role;
alter table public.settlement_runs enable row level security;
create policy settlement_runs_read_scoped on public.settlement_runs
  for select to authenticated using (public.has_owner_access(owner_id));
create trigger settlement_runs_updated_at before update on public.settlement_runs
  for each row execute function public.set_updated_at();

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  settlement_run_id uuid not null references public.settlement_runs(id) on delete cascade,
  owner_id uuid not null references public.owners(id) on delete cascade,
  amount_minor bigint not null,
  method text not null default 'momo' check (method in ('momo','airtel','bank')),
  destination text,
  status text not null default 'scheduled' check (status in ('scheduled','sent','failed','settled')),
  provider_ref text,
  scheduled_for date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.payouts to authenticated;
grant all on public.payouts to service_role;
alter table public.payouts enable row level security;
create policy payouts_read_scoped on public.payouts
  for select to authenticated using (public.has_owner_access(owner_id));
create trigger payouts_updated_at before update on public.payouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 11. Seed one published tariff version + split rule per owner so the
--     network prices sessions from day one (policy defaults).
-- ---------------------------------------------------------------------
insert into public.tariff_versions
  (owner_id, name, energy_minor_per_kwh, time_minor_per_minute, session_fee_minor,
   idle_fee_minor_per_minute, idle_grace_minutes, effective_from)
select w.id, 'UZA standard v1', 32000, 0, 0, 10000, 10, now()
from public.owners w
where not exists (select 1 from public.tariff_versions v where v.owner_id = w.id);

insert into public.tariff_tou_windows (tariff_version_id, half_hour_index, tier, multiplier)
select v.id, g.i,
       case
         when g.i between 0 and 11 then 'valley'
         when g.i between 34 and 41 then 'peak'
         when g.i between 36 and 37 then 'sharp'
         else 'standard'
       end,
       case
         when g.i between 0 and 11 then 0.75
         when g.i between 34 and 41 then 1.25
         else 1.0
       end
from public.tariff_versions v
cross join generate_series(0, 47) as g(i)
where not exists (select 1 from public.tariff_tou_windows w where w.tariff_version_id = v.id);

insert into public.revenue_split_rules
  (owner_id, version, energy_cost_minor_per_kwh, host_share_bps, platform_share_bps, note)
select w.id, 1, 21500, 7000, 3000, 'Policy default split, published 2026-09-02'
from public.owners w
where not exists (select 1 from public.revenue_split_rules r where r.owner_id = w.id and r.version = 1);
