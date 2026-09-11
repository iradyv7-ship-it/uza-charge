-- has_owner_access does not need elevated rights: owner_members already has a
-- read-own policy and user_roles a select-own policy, so the check works
-- correctly as SECURITY INVOKER and no longer runs with the owner's rights.
create or replace function public.has_owner_access(_owner_id uuid)
returns boolean language sql stable set search_path = public as $$
  select public.is_staff(auth.uid())
      or exists (select 1 from public.owner_members m
                 where m.owner_id = _owner_id and m.user_id = auth.uid())
$$;
revoke all on function public.has_owner_access(uuid) from public, anon;
grant execute on function public.has_owner_access(uuid) to authenticated, service_role;
