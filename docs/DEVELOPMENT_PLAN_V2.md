# Development Plan V2

**Created:** 2026-08-16
**Status:** Proposed execution baseline
**Supersedes:** `DEVELOPMENT_PLAN.md` for sequencing and status; the V1 plan remains useful historical context.
**Product source of truth:** `PRD_MVP.md`

## Outcome

Deliver a self-hosted MVP for at least 100 businesses, with a reliable first-pilot capacity of at least 10 barbers serving customers every 20 minutes. The differentiating vertical slice is an appointment containing an ordered series of services that may require different providers, while preserving provider availability, preventing collisions, and notifying the manager when multiple providers are involved.

The cheapest viable architecture remains:

- One React frontend.
- One NestJS modular monolith.
- One PostgreSQL database.
- One worker process built from the same backend codebase.
- PostgreSQL-backed jobs/outbox before considering Redis, Kafka, or a separate queue service.
- Pluggable email/SMS/WhatsApp adapters, with fake/local adapters until external delivery is required.

## What changed from V1

V1 correctly chose the target architecture but assumed a cleaner transition than the current repository state supports. V2 changes the execution order based on the code review:

1. Add a short stabilization stage before any new domain feature.
2. Prove the compound scheduler before implementing the full authentication and management surface.
3. Require real PostgreSQL migration and readiness checks in CI immediately.
4. Split the broad current working tree into reviewable units.
5. Treat the existing Supabase UI as a transitional prototype, not a backend contract to reproduce blindly.
6. Bring architecture/documentation cleanup forward so contributors see one target direction.
7. Gate progress with runnable user journeys and concurrency tests instead of file-count milestones.

## Current status

### Done

- Full MVP PRD.
- NestJS application boundary and independent dependency set.
- Validated base environment configuration.
- Liveness and database readiness endpoints.
- PostgreSQL development stack.
- Reversible foundation migration for businesses, locations, users, and memberships.
- Deterministic demo-business seed.
- NestJS modular-monolith and PostgreSQL migration/job ADRs.
- Passing baseline frontend and backend checks.
- Atomic compound booking, secure customer cancellation, and PostgreSQL-backed local notifications.
- Durable public-booking quotas and protection against anonymous customer-profile replacement.
- Sequential cancellation backfill with expiring holds, atomic claim, and a public waitlist journey.

### Stabilization completed

- The broad foundation was divided into five reviewable commits and pushed to a dedicated branch.
- CI provisions PostgreSQL and validates migration, seed, real readiness, rollback, and reapply.
- React Router was patched and both production dependency audits are clean.
- JSON logs, request IDs, pool failure handling, strict HTTP configuration, and loopback-only local ports are implemented.
- Self-hosting documentation now labels Supabase as the legacy contingency and NestJS/PostgreSQL as the target.

### Scheduling data foundation completed

- Tenant-safe customers, services, provider skills, business hours, availability, appointments, and ordered steps are migrated.
- Composite foreign keys reject cross-tenant relationships at the database boundary.
- The tenant-scoped scheduling repository supplies indexed candidate reads for the pure scheduler.
- The seed demonstrates a trim-to-vaccination handoff between a groomer and veterinarian.
- GiST range indexes serve availability and active-step overlap queries; the provider exclusion constraint rejects collisions.

### Not started in the target backend

- Tenant membership guards and authenticated scope resolution.
- Authentication and role authorization.
- Configuration APIs for services, provider skills, working hours, and exceptions.
- Manager and provider operational APIs.
- Provider-ready real notification adapters and pilot operations.

## Delivery principles

- PostgreSQL is the final authority for booking conflicts; availability responses are advisory until booking commits.
- Every tenant-owned query is scoped by `business_id`; route input alone never establishes tenancy.
- Scheduling logic is a pure, deterministic TypeScript domain module. Database code loads candidates and persists results but does not hide scheduling rules.
- One appointment contains ordered appointment steps. Each step records its service, provider, time range, duration, and price snapshots.
- Correctness before caching. The MVP scale does not justify distributed infrastructure.
- No external messaging dependency is needed until notification intent, idempotency, retries, and local worker behavior are proven.
- Every stage ends in a runnable proof and has explicit exit criteria.

