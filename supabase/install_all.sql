-- ============================================================
-- ONE-SHOT INSTALLER for an empty/expendable database.
-- Paste this whole file into Supabase Dashboard -> SQL Editor -> Run.
-- It DROPS all fp-shifter tables and recreates everything (v2):
-- schema + RLS + business functions + demo services.
-- (Generated from schema.sql + rls.sql + functions.sql + seed.sql —
--  edit those files, not this one.)
-- ============================================================

-- ---- reset ----
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.get_available_slots(date, uuid[]) cascade;
drop function if exists public.book_appointment(text, text, text, text, date, time, uuid[], text) cascade;
drop function if exists public.admin_set_user_role(uuid, text) cascade;
drop function if exists public.qualified_employees(uuid[]) cascade;
drop function if exists public.business_now() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.role_of(uuid) cascade;
drop function if exists public.set_updated_at() cascade;
drop table if exists appointment_items cascade;
drop table if exists appointments cascade;
drop table if exists availabilities cascade;
drop table if exists employee_skills cascade;
drop table if exists service_types cascade;
drop table if exists customers cascade;
drop table if exists users cascade;

-- ==================== schema.sql ====================
-- ============================================================
-- fp-shifter schema (v2) — fresh install
-- Single-business generic booking system.
-- Run this on an empty database, then rls.sql, then functions.sql.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists btree_gist; -- needed for overlap (exclusion) constraints

