
-- ROLES ------------------------------------------------------------------
create type public.app_role as enum ('driver','operator','admin','investor','regulator','battery_passport');

create table public.profiles (
  id uuid primary key,
  full_name text,
  phone text,
  locale text not null default 'en',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid());

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "user_roles_select_own" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('operator','admin'))
$$;

-- NETWORK ----------------------------------------------------------------
create table public.operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  momo_merchant_id text,
  revenue_share_pct numeric not null default 80,
  created_at timestamptz not null default now()
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  name text not null,
  area text,
  gps_lat numeric,
  gps_lng numeric,
  kind text not null default '120kW DC' check (kind in ('180kW DC','120kW DC','22kW AC')),
  created_at timestamptz not null default now()
);

create table public.chargers (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  serial text not null unique,
  vendor text,
  model text,
  connector_count int not null default 2,
  status text not null default 'offline' check (status in ('online','offline','faulted')),
  firmware_version text,
  last_heartbeat timestamptz,
  max_output_pct int not null default 100,
  created_at timestamptz not null default now()
);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null references public.chargers(id) on delete cascade,
  label text not null,
  type text not null default 'CCS2' check (type in ('CCS2','Type2')),
  power_kw numeric not null default 60,
  status text not null default 'offline' check (status in ('available','preparing','charging','finishing','faulted','offline')),
  created_at timestamptz not null default now()
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  full_name text,
  phone text,
  wallet_balance_rwf numeric not null default 0,
  default_pay_method text not null default 'momo' check (default_pay_method in ('momo','airtel','wallet')),
  created_at timestamptz not null default now()
);

