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
