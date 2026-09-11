create or replace function public.current_driver_id()
returns uuid language sql stable security invoker set search_path = public as $$
  select d.id from public.drivers d where d.user_id = auth.uid() limit 1
$$;
revoke all on function public.current_driver_id() from public, anon;
grant execute on function public.current_driver_id() to authenticated, service_role;

create or replace function public.has_bank_access(_bank_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select public.is_staff(auth.uid())
      or exists (select 1 from public.bank_members m
                 where m.bank_id = _bank_id and m.user_id = auth.uid())
$$;
revoke all on function public.has_bank_access(uuid) from public, anon;
grant execute on function public.has_bank_access(uuid) to authenticated, service_role;
