-- Enable UUID extension
create extension if not exists "uuid-ossp";

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

-- Table: users (extends Supabase auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  role text not null default 'Employee', -- 'Admin' or 'Employee'
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
  base_price numeric not null,
  default_duration integer not null, -- in minutes
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

-- Table: employee_skills
create table employee_skills (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade not null,
  service_type_id uuid references service_types(id) on delete cascade not null,
  duration_minutes integer not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, service_type_id)
);

-- Table: appointments
create table appointments (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete restrict not null,
  visit_date date not null,
  total_price numeric default 0,
  status text not null default 'Pending', -- Pending, Confirmed, Cancelled, Completed
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

-- Table: appointment_items
create table appointment_items (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid references appointments(id) on delete cascade not null,
  service_type_id uuid references service_types(id) on delete restrict not null,
  user_id uuid references users(id) on delete restrict,
  start_time time not null,
  end_time time not null,
  status text not null default 'Scheduled', -- Scheduled, In_Progress, Done
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone,
  -- Ensure an employee isn't double-booked
  constraint no_double_booking unique(user_id, start_time, end_time) 
);

-- Table: availabilities
create table availabilities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade not null,
  available_date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Function to handle user creation automatically
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  -- Hardcode 'Employee' to prevent privilege escalation from raw metadata
  insert into public.users (id, first_name, last_name, role)
  values (
    new.id, 
    coalesce(split_part(new.raw_user_meta_data->>'full_name', ' ', 1), 'New'), 
    coalesce(split_part(new.raw_user_meta_data->>'full_name', ' ', 2), 'User'), 
    'Employee'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function on user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
