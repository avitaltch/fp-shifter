-- ============================================================
-- Migration: v1 -> v2 (run once in the Supabase SQL editor)
--
-- If your data is disposable, it is SIMPLER to reset instead:
-- drop the tables and run schema.sql + rls.sql + functions.sql.
-- This script is for keeping existing data.
-- ============================================================

begin;

create extension if not exists btree_gist;

-- ---- 1. Clean up data that would violate the new constraints ----

-- Deduplicate customers by phone (keep the oldest, soft-delete the rest)
with ranked as (
  select id, row_number() over (partition by phone order by created_at) as rn
  from customers where deleted_at is null
)
update customers set deleted_at = now()
where id in (select id from ranked where rn > 1);

-- Remove zero/negative-length time windows
delete from availabilities where start_time >= end_time;
update appointment_items set deleted_at = now()
where start_time >= end_time and deleted_at is null;

-- ---- 2. Schema changes ----

-- appointment_items: date-aware overlap prevention instead of the broken
-- unique(user_id, start_time, end_time)
alter table appointment_items drop constraint if exists no_double_booking;
alter table appointment_items add column if not exists work_date date;
update appointment_items ai
set work_date = a.visit_date
from appointments a
where ai.appointment_id = a.id and ai.work_date is null;
alter table appointment_items alter column work_date set not null;

-- Soft-delete conflicting assignments so the exclusion constraint can be
-- added. Greedy keep-oldest loop: repeatedly drop the newer row of some
-- overlapping pair ((created_at, id) breaks ties for same-statement inserts).
do $$
declare v_id uuid;
begin
  loop
    select ai2.id into v_id
    from appointment_items ai1
    join appointment_items ai2
      on ai1.user_id = ai2.user_id
     and ai1.work_date = ai2.work_date
     and ai1.id <> ai2.id
     and (ai1.created_at, ai1.id) < (ai2.created_at, ai2.id)
     and tsrange((ai1.work_date + ai1.start_time)::timestamp, (ai1.work_date + ai1.end_time)::timestamp)
         && tsrange((ai2.work_date + ai2.start_time)::timestamp, (ai2.work_date + ai2.end_time)::timestamp)
    where ai1.user_id is not null and ai1.deleted_at is null and ai2.deleted_at is null
    limit 1;
    exit when v_id is null;
    update appointment_items
    set deleted_at = now(),
        notes = coalesce(notes || ' | ', '') || 'migration: overlapping assignment removed'
    where id = v_id;
  end loop;
end $$;

alter table appointment_items add constraint no_overlapping_assignments exclude using gist (
  user_id with =,
  tsrange((work_date + start_time)::timestamp, (work_date + end_time)::timestamp) with &&
) where (user_id is not null and deleted_at is null);

alter table appointment_items add constraint appointment_items_time_order check (start_time < end_time);
alter table appointment_items add constraint appointment_items_status_check
  check (status in ('Scheduled', 'In_Progress', 'Done'));

-- availabilities: remove overlaps (same greedy keep-oldest), then forbid them
do $$
declare v_id uuid;
begin
  loop
    select a2.id into v_id
    from availabilities a1
    join availabilities a2
      on a1.user_id = a2.user_id
     and a1.available_date = a2.available_date
     and a1.id <> a2.id
     and (a1.created_at, a1.id) < (a2.created_at, a2.id)
     and tsrange((a1.available_date + a1.start_time)::timestamp, (a1.available_date + a1.end_time)::timestamp)
         && tsrange((a2.available_date + a2.start_time)::timestamp, (a2.available_date + a2.end_time)::timestamp)
    limit 1;
    exit when v_id is null;
    delete from availabilities where id = v_id;
  end loop;
end $$;

alter table availabilities add constraint availabilities_time_order check (start_time < end_time);
alter table availabilities add constraint no_overlapping_availability exclude using gist (
  user_id with =,
  tsrange((available_date + start_time)::timestamp, (available_date + end_time)::timestamp) with &&
);

-- customers / users / service_types / appointments hardening
create unique index if not exists customers_phone_unique on customers (phone) where deleted_at is null;
alter table users add constraint users_role_check check (role in ('Admin', 'Employee'));
alter table service_types add constraint service_types_price_check check (base_price >= 0);
alter table service_types add constraint service_types_duration_check check (default_duration > 0);
create unique index if not exists service_types_name_unique on service_types (name) where deleted_at is null;
alter table appointments alter column total_price set not null;
alter table appointments add constraint appointments_price_check check (total_price >= 0);
alter table appointments add constraint appointments_status_check
  check (status in ('Pending', 'Confirmed', 'Cancelled', 'Completed'));

-- employee_skills: capability mapping only (per-employee durations were never used)
alter table employee_skills drop column if exists duration_minutes;

-- Indexes
create index if not exists employee_skills_service_idx on employee_skills (service_type_id);
create index if not exists appointments_visit_date_idx on appointments (visit_date);
create index if not exists appointments_customer_idx on appointments (customer_id);
create index if not exists appointment_items_appointment_idx on appointment_items (appointment_id);
create index if not exists appointment_items_user_date_idx on appointment_items (user_id, work_date);
create index if not exists appointment_items_unassigned_idx on appointment_items (work_date) where user_id is null and deleted_at is null;
create index if not exists availabilities_user_date_idx on availabilities (user_id, available_date);
create index if not exists availabilities_date_idx on availabilities (available_date);

-- ---- 3. Drop ALL v1 policies (they get recreated by rls.sql) ----
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('customers','users','service_types','employee_skills',
                        'appointments','appointment_items','availabilities')
  loop
    execute format('drop policy %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ---- 4. updated_at triggers ----
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_customers_updated_at on customers;
create trigger set_customers_updated_at before update on customers for each row execute procedure public.set_updated_at();
drop trigger if exists set_users_updated_at on users;
create trigger set_users_updated_at before update on users for each row execute procedure public.set_updated_at();
drop trigger if exists set_service_types_updated_at on service_types;
create trigger set_service_types_updated_at before update on service_types for each row execute procedure public.set_updated_at();
drop trigger if exists set_appointments_updated_at on appointments;
create trigger set_appointments_updated_at before update on appointments for each row execute procedure public.set_updated_at();
drop trigger if exists set_appointment_items_updated_at on appointment_items;
create trigger set_appointment_items_updated_at before update on appointment_items for each row execute procedure public.set_updated_at();
drop trigger if exists set_availabilities_updated_at on availabilities;
create trigger set_availabilities_updated_at before update on availabilities for each row execute procedure public.set_updated_at();

commit;

-- ---- 5. Now run rls.sql, then functions.sql. ----
-- ---- 6. Bootstrap your first Admin (one-time, replace the email): ----
-- update public.users set role = 'Admin'
-- where id = (select id from auth.users where email = 'you@example.com');
--
-- ---- 7. In Supabase Dashboard -> Authentication -> Providers -> Email:
--         disable public sign-ups ("Allow new users to sign up" = off).
--         Invite employees via Dashboard -> Authentication -> Users -> Invite.
