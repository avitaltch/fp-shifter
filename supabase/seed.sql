-- ============================================================
-- Demo seed data (optional). Run AFTER schema + rls + functions,
-- and after inviting at least one staff user.
-- Safe to re-run: skips existing phones / overlapping availability /
-- already-seeded DEMO_SEED appointments.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Services
-- ------------------------------------------------------------
insert into service_types (name, description, base_price, default_duration) values
  ('תספורת', 'תספורת מעוצבת כולל חפיפה', 120, 45),
  ('צבע', 'צביעת שיער מלאה', 250, 90),
  ('פן', 'עיצוב ופן', 80, 30),
  ('מניקור', 'מניקור אנטומי + לק ג''ל', 110, 60)
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. Friendly staff names (only if still the invite default)
-- ------------------------------------------------------------
with ranked as (
  select
    id,
    role,
    row_number() over (
      partition by role
      order by created_at, id
    ) as rn
  from users
  where deleted_at is null
    and first_name = 'New'
    and last_name = 'User'
)
update users u
set
  first_name = case
    when r.role = 'Admin' and r.rn = 1 then 'דנה'
    when r.role = 'Employee' and r.rn = 1 then 'יוסי'
    when r.role = 'Employee' and r.rn = 2 then 'מיכל'
    when r.role = 'Employee' and r.rn = 3 then 'אבי'
    else u.first_name
  end,
  last_name = case
    when r.role = 'Admin' and r.rn = 1 then 'לוי'
    when r.role = 'Employee' and r.rn = 1 then 'כהן'
    when r.role = 'Employee' and r.rn = 2 then 'ברק'
    when r.role = 'Employee' and r.rn = 3 then 'שמש'
    else u.last_name
  end
from ranked r
where u.id = r.id;

-- ------------------------------------------------------------
-- 3. Skills — every active staff member can do every service
-- ------------------------------------------------------------
insert into employee_skills (user_id, service_type_id)
select u.id, st.id
from users u
cross join service_types st
where u.deleted_at is null
  and st.deleted_at is null
on conflict do nothing;

-- ------------------------------------------------------------
-- 4. Availability — next ~90 days, 09:00–17:00, all staff
-- ------------------------------------------------------------
insert into availabilities (user_id, available_date, start_time, end_time)
select u.id, d::date, '09:00'::time, '17:00'::time
from users u
cross join generate_series(
  (current_date + 1)::timestamp,
  (current_date + 90)::timestamp,
  interval '1 day'
) as d
where u.deleted_at is null
  and not exists (
    select 1
    from availabilities a
    where a.user_id = u.id
      and a.available_date = d::date
      and a.start_time < '17:00'::time
      and a.end_time > '09:00'::time
  );

-- Also open today so the dashboard / my-shifts have live work
insert into availabilities (user_id, available_date, start_time, end_time)
select u.id, current_date, '09:00'::time, '17:00'::time
from users u
where u.deleted_at is null
  and not exists (
    select 1
    from availabilities a
    where a.user_id = u.id
      and a.available_date = current_date
      and a.start_time < '17:00'::time
      and a.end_time > '09:00'::time
  );

-- ------------------------------------------------------------
-- 5. Demo customers
-- ------------------------------------------------------------
insert into customers (first_name, last_name, phone, email, notes)
select v.first_name, v.last_name, v.phone, v.email, 'DEMO_SEED'
from (values
  ('נועה',  'כהן',    '0501111001', 'noa.cohen@example.com'),
  ('יעל',   'לוי',    '0501111002', 'yael.levy@example.com'),
  ('דניאל', 'מזרחי',  '0501111003', 'daniel.m@example.com'),
  ('מיכל',  'אברהם',  '0501111004', 'michal.a@example.com'),
  ('אורי',  'שפירא',  '0501111005', 'ori.s@example.com'),
  ('רות',   'גולן',   '0501111006', 'ruth.g@example.com'),
  ('תמר',   'חדד',    '0501111007', 'tamar.h@example.com'),
  ('עידן',  'פרץ',    '0501111008', 'idan.p@example.com')
) as v(first_name, last_name, phone, email)
where not exists (
  select 1 from customers c
  where c.phone = v.phone and c.deleted_at is null
);

-- ------------------------------------------------------------
-- 6. Demo appointments + items (dashboard / assign / my shifts /
--    open shifts). Skipped entirely if DEMO_SEED appointments exist.
-- ------------------------------------------------------------
do $$
declare
  v_staff uuid[];
  v_emp1 uuid;
  v_emp2 uuid;
  v_cut uuid;
  v_color uuid;
  v_blow uuid;
  v_mani uuid;
  v_apt uuid;
  v_cust uuid;
