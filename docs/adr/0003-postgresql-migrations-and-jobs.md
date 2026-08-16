# ADR 0003: PostgreSQL migrations and operational state

- Status: Accepted
- Date: 2026-08-16

## Context

The existing product already relies on PostgreSQL exclusion constraints for conflict safety. The replacement backend needs tenant-owned relational data, atomic compound bookings and durable notification/waitlist jobs. ORM schemas frequently cannot express every partial index, exclusion constraint or locking rule needed by the scheduling domain.

Adding Redis or a separate broker would increase cost and operational surface before the product has live customers.

## Decision

Use PostgreSQL as the authoritative MVP datastore and keep versioned SQL-capable migrations as the schema source of truth. Use `node-pg-migrate` for migration ordering and execution. Preserve advanced PostgreSQL constraints in reviewed migrations even when a later query abstraction cannot model them directly.

Use an injected `pg` pool for the first backend slice. Select a higher-level query layer only after the tenant-repository and scheduler access patterns are understood.

Notification outbox, reminder scheduling, waitlist offers and worker leases will also use PostgreSQL. Workers will claim bounded batches with transactional locking such as `FOR UPDATE SKIP LOCKED` and implement idempotent application effects.

## Consequences

- Scheduling state and job intent can be committed atomically.
- One database is sufficient for the MVP deployment and backup plan.
- Migration review is security- and correctness-critical.
- Long-running jobs and provider network calls must never hold database transactions open.
- Worker throughput must be benchmarked before adding another queue technology.
- The database remains portable and does not require a managed Supabase project.

## Validation

- A clean PostgreSQL 17 container migrates from zero automatically.
- Re-running migrations is a no-op.
- Deterministic seed data creates two isolated business fixtures.
- API readiness checks the injected database pool.
- Future booking and job integration tests run against real PostgreSQL.
