# FP Shifter (ShiftSync)

A generic booking & shift-management system for service businesses (a beauty salon is the demo use case). Customers book appointments online and only ever see time slots where a qualified employee is actually free; managers assign shifts, manage services, and track the day; employees publish availability, claim open shifts, and progress their tasks.

Built with **React 19 + Vite** (Hebrew, RTL) and **Supabase** (Postgres, Auth, RLS).

## Architecture

```
src/
  lib/
    supabase.js      Supabase client (env-guarded)
    api/             ALL data access, split by domain (services, booking,
                     availability, shifts, assignment, dashboard, team)
                     behind one facade — pages never build queries themselves
    dates.js         Local-time date helpers (never UTC-based)
    errors.js        RPC error code -> Hebrew message mapping
  hooks/
    useAsyncData.js  Fetch-on-mount lifecycle (data/loading/error/refetch)
    useAction.js     Mutation lifecycle (busy row, friendly error, message)
  context/
    AuthContext.jsx  Single auth subscription; role comes from public.users
  components/        Navbar, Footer, ProtectedRoute, PageHeader, Alert, ...
  pages/             One folder-less page per route
supabase/
  schema.sql         Tables, constraints (incl. overlap-exclusion), triggers
  rls.sql            RLS policies + column-guard trigger (DB-enforced roles)
  functions.sql      get_available_slots, book_appointment, claim_shift,
                     cancel_appointment, admin_set_user_role
  seed.sql           Optional demo data
  migrate_v1_to_v2.sql  One-time migration for a pre-existing v1 database
```

### Security model
- **Roles live in `public.users.role`**, guarded by RLS (`with check` pins a user's own role; only `admin_set_user_role` can change it — and never one's own). `user_metadata` is never trusted.
- **Public sign-up is disabled** — employees are invited by an Admin (Supabase Dashboard → Authentication → Invite user). Anonymous visitors can only read the service catalog and call the two booking RPCs; the security-definer helper functions (`role_of`, `qualified_employees`, ...) are revoked from client roles.
- **Booking is a transactional security-definer RPC** (`book_appointment`): server-side pricing, skill matching, availability + conflict checks, atomic customer/appointment/items creation. Double-booking is additionally blocked by a Postgres exclusion constraint.
- **Employees can only change `status`/`notes` on their own items** — a column-guard trigger rejects every other column, so times, assignees, and soft-deletes can't be tampered with from the client. Claiming an open shift goes through the `claim_shift` RPC, which enforces skills, availability, and conflicts server-side.
- **Cancelling** goes through `cancel_appointment` (admin-only RPC) which sets the status *and* soft-deletes the items in one transaction, so the booked span is genuinely freed for re-booking.
- Client route guards (`ProtectedRoute`) are UX only; enforcement is in the database.

### Booking flow
1. Customer picks services → `get_available_slots(date, service_ids)` computes a 15-minute grid over qualified employees' availability minus existing assignments (in the business timezone, Asia/Jerusalem).
2. `book_appointment(...)` re-validates everything server-side, upserts the customer by phone, auto-assigns the least-loaded qualified employee, and returns the real booking details shown on the success page.
3. If an employee later becomes unavailable, items can be unassigned; they then appear on the employees' "open shifts" page (self-claim with race-safe guarded updates) and the manager's assignment page (which only offers qualified, available, conflict-free staff).

## Setup

1. Create a Supabase project.
2. In the SQL editor run, in order: `supabase/schema.sql`, `supabase/rls.sql`, `supabase/functions.sql` (fresh DB), or `supabase/migrate_v1_to_v2.sql` then `rls.sql` + `functions.sql` (existing v1 DB).
3. Authentication → Providers → Email: **disable** "Allow new users to sign up". Invite your staff via Authentication → Users → Invite.
4. Bootstrap the first Admin:
   ```sql
   update public.users set role = 'Admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
5. Optionally run `supabase/seed.sql` for demo services/skills/availability.
6. `cp .env.example .env` and fill in the project URL + anon key.
7. `npm install && npm run dev`

## Deploy (Vercel)

1. Import the repo in Vercel — the Vite framework preset is detected automatically (`npm run build`, output `dist/`).
2. Add the environment variables (Project → Settings → Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. `vercel.json` rewrites all routes to `index.html` so React Router deep links (e.g. `/login`, `/dashboard`) work on refresh.
4. In Supabase, set Authentication → URL Configuration → Site URL to the Vercel production URL (and add preview URLs to Redirect URLs) so invite/recovery emails land back on the deployed app.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm test` / `npm run test:watch` | Vitest unit tests |
| `npm run coverage` | Unit tests + V8 coverage |
| `npm run e2e` | Playwright E2E (network-stubbed) |
| `npm run lint` | Oxlint |
| `npm run build` | Production build |

CI (GitHub Actions) runs lint, unit tests, the production build, and Playwright e2e on every push/PR.
