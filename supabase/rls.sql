-- ============================================================
-- fp-shifter RLS (v2)
-- Principles:
--  * Roles live ONLY in public.users.role — never in user_metadata.
--  * Users cannot change their own role (see with check on the update policy).
--  * Anonymous visitors get: service_types (read) + the booking RPCs. Nothing else.
--  * All booking writes go through security definer functions (functions.sql),
--    so there are NO public insert policies on customers/appointments/items.
-- ============================================================

alter table customers enable row level security;
alter table users enable row level security;
alter table service_types enable row level security;
alter table employee_skills enable row level security;
alter table appointments enable row level security;
alter table appointment_items enable row level security;
alter table availabilities enable row level security;

-- ------------------------------------------------------------
-- Helper functions (security definer → no RLS recursion on users)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from users
    where id = auth.uid() and role = 'Admin' and deleted_at is null
  );
$$;

create or replace function public.role_of(p_user_id uuid)
returns text
language sql security definer stable set search_path = public as $$
  select role from users where id = p_user_id;
$$;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
create policy "Staff can view users"
on users for select
to authenticated
using (true);

-- A user may edit their own profile but NOT their own role:
-- the with check pins role to its current value.
create policy "Users can update their own profile"
on users for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id and role = public.role_of(id));

create policy "Admins can update any profile"
on users for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete any profile"
on users for delete
to authenticated
using (public.is_admin());

-- ------------------------------------------------------------
-- customers (staff only — customers never log in)
-- ------------------------------------------------------------
create policy "Staff can view customers"
on customers for select
to authenticated
using (deleted_at is null);

create policy "Admins can manage customers"
on customers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ------------------------------------------------------------
-- service_types (public catalog)
-- ------------------------------------------------------------
create policy "Anyone can view active service types"
on service_types for select
to anon, authenticated
using (deleted_at is null);

create policy "Admins can manage service types"
on service_types for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ------------------------------------------------------------
-- employee_skills
-- ------------------------------------------------------------
create policy "Staff can view employee skills"
on employee_skills for select
to authenticated
using (true);

create policy "Admins can manage employee skills"
on employee_skills for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ------------------------------------------------------------
-- appointments (created only via the book_appointment RPC)
-- ------------------------------------------------------------
create policy "Staff can view appointments"
on appointments for select
to authenticated
using (deleted_at is null);

create policy "Admins can manage appointments"
on appointments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ------------------------------------------------------------
-- appointment_items (created only via the book_appointment RPC)
-- ------------------------------------------------------------
create policy "Staff can view appointment items"
on appointment_items for select
to authenticated
using (deleted_at is null);

create policy "Admins can manage appointment items"
on appointment_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Employees may update their OWN items (e.g. progress status).
-- with check keeps user_id pinned to themselves — no reassigning to others.
create policy "Employees can update their own items"
on appointment_items for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Employees may claim an UNASSIGNED item for themselves (volunteer flow).
create policy "Employees can claim unassigned items"
on appointment_items for update
to authenticated
using (user_id is null and deleted_at is null)
with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- availabilities
-- ------------------------------------------------------------
create policy "Staff can view availabilities"
on availabilities for select
to authenticated
using (true);

create policy "Users can manage their own availability"
on availabilities for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Admins can manage any availability"
on availabilities for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
