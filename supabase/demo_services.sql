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
-- 4. Run supabase/seed.sql after inviting staff:
--    services, skills, ~90 days availability, demo customers,
--    and sample appointments (today / open shifts / my shifts).
--    Safe to re-run. Or open availability in-app via פתיחה מרוכזת.
