-- ============================================================
-- UZA EMPOWER — driver training, bank financing, savings companion
-- Money is integer minor units everywhere. UZA never holds driver money;
-- these tables are a RECORD of what the driver paid on their own MoMo/cash.
-- ============================================================

create or replace function public.current_driver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select d.id from public.drivers d where d.user_id = auth.uid() limit 1
$$;
revoke all on function public.current_driver_id() from public, anon;
grant execute on function public.current_driver_id() to authenticated, service_role;

-- ---------- banks ----------
create table public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  country_code text not null default 'RW',
  deposit_bps integer not null default 1000,
  min_client_contribution_minor bigint not null default 50000000,
  terms_status text not null default 'ASSUMED' check (terms_status in ('CONFIRMED','ASSUMED')),
  contact_name text,
  contact_email text,
  contact_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.banks to authenticated;
grant all on public.banks to service_role;
alter table public.banks enable row level security;
create policy "banks readable by signed-in users" on public.banks for select to authenticated using (true);

create table public.bank_members (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'bank_officer' check (role in ('bank_officer','bank_admin')),
  created_at timestamptz not null default now(),
  unique (bank_id, user_id)
);
grant select on public.bank_members to authenticated;
grant all on public.bank_members to service_role;
alter table public.bank_members enable row level security;
create policy "bank members see their own membership" on public.bank_members
  for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.has_bank_access(_bank_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid())
      or exists (select 1 from public.bank_members m
                 where m.bank_id = _bank_id and m.user_id = auth.uid())
$$;
revoke all on function public.has_bank_access(uuid) from public, anon;
grant execute on function public.has_bank_access(uuid) to authenticated, service_role;

-- ---------- training ----------
create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  hours numeric not null default 0,
  required_for_finance boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.training_programs to authenticated;
grant all on public.training_programs to service_role;
alter table public.training_programs enable row level security;
create policy "training catalogue readable" on public.training_programs
  for select to authenticated using (active or public.is_staff(auth.uid()));

create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled','in_progress','completed','withdrawn')),
  score_pct integer check (score_pct between 0 and 100),
  started_on date,
  completed_on date,
  assessor text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, program_id)
);
grant select on public.training_records to authenticated;
grant all on public.training_records to service_role;
alter table public.training_records enable row level security;
create policy "driver reads own training" on public.training_records
  for select to authenticated using (driver_id = public.current_driver_id());
create policy "staff reads all training" on public.training_records
  for select to authenticated using (public.is_staff(auth.uid()));
