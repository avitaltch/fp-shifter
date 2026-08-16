# ShiftSync MVP Development Plan

**Status:** Draft execution plan
**Last updated:** 2026-08-16
**Source requirements:** [`docs/PRD_MVP.md`](./PRD_MVP.md)
**Planning assumption:** One full-time engineer, two-week iterations, 70–80% planned capacity
**Target:** Scheduling proof in week 1, full local vertical slice in 6–7 weeks, supervised design-partner dry run in 8–10 weeks, production pilot in 12–14 weeks, paid-MVP decision after pilot evidence

The earlier 7–9 week pilot estimate is achievable only as a supervised dry run using local/fake communication adapters and operator-assisted setup. This detailed plan treats external delivery, backup restoration, privacy procedures and operational hardening as requirements for an unsupervised production pilot, so its production-pilot estimate is deliberately more conservative.

## 1. Delivery strategy

Build an evolutionary modular monolith:

```text
React SPA
   │ REST/JSON
   ▼
NestJS API
   ├── Auth and tenant guards
   ├── Scheduling and appointments
   ├── Management APIs
   └── Notification/waitlist APIs
   │
   ▼
PostgreSQL
   ├── Tenant data
   ├── Provider overlap constraints
   ├── Notification outbox
   └── Waitlist offers/holds

NestJS worker process
   ├── Reminder scheduler
   ├── Notification dispatcher
   └── Waitlist progression
```

Do not introduce microservices, Kubernetes, Kafka or a required Redis instance for the MVP. Use PostgreSQL for durable job coordination and keep message vendors behind adapters.

## 2. Delivery principles

1. Prove the compound scheduler before broad UI or integrations.
2. Keep every pull request independently reviewable and testable.
3. Add real PostgreSQL integration tests before trusting scheduling correctness.
4. Never confirm an appointment with an unassigned step.
5. Enforce tenant scope at module/repository boundaries, not ad hoc in controllers.
6. Preserve existing React page contracts while replacing Supabase implementations behind the API layer.
7. Build fake notification adapters first; vendor selection must not block domain work.
8. Deploy one API and one worker from the same codebase until scale proves otherwise.

## 3. Architectural decisions required in the first week

Create short ADRs for:

- **ADR-002 Backend boundary:** NestJS modular monolith and REST API.
- **ADR-003 Persistence:** PostgreSQL schema/migration source and query-layer choice.
- **ADR-004 Authentication:** Local password/access/refresh credential lifecycle.
- **ADR-005 Tenant isolation:** Membership guard and business-scoped repositories.
- **ADR-006 Scheduling:** Fixed-order sequential plan search plus transactional revalidation.
- **ADR-007 Jobs:** PostgreSQL outbox/worker locking and retry semantics.

Recommended persistence rule: keep PostgreSQL migrations authoritative. If an ORM cannot express exclusion constraints or partial indexes, retain those constraints in reviewed raw SQL migrations rather than weakening the model.

## 4. Workstreams

### A. Platform foundation

- NestJS application and worker entry point
- Environment validation
- PostgreSQL connection and migrations
- Health/readiness endpoints
- Structured logging and request identifiers
- Docker Compose development environment

### B. Identity and tenancy

- Businesses, locations, users and memberships
- Owner/manager/provider roles
- Local authentication and refresh/revocation
- Tenant guard and scoped repository conventions
- Cross-tenant security tests

### C. Scheduling domain

- Services, provider skills and availability
- Ordered visit request
- Candidate-provider lookup
- Deterministic multi-provider plan search
- Booking transaction and provider exclusion constraints
- Cancellation and reassignment integrity

### D. Product interfaces

- Public business booking route
- Ordered service selection and reordering
- Availability and booking API integration
- Manager day/week calendar
- Provider schedule
- Customer appointment management

### E. Notifications and recovery

- Transactional outbox
- Fake email/SMS/WhatsApp adapters
- Reminder scheduling and cancellation
- Waitlist entries and matching
- Offers, holds, expiry and acceptance
- Recovered-revenue records

### F. Pilot readiness

- External messaging adapters
- Operator onboarding and import path
- Rate limiting and security review
- Backup/restore rehearsal
- Load/concurrency tests
- Runbooks, dashboards and pilot support process

## 5. Milestones and iterations

### Iteration 0 — baseline and architecture

**Duration:** 3–5 days
**Goal:** Establish a clean backend boundary and protect the known-good frontend baseline.

Deliverables:

- Record current passing checks and preserve existing behavior.
- Add repository workspace structure for the NestJS API without disrupting the React build.
- Add local PostgreSQL and API services to Compose.
- Create environment schema and health/readiness endpoints.
- Write ADRs 002–007.
- Add CI jobs for backend lint, unit tests, migrations and integration tests.
- Add seed fixtures for two isolated businesses.

