-- ============================================================
-- Demo seed data (optional). Run AFTER schema.sql + rls.sql +
-- functions.sql, and after inviting at least one user.
-- Safe to re-run: skips overlapping availability rows.
-- ============================================================

-- Services
insert into service_types (name, description, base_price, default_duration) values
  ('תספורת', 'תספורת מעוצבת כולל חפיפה', 120, 45),
  ('צבע', 'צביעת שיער מלאה', 250, 90),
  ('פן', 'עיצוב ופן', 80, 30),
  ('מניקור', 'מניקור אנטומי + לק ג''ל', 110, 60)
on conflict do nothing;

-- Give every existing staff member all skills (demo convenience —
-- fine-tune per employee in the app: Admin -> ניהול צוות)
insert into employee_skills (user_id, service_type_id)
select u.id, st.id
from users u cross join service_types st
where u.deleted_at is null and st.deleted_at is null
on conflict do nothing;

-- Availability for the next ~3 months (90 days), 09:00-17:00, for all staff.
-- Skips days that already have an overlapping window so re-runs are safe.
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