-- Table: customers
create table customers (
  id uuid primary key default uuid_generate_v4(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text not null,
  address text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

-- One active customer per phone number (booking upserts by phone)
create unique index customers_phone_unique on customers (phone) where deleted_at is null;

-- Table: users (extends Supabase auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  role text not null default 'Employee' check (role in ('Admin', 'Employee')),
  phone text,
  hire_date date,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

-- Table: service_types
create table service_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  base_price numeric not null check (base_price >= 0),
  default_duration integer not null check (default_duration > 0), -- in minutes
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

create unique index service_types_name_unique on service_types (name) where deleted_at is null;

-- Table: employee_skills — which services an employee can perform
create table employee_skills (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade not null,
  service_type_id uuid references service_types(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(user_id, service_type_id)
);

create index employee_skills_service_idx on employee_skills (service_type_id);

-- Table: appointments
create table appointments (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete restrict not null,
  visit_date date not null,
  total_price numeric not null default 0 check (total_price >= 0),
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Cancelled', 'Completed')),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

create index appointments_visit_date_idx on appointments (visit_date);
create index appointments_customer_idx on appointments (customer_id);

-- Table: appointment_items — one row per booked service
create table appointment_items (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid references appointments(id) on delete cascade not null,
  service_type_id uuid references service_types(id) on delete restrict not null,
  user_id uuid references users(id) on delete restrict,
  -- work_date mirrors appointments.visit_date so overlap checks live on one row
  work_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'Scheduled' check (status in ('Scheduled', 'In_Progress', 'Done')),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone,
  check (start_time < end_time),
  -- An employee cannot have two overlapping assignments (date-aware, range-aware)
  constraint no_overlapping_assignments exclude using gist (
    user_id with =,
    tsrange((work_date + start_time)::timestamp, (work_date + end_time)::timestamp) with &&
  ) where (user_id is not null and deleted_at is null)
);

create index appointment_items_appointment_idx on appointment_items (appointment_id);
create index appointment_items_user_date_idx on appointment_items (user_id, work_date);
create index appointment_items_unassigned_idx on appointment_items (work_date) where user_id is null and deleted_at is null;

-- Table: availabilities — when an employee can work
create table availabilities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade not null,
  available_date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  check (start_time < end_time),
  -- No overlapping availability windows for the same employee
  constraint no_overlapping_availability exclude using gist (
    user_id with =,
    tsrange((available_date + start_time)::timestamp, (available_date + end_time)::timestamp) with &&
  )
);

create index availabilities_user_date_idx on availabilities (user_id, available_date);
create index availabilities_date_idx on availabilities (available_date);

-- ============================================================
-- Triggers
-- ============================================================

-- Keep updated_at fresh on every update
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_customers_updated_at before update on customers
  for each row execute procedure public.set_updated_at();
create trigger set_users_updated_at before update on users
  for each row execute procedure public.set_updated_at();
create trigger set_service_types_updated_at before update on service_types
  for each row execute procedure public.set_updated_at();
create trigger set_appointments_updated_at before update on appointments
  for each row execute procedure public.set_updated_at();
create trigger set_appointment_items_updated_at before update on appointment_items
  for each row execute procedure public.set_updated_at();
create trigger set_availabilities_updated_at before update on availabilities
  for each row execute procedure public.set_updated_at();

-- Mirror new auth users into public.users.
-- Role is ALWAYS 'Employee' here; promoting to Admin is done by an existing
-- Admin (see admin_set_user_role in functions.sql) or manually in SQL for
-- bootstrapping the first Admin.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, first_name, last_name, role)
  values (
    new.id,
    coalesce(nullif(split_part(new.raw_user_meta_data->>'full_name', ' ', 1), ''), 'New'),
    coalesce(nullif(split_part(new.raw_user_meta_data->>'full_name', ' ', 2), ''), 'User'),
    'Employee'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==================== rls.sql ====================
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

-- ==================== functions.sql ====================
-- ============================================================
-- fp-shifter business logic (v2)
-- Security definer RPCs: booking runs server-side so pricing,
-- skills, conflicts and transactionality cannot be bypassed
-- from the browser. Run after schema.sql + rls.sql.
-- ============================================================

-- Business timezone: all "today"/"now" checks use this, not UTC.
create or replace function public.business_now()
returns timestamp
language sql stable as $$
  select timezone('Asia/Jerusalem', now());
$$;

-- ------------------------------------------------------------
-- Employees qualified to perform ALL of the given services
-- ------------------------------------------------------------
create or replace function public.qualified_employees(p_service_ids uuid[])
returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.id
  from users u
  where u.deleted_at is null
    and not exists (
      select 1 from unnest(p_service_ids) as s(id)
      where not exists (
        select 1 from employee_skills es
        where es.user_id = u.id and es.service_type_id = s.id
      )
    );
$$;

-- ------------------------------------------------------------
-- get_available_slots
-- Returns bookable start/end times for a date + set of services:
-- a 15-minute grid over qualified employees' availability windows,
-- minus anything that would overlap an existing assignment.
-- ------------------------------------------------------------
create or replace function public.get_available_slots(
  p_date date,
  p_service_ids uuid[]
)
returns table (slot_start time, slot_end time)
language plpgsql stable security definer set search_path = public as $$
declare
  v_duration integer;
  v_now timestamp := public.business_now();
begin
  select coalesce(sum(default_duration), 0)::integer into v_duration
  from service_types
  where id = any(p_service_ids) and deleted_at is null;

  if v_duration = 0 or p_date < v_now::date then
    return;
  end if;

  return query
  with candidate as (
    -- every 15-min start inside a qualified employee's window that fits the full duration
    select
      a.user_id,
      gs as start_ts,
      gs + make_interval(mins => v_duration) as end_ts
    from availabilities a
    join public.qualified_employees(p_service_ids) q(id) on q.id = a.user_id
    cross join lateral generate_series(
      (p_date + a.start_time)::timestamp,
      (p_date + a.end_time)::timestamp - make_interval(mins => v_duration),
      interval '15 minutes'
    ) as gs
    where a.available_date = p_date
  )
  select distinct c.start_ts::time, c.end_ts::time
  from candidate c
  where c.start_ts > v_now -- no booking in the past (matters when p_date = today)
    and not exists (
      select 1 from appointment_items ai
      where ai.user_id = c.user_id
        and ai.work_date = p_date
        and ai.deleted_at is null
        and tsrange((ai.work_date + ai.start_time)::timestamp,
                    (ai.work_date + ai.end_time)::timestamp)
            && tsrange(c.start_ts, c.end_ts)
    )
  order by 1;
end;
$$;

-- ------------------------------------------------------------
-- book_appointment
-- The ONLY write path for customer bookings (anon or logged in).
-- Transactional: customer upsert + appointment + items + employee
-- auto-assignment happen atomically; price comes from the DB.
-- Raises SLOT_TAKEN if the slot was grabbed concurrently.
-- ------------------------------------------------------------
create or replace function public.book_appointment(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_visit_date date,
  p_start_time time,
  p_service_ids uuid[],
  p_notes text default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := public.business_now();
  v_customer_id uuid;
  v_appointment_id uuid;
  v_employee_id uuid;
  v_total_price numeric := 0;
  v_total_duration integer := 0;
  v_cursor time;
  v_service record;
  v_end_time time;
begin
  -- ---- validate input ----
  if trim(coalesce(p_first_name, '')) = '' or trim(coalesce(p_last_name, '')) = '' then
    raise exception 'INVALID_NAME';
  end if;
  if coalesce(p_phone, '') !~ '^[0-9+\-\s]{7,15}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'NO_SERVICES';
  end if;

  select coalesce(sum(base_price), 0), coalesce(sum(default_duration), 0)::integer
  into v_total_price, v_total_duration
  from service_types
  where id = any(p_service_ids) and deleted_at is null;

  if v_total_duration = 0
     or (select count(*) from service_types where id = any(p_service_ids) and deleted_at is null)
        <> array_length(p_service_ids, 1) then
    raise exception 'UNKNOWN_SERVICE';
  end if;

  v_end_time := ((p_visit_date + p_start_time)::timestamp
                 + make_interval(mins => v_total_duration))::time;

  if (p_visit_date + p_start_time)::timestamp <= v_now then
    raise exception 'SLOT_IN_PAST';
  end if;

  -- ---- pick an employee: qualified, available for the whole span, no conflicts.
  -- Least-loaded-first keeps assignments fair. ----
  select q.id into v_employee_id
  from public.qualified_employees(p_service_ids) q(id)
  join availabilities a
    on a.user_id = q.id
   and a.available_date = p_visit_date
   and a.start_time <= p_start_time
   and (p_visit_date + a.end_time)::timestamp
       >= (p_visit_date + p_start_time)::timestamp + make_interval(mins => v_total_duration)
  where not exists (
    select 1 from appointment_items ai
    where ai.user_id = q.id
      and ai.work_date = p_visit_date
      and ai.deleted_at is null
      and tsrange((ai.work_date + ai.start_time)::timestamp,
                  (ai.work_date + ai.end_time)::timestamp)
          && tsrange((p_visit_date + p_start_time)::timestamp,
                     (p_visit_date + p_start_time)::timestamp + make_interval(mins => v_total_duration))
  )
  order by (
    select count(*) from appointment_items ai2
    where ai2.user_id = q.id and ai2.work_date = p_visit_date and ai2.deleted_at is null
  ) asc
  limit 1;

  if v_employee_id is null then
    raise exception 'SLOT_TAKEN';
  end if;

  -- ---- upsert customer by phone ----
  insert into customers (first_name, last_name, phone, email)
  values (trim(p_first_name), trim(p_last_name), trim(p_phone), nullif(trim(coalesce(p_email, '')), ''))
  on conflict (phone) where deleted_at is null
  do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = coalesce(excluded.email, customers.email)
  returning id into v_customer_id;

  -- ---- create appointment + one item per service, chained back-to-back ----
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_customer_id, p_visit_date, v_total_price, 'Confirmed', nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_appointment_id;

  v_cursor := p_start_time;
  for v_service in
    select st.id, st.default_duration
    from unnest(p_service_ids) with ordinality as chosen(id, ord)
    join service_types st on st.id = chosen.id
    order by chosen.ord
  loop
    insert into appointment_items
      (appointment_id, service_type_id, user_id, work_date, start_time, end_time)
    values (
      v_appointment_id, v_service.id, v_employee_id, p_visit_date,
      v_cursor,
      ((p_visit_date + v_cursor)::timestamp + make_interval(mins => v_service.default_duration))::time
    );
    v_cursor := ((p_visit_date + v_cursor)::timestamp
                 + make_interval(mins => v_service.default_duration))::time;
  end loop;

  return json_build_object(
    'appointment_id', v_appointment_id,
    'visit_date', p_visit_date,
    'start_time', p_start_time,
    'end_time', v_end_time,
    'total_price', v_total_price,
    'total_duration', v_total_duration
  );

exception
  when exclusion_violation then
    -- another booking grabbed an overlapping span between our check and insert
    raise exception 'SLOT_TAKEN';
end;
$$;

-- ------------------------------------------------------------
-- admin_set_user_role — the only way to change a role
-- ------------------------------------------------------------
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_role not in ('Admin', 'Employee') then
    raise exception 'INVALID_ROLE';
  end if;
  update users set role = p_role where id = p_user_id;
end;
$$;

-- ------------------------------------------------------------
-- Grants: booking RPCs are public; role management is auth-only
-- (and self-guards with is_admin()).
-- ------------------------------------------------------------
revoke execute on function public.book_appointment(text, text, text, text, date, time, uuid[], text) from public;
revoke execute on function public.admin_set_user_role(uuid, text) from public;

grant execute on function public.get_available_slots(date, uuid[]) to anon, authenticated;
grant execute on function public.book_appointment(text, text, text, text, date, time, uuid[], text) to anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- ==================== demo services ====================
insert into service_types (name, description, base_price, default_duration) values
  ('תספורת', 'תספורת מעוצבת כולל חפיפה', 120, 45),
  ('צבע', 'צביעת שיער מלאה', 250, 90),
  ('פן', 'עיצוב ופן', 80, 30),
  ('מניקור', 'מניקור אנטומי + לק ג''ל', 110, 60);

-- ==================== AFTER RUNNING THIS FILE ====================
-- 1. Authentication -> Providers -> Email: disable "Allow new users to sign up".
-- 2. Authentication -> Users -> Invite user (invite yourself + employees).
-- 3. Make yourself Admin (replace the email):
--    update public.users set role = 'Admin'
--    where id = (select id from auth.users where email = 'you@example.com');
-- 4. In the app (as Admin): ניהול צוות -> assign skills to each employee,
--    and each employee adds availability. Then booking slots will appear.