PRD coverage: P0-15 and foundations for P0-01/P0-02.

Exit gate:

- [ ] React checks still pass.
- [ ] NestJS starts locally and reports readiness only after PostgreSQL is reachable.
- [ ] Empty database can migrate up from zero through one command.
- [ ] CI executes both frontend and backend checks.

### Iteration 1 — tenant-safe domain foundation

**Duration:** 2 weeks
**Goal:** Operate two isolated businesses with local staff authentication and scheduling configuration.

Deliverables:

- Businesses and locations schema/API.
- Users and business memberships.
- Owner, manager and provider authorization.
- Password/access/refresh credential lifecycle.
- Customers, services, provider skills, business hours and availability schema/API.
- Business-scoped repository/query helpers.
- Public business lookup by slug.
- Cross-tenant integration-test matrix.
- Operator seed command for owner and demonstration data.

PRD coverage: P0-01, P0-02, P0-03 and part of P0-14.

Exit gate:

- [ ] Two businesses may contain customers with the same phone number.
- [ ] Business A cannot read or mutate any Business B record.
- [ ] Owner can configure services, skills and availability locally.
- [ ] Provider sees only memberships and data permitted by role.

### Iteration 2 — compound scheduling engine

**Duration:** 2 weeks
**Goal:** Return valid, deterministic plans for ordered multi-service requests.

Deliverables:

- Appointment and appointment-step schema.
- Provider/time exclusion constraint.
- Pure scheduling-domain types and algorithm.
- Candidate query for each ordered service step.
- Fixed-order, back-to-back multi-provider search.
- Deterministic plan ranking.
- `GET /public/businesses/:slug/availability` endpoint.
- Unit tests for combinatorial plan rules.
- Real PostgreSQL tests for skills, availability and conflicts.
- Scheduler benchmark fixture: ten providers and up to six services.

PRD coverage: P0-04, P0-05, P0-06 foundations and scheduling NFRs.

Exit gate:

- [ ] Trim-plus-vaccine returns a groomer/veterinarian plan.
- [ ] Removing either provider removes the affected start time.
- [ ] Identical input/state returns the same chosen plan.
- [ ] p95 availability target is met on the benchmark fixture or documented with an optimization plan.

### Iteration 3 — transactional booking and React vertical slice

**Duration:** 2 weeks
**Goal:** Complete the differentiating customer journey through NestJS.

Deliverables:

- Transactional compound-booking command.
- Server-owned price and duration snapshots.
- Stale-plan conflict response.
- Public booking management credential.
- Business-specific `/book/:businessSlug` route.
- React API adapter from Supabase RPC to NestJS REST.
- Ordered service selection/reordering UI.
- Feasible-time selection and compound confirmation summary.
- Manager compound-visit timeline.
- Concurrency tests with simultaneous booking attempts.
- End-to-end browser test against real NestJS/PostgreSQL.

PRD coverage: P0-04, P0-05, P0-06, initial P0-07 and part of P0-09.

Exit gate — local differentiated prototype:

- [ ] Customer books a two-provider visit end to end.
- [ ] Impossible slots are not offered.
- [ ] A race produces one confirmed booking and one clean conflict response.
- [ ] No failed path leaves partial appointment steps.
- [ ] Two public business slugs remain isolated.

This is the first product-demonstration milestone and should be shown to prospective design partners before expanding scope.

### Iteration 4 — management, cancellation and notification engine

**Duration:** 2 weeks
**Goal:** Make the scheduled visit operational for customer, manager and provider.

Deliverables:

- Manager day/week calendar and manager-created booking.
- Provider schedule and status progression.
- Customer view/cancel flow using secure credential.
- Availability-change impact detection.
- Notification outbox created transactionally with domain changes.
- PostgreSQL worker leasing with `SKIP LOCKED` or equivalent.
- Fake email, SMS and WhatsApp adapters.
- Immediate confirmation and multi-provider manager events.
- Seven-day, 24-hour and one-hour reminder scheduler.
- Retry, idempotency and operator-visible failure states.

PRD coverage: P0-07 through P0-11, part of P0-14/P0-15.

Exit gate — internal MVP:

- [ ] All three personas can complete their core flow locally.
- [ ] Cancellation atomically releases the complete visit.
- [ ] Fake adapters receive the correct scheduled messages exactly once at the application-effect level.
- [ ] Cancelling an appointment prevents pending reminders.
- [ ] Manager receives a fake-channel event for every multi-provider visit.

### Iteration 5 — waitlist and cancellation backfill

**Duration:** 1–2 weeks
**Goal:** Convert released compound availability into a safe, measurable offer.

Deliverables:

