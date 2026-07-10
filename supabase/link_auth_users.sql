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
-- 2) EDIT ME — set display names
-- ------------------------------------------------------------
update public.users
set first_name = 'דנה', last_name = 'לוי'
where id = (select id from auth.users where email = 'admin@example.com');

update public.users
set first_name = 'יוסי', last_name = 'כהן'
where id = (select id from auth.users where email = 'employee@example.com');

-- Optional third employee:
-- update public.users
-- set first_name = 'מיכל', last_name = 'ברק'
-- where id = (select id from auth.users where email = 'employee2@example.com');

-- ------------------------------------------------------------
-- 3) EDIT ME — promote Admin (exactly one is enough to start)
-- ------------------------------------------------------------
update public.users
set role = 'Admin'
where id = (select id from auth.users where email = 'admin@example.com');

-- Everyone else stays Employee (optional hard reset):
-- update public.users
-- set role = 'Employee'
-- where id in (
--   select id from auth.users
--   where email in ('employee@example.com', 'employee2@example.com')
-- );

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
