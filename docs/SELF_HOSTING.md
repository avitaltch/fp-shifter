# Self-hosting ShiftSync

ShiftSync can be migrated incrementally. Move the stateless web app first, then move the stateful Supabase stack after backups, restore rehearsals, and monitoring are in place.

## Target shape

```text
Browser
  ├── app.example.com       -> ShiftSync Nginx container
  └── supabase.example.com  -> TLS proxy -> Supabase API gateway
                                      ├── Auth
                                      ├── PostgREST / RPC
                                      ├── Edge Runtime
                                      └── Postgres + persistent backups
```

The browser still uses the Supabase protocol, but neither application hosting nor data hosting has to be a managed SaaS dependency.

## Phase 1: move the web app off Vercel

Requirements: Docker Engine with Compose and a host or reverse proxy that provides HTTPS.

1. Copy `.env.selfhost.example` to the git-ignored `.env.selfhost` and set:

   ```dotenv
   APP_SUPABASE_URL=https://your-current-project.supabase.co
   APP_SUPABASE_ANON_KEY=your-current-public-key
   APP_PORT=8080
   ```

2. Start and verify the app:

   ```bash
   docker compose --env-file .env.selfhost up -d --build
   docker compose --env-file .env.selfhost ps
   curl --fail http://127.0.0.1:8080/healthz
   ```

3. Put the container behind TLS, point the application DNS name at it, and add the new application origin to Supabase Auth redirect URLs.
4. Configure the `invite-user` function with both the canonical app URL and every permitted browser origin:

   ```bash
   supabase secrets set SITE_URL=https://app.example.com
   supabase secrets set ALLOWED_ORIGINS=https://app.example.com
   supabase functions deploy invite-user
   ```

5. Exercise booking, login, password reset, employee invite, and an authenticated admin flow before removing the Vercel deployment.

`APP_SUPABASE_ANON_KEY` is intentionally public browser configuration. Never put a service-role or secret key in it.

## Phase 2: provision Supabase on your infrastructure

Use the upstream Supabase Docker distribution instead of copying its many services into this repository. Supabase currently documents Docker as the recommended self-hosting path and lists 4 GB RAM / 2 cores as the minimum, with 8 GB+ RAM / 4 cores recommended for small-to-medium production workloads.

Follow the official guides:

- [Self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Reverse proxy and HTTPS](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https)
- [Restore a managed project to self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Self-hosted Edge Functions](https://supabase.com/docs/guides/self-hosting/self-hosted-functions)

At minimum:

1. Generate unique database, dashboard, JWT, publishable, and secret credentials. Do not use the example values from the upstream `.env.example`.
2. Set `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, and `SITE_URL` to the real HTTPS endpoints.
3. Configure SMTP for staff invitations and password resets.
4. Keep Postgres and any storage volumes on persistent disks. Back them up to a different machine or storage account.
5. Restrict Studio, Postgres, and administrative ports at the firewall. The public application needs only the HTTPS app and API endpoints.

## Phase 3: restore ShiftSync data and functions

For a brand-new empty database, the application schema can be installed with `supabase/schema.sql`, `supabase/rls.sql`, and `supabase/functions.sql` in that order. Do **not** use `supabase/install_all.sql` against a database containing data; it intentionally drops and recreates the application tables.

For an existing managed project, follow Supabase's restore guide so Auth users, roles, schema, and data move together. Rehearse the restore on a disposable instance first, then verify:

- staff can log in and `public.users.id` still matches `auth.users.id`;
- RLS blocks anonymous reads outside the public service/RPC surface;
- booking and cancellation RPCs work;
- the overlap exclusion constraints reject double bookings;
- future availability, assignments, and customer confirmation numbers are intact.

Deploy the function by copying `supabase/edge-functions/invite-user` to the self-hosted stack's `volumes/functions/invite-user` directory. Make `SITE_URL` and `ALLOWED_ORIGINS` available to the functions container, then restart that service.

## Phase 4: cut over safely

1. Lower DNS TTL in advance.
2. Put the managed application into a short maintenance window so the final data export is consistent.
3. Take and retain a final managed database backup.
4. Restore to the self-hosted stack and run the verification list above.
5. Change the app container's `APP_SUPABASE_URL` and public key, then recreate only the app container:

   ```bash
   docker compose --env-file .env.selfhost up -d --force-recreate app
   ```

6. Move DNS, watch HTTP error rates and container/database health, and keep the managed project unchanged during the rollback window.

Rollback is a DNS/configuration reversal only if the old managed project remains intact and no production writes have occurred on both systems. After cutover writes begin, use a planned data reconciliation rather than switching blindly.

## Operational ownership gained

Self-hosting removes platform dependency but transfers responsibility for OS patching, Supabase upgrades, Postgres maintenance, backups and restore tests, monitoring, mail deliverability, capacity, and incident response. Before production cutover, define recovery-point and recovery-time targets and prove a restore meets them.
