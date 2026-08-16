# ADR 0001: Portable runtime configuration for self-hosting

- Status: Accepted
- Date: 2026-08-16

## Context

The Vite application previously embedded the Supabase URL and anonymous key at build time and the production documentation assumed Vercel. Every environment therefore required a distinct frontend build, and the invite function contained a Vercel-specific fallback URL and wildcard CORS response.

The migration goal is evolutionary: move the frontend first, then move the database/Auth/function stack without rewriting the product at the same time.

## Decision

Ship the SPA as a multi-stage Docker image served by Nginx. At container startup, validate public `APP_SUPABASE_*` values and write them to `/config.js`. The client prefers this runtime configuration and retains Vite variables as a local-development fallback.

Keep the existing `src/lib/api` facade and Supabase protocol for now. Self-host the open-source Supabase distribution rather than introducing a new custom backend during the infrastructure migration. Require an explicit invite redirect URL and restrict function CORS to configured origins.

## Consequences

- One image can target managed, staging, or self-hosted Supabase instances.
- Vercel is optional and the frontend can run on any Docker host.
- The Google Fonts request is removed, so the SPA has no non-Supabase runtime fetch dependency.
- Supabase remains a technology dependency, but no longer has to be a managed-service dependency.
- Operators now own TLS, patching, backups, recovery, monitoring, SMTP, and Supabase version compatibility.
- A later backend replacement remains possible behind `src/lib/api`, but is deliberately outside this first migration step.

## Validation

- Unit-test runtime-over-build configuration precedence and missing configuration.
- Build the production bundle without Vite Supabase variables.
- Build and start the container with runtime values, then verify `/healthz` and `/config.js`.
- Run the existing unit and browser suites to detect application regressions.