## Now: establish a trustworthy vertical slice

### R0 — Stabilize the foundation

**Estimate:** 1–2 focused engineering days
**Status:** Implemented and locally verified on `codex/mvp-foundation-v2`
**Goal:** Make the existing foundation safe to review and safe to build on.

**Work**

- Preserve the current work and divide it into reviewable changes; do not discard unrelated user changes.
- Patch React Router to a non-vulnerable version and refresh the lockfile.
- Add PostgreSQL to CI.
- Apply migrations and seed data in CI.
- Add a real AppModule/database readiness integration test.
- Validate migration rollback on a disposable CI database.
- Register PostgreSQL pool error handling.
- Add structured JSON logs and propagate or create request IDs.
- Bind local Compose ports to loopback and require secrets outside local development.
- Validate CORS origins and disable Swagger by default in production.
- Mark ADR 0001 as partially superseded and label legacy versus target setup paths.

**Exit gate**

- A small foundation change can be reviewed independently.
- Frontend and API production audits report no high-severity findings.
- A clean CI run proves lint, typecheck, tests, builds, migrations, seed, real readiness, and rollback.
- A database interruption produces structured logging rather than an unhandled pool error.

### R1 — Build the scheduling data foundation

**Estimate:** 3–5 focused engineering days
**Status:** Implemented and locally verified on `codex/mvp-foundation-v2`
**Goal:** Represent the compound-booking domain with tenant-safe persistence.

**Work**

- Add migrations for:
  - customers;
  - services;
  - provider skills/qualifications;
  - business hours and provider availability/absence exceptions;
  - appointments;
  - ordered appointment steps.
- Put `business_id` and, where required, `location_id` on tenant-owned records.
- Add foreign keys, uniqueness constraints, status checks, and query indexes.
- Enable `btree_gist` and add an exclusion constraint that prevents overlapping active steps for a provider.
- Define one tenant-scoped repository/query pattern and prohibit unscoped access from controllers.
- Add cross-tenant isolation tests for every repository introduced.
- Expand the deterministic seed with a pet-care business containing services that require a groomer and a veterinarian.
- Write the tenant/query-safety and booking-transaction ADRs.

**Exit gate**

- The schema can represent a trim followed by a vaccine with two different providers.
- The database rejects overlapping active work for the same provider.
- Tests prove that one business cannot read or mutate another business's records.
- Migration up/down succeeds from an empty database.

### R2 — Prove the ordered multi-provider scheduler

**Estimate:** 4–6 focused engineering days
**Status:** Implemented and locally verified on `codex/mvp-foundation-v2`
**Goal:** Validate the product's central technical and commercial hypothesis early.

**Work**

- Implement a pure TypeScript scheduling domain module.
- Input: business/location, ordered service IDs, date window, business hours, provider availability, skills, existing reservations, and buffers.
- Output: valid appointment plans containing one step per service and a provider/time assignment per step.
- Use deterministic candidate ordering and bounded depth-first search/backtracking with pruning.
- Support at least six ordered services and ten candidate providers without infrastructure changes.
- Preserve service order; allow different providers between consecutive steps.
- Reject a slot when any step lacks a qualified available provider.
- Include reasons useful for diagnostics without exposing staff-private data publicly.
- Add unit/property-style cases for time zones, DST, breaks, closures, buffers, provider handoff, and no-solution paths.
- Add a benchmark based on the stated large-studio and ten-barber scenarios.
- Expose a read-only availability endpoint addressed by public business slug.

**Exit gate**

- The pet-care seed produces valid trim-plus-vaccine plans using different qualified providers.
- Removing either provider removes the invalid plan.
- A representative search completes within the PRD target, initially p95 below 500 ms on the development benchmark.
- Identical input produces identical ordered output.

## Next: turn the scheduling proof into a usable product

### R3 — Atomic booking and public booking vertical slice