- Waitlist entry UI/API.
- Compound-service and time-window matcher.
- Deterministic candidate ranking.
- Offer/hold schema and worker lifecycle.
- Secure acceptance/rejection endpoint.
- Five-minute expiry and next-candidate progression.
- Atomic offer acceptance and appointment creation.
- Recovered-revenue record.
- Race, expiry and duplicate-processing integration tests.

PRD coverage: P0-12, P0-13 and related analytics.

Exit gate:

- [ ] Cancellation of a compound visit selects a compatible candidate.
- [ ] Only the active candidate can accept.
- [ ] Expiry advances without operator action.
- [ ] Concurrent acceptance cannot create overlapping appointments.
- [ ] Successful fill records recovered revenue.

### Iteration 6 — pilot hardening and controlled external integration

**Duration:** 2 weeks
**Goal:** Operate safely with five design-partner businesses.

Deliverables:

- Select and implement external email/SMS/WhatsApp adapters.
- Template configuration and delivery-status webhooks.
- Business channel and fallback settings.
- Usage metering per channel/business.
- Rate limits and abuse controls.
- Privacy notice and operator export/deletion procedure.
- Production container configuration, TLS and secrets documentation.
- Off-host backup and restore rehearsal.
- Load test against PRD capacity fixtures.
- Operator runbooks for delivery failure, stuck job, provider absence and restoration.
- Assisted onboarding and data-import procedure.

PRD coverage: completion of P0-10, P0-11, P0-14, P0-15 and all launch gates.

Exit gate — design-partner pilot:

- [ ] Five businesses are configured.
- [ ] Production backup has been restored successfully in a clean environment.
- [ ] External delivery and status callbacks work for configured channels.
- [ ] Load and tenant-isolation gates pass.
- [ ] Operator can identify and recover from documented failure scenarios.

### Iteration 7 — pilot learning and paid-MVP gate

**Duration:** 2 weeks of observation/fixes after pilot starts
**Goal:** Resolve pilot-critical issues and establish willingness to pay.

Deliverables:

- Instrument PRD product events and pilot queries.
- Weekly design-partner review.
- Fix P0 scheduling, delivery and usability findings.
- Measure coordination time and recovered bookings.
- Basic business usage/recovered-value report.
- Support and incident triage process.
- Paid-plan entitlement and manual billing record if needed.

Exit gate — paid MVP:

- [ ] No unresolved severity-one scheduling or isolation defect.
- [ ] Four of five pilot businesses are willing to pay.
- [ ] Pilot success metrics have been evaluated and documented.
- [ ] Support burden is sustainable for the operator.

## 6. Proposed pull-request sequence

Each PR should preserve a green main branch and include tests for its boundary.

| PR | Scope | Depends on |
| ---: | --- | --- |
| 1 | Workspace structure, NestJS health endpoint, backend CI | None |
| 2 | PostgreSQL Compose service, migrations and two-business seed | PR 1 |
| 3 | Businesses, memberships and tenant guard | PR 2 |
| 4 | Local auth and role authorization | PR 3 |
| 5 | Services, provider skills and availability APIs | PR 3 |
| 6 | Appointment-step schema and provider exclusion constraint | PR 2 |
| 7 | Pure compound scheduling engine and unit tests | PR 5, PR 6 |
| 8 | Availability API and PostgreSQL integration tests | PR 7 |
| 9 | Atomic booking command and concurrency tests | PR 8 |
| 10 | React business routes and NestJS booking adapter | PR 9 |
| 11 | Manager/provider operational views | PR 9, PR 10 |
| 12 | Customer management and cancellation | PR 9, PR 10 |
| 13 | Outbox worker and fake channel adapters | PR 9 |
| 14 | Confirmation and reminder policy | PR 12, PR 13 |
| 15 | Waitlist entries, matching and offers | PR 12, PR 13 |
| 16 | External adapters, webhooks and channel metering | PR 14 |
| 17 | Pilot security, load, backup and runbook gate | All P0 PRs |

PRs 3/4, 5/6 and 11/13 may be developed concurrently if more than one engineer is available.

## 7. Backlog mapped to PRD

| Epic | PRD requirements | Estimate | Milestone |
| --- | --- | ---: | --- |
| Backend/platform foundation | P0-15 | 3–5 days | Iteration 0 |
| Tenant-safe identity and configuration | P0-01–P0-03 | 8–10 days | Iteration 1 |
| Compound scheduler | P0-04–P0-05 | 8–10 days | Iteration 2 |
| Atomic booking and public React flow | P0-06, part P0-07/P0-09 | 8–10 days | Iteration 3 |
| Operational manager/provider/customer flows | P0-07–P0-09 | 5–7 days | Iteration 4 |
| Notification and reminders | P0-10–P0-11 | 5–7 days | Iteration 4 |
| Waitlist and backfill | P0-12–P0-13 | 5–8 days | Iteration 5 |
| Privacy, security and operations | P0-14–P0-15 | 6–10 days | Iteration 6 |
| External communication adapters | P0-10–P0-11 completion | 4–7 days | Iteration 6 |