create table public.rfid_cards (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  physical_uid text not null,
  logical_number text not null,
  offline_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- TARIFFS ----------------------------------------------------------------
create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.tariff_segments (
  id uuid primary key default gen_random_uuid(),
  tariff_id uuid not null references public.tariffs(id) on delete cascade,
  half_hour_index int not null check (half_hour_index between 0 and 47),
  tier text not null check (tier in ('sharp','peak','standard','valley')),
  unique (tariff_id, half_hour_index)
);

create table public.tariff_rates (
  id uuid primary key default gen_random_uuid(),
  tariff_id uuid not null references public.tariffs(id) on delete cascade,
  tier text not null check (tier in ('sharp','peak','standard','valley')),
  energy_rwf_per_kwh numeric not null,
  service_rwf_per_kwh numeric not null default 0,
  unique (tariff_id, tier)
);

-- SESSIONS + TELEMETRY ---------------------------------------------------
create sequence public.session_serial_seq;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  serial_no text not null unique default ('UZA-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('public.session_serial_seq')::text, 5, '0')),
  connector_id uuid not null references public.connectors(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  start_method text not null default 'app' check (start_method in ('app','rfid','vin','offline')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'charging' check (status in ('preparing','charging','finishing','completed','faulted')),
  kwh numeric not null default 0,
  cost_rwf numeric not null default 0,
  soc_start int,
  soc_end int,
  stop_reason_code text,
  vin text,
  created_at timestamptz not null default now()
);
create index sessions_status_idx on public.sessions(status);
create index sessions_driver_idx on public.sessions(driver_id);

create table public.meter_values (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  voltage numeric,
  current numeric,
  power_kw numeric,
  kwh numeric,
  soc int,
  temp_c numeric
);
create index meter_values_session_ts_idx on public.meter_values(session_id, ts);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  tier_breakdown jsonb not null default '{}'::jsonb,
  meter_start numeric not null default 0,
  meter_stop numeric not null default 0,
  total_kwh numeric not null default 0,
  total_rwf numeric not null default 0,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  method text not null check (method in ('momo','airtel','wallet')),
  amount_rwf numeric not null,
  status text not null default 'pending' check (status in ('pending','settled','failed')),
  provider_ref text,
  created_at timestamptz not null default now()
);

-- OCPP SEAM --------------------------------------------------------------
create table public.charger_events (
  id bigint generated always as identity primary key,
  charger_id uuid references public.chargers(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create table public.charger_commands (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null references public.chargers(id) on delete cascade,
  type text not null check (type in ('remote_start','remote_stop','reset','unlock','update_firmware','set_max_power','enable','disable')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','sent','accepted','rejected','failed')),
  requested_by uuid,
  created_at timestamptz not null default now()
);

create table public.faults (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null references public.chargers(id) on delete cascade,
  code text not null,
  label text not null,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  raised_at timestamptz not null default now(),
  cleared_at timestamptz
);

-- GRANTS -----------------------------------------------------------------
grant select on public.operators, public.stations, public.chargers, public.connectors,
  public.tariffs, public.tariff_segments, public.tariff_rates, public.faults to anon;
grant select on public.operators, public.stations, public.chargers, public.connectors,
  public.tariffs, public.tariff_segments, public.tariff_rates, public.faults,
  public.drivers, public.rfid_cards, public.sessions, public.meter_values,
  public.transactions, public.payments, public.charger_events, public.charger_commands to authenticated;
grant all on public.operators, public.stations, public.chargers, public.connectors,
  public.tariffs, public.tariff_segments, public.tariff_rates, public.faults,
  public.drivers, public.rfid_cards, public.sessions, public.meter_values,
  public.transactions, public.payments, public.charger_events, public.charger_commands to service_role;
grant usage, select on sequence public.session_serial_seq to service_role;

-- RLS --------------------------------------------------------------------
alter table public.operators enable row level security;
alter table public.stations enable row level security;
alter table public.chargers enable row level security;
alter table public.connectors enable row level security;
alter table public.tariffs enable row level security;
alter table public.tariff_segments enable row level security;
alter table public.tariff_rates enable row level security;
alter table public.faults enable row level security;
alter table public.drivers enable row level security;
alter table public.rfid_cards enable row level security;
alter table public.sessions enable row level security;
alter table public.meter_values enable row level security;
alter table public.transactions enable row level security;
alter table public.payments enable row level security;
alter table public.charger_events enable row level security;
alter table public.charger_commands enable row level security;

create policy "operators_public_read" on public.operators for select to anon, authenticated using (true);
create policy "stations_public_read" on public.stations for select to anon, authenticated using (true);
create policy "chargers_public_read" on public.chargers for select to anon, authenticated using (true);
create policy "connectors_public_read" on public.connectors for select to anon, authenticated using (true);
create policy "tariffs_public_read" on public.tariffs for select to anon, authenticated using (true);
create policy "tariff_segments_public_read" on public.tariff_segments for select to anon, authenticated using (true);
create policy "tariff_rates_public_read" on public.tariff_rates for select to anon, authenticated using (true);
create policy "faults_public_read" on public.faults for select to anon, authenticated using (true);

create policy "drivers_read_own_or_staff" on public.drivers for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "drivers_update_own" on public.drivers for update to authenticated
  using (user_id = auth.uid());

create policy "cards_read_own_or_staff" on public.rfid_cards for select to authenticated
  using (public.is_staff(auth.uid()) or exists (select 1 from public.drivers d where d.id = rfid_cards.driver_id and d.user_id = auth.uid()));

create policy "sessions_read_own_or_staff" on public.sessions for select to authenticated
  using (public.is_staff(auth.uid()) or exists (select 1 from public.drivers d where d.id = sessions.driver_id and d.user_id = auth.uid()));

create policy "meter_values_read_own_or_staff" on public.meter_values for select to authenticated
  using (public.is_staff(auth.uid()) or exists (
    select 1 from public.sessions s join public.drivers d on d.id = s.driver_id
    where s.id = meter_values.session_id and d.user_id = auth.uid()));

create policy "transactions_read_own_or_staff" on public.transactions for select to authenticated
  using (public.is_staff(auth.uid()) or exists (
    select 1 from public.sessions s join public.drivers d on d.id = s.driver_id
    where s.id = transactions.session_id and d.user_id = auth.uid()));

create policy "payments_read_own_or_staff" on public.payments for select to authenticated
  using (public.is_staff(auth.uid()) or exists (select 1 from public.drivers d where d.id = payments.driver_id and d.user_id = auth.uid()));

create policy "charger_events_staff_read" on public.charger_events for select to authenticated
  using (public.is_staff(auth.uid()));
create policy "charger_commands_staff_read" on public.charger_commands for select to authenticated
  using (public.is_staff(auth.uid()));

-- BACKEND PRICING --------------------------------------------------------
create or replace function public.tier_for_ts(_tariff_id uuid, _ts timestamptz)
returns text language sql stable security definer set search_path = public as $$
  select s.tier from public.tariff_segments s
  where s.tariff_id = _tariff_id
    and s.half_hour_index = (
      extract(hour from _ts at time zone 'Africa/Kigali')::int * 2
      + case when extract(minute from _ts at time zone 'Africa/Kigali')::int >= 30 then 1 else 0 end)
  limit 1
$$;

create or replace function public.session_tariff_id(_session_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select t.id from public.sessions se
  join public.connectors c on c.id = se.connector_id
  join public.chargers ch on ch.id = c.charger_id
  join public.stations st on st.id = ch.station_id
  join public.tariffs t on t.operator_id = st.operator_id
  where se.id = _session_id limit 1
$$;

create or replace function public.compute_session_cost(_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        _rate numeric;
        _amt numeric;
      begin
        _tier := public.tier_for_ts(_tariff, _rec.ts);
        if _tier is not null and _d > 0 then
          select (energy_rwf_per_kwh + service_rwf_per_kwh) into _rate
          from public.tariff_rates where tariff_id = _tariff and tier = _tier limit 1;
          _amt := _d * coalesce(_rate, 0);
          _total := _total + _amt;
          _breakdown := jsonb_set(_breakdown, array[_tier],
            to_jsonb(round(coalesce((_breakdown->>_tier)::numeric, 0) + _amt)), true);
        end if;
      end;
    end if;
    _prev := coalesce(_rec.kwh, 0);
    _kwh := coalesce(_rec.kwh, 0);
  end loop;
  return jsonb_build_object('total_rwf', round(_total), 'total_kwh', round(_kwh, 3), 'tiers', _breakdown);
end;
$$;

grant execute on function public.compute_session_cost(uuid) to anon, authenticated, service_role;
grant execute on function public.tier_for_ts(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.session_tariff_id(uuid) to anon, authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_staff(uuid) to authenticated, service_role;

-- REALTIME ---------------------------------------------------------------
alter table public.sessions replica identity full;
alter table public.connectors replica identity full;
alter table public.chargers replica identity full;
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.meter_values;
alter publication supabase_realtime add table public.connectors;
alter publication supabase_realtime add table public.chargers;
alter publication supabase_realtime add table public.faults;
alter publication supabase_realtime add table public.charger_commands;
alter publication supabase_realtime add table public.payments;

-- SEED -------------------------------------------------------------------
insert into public.operators (id, name, momo_merchant_id, revenue_share_pct) values
 ('a1000000-0000-4000-8000-000000000001','Kigali PowerDrive Ltd','MOMO-KPD-4412', 82),
 ('a1000000-0000-4000-8000-000000000002','Rwanda Motion Energy','MOMO-RME-7781', 78),
 ('a1000000-0000-4000-8000-000000000003','EastAfrica GreenGrid','MOMO-EAG-2290', 85);

insert into public.stations (id, operator_id, name, area, gps_lat, gps_lng, kind) values
 ('b2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Kigali Heights Hub','Remera',-1.9536,30.0928,'180kW DC'),
 ('b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Nyabugogo Terminal','Nyabugogo',-1.9403,30.0464,'120kW DC'),
 ('b2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','Kimironko Market','Kimironko',-1.9482,30.1213,'22kW AC'),
 ('b2000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000002','KCC Downtown','Nyarugenge',-1.9497,30.0588,'180kW DC'),
 ('b2000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000002','Airport North Plaza','Kanombe',-1.9686,30.1395,'120kW DC'),
 ('b2000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000003','Musanze Highway Stop','Musanze',-1.4998,29.6350,'120kW DC');

insert into public.chargers (id, station_id, serial, vendor, model, connector_count, status, firmware_version, last_heartbeat, max_output_pct) values
 ('c3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','UZA-KH-180-01','Yunkuaichong','YKC-180D',2,'online','1.6J-4.2.1', now(), 100),
 ('c3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','UZA-KH-180-02','Star Charge','SC-180DC',2,'online','1.6J-4.2.1', now(), 90),
 ('c3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','UZA-NB-120-01','Kempower','K-120S',2,'online','1.6J-3.8.0', now(), 100),
 ('c3000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000003','UZA-KM-022-01','ABB','Terra-AC-22',2,'online','1.6J-2.9.4', now(), 100),
 ('c3000000-0000-4000-8000-000000000005','b2000000-0000-4000-8000-000000000004','UZA-KCC-180-01','Yunkuaichong','YKC-180D',2,'online','1.6J-4.2.1', now(), 100),
 ('c3000000-0000-4000-8000-000000000006','b2000000-0000-4000-8000-000000000004','UZA-KCC-180-02','Yunkuaichong','YKC-180D',2,'faulted','1.6J-4.1.7', now() - interval '4 minutes', 100),
 ('c3000000-0000-4000-8000-000000000007','b2000000-0000-4000-8000-000000000005','UZA-AP-120-01','Sinexcel','SX-120',2,'online','1.6J-3.8.0', now(), 80),
 ('c3000000-0000-4000-8000-000000000008','b2000000-0000-4000-8000-000000000006','UZA-MS-120-01','Kempower','K-120S',2,'offline','1.6J-3.6.2', now() - interval '3 hours', 100);

insert into public.connectors (id, charger_id, label, type, power_kw, status) values
 ('d4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Gun A','CCS2',180,'charging'),
 ('d4000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','Gun B','CCS2',180,'available'),
 ('d4000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000002','Gun A','CCS2',180,'charging'),
 ('d4000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000002','Gun B','CCS2',180,'available'),
 ('d4000000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000003','Gun A','CCS2',120,'charging'),
 ('d4000000-0000-4000-8000-000000000006','c3000000-0000-4000-8000-000000000003','Gun B','CCS2',120,'preparing'),
 ('d4000000-0000-4000-8000-000000000007','c3000000-0000-4000-8000-000000000004','Gun A','Type2',22,'available'),
 ('d4000000-0000-4000-8000-000000000008','c3000000-0000-4000-8000-000000000004','Gun B','Type2',22,'charging'),
 ('d4000000-0000-4000-8000-000000000009','c3000000-0000-4000-8000-000000000005','Gun A','CCS2',180,'available'),
 ('d4000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-000000000005','Gun B','CCS2',180,'available'),
 ('d4000000-0000-4000-8000-00000000000b','c3000000-0000-4000-8000-000000000006','Gun A','CCS2',180,'faulted'),
 ('d4000000-0000-4000-8000-00000000000c','c3000000-0000-4000-8000-000000000006','Gun B','CCS2',180,'faulted'),
 ('d4000000-0000-4000-8000-00000000000d','c3000000-0000-4000-8000-000000000007','Gun A','CCS2',120,'available'),
 ('d4000000-0000-4000-8000-00000000000e','c3000000-0000-4000-8000-000000000007','Gun B','CCS2',120,'finishing'),
 ('d4000000-0000-4000-8000-00000000000f','c3000000-0000-4000-8000-000000000008','Gun A','CCS2',120,'offline'),
 ('d4000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000008','Gun B','CCS2',120,'offline');

insert into public.drivers (id, user_id, full_name, phone, wallet_balance_rwf, default_pay_method) values
 ('e5000000-0000-4000-8000-000000000001', null,'Jean-Paul Habimana','+250788112233', 12500,'momo'),
 ('e5000000-0000-4000-8000-000000000002', null,'Aline Uwase','+250789334455', 4200,'airtel'),
 ('e5000000-0000-4000-8000-000000000003', null,'Eric Nsengimana','+250788556677', 26800,'wallet'),
 ('e5000000-0000-4000-8000-000000000004', null,'Claudine Mukamana','+250789778899', 900,'momo'),
 ('e5000000-0000-4000-8000-000000000005', null,'Patrick Rwema','+250788990011', 31000,'momo');

insert into public.rfid_cards (driver_id, physical_uid, logical_number, offline_enabled) values
 ('e5000000-0000-4000-8000-000000000001','04A2B7C9D1','UZA-0001-8842', true),
 ('e5000000-0000-4000-8000-000000000003','04F1E3A882','UZA-0003-1190', true),
 ('e5000000-0000-4000-8000-000000000005','04CC91B2D7','UZA-0005-7731', false);

insert into public.tariffs (id, operator_id, name) values
 ('f6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','KPD Standard RWF'),
 ('f6000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','RME Dynamic RWF'),
 ('f6000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','GreenGrid Highway RWF');

insert into public.tariff_segments (tariff_id, half_hour_index, tier)
select t.id, g,
  case
    when g between 36 and 41 then 'sharp'
    when g between 14 and 19 or g between 42 and 45 then 'peak'
    when g between 0 and 11 or g >= 46 then 'valley'
    else 'standard'
  end
from public.tariffs t cross join generate_series(0,47) g;

insert into public.tariff_rates (tariff_id, tier, energy_rwf_per_kwh, service_rwf_per_kwh) values
 ('f6000000-0000-4000-8000-000000000001','sharp',   295, 45),
 ('f6000000-0000-4000-8000-000000000001','peak',    255, 40),
 ('f6000000-0000-4000-8000-000000000001','standard',215, 35),
 ('f6000000-0000-4000-8000-000000000001','valley',  165, 30),
 ('f6000000-0000-4000-8000-000000000002','sharp',   310, 50),
 ('f6000000-0000-4000-8000-000000000002','peak',    265, 42),
 ('f6000000-0000-4000-8000-000000000002','standard',225, 36),
 ('f6000000-0000-4000-8000-000000000002','valley',  170, 28),
 ('f6000000-0000-4000-8000-000000000003','sharp',   285, 48),
 ('f6000000-0000-4000-8000-000000000003','peak',    245, 40),
 ('f6000000-0000-4000-8000-000000000003','standard',205, 34),
 ('f6000000-0000-4000-8000-000000000003','valley',  160, 26);

-- live sessions
insert into public.sessions (id, connector_id, driver_id, start_method, started_at, status, soc_start, vin) values
 ('99000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','app', now() - interval '9 minutes','charging', 24,'LSVAU21B8NN012345'),
 ('99000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000002','rfid', now() - interval '7 minutes','charging', 41,'LGXC24E45N0098211'),
 ('99000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000005','e5000000-0000-4000-8000-000000000003','app', now() - interval '5 minutes','charging', 58,'WBY8P210X07J12309'),
 ('99000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000008','e5000000-0000-4000-8000-000000000005','vin', now() - interval '4 minutes','charging', 66,'LFV3A23C1P3011882');

insert into public.meter_values (session_id, ts, voltage, current, power_kw, kwh, soc, temp_c)
select s.id,
  s.started_at + (g * interval '30 seconds'),
  round((398 + random()*22)::numeric, 1),
  round((110 + random()*60)::numeric, 1),
  round((52 + random()*24)::numeric, 2),
  round((g * 0.48)::numeric, 3),
  s.soc_start + g,
  round((27 + random()*7)::numeric, 1)
from public.sessions s cross join generate_series(0,9) g
where s.status = 'charging';

update public.sessions set kwh = 4.32, soc_end = soc_start + 9 where status = 'charging';
update public.sessions set cost_rwf = (public.compute_session_cost(id)->>'total_rwf')::numeric where status = 'charging';

-- completed history
insert into public.sessions (id, connector_id, driver_id, start_method, started_at, ended_at, status, kwh, cost_rwf, soc_start, soc_end, stop_reason_code, vin) values
 ('99000000-0000-4000-8000-000000000011','d4000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','app', now() - interval '5 hours', now() - interval '4 hours 22 minutes','completed', 38.4, 9600, 18, 82,'Local','LSVAU21B8NN012345'),
 ('99000000-0000-4000-8000-000000000012','d4000000-0000-4000-8000-000000000009','e5000000-0000-4000-8000-000000000003','rfid', now() - interval '1 day', now() - interval '23 hours 30 minutes','completed', 27.1, 6480, 35, 88,'EVDisconnected','WBY8P210X07J12309'),
 ('99000000-0000-4000-8000-000000000013','d4000000-0000-4000-8000-00000000000d','e5000000-0000-4000-8000-000000000004','app', now() - interval '2 days', now() - interval '2 days' + interval '52 minutes','completed', 45.9, 11700, 12, 95,'Local','LFV3A23C1P3011882'),
 ('99000000-0000-4000-8000-000000000014','d4000000-0000-4000-8000-00000000000e','e5000000-0000-4000-8000-000000000005','app', now() - interval '2 hours', now() - interval '1 hour 18 minutes','completed', 31.7, 7920, 44, 91,'Local','LFV3A23C1P3011882');

insert into public.transactions (session_id, tier_breakdown, meter_start, meter_stop, total_kwh, total_rwf, settled)
select id, jsonb_build_object('standard', round(cost_rwf*0.6), 'peak', round(cost_rwf*0.4)), 0, kwh, kwh, cost_rwf, true
from public.sessions where status = 'completed';

insert into public.payments (driver_id, session_id, method, amount_rwf, status, provider_ref)
select driver_id, id,
  case when random() < 0.5 then 'momo' else 'airtel' end,
  cost_rwf, 'settled', 'REF-' || upper(substr(md5(id::text), 1, 10))
from public.sessions where status = 'completed';

insert into public.payments (driver_id, session_id, method, amount_rwf, status, provider_ref) values
 ('e5000000-0000-4000-8000-000000000002', null,'momo', 10000,'settled','TOPUP-MOMO-88213'),
 ('e5000000-0000-4000-8000-000000000004', null,'airtel', 5000,'pending','TOPUP-AIRT-11902');

insert into public.faults (charger_id, code, label, severity, raised_at) values
 ('c3000000-0000-4000-8000-000000000006','GroundFailure','Ground fault detected on Gun A','critical', now() - interval '38 minutes'),
 ('c3000000-0000-4000-8000-000000000008','ConnectionLost','Charger heartbeat lost','critical', now() - interval '3 hours');

insert into public.faults (charger_id, code, label, severity, raised_at, cleared_at) values
 ('c3000000-0000-4000-8000-000000000002','OverTemperature','Cabinet temperature high','warning', now() - interval '2 days', now() - interval '2 days' + interval '35 minutes');

insert into public.charger_events (charger_id, type, payload, received_at)
select id, 'BootNotification', jsonb_build_object('chargePointVendor', vendor, 'chargePointModel', model, 'firmwareVersion', firmware_version), now() - interval '6 hours'
from public.chargers;

insert into public.charger_events (charger_id, type, payload, received_at)
select id, 'Heartbeat', jsonb_build_object('currentTime', now()), now()
from public.chargers where status = 'online';