**Estimate:** 5–7 focused engineering days
**Status:** Implemented except for the final real-stack browser journey
**Goal:** Let a customer find and commit a real compound appointment through NestJS/PostgreSQL.

**Backend work**

- Add normalized customer identity scoped to a business.
- Accept an ordered service list and selected plan.
- Recompute/revalidate the plan inside the booking command.
- Create the appointment and all steps in one transaction.
- Snapshot service names, durations, prices, and provider assignments.
- Convert exclusion conflicts into a stable “slot no longer available” response.
- Add idempotency for booking submission.
- Generate an unguessable customer-management token, store only its hash, and support expiry/revocation.
- Add concurrency tests in which only one of two conflicting bookings succeeds.

**Frontend work**

- Restore a real `/book/:businessSlug` route.
- Load public business, service, and availability data through the API facade.
- Let customers add and reorder services.
- Display provider handoffs clearly without requiring the customer to choose staff unless configured.
- Submit the selected plan and handle conflict refresh without losing customer input.
- Replace the legacy phone-plus-appointment management lookup with the secure token flow.

**Implemented checkpoint**

- `/book/:businessSlug` loads the public catalog, searches compound availability, and commits through NestJS.
- The adapter normalizes minor currency units, business-local ISO times, and Israeli E.164 phone input at the API boundary.
- Browser coverage proves the slug journey makes no Supabase request; `/book` remains temporarily available for legacy regression coverage.
- UUID-based keys are stable across identical frontend retries, tenant-scoped in PostgreSQL, and replay one committed response under concurrency.

**Exit gate**

- A browser E2E test books trim then vaccine against the real NestJS/PostgreSQL stack.
- Two simultaneous attempts cannot double-book a provider.
- A customer can cancel with a valid management token; guessed or revoked tokens fail.
- No Supabase call is used in this public-booking journey.

### R4 — Authentication, authorization, and tenant configuration

**Estimate:** 5–7 focused engineering days
**Goal:** Make the vertical slice safe for a real business operator.

**Work**

- Implement Argon2 password hashing.
- Add short-lived access tokens and rotating refresh tokens with revocation.
- Add owner, manager, and provider roles.
- Resolve authenticated membership server-side and enforce tenant scope in guards plus repositories.
- Implement CRUD APIs for locations, services, provider skills, business hours, and provider availability.
- Add a cross-tenant authorization matrix to integration tests.
- Rate-limit authentication and public booking mutation endpoints.
- Keep demo credentials and pilot tenants in separate environments.

**Exit gate**

- An owner can configure the pet-care demo through NestJS APIs.
- A provider can see only their allowed schedule data.
- Cross-tenant read and write attempts consistently return no data or authorization errors.
- Revoked refresh tokens cannot create new sessions.

### R5 — Manager and provider operating flows

**Estimate:** 4–6 focused engineering days
**Goal:** Support the minimum daily workflow after a booking is created.

**Work**

- Manager day/week calendar sourced from NestJS.
- Provider personal schedule.
- Appointment details showing ordered steps and handoffs.
- Manager cancellation, reassignment, and status changes with audit events.
- Provider absence/availability changes and immediate impact visibility.
- Simple diagnostic view explaining why a requested compound appointment has no valid slot.

**Exit gate**

- Manager and provider E2E journeys use no Supabase backend calls.
- Changes are tenant-safe and audited.
- Reassignment cannot create a collision.

### R6 — PostgreSQL outbox, reminders, and manager notifications

**Estimate:** 5–7 focused engineering days
**Status:** Implemented and locally verified with fake providers
**Goal:** Prove notification behavior locally before paying for delivery providers.

**Work**

- Add notification intent/outbox tables with stable idempotency keys.
- Run a worker process from the same backend repository using `FOR UPDATE SKIP LOCKED` claims.
- Add retry/backoff, terminal failure state, and recovery of abandoned claims.
- Implement fake email, SMS, and WhatsApp adapters that log/store rendered messages.
- Schedule:
  - one-week reminder only when the appointment was created more than one month in advance;
  - 24-hour reminder;
  - one-hour reminder.
