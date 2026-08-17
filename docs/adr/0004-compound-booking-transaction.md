# ADR 0004: Compound appointment model and booking transaction

- Status: Accepted
- Date: 2026-08-16

## Context

The product differentiator is one customer visit containing an ordered service sequence that may hand off between providers. Availability reads cannot reserve capacity, and two customers may attempt to book the same provider time concurrently. A single appointment row with one provider cannot represent the required schedule or protect every step from races.

## Decision

Represent the customer visit in `appointments` and each ordered service in `appointment_steps`.

Each step stores:

- a positive sequence number;
- its tenant, location, appointment, service, and assigned provider;
- an active/cancelled lifecycle status;
- an exact half-open `[starts_at, ends_at)` time range;
- service name, duration, price, and currency snapshots.

The service and provider foreign keys include `business_id`, so a step cannot reference another tenant. A PostgreSQL GiST exclusion constraint prevents a provider from having overlapping `Scheduled` or `InProgress` steps. Back-to-back steps are allowed because time ranges are half-open.

The future booking command will re-read server-owned service data and revalidate the complete provider plan inside one short database transaction. It will insert the appointment and every step before committing. Exclusion error `23P01` maps to the domain response `PLAN_NO_LONGER_AVAILABLE`; every error rolls the entire transaction back. Cancellation updates the appointment and all active steps in one transaction so released time becomes immediately available.

No notification provider call, email rendering, or other network operation may run inside the booking transaction. Durable notification intent will be inserted in the same transaction when the outbox is introduced.

## Consequences

- Every confirmed visit can expose explicit ordered handoffs.
- Service edits do not rewrite the historical customer agreement.
- PostgreSQL, rather than an availability cache, is the final concurrency authority.
- Appointment/step lifecycle consistency must be enforced by booking and cancellation commands and covered by integration tests.
- Changing a provider or time is a scheduling operation, not a generic step update.

## Validation

- The deterministic seed stores a trim followed by a vaccination with two providers.
- A second active step overlapping the groomer fixture fails with `23P01`.
- Adjacent steps ending and starting at the same instant are accepted.
- Migration rollback removes the entire scheduling layer without altering foundation tenants/users.
- The public booking command reloads services and scheduling state on one tenant-scoped transaction client.
- A real PostgreSQL concurrency test proves that exactly one competing booking commits, the loser receives `PLAN_NO_LONGER_AVAILABLE`, and no partial appointment remains.
