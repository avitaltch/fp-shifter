-- ============================================================
-- Link Auth users → public.users (manual bootstrap)
-- Paste into Supabase → SQL Editor and run.
-- Edit the emails / names in the blocks marked EDIT ME.
-- ============================================================

-- ------------------------------------------------------------
-- 0) See who exists and who is missing a profile
-- ------------------------------------------------------------
select
  a.id,
  a.email,
  a.created_at as auth_created_at,
  u.first_name,
  u.last_name,
  u.role,
  u.deleted_at,
  case when u.id is null then 'MISSING public.users' else 'linked' end as link_status
from auth.users a
left join public.users u on u.id = a.id
order by a.created_at;

-- ------------------------------------------------------------
-- 1) Backfill any auth user that has no public.users row
--    (same id = the link; role defaults to Employee)
-- ------------------------------------------------------------
insert into public.users (id, first_name, last_name, role)
select
  a.id,
  'New',
  'User',
  'Employee'
from auth.users a
left join public.users u on u.id = a.id
where u.id is null;

-- ------------------------------------------------------------
-- 2) Demo display names (admindemo / userdemo)
-- ------------------------------------------------------------
update public.users
set first_name = 'דנה', last_name = 'לוי'
where id = (select id from auth.users where email = 'admindemo@demo.internal');

update public.users
set first_name = 'יוסי', last_name = 'כהן'
where id = (select id from auth.users where email = 'userdemo@demo.internal');

-- ------------------------------------------------------------
-- 3) Promote Admin
-- ------------------------------------------------------------
update public.users
set role = 'Admin'
where id = (select id from auth.users where email = 'admindemo@demo.internal');

update public.users
set role = 'Employee'
where id = (select id from auth.users where email = 'userdemo@demo.internal');

-- ------------------------------------------------------------
-- 4) Verify
-- ------------------------------------------------------------
select
  a.email,
  u.first_name,
  u.last_name,
  u.role,
  u.deleted_at
from auth.users a
join public.users u on u.id = a.id
order by u.role desc, a.email;

-- ------------------------------------------------------------
-- 5) Next (separate file): after staff are linked, run seed.sql
--    so skills / 90-day availability / demo appointments attach.
-- ============================================================