Expected engineering effort is approximately 52–74 focused developer-days. Calendar time depends on review latency, pilot feedback and whether frontend/backend work can run concurrently.

## 8. Testing strategy

### Unit tests

- Scheduling-plan generation and ranking
- Reminder eligibility and timing
- Waitlist ranking and offer progression
- Authorization decisions
- DTO validation and error mapping
- Channel adapter contract

### PostgreSQL integration tests

- Migrations from an empty database
- Tenant isolation
- Provider overlap constraints
- Transaction rollback on partial booking failure
- Simultaneous booking race
- Cancellation and slot release
- Job leasing and idempotency
- Offer acceptance race and expiry

### Browser tests

- Public compound booking against real local API/database
- Business slug isolation
- Manager-created booking
- Customer cancellation
- Manager calendar handoff view
- Provider schedule/status
- Waitlist join and simulated offer acceptance
- Hebrew RTL mobile viewport

### Load and resilience tests

- Ten-provider/six-step availability benchmark
- Concurrent attempts for the same plan
- 100-business data isolation/load fixture
- 100,000 queued reminder-job fixture
- Worker restart during dispatch
- PostgreSQL restart and recovery
- Backup restoration into a clean environment

## 9. Definition of done for every implementation item

- [ ] Behavior maps to a PRD requirement and acceptance criterion.
- [ ] Tenant authorization is explicitly considered.
- [ ] Unit/integration coverage exists at the appropriate boundary.
- [ ] Negative and concurrency cases are tested when state changes.
- [ ] API contract and domain errors are documented.
- [ ] Logs contain identifiers but no secrets or sensitive tokens.
- [ ] Migration is repeatable from a clean database.
- [ ] Existing frontend checks remain green.
- [ ] Documentation is updated when behavior or operations change.
- [ ] No new external service is required for local automated tests.

## 10. Risk-driven spikes

Time-box each spike; it must end in a decision, benchmark or rejected approach.

### Spike 1 — scheduling complexity

**Time box:** 2 days
Generate synthetic schedules for ten providers and one-to-six steps. Compare straightforward depth-first search with candidate pruning. Adopt the simplest method meeting the 500 ms p95 target.

### Spike 2 — PostgreSQL job queue

**Time box:** 1 day
Validate locking, retries and restart recovery using a small `SKIP LOCKED` worker or a maintained PostgreSQL job library. Prefer the library only if it preserves inspectability and does not introduce an external service.

### Spike 3 — authentication lifecycle

**Time box:** 1 day
Prove password login, refresh rotation, revocation and development reset flow. Do not build social login or customer accounts.

### Spike 4 — external channel selection

**Time box:** 2 days during Iteration 5
Compare official WhatsApp/SMS providers on Israeli delivery, status webhooks, template approval, sender requirements and price. This spike does not block local notification development.

## 11. Scope-control rules

- A new P0 requirement must remove comparable P0 scope or extend the timeline explicitly.
- P1 work does not begin before the local internal-MVP exit gate.
- External vendor UX is not built before the fake adapter passes the same contract tests.
- Rooms/equipment, parallel steps and automatic reordering stay out of the MVP scheduler.
- Payment and invoicing do not block the design-partner pilot.
- Product discovery may stop or redirect implementation if compound-booking frequency does not support the hypothesis.

## 12. First five working days

### Day 1

- Agree on PRD P0 boundary.
- Record baseline checks.
- Create backend workspace and health endpoint.
- Add backend CI scripts.

### Day 2

- Add local PostgreSQL service and migration runner.
- Create businesses, locations, users and memberships.
- Seed two businesses.

### Day 3

- Implement tenant request context and repository scoping.
- Add cross-tenant integration-test harness.
- Create service/provider/skill tables.

### Day 4

- Create availability and appointment-step tables.
- Add provider/time exclusion constraint.
- Define scheduling-domain input/output types.

### Day 5

- Implement the first fixed-order two-service plan search.
- Demonstrate trim by groomer followed by vaccine by veterinarian.
- Record benchmark and correctness gaps for Iteration 2.

## 13. Immediate decision checklist

These decisions should be confirmed before or during Iteration 0:

- [ ] Accept fixed customer-selected service order for MVP.
- [ ] Accept sequential back-to-back steps only.
- [ ] Accept automatically confirmed, fully assigned public bookings.
- [ ] Accept informational manager alert for every multi-provider booking.
- [ ] Accept one active location per business in the MVP interface.
- [ ] Accept local staff authentication and accountless customer management.
- [ ] Select PostgreSQL query/migration tooling.
- [ ] Confirm one-engineer capacity assumption or revise estimates.

External message-provider selection is deliberately not on this blocking list.
