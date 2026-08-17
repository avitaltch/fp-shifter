# ADR 0001: Portable runtime configuration for self-hosting

- Status: Superseded in part by ADR 0002 and ADR 0003
- Date: 2026-08-16

## Context

The Vite application previously embedded the Supabase URL and anonymous key at build time and the production documentation assumed Vercel. Every environment therefore required a distinct frontend build, and the invite function contained a Vercel-specific fallback URL and wildcard CORS response.

The original migration goal was evolutionary: move the frontend first, then move the database/Auth/function stack without rewriting the product at the same time.

## Decision

Ship the SPA as a multi-stage Docker image served by Nginx. At container startup, validate public `APP_SUPABASE_*` values and write them to `/config.js`. The client prefers this runtime configuration and retains Vite variables as a local-development fallback.

Keep the existing `src/lib/api` facade and Supabase protocol for the legacy demo path. Self-hosting the open-source Supabase distribution remains a short-term contingency for that path. Require an explicit invite redirect URL and restrict function CORS to configured origins.

ADRs 0002 and 0003 supersede Supabase self-hosting as the product target. New MVP backend work uses the NestJS modular monolith, PostgreSQL-owned migrations, and PostgreSQL-backed jobs. The facade remains the transition seam while browser journeys move endpoint by endpoint.

## Consequences

- One image can target managed, staging, or self-hosted Supabase instances.
- Vercel is optional and the frontend can run on any Docker host.
- The Google Fonts request is removed, so the SPA has no non-Supabase runtime fetch dependency.
- Supabase remains a temporary dependency of the legacy demo path, not the target MVP backend.
- Operators now own TLS, patching, backups, recovery, monitoring, SMTP, and Supabase version compatibility.
- Backend replacement proceeds behind `src/lib/api` according to ADRs 0002 and 0003.

## Validation

- Unit-test runtime-over-build configuration precedence and missing configuration.
- Build the production bundle without Vite Supabase variables.
- Build and start the container with runtime values, then verify `/healthz` and `/config.js`.
- Run the existing unit and browser suites to detect application regressions.