begin
  if exists (
    select 1 from appointments where notes = 'DEMO_SEED' and deleted_at is null
  ) then
    raise notice 'Demo appointments already present — skipping section 6';
    return;
  end if;

  select array_agg(id order by
    case when role = 'Employee' then 0 else 1 end,
    created_at,
    id
  )
  into v_staff
  from users
  where deleted_at is null;

  if v_staff is null or array_length(v_staff, 1) is null then
    raise notice 'No staff users yet — invite users, then re-run seed.sql';
    return;
  end if;

  v_emp1 := v_staff[1];
  v_emp2 := coalesce(v_staff[2], v_staff[1]);

  select id into v_cut   from service_types where name = 'תספורת' and deleted_at is null;
  select id into v_color from service_types where name = 'צבע'     and deleted_at is null;
  select id into v_blow  from service_types where name = 'פן'      and deleted_at is null;
  select id into v_mani  from service_types where name = 'מניקור'  and deleted_at is null;

  if v_cut is null or v_color is null or v_blow is null or v_mani is null then
    raise exception 'Demo services missing — section 1 must run first';
  end if;

  -- ===== Today: populated manager dashboard =====
  select id into v_cust from customers where phone = '0501111001' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date, 120, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_cut, v_emp1, current_date, '10:00', '10:45', 'Scheduled', 'DEMO_SEED');

  select id into v_cust from customers where phone = '0501111002' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date, 80, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_blow, v_emp2, current_date, '11:00', '11:30', 'In_Progress', 'DEMO_SEED');

  select id into v_cust from customers where phone = '0501111003' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date, 370, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_color, v_emp1, current_date, '13:00', '14:30', 'Scheduled', 'DEMO_SEED'),
    (v_apt, v_cut,   v_emp2, current_date, '14:30', '15:15', 'Scheduled', 'DEMO_SEED');

  -- ===== Tomorrow: mix of assigned + open (unassigned) =====
  select id into v_cust from customers where phone = '0501111004' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date + 1, 110, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_mani, null, current_date + 1, '09:30', '10:30', 'Scheduled', 'DEMO_SEED');

  select id into v_cust from customers where phone = '0501111005' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date + 1, 120, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_cut, v_emp1, current_date + 1, '11:00', '11:45', 'Scheduled', 'DEMO_SEED');

  select id into v_cust from customers where phone = '0501111006' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date + 1, 200, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_cut,  null, current_date + 1, '15:00', '15:45', 'Scheduled', 'DEMO_SEED'),
    (v_apt, v_blow, null, current_date + 1, '15:45', '16:15', 'Scheduled', 'DEMO_SEED');

  -- ===== Day +2: another open shift for claim / assign =====
  select id into v_cust from customers where phone = '0501111007' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date + 2, 250, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_color, null, current_date + 2, '10:00', '11:30', 'Scheduled', 'DEMO_SEED');

  -- ===== Day +3: assigned future work for employee "my shifts" =====
  select id into v_cust from customers where phone = '0501111008' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date + 3, 200, 'Confirmed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_cut,  v_emp2, current_date + 3, '12:00', '12:45', 'Scheduled', 'DEMO_SEED'),
    (v_apt, v_blow, v_emp2, current_date + 3, '12:45', '13:15', 'Scheduled', 'DEMO_SEED');

  -- ===== Yesterday: completed visit (history) =====
  select id into v_cust from customers where phone = '0501111001' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date - 1, 120, 'Completed', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes)
  values
    (v_apt, v_cut, v_emp1, current_date - 1, '16:00', '16:45', 'Done', 'DEMO_SEED');

  -- ===== Cancelled sample (items soft-deleted like cancel_appointment) =====
  select id into v_cust from customers where phone = '0501111002' and deleted_at is null;
  insert into appointments (customer_id, visit_date, total_price, status, notes)
  values (v_cust, current_date + 4, 110, 'Cancelled', 'DEMO_SEED')
  returning id into v_apt;
  insert into appointment_items
    (appointment_id, service_type_id, user_id, work_date, start_time, end_time, status, notes, deleted_at)
  values
    (v_apt, v_mani, null, current_date + 4, '10:00', '11:00', 'Scheduled', 'DEMO_SEED', now());

  raise notice 'Demo appointments seeded for lecturer walkthrough';
end $$;