- Cancel obsolete reminder jobs when appointments change.
- Notify the manager when one appointment requires multiple providers.
- Add per-business and per-channel policy switches.

**Exit gate**

- Restarting the worker does not send the same logical notification twice.
- Time-based tests prove each reminder rule at boundary conditions.
- Rescheduling/cancellation invalidates outdated reminders.
- The manager notification contains the complete provider handoff plan.

**Implemented checkpoint**

- Booking and cancellation transactions create or invalidate notification jobs atomically.
- PostgreSQL claims bounded batches with `FOR UPDATE SKIP LOCKED` and recovers expired worker leases.
- The one-week, 24-hour, and one-hour rules have deterministic boundary coverage.
- Local Email, SMS, and WhatsApp delivery is idempotent and fully audited without an external account.
- Bounded exponential retry, terminal failure, and configured fallback-channel behavior are covered against real PostgreSQL.

### R7 — Waitlist and cancellation backfill

**Estimate:** 5–8 focused engineering days
**Status:** Implemented and locally verified with real PostgreSQL plus frontend journey tests
**Goal:** Fill newly available time without overselling it.

**Work**

- Capture waitlist requests with acceptable time windows and ordered services.
- Re-run the scheduler when cancellation or availability change creates capacity.
- Rank eligible matches deterministically.
- Send a “booking time became available” offer through the outbox.
- Use expiring claim tokens and an atomic claim transaction.
- Define whether MVP offers are sequential or sent to a small batch; default to sequential for cost and fairness control.
- Audit offer, expiry, claim, and loss events.

**Exit gate**

- A cancellation can generate an offer for a compatible multi-service request.
- Only one customer can claim the released capacity.
- Expired offers cannot create bookings.

**Implemented checkpoint**

- Public registration validates future bounded windows, ordered services, tenant ownership, duplicate active demand, and durable abuse quotas.
- Cancellation creates durable match work; the worker ranks by entry creation time and creates only one active offer per released appointment.
- Pending appointments and scheduled steps act as five-minute provider holds under the existing exclusion constraint, without another queue or cache service.
- Offer and management capabilities are purpose-scoped, hashed at rest, carried in URL fragments for browser handoff, and never exposed in API paths or queries.
- Acceptance is single-effect and transactional; the appointment, entry, offer, notification/reminder intent, and recovered-revenue event commit together.
- Real PostgreSQL coverage proves expiry releases the first hold and advances to a second candidate, whose single-use acceptance creates the booking.
- The public booking page registers unavailable ordered-service demand; offer links claim through an authorization header, strip their fragment, and never persist the capability in browser storage.

## Later: connect real delivery and prepare a pilot

### R8 — External adapters and pilot hardening

**Estimate:** 7–10 focused engineering days, excluding provider onboarding delays
**Goal:** Put one real business on the system without changing the core architecture.

**Work**

- Select the lowest-cost compliant providers for Israeli email, SMS, and WhatsApp delivery based on current quotes and onboarding requirements.
- Implement adapters behind the tested notification interface.
- Add consent, opt-out, quiet-hours, template/version, delivery-receipt, and channel-fallback rules.
- Add backups and a tested restore runbook.
- Add metrics for booking success, scheduler latency, conflicts, queue age, notification delivery, and failures.
- Add alerting for readiness, worker backlog, backup failure, and repeated delivery failures.
- Complete privacy/export/deletion and audit-log controls required for the pilot.
- Run load and soak tests matching at least ten barbers with 20-minute appointments and the documented reminder policy.
- Remove/rotate public demo credentials and create a separate pilot environment.
- Replace transitional Supabase/self-hosting instructions with the final NestJS runbook.

**Exit gate**

- Restore from backup is demonstrated.
- Load tests meet booking and scheduling latency targets without double bookings.
- Provider costs can be measured per business/channel.
- A pilot business can be onboarded, configured, booked, reminded, cancelled, and backfilled end to end.

## Reviewable change sequence

Each change should be independently understandable, testable, and reversible:

| Change | Scope | Depends on |
|---|---|---|
| V2-01 | Foundation stabilization, security, real DB CI, logging | Current foundation |
| V2-02 | Scheduling schema, constraints, tenant repository pattern | V2-01 |
| V2-03 | Pure compound scheduler and benchmark | V2-02 |
| V2-04 | Public availability API by business slug | V2-03 |
| V2-05 | Atomic booking, idempotency, secure management tokens | V2-04 |
| V2-06 | Public React booking vertical slice | V2-05 |
| V2-07 | Authentication, roles, guards, configuration APIs | V2-02; can begin after V2-03 stabilizes |
| V2-08 | Manager/provider operating flows | V2-06 and V2-07 |
| V2-09 | Outbox worker, fake adapters, reminders, manager alerts | V2-05 |
| V2-10 | Waitlist and atomic backfill | V2-09 |
| V2-11 | Real providers, operations, security, and pilot hardening | Previous vertical slices |

V2-07 may proceed alongside frontend work only after the scheduler contract is stable. Avoid parallel edits to shared migration or API-contract files until ownership boundaries are explicit.

## Indicative timeline

Assumption: one engineer with roughly 70–80% of time available for implementation, review, and verification. Estimates are ranges, not commitments.

| Window | Target outcome |
|---|---|
| Days 1–2 | Trustworthy, reviewable backend foundation |
| Days 3–10 | Tenant-safe scheduling schema and compound scheduler proof |
| Weeks 3–4 | Atomic public booking vertical slice |
| Weeks 5–6 | Auth, configuration, manager/provider minimum flows |
| Weeks 7–8 | Local outbox worker and full reminder policy |
| Weeks 9–10 | Waitlist and cancellation backfill |
| Weeks 11–14 | External channels, operational hardening, first pilot |

The first commercially meaningful demo should arrive at the end of R3, before all management and messaging features are complete.

## Definition of done for every change

- Acceptance behavior is expressed in tests before the change is considered complete.
- Tenant-owned access includes positive and cross-tenant negative tests.
- New migrations apply from empty and current databases and have a validated rollback strategy.
- API errors use stable machine-readable codes and do not leak internals.
- Logs include request/job IDs and tenant IDs where safe.
- Frontend and API lint, typecheck, unit/integration tests, builds, and production audits pass.
- Relevant documentation and ADR status are updated in the same change.
- No unrelated working-tree changes are staged or rewritten.

## MVP release gates

### Product gate

- Customer can select and reorder multiple services.
- System finds only schedules in which every ordered step has a qualified available provider.
- One appointment can hand off between providers.
- Manager is notified of that handoff.
- Customer can securely cancel.
- Cancellation can trigger an atomic waitlist offer.

### Capacity gate

- Ten barbers with 20-minute booking intervals are supported with headroom.
- Scheduler p95 is below 500 ms for the agreed representative dataset.
- Booking write p95 is below 300 ms excluding external delivery latency.
- Concurrent requests cannot double-book a provider.

### Notification gate

- One-week, 24-hour, and one-hour reminder rules pass deterministic time tests.
- Notification intent is durable and idempotent.
- Channel failures retry and surface to operators.
- Per-business usage and cost can be measured.

### Operations and security gate

- Authentication, tenant isolation, rate limiting, and management tokens have negative tests.
- Backups and restore are tested.
- Health, queue backlog, and delivery failures are observable.
- Pilot credentials and data are isolated from the public demo.
- No high-severity production dependency advisory remains without documented acceptance.

## Explicitly deferred

Do not add these before evidence requires them:

- Redis, Kafka, RabbitMQ, Kubernetes, or microservices.
- Payments and complex subscription billing.
- AI-based scheduling or optimization.
- Arbitrary parallel-service graphs; MVP supports fixed ordered sequential services.
- Native mobile applications.
- Deep analytics, marketplace discovery, or broad CRM features.
- Real SMS/WhatsApp spend before the fake-adapter workflow is correct and measurable.

## Immediate next action

Implement R4 authentication, tenant membership guards, and operator configuration APIs. Keep the existing Supabase screens transitional while moving each authenticated journey to the NestJS tenant boundary.
