-- ============================================================
-- ONE-SHOT INSTALLER for an empty/expendable database.
-- Paste the generated install_all.sql into Supabase SQL Editor -> Run.
-- It DROPS all fp-shifter tables and recreates everything (v2):
-- schema + RLS + business functions + demo services.
-- Run `npm run sql:generate` after editing any installer source.
-- ============================================================

-- ---- reset ----
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.get_available_slots(date, uuid[]) cascade;
drop function if exists public.book_appointment(text, text, text, text, date, time, uuid[], text) cascade;
drop function if exists public.claim_shift(uuid) cascade;
drop function if exists public.cancel_appointment(uuid) cascade;
drop function if exists public.customer_get_appointment(uuid, text) cascade;
drop function if exists public.customer_cancel_appointment(uuid, text) cascade;
drop function if exists public.admin_set_user_role(uuid, text) cascade;
drop function if exists public.assign_shift(uuid, uuid) cascade;
drop function if exists public.unassign_shift(uuid) cascade;
drop function if exists public.admin_deactivate_user(uuid) cascade;
drop function if exists public.admin_reactivate_user(uuid) cascade;
drop function if exists public.qualified_employees(uuid[]) cascade;
drop function if exists public.guard_appointment_item_columns() cascade;
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