-- ---------- finance applications ----------
create table public.finance_applications (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bank_id uuid references public.banks(id) on delete set null,
  vehicle_price_minor bigint not null,
  client_contribution_minor bigint not null default 0,
  bridge_minor bigint not null default 0,
  financed_total_minor bigint not null default 0,
  deposit_required_minor bigint not null default 0,
  principal_minor bigint not null default 0,
  term_months integer not null default 48,
  collateral_release_month integer not null default 24,
  status text not null default 'draft'
    check (status in ('draft','submitted','under_review','approved','declined','disbursed','repaying','closed')),
  rule_version integer not null default 1,
  trace jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index finance_applications_driver_idx on public.finance_applications(driver_id);
create index finance_applications_bank_idx on public.finance_applications(bank_id);
grant select on public.finance_applications to authenticated;
grant all on public.finance_applications to service_role;
alter table public.finance_applications enable row level security;
create policy "driver reads own application" on public.finance_applications
  for select to authenticated using (driver_id = public.current_driver_id());
create policy "bank reads its applications" on public.finance_applications
  for select to authenticated using (bank_id is not null and public.has_bank_access(bank_id));
create policy "staff reads all applications" on public.finance_applications
  for select to authenticated using (public.is_staff(auth.uid()));

create policy "financing bank reads client training" on public.training_records
  for select to authenticated using (exists (
    select 1 from public.finance_applications a
    where a.driver_id = training_records.driver_id
      and a.bank_id is not null and public.has_bank_access(a.bank_id)));

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.finance_applications(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bank_id uuid references public.banks(id) on delete set null,
  principal_minor bigint not null,
  instalment_minor bigint not null,
  cadence text not null default 'monthly' check (cadence in ('monthly','weekly')),
  term_months integer not null default 48,
  start_on date not null default current_date,
  next_due_on date,
  paid_to_date_minor bigint not null default 0,
  collateral_blocked_minor bigint not null default 0,
  collateral_released_minor bigint not null default 0,
  collateral_release_month integer not null default 24,
  status text not null default 'active' check (status in ('active','in_arrears','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loans_driver_idx on public.loans(driver_id);
create index loans_bank_idx on public.loans(bank_id);
grant select on public.loans to authenticated;
grant all on public.loans to service_role;
alter table public.loans enable row level security;
create policy "driver reads own loan" on public.loans
  for select to authenticated using (driver_id = public.current_driver_id());
create policy "bank reads its loans" on public.loans
  for select to authenticated using (bank_id is not null and public.has_bank_access(bank_id));
create policy "staff reads all loans" on public.loans
  for select to authenticated using (public.is_staff(auth.uid()));

-- ---------- savings pots (the driver's own named sub-accounts) ----------
create table public.savings_pots (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  name text not null,
  category text not null default 'personal'
    check (category in ('loan','maintenance','electricity','opex','insurance','personal','other')),
  target_cadence text not null default 'daily' check (target_cadence in ('daily','weekly','monthly')),
  target_minor bigint not null default 0,
  system_managed boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index savings_pots_driver_idx on public.savings_pots(driver_id);
grant select, insert, update on public.savings_pots to authenticated;
grant all on public.savings_pots to service_role;
alter table public.savings_pots enable row level security;
create policy "driver manages own pots" on public.savings_pots
  for select to authenticated using (driver_id = public.current_driver_id());
create policy "driver creates own pots" on public.savings_pots
  for insert to authenticated with check (driver_id = public.current_driver_id());
create policy "driver edits own pots" on public.savings_pots
  for update to authenticated using (driver_id = public.current_driver_id())
  with check (driver_id = public.current_driver_id());
create policy "staff reads all pots" on public.savings_pots
  for select to authenticated using (public.is_staff(auth.uid()));
create policy "bank reads client pots" on public.savings_pots
  for select to authenticated using (exists (
    select 1 from public.loans l
    where l.driver_id = savings_pots.driver_id and l.bank_id is not null and public.has_bank_access(l.bank_id)));

-- ---------- savings entries: append-only record of money the driver paid ----------
create table public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  pot_id uuid not null references public.savings_pots(id) on delete cascade,
  kind text not null default 'credit' check (kind in ('credit','reversal')),
  amount_minor bigint not null check (amount_minor > 0),
  source text not null default 'cash_manual'
    check (source in ('momo_recorded','airtel_recorded','cash_manual','bank_statement','charging_payout')),
  occurred_on date not null default (now() at time zone 'Africa/Kigali')::date,
  note text,
  external_ref text,
  reversal_of uuid references public.savings_entries(id) on delete set null,
  recorded_by uuid,
  created_at timestamptz not null default now()
);
create index savings_entries_driver_day_idx on public.savings_entries(driver_id, occurred_on);
create index savings_entries_pot_idx on public.savings_entries(pot_id);
grant select, insert on public.savings_entries to authenticated;
grant all on public.savings_entries to service_role;
alter table public.savings_entries enable row level security;
create policy "driver reads own entries" on public.savings_entries
  for select to authenticated using (driver_id = public.current_driver_id());
create policy "driver records own entries" on public.savings_entries
  for insert to authenticated with check (driver_id = public.current_driver_id());
create policy "staff reads all entries" on public.savings_entries
  for select to authenticated using (public.is_staff(auth.uid()));
create policy "bank reads client entries" on public.savings_entries
  for select to authenticated using (exists (
    select 1 from public.loans l
    where l.driver_id = savings_entries.driver_id and l.bank_id is not null and public.has_bank_access(l.bank_id)));

create or replace function public.savings_entries_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'savings_entries is append-only: correct a mistake with a reversal entry';
end; $$;
create trigger savings_entries_no_change before update or delete on public.savings_entries
  for each row execute function public.savings_entries_append_only();

-- ---------- immutable finance audit ----------
create table public.finance_audit (
  id bigserial primary key,
  actor_id uuid,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
grant select on public.finance_audit to authenticated;
grant all on public.finance_audit to service_role;
alter table public.finance_audit enable row level security;
create policy "staff reads finance audit" on public.finance_audit
  for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.finance_audit_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'finance_audit is append-only';
end; $$;
create trigger finance_audit_no_change before update or delete on public.finance_audit
  for each row execute function public.finance_audit_append_only();

create or replace function public.log_finance_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.finance_audit(actor_id, entity, entity_id, action, before, after)
  values (auth.uid(), tg_table_name, coalesce(new.id, old.id), lower(tg_op),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end; $$;

create trigger finance_applications_audit after insert or update or delete on public.finance_applications
  for each row execute function public.log_finance_change();
create trigger loans_audit after insert or update or delete on public.loans
  for each row execute function public.log_finance_change();

create trigger banks_updated_at before update on public.banks
  for each row execute function public.set_updated_at();
create trigger training_records_updated_at before update on public.training_records
  for each row execute function public.set_updated_at();
create trigger finance_applications_updated_at before update on public.finance_applications
  for each row execute function public.set_updated_at();
create trigger loans_updated_at before update on public.loans
  for each row execute function public.set_updated_at();
create trigger savings_pots_updated_at before update on public.savings_pots
  for each row execute function public.set_updated_at();

-- ---------- seed the real training catalogue ----------
insert into public.training_programs (code, name, description, hours, required_for_finance, sort_order) values
  ('defensive_driving','Defensive driving & road safety','Rwandan road rules, hazard awareness, passenger safety and incident reporting.',16,true,1),
  ('ev_handling','EV handling & charging discipline','How an electric vehicle behaves, battery care, safe charging, what to do when a charger faults.',12,true,2),
  ('financial_literacy','Financial literacy & saving discipline','Daily targets, separating income from profit, saving for the instalment, avoiding mobile-money fraud.',12,true,3),
  ('customer_care','Customer care & platform conduct','Serving passengers, ratings, disputes, honest fare handling.',8,false,4),
  ('business_basics','Running your vehicle as a business','Running costs, maintenance planning, record keeping, growing from one vehicle to a fleet.',10,false,5)
on conflict (code) do nothing;
