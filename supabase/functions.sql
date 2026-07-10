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
      select 1
      from appointment_items ai
      join appointments ap on ap.id = ai.appointment_id
      where ai.user_id = c.user_id
        and ai.work_date = p_date
        and ai.deleted_at is null
        and ap.deleted_at is null
        and ap.status <> 'Cancelled' -- cancelled visits free their slots
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

  -- ::time wraps past midnight, which would corrupt the chain and trip
  -- check(start_time < end_time) with a cryptic error. Reject explicitly.
  if (p_visit_date + p_start_time)::timestamp + make_interval(mins => v_total_duration)
     >= (p_visit_date + 1)::timestamp then
    raise exception 'PAST_MIDNIGHT';
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
    select 1
    from appointment_items ai
    join appointments ap on ap.id = ai.appointment_id
    where ai.user_id = q.id
      and ai.work_date = p_visit_date
      and ai.deleted_at is null
      and ap.deleted_at is null
      and ap.status <> 'Cancelled'
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
-- claim_shift — the only way an employee takes an unassigned item.
-- Enforces what RLS cannot: the claimer must be qualified for the
-- service, available for the whole span, and conflict-free. The
-- guarded update + exclusion constraint handle concurrent claims.
-- ------------------------------------------------------------
create or replace function public.claim_shift(p_item_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN';
  end if;

  -- Deactivated (soft-deleted) staff must not claim shifts even if they
  -- still hold a live JWT.
  if not exists (
    select 1 from users u
    where u.id = v_uid and u.deleted_at is null
  ) then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  select ai.* into v_item
  from appointment_items ai
  join appointments ap on ap.id = ai.appointment_id
  where ai.id = p_item_id
    and ai.deleted_at is null
    and ap.deleted_at is null
    and ap.status <> 'Cancelled';

  if not found then
    raise exception 'SHIFT_TAKEN';
  end if;

  if not exists (
    select 1 from employee_skills es
    where es.user_id = v_uid and es.service_type_id = v_item.service_type_id
  ) then
    raise exception 'NOT_QUALIFIED';
  end if;

  if not exists (
    select 1 from availabilities a
    where a.user_id = v_uid
      and a.available_date = v_item.work_date
      and a.start_time <= v_item.start_time
      and a.end_time >= v_item.end_time
  ) then
    raise exception 'NOT_AVAILABLE';
  end if;

  update appointment_items
  set user_id = v_uid
  where id = p_item_id and user_id is null;

  if not found then
    raise exception 'SHIFT_TAKEN';
  end if;

  return json_build_object('item_id', p_item_id, 'user_id', v_uid);

exception
  when exclusion_violation then
    -- overlaps another assignment the claimer already has
    raise exception 'SHIFT_CONFLICT';
end;
$$;

-- ------------------------------------------------------------
-- cancel_appointment — admin cancel that actually frees the slots:
-- sets the status AND soft-deletes the items in one transaction, so
-- the exclusion constraint stops blocking re-booking of that span.
-- ------------------------------------------------------------
create or replace function public.cancel_appointment(p_appointment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  update appointments
  set status = 'Cancelled'
  where id = p_appointment_id and deleted_at is null and status <> 'Cancelled';

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  update appointment_items
  set deleted_at = now()
  where appointment_id = p_appointment_id and deleted_at is null;
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
  if auth.uid() = p_user_id then
    -- an admin demoting themselves could lock everyone out
    raise exception 'CANNOT_CHANGE_OWN_ROLE';
  end if;
  update users set role = p_role where id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- assign_shift — admin assignment with the same server-side checks
-- as claim_shift (skill, availability, conflicts), so the browser
-- cannot assign an ineligible employee even with a tampered client.
-- ------------------------------------------------------------
create or replace function public.assign_shift(
  p_item_id uuid,
  p_user_id uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from users u
    where u.id = p_user_id and u.deleted_at is null
  ) then
    raise exception 'USER_NOT_FOUND';
  end if;

  select ai.* into v_item
  from appointment_items ai
  join appointments ap on ap.id = ai.appointment_id
  where ai.id = p_item_id
    and ai.deleted_at is null
    and ap.deleted_at is null
    and ap.status <> 'Cancelled';

  if not found then
    raise exception 'SHIFT_TAKEN';
  end if;

  if not exists (
    select 1 from employee_skills es
    where es.user_id = p_user_id and es.service_type_id = v_item.service_type_id
  ) then
    raise exception 'NOT_QUALIFIED';
  end if;

  if not exists (
    select 1 from availabilities a
    where a.user_id = p_user_id
      and a.available_date = v_item.work_date
      and a.start_time <= v_item.start_time
      and a.end_time >= v_item.end_time
  ) then
    raise exception 'NOT_AVAILABLE';
  end if;

  update appointment_items
  set user_id = p_user_id
  where id = p_item_id and user_id is null;

  if not found then
    raise exception 'SHIFT_TAKEN';
  end if;

  return json_build_object('item_id', p_item_id, 'user_id', p_user_id);

exception
  when exclusion_violation then
    -- overlaps another assignment the target employee already has
    raise exception 'SHIFT_CONFLICT';
end;
$$;

-- ------------------------------------------------------------
-- unassign_shift — admin returns an assigned item to the open
-- pool. Past work is history and stays assigned.
-- ------------------------------------------------------------
create or replace function public.unassign_shift(p_item_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select ai.* into v_item
  from appointment_items ai
  where ai.id = p_item_id
    and ai.deleted_at is null
    and ai.user_id is not null;

  if not found then
    raise exception 'ALREADY_UNASSIGNED';
  end if;

  if v_item.work_date < public.business_now()::date then
    raise exception 'CANNOT_UNASSIGN_PAST';
  end if;

  update appointment_items
  set user_id = null
  where id = p_item_id;

  return json_build_object('item_id', p_item_id, 'user_id', null);
end;
$$;

-- ------------------------------------------------------------
-- admin_deactivate_user / admin_reactivate_user — staff offboarding.
-- Deactivation soft-deletes the profile AND returns the employee's
-- future assignments to the open pool in one transaction, so booked
-- work is never stranded on a disabled account.
-- ------------------------------------------------------------
create or replace function public.admin_deactivate_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if auth.uid() = p_user_id then
    -- an admin deactivating themselves could lock everyone out
    raise exception 'CANNOT_DEACTIVATE_SELF';
  end if;

  update users set deleted_at = now()
  where id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  update appointment_items
  set user_id = null
  where user_id = p_user_id
    and work_date >= public.business_now()::date
    and deleted_at is null;
end;
$$;

create or replace function public.admin_reactivate_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  update users set deleted_at = null
  where id = p_user_id and deleted_at is not null;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- customer_get_appointment — anon self-service lookup.
-- Requires appointment id AND phone (trim-normalized like
-- book_appointment). Wrong id and wrong phone both raise the
-- same APPOINTMENT_NOT_FOUND so neither is leaked. Soft-deleted
-- service names are included deliberately (security definer).
-- ------------------------------------------------------------
create or replace function public.customer_get_appointment(
  p_appointment_id uuid,
  p_phone text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_appt record;
  v_start_time time;
  v_end_time time;
  v_service_names text[];
begin
  select a.id, a.visit_date, a.status, c.first_name
  into v_appt
  from appointments a
  join customers c on c.id = a.customer_id
  where a.id = p_appointment_id
    and a.deleted_at is null
    and c.deleted_at is null
    and trim(c.phone) = trim(coalesce(p_phone, ''));

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  -- Include soft-deleted items so a cancelled appointment still shows
  -- its original time range and services.
  select min(ai.start_time), max(ai.end_time)
  into v_start_time, v_end_time
  from appointment_items ai
  where ai.appointment_id = v_appt.id;

  select coalesce(array_agg(st.name order by ai.start_time, ai.id), '{}')
  into v_service_names
  from appointment_items ai
  join service_types st on st.id = ai.service_type_id
  where ai.appointment_id = v_appt.id;

  return json_build_object(
    'appointment_id', v_appt.id,
    'visit_date', v_appt.visit_date,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'status', v_appt.status,
    'service_names', to_json(v_service_names),
    'customer_first_name', v_appt.first_name
  );
end;
$$;

-- ------------------------------------------------------------
-- customer_cancel_appointment — anon self-service cancel.
-- Same phone gate as customer_get_appointment. Mirrors admin
-- cancel_appointment (status = Cancelled + soft-delete items)
-- but only for future appointments that are not already cancelled.
-- ------------------------------------------------------------
create or replace function public.customer_cancel_appointment(
  p_appointment_id uuid,
  p_phone text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt record;
  v_start_time time;
begin
  select a.id, a.visit_date, a.status
  into v_appt
  from appointments a
  join customers c on c.id = a.customer_id
  where a.id = p_appointment_id
    and a.deleted_at is null
    and c.deleted_at is null
    and trim(c.phone) = trim(coalesce(p_phone, ''));

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  if v_appt.status = 'Cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;

  select min(ai.start_time)
  into v_start_time
  from appointment_items ai
  where ai.appointment_id = v_appt.id
    and ai.deleted_at is null;

  if v_start_time is null
     or (v_appt.visit_date + v_start_time)::timestamp <= public.business_now() then
    raise exception 'CANCEL_TOO_LATE';
  end if;

  update appointments
  set status = 'Cancelled'
  where id = v_appt.id and deleted_at is null and status <> 'Cancelled';

  if not found then
    raise exception 'ALREADY_CANCELLED';
  end if;

  update appointment_items
  set deleted_at = now()
  where appointment_id = v_appt.id and deleted_at is null;
end;
$$;

-- ------------------------------------------------------------
-- Grants. Postgres gives EXECUTE to PUBLIC by default, so every
-- function is revoked first; only what clients need is granted back.
-- qualified_employees/business_now are internal (called from the
-- definer RPCs, which run as owner) — no client role needs them.
-- ------------------------------------------------------------
revoke execute on function public.business_now() from public, anon, authenticated;
revoke execute on function public.qualified_employees(uuid[]) from public, anon, authenticated;
revoke execute on function public.get_available_slots(date, uuid[]) from public;
revoke execute on function public.book_appointment(text, text, text, text, date, time, uuid[], text) from public;
revoke execute on function public.claim_shift(uuid) from public;
revoke execute on function public.cancel_appointment(uuid) from public;
revoke execute on function public.customer_get_appointment(uuid, text) from public;
revoke execute on function public.customer_cancel_appointment(uuid, text) from public;
revoke execute on function public.admin_set_user_role(uuid, text) from public;
revoke execute on function public.assign_shift(uuid, uuid) from public;
revoke execute on function public.unassign_shift(uuid) from public;
revoke execute on function public.admin_deactivate_user(uuid) from public;
revoke execute on function public.admin_reactivate_user(uuid) from public;

grant execute on function public.get_available_slots(date, uuid[]) to anon, authenticated;
grant execute on function public.book_appointment(text, text, text, text, date, time, uuid[], text) to anon, authenticated;
grant execute on function public.customer_get_appointment(uuid, text) to anon, authenticated;
grant execute on function public.customer_cancel_appointment(uuid, text) to anon, authenticated;
grant execute on function public.claim_shift(uuid) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.assign_shift(uuid, uuid) to authenticated;
grant execute on function public.unassign_shift(uuid) to authenticated;
grant execute on function public.admin_deactivate_user(uuid) to authenticated;
grant execute on function public.admin_reactivate_user(uuid) to authenticated;
