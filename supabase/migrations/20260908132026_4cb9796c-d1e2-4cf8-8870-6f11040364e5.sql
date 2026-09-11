insert into public.owner_members (owner_id, user_id, role)
select o.id, u.id, 'owner_admin'
from public.owners o, auth.users u
where o.name = 'Kigali PowerDrive Ltd'
  and u.email = 'iradyv7@gmail.com'
  and not exists (
    select 1 from public.owner_members m where m.owner_id = o.id and m.user_id = u.id
  );
