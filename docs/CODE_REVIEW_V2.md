# Code Review V2

**Reviewed:** 2026-08-16
**Scope:** Current working tree, NestJS/PostgreSQL foundation, migration path away from Supabase, and alignment with `PRD_MVP.md` and `DEVELOPMENT_PLAN.md`.

## Executive summary

The new NestJS/PostgreSQL boundary is the right direction. The API starts independently, configuration is validated, health and readiness have sensible semantics, the initial migration is reversible, and the frontend already has an API facade that can become the migration seam away from direct Supabase access.

The foundation is not ready to merge as one unit yet. The immediate concerns are delivery safety and missing production checks rather than a need to redesign the architecture:

1. The working tree contains 30 modified tracked files and 51 untracked files, spanning several concerns. It needs to be divided into reviewable changes before more feature work is layered on top.
2. CI does not start PostgreSQL, apply migrations, or exercise the real readiness path. The test named E2E replaces `HealthService`, so it cannot detect a broken database configuration or migration.
3. The frontend lockfile resolves React Router 7.18.0, which is covered by a high-severity advisory. The reported issue concerns RSC mode and this project is a Vite SPA, so practical exposure appears limited, but the dependency should still be patched before merge.

**Verdict:** request changes on the foundation as a merge unit, then proceed with the architecture after the stabilization gate in `DEVELOPMENT_PLAN_V2.md` is green.

## Prioritized findings

### CR-01 — High: patch the React Router security advisory

**Evidence**

- `package.json` permits React Router from `^7.18.0`.
- The current lockfile resolves `react-router` and `react-router-dom` to 7.18.0.
- `npm audit --omit=dev` reports advisory `GHSA-qwww-vcr4-c8h2`, fixed in 7.18.2.

**Impact**

The advisory applies to React Router's RSC mode. This application is currently a client-side Vite application, which reduces the likely exploitability, but retaining a known high advisory creates avoidable release risk.

**Recommendation**

Update both packages to at least 7.18.2, refresh the lockfile, and run the frontend unit and Playwright suites. Make a zero-high-production-audit result part of the stabilization gate.

### CR-02 — High: CI does not validate the real database path

**Evidence**

- `.github/workflows/ci.yml` installs, lints, tests, and builds the API without a PostgreSQL service or a migration step.
- `apps/api/test/health.e2e.spec.ts` overrides `HealthService`, so the test does not construct the production database path or verify a real readiness response.
- `DEVELOPMENT_PLAN.md` lists migrations and integration tests as Iteration 0 CI deliverables.

**Impact**

A migration, environment, driver, or database wiring regression can pass CI and fail only when the stack is deployed.

**Recommendation**

Add a PostgreSQL CI service and a job that:

1. Builds the API.
2. Applies migrations to an empty database.
3. Runs an AppModule-based readiness smoke test against that database.
4. Runs the seed and verifies its stable identifiers.
5. Applies migration rollback on a disposable database, or otherwise validates every `down` migration in a dedicated migration job.

The mocked health test can remain as a controller-level test, but it should not be the only test labeled E2E.

### CR-03 — High delivery risk: the current change set is too broad to review safely

**Evidence**

The working tree currently has 30 modified tracked files and 51 untracked files. It mixes frontend refactors, self-hosting work, documentation, the NestJS service, Compose configuration, migrations, and CI changes.

**Impact**

Large mixed changes make regressions harder to identify, rollback, and review. They also obscure which tests validate which architectural decision.

**Recommendation**

Before feature work, preserve the current state and divide it into the V2 PR sequence. Do not discard existing changes. The first reviewable unit should contain only the backend foundation and its CI/security corrections; subsequent units should isolate frontend cleanup and Supabase-transition work.

### CR-04 — Medium: local service ports are exposed on all host interfaces

**Evidence**

- `compose.mvp.yaml` publishes PostgreSQL and API ports without a loopback host prefix.
- The database has a predictable development password by default.

**Impact**

On a laptop or shared host, Docker may make these development services reachable from other devices on the network. The weak default is suitable only when the service is actually local-only.

**Recommendation**

Bind development ports to `127.0.0.1`. For any shared or remote environment, require an injected database password and avoid publishing PostgreSQL publicly.

### CR-05 — Medium: the PostgreSQL pool has no error listener

**Evidence**

`apps/api/src/database/database.module.ts` creates a `pg.Pool`, while `apps/api/src/database/database.service.ts` only exposes `ping()` and shutdown behavior. No handler is registered for pool `error` events.

**Impact**

The `pg` pool may emit an `error` for an idle client after a network or database failure. Without a listener, Node can treat it as an unhandled event and terminate the process without structured context.

**Recommendation**

Register a pool error listener through the application logger. Treat it as an operational event, include a request-independent correlation field, and allow the orchestrator to restart the process when recovery is unsafe.

### CR-06 — Medium: self-hosting documentation now describes two conflicting architectures

**Evidence**

