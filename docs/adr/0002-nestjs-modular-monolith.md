# ADR 0002: NestJS modular monolith backend

- Status: Accepted
- Date: 2026-08-16

## Context

The current React client talks directly to Supabase tables and PostgreSQL RPCs. The MVP requires tenant-aware compound scheduling, a notification worker, local authentication and self-hosted operation. Continuing to add those responsibilities as browser-visible database calls would make authorization and domain orchestration increasingly difficult to test and evolve.

The target is at least 100 businesses, not a scale that justifies distributed services.

## Decision

Introduce a NestJS modular monolith under `apps/api`. It exposes versioned REST endpoints and owns authentication, tenant authorization, scheduling, appointments, notification intent and waitlist behavior.

Keep the existing React API facade while replacing its Supabase implementations endpoint by endpoint. Run the API and background worker from the same codebase, with separate process entry points when the worker is introduced.

The legacy Supabase path remains operational during incremental migration. The replacement stack uses `compose.mvp.yaml` so incomplete backend work does not disrupt the existing demo.

## Consequences

- Domain rules move behind a server-controlled boundary.
- React pages can migrate incrementally rather than through a full rewrite.
- One deployable codebase remains inexpensive to operate and debug.
- Module boundaries must prevent circular dependencies and tenant context leakage.
- The team owns authentication, API security and backend operations previously supplied by Supabase.
- Microservices, Kafka, Kubernetes and service discovery are explicitly deferred until measured scale requires them.

## Validation

- API lint, type-check, unit and HTTP endpoint tests run independently from the frontend.
- API starts only with validated configuration.
- Liveness succeeds without the database; readiness requires a successful database query.
- Existing React checks remain green after backend scaffolding.