- `docs/SELF_HOSTING.md` and ADR 0001 describe self-hosting Supabase as the target.
- ADRs 0002 and 0003 choose a NestJS modular monolith and PostgreSQL-owned migrations/jobs as the replacement architecture.
- The README still presents Supabase as the source of truth.

**Impact**

New contributors can reasonably implement against the wrong target or assume the Supabase stack remains a production dependency.

**Recommendation**

Mark ADR 0001 as partially superseded, document the transitional state explicitly, and revise self-hosting instructions once the first NestJS vertical slice is runnable. Until then, distinguish “legacy demo path” from “target MVP path” on every setup page.

### CR-07 — Medium: production HTTP defaults need a tighter policy

**Evidence**

- CORS origins are split and trimmed but not validated as origins.
- Swagger is enabled by the normal bootstrap path for every environment.
- `API_HOST` can become an empty trimmed string.

**Impact**

Configuration mistakes will be discovered late, and production can expose API discovery information unintentionally.

**Recommendation**

Validate CORS entries as exact HTTP(S) origins, reject blank hosts, and make Swagger an explicit environment setting that defaults off in production.

### CR-08 — Medium: Iteration 0 is only partially complete

**Completed**

- Independent NestJS application boundary.
- Validated base configuration.
- Liveness and readiness endpoints.
- Local PostgreSQL/Compose stack.
- Reversible foundation migration and deterministic demo-business seed.
- NestJS/PostgreSQL architecture ADRs.
- Passing frontend and backend lint, typecheck, tests, and builds.

**Outstanding from the V1 gate**

- Real migration and database integration checks in CI.
- Structured logging and request IDs.
- Remaining tenant/query, scheduling, transaction, and notification ADRs.
- A reviewable PR boundary for the foundation.

**Recommendation**

Do not report Iteration 0 as complete until the stabilization gate in the V2 plan is satisfied.

### CR-09 — Pilot launch blocker: public demo credentials must not reach a real tenant

**Evidence**

The README documents administrator and employee credentials for the public demo.

**Impact**

This is acceptable only for disposable mock data. Reusing the same credentials or environment for a pilot would expose tenant administration.

**Recommendation**

Keep demo and pilot environments separate. Remove or rotate documented credentials before connecting a real business, and never copy demo password hashes into a production seed.

## Product implementation gap

The current NestJS service is a sound foundation, not yet the MVP backend. Against the PRD's P0 requirements:

| Capability | Current state |
|---|---|
| Tenant model | Foundation tables only; no tenant-scoped data-access enforcement |
| Authentication and roles | User/membership schema only |
| Services and provider skills | Legacy Supabase implementation only |
| Ordered multi-service scheduling | Not implemented in NestJS |
| Multiple providers in one appointment | Not implemented |
| Atomic booking and collision protection | Not implemented |
| Customer secure management link | Legacy phone/appointment lookup does not meet the token requirement |
| Manager/provider operational views | Existing demo UI only; not backed by NestJS |
| Reminders and manager alerts | Not implemented |
| Waitlist/backfill | Not implemented |
| Audit/privacy controls | Not implemented beyond basic schema metadata |
| Operations | Containers, health, and migrations are partial; worker, backups, and observability remain |

This gap is expected at this stage. It changes the next milestone: the team should prove the compound scheduling and atomic-booking hypothesis, not broaden infrastructure prematurely.

## Positive observations

- The modular NestJS boundary supports an incremental strangler migration from Supabase.
- Environment validation and the strict global validation pipe are good defaults.
- Liveness avoids a database dependency while readiness checks it.
- Database errors returned by health endpoints are sanitized.
- The initial migration was successfully applied and rolled back against a disposable database.
- The API production dependency audit is clean.
- The frontend's `src/lib/api` facade is a useful seam for switching implementations without rewriting every component at once.
- Existing PostgreSQL constraints and transaction-oriented design should remain the final authority for booking collisions.
- The frontend test base is substantial enough to protect incremental migration work.

## Verification performed

- Confirmed `main` matches `origin/main` at the reviewed commit before considering uncommitted work.
- Inspected the full working-tree status and change volume.
- Ran frontend and backend lint, typecheck, tests, and builds during foundation validation.
- Confirmed 342 frontend unit tests, 15 Playwright tests, and 13 backend tests passing at the reviewed state.
- Applied and rolled back the initial migration on a disposable PostgreSQL database.
- Ran production dependency audits for the root application and API.
- Reviewed the NestJS bootstrap, configuration, database, health, migration, seed, Compose, CI, and transition documentation paths.

## Merge gate

The foundation becomes ready for feature development when all of the following are true:

- The work is divided into a small, reviewable foundation change.
- Frontend and API production audits contain no high-severity findings.
- CI provisions PostgreSQL and proves migrations plus real readiness.
- PostgreSQL pool errors are handled and logged.
- Development ports bind to loopback by default.
- Request IDs and structured logs exist.
- Documentation clearly identifies the legacy Supabase path and target NestJS path.
