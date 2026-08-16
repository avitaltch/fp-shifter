# ShiftSync MVP Product Requirements Document

**Status:** Draft for implementation
**Version:** 1.0
**Last updated:** 2026-08-16
**Product:** ShiftSync
**Initial market:** Israeli multi-provider service businesses
**Primary interface language:** Hebrew, right-to-left

## 1. Executive summary

ShiftSync enables a customer to book one visit containing an ordered series of services, even when those services require different qualified providers. The system exposes a start time only when it can construct and reserve a complete, conflict-free provider plan for every service in the visit.

For example, a customer can request a 45-minute pet trim followed by a 15-minute vaccination. ShiftSync may assign the trim to a groomer from 09:00–09:45 and the vaccination to a veterinarian from 09:45–10:00. If no complete provider sequence is available, 09:00 is not offered.

The MVP will replace the current single-business Supabase backend with a self-hosted modular NestJS application and PostgreSQL database. It will support at least 100 businesses, outbound email/SMS/WhatsApp adapters, scheduled reminders, customer cancellation, and cancellation-backfill offers.

## 2. Product hypothesis

Multi-provider businesses lose time and revenue because ordinary appointment calendars model a booking as one service with one employee. Managers therefore coordinate compound visits manually across calendars, reject potentially valid requests, or accept bookings that later require repair.

We believe businesses will adopt and pay for a system that automatically constructs valid multi-service visits, prevents provider conflicts, and demonstrates recovered revenue from cancellation backfill.

The riskiest product assumption is that compound appointments occur frequently enough, and create enough operational cost, to drive switching from existing booking systems.

## 3. Problem statement

Customers want to book everything they need as one visit without calling the business. Managers need every service to be performed by a qualified and available provider in the correct order, without manually comparing several calendars. Providers need schedules that clearly identify their part of a larger customer visit.

Without a compound scheduling system:

- customers must call or message the business;
- managers manually coordinate several employees;
- businesses hide or reject otherwise valid appointment times;
- providers can be double-booked during handoffs;
- cancellations are difficult to refill because the opening spans several constraints;
- businesses cannot measure the revenue recovered by automation.

## 4. Target market and personas

### 4.1 Initial ideal customer profile

The initial customer is a single-location Israeli service business with two to ten providers where a meaningful portion of visits contain two or more ordered services. Initial discovery should prioritize:

- multi-service beauty and hair centers;
- combined pet grooming and veterinary/wellness centers;
- aesthetic and wellness clinics that do not require a full medical-record product;
- bridal hair/makeup businesses;
- other small service businesses with frequent provider handoffs.

Ordinary barbershops remain supported but are not the primary differentiating segment when most visits use one barber.

### 4.2 Personas

#### Customer

Wants to select several services, see only genuinely bookable times, receive confirmations and reminders, and cancel without calling.

#### Business owner or manager

Configures services, staff skills and availability; views the complete schedule; handles exceptions; and wants fewer coordination messages, fewer empty slots and no double bookings.

#### Service provider

Publishes or receives working availability, sees assigned service steps, and updates work status without accessing unrelated businesses.

#### Platform operator

Onboards pilot businesses, assists with data import, diagnoses delivery or scheduling problems, and operates the self-hosted system.

## 5. Jobs to be done

- When a customer needs several services in one visit, they want to book the complete visit online so they do not need to coordinate employees themselves.
- When a manager receives a compound request, they want the system to assign every step safely so they do not need to compare calendars.
- When a provider checks the day, they want to see exactly which service they perform and when so handoffs run on time.
- When a customer cancels, the manager wants a matching customer notified automatically so otherwise-lost revenue can be recovered.
- When an owner evaluates the subscription, they want to see the time and revenue the product recovered.

## 5.1 User stories

### Customer stories

- As a customer, I want to select and order several services so that I can arrange everything I need in one visit.
- As a customer, I want to see only start times that support the complete visit so that my confirmed booking does not require later repair.
- As a customer, I want the business to assign qualified providers automatically so that I do not need to understand its staffing model.
- As a customer, I want a clear confirmation and reminders through an appropriate channel so that I remember the complete visit.
- As a customer, I want to cancel securely without creating an account so that I do not need to call the business.
- As a customer whose preferred time is unavailable, I want to join a waitlist for the complete service sequence so that I can claim a cancellation.

### Owner and manager stories

- As an owner, I want every record and staff permission isolated to my business so that another business cannot access my data.
- As a manager, I want to define which providers can perform each service so that the scheduler makes valid assignments.
- As a manager, I want to configure working availability so that customers see only operationally possible visits.
- As a manager, I want the system to coordinate different providers across one visit so that I do not compare calendars manually.
- As a manager, I want to receive an alert for a multi-provider visit so that I am aware of the handoff.
- As a manager, I want to create bookings received by phone or in person so that one calendar remains authoritative.
- As a manager, I want to see each visit's ordered steps and providers so that I can run the day and handle exceptions.
- As a manager, I want cancellation backfill to progress automatically so that released capacity can generate revenue.
- As an owner, I want delivery and recovered-revenue records so that I can evaluate whether the system pays for itself.

### Provider stories

- As a provider, I want to see only my assigned service steps so that I know what to perform and when.
- As a provider, I want to understand where my work sits in a compound visit so that customer handoffs run on time.
- As a provider, I want to update work status without changing scheduling fields so that progress is visible without risking the calendar.

### Platform-operator stories

- As an operator, I want to onboard and seed a business without a messaging vendor so that product development and demonstrations remain local.
- As an operator, I want to inspect failed jobs and scheduling decisions so that I can diagnose incidents.
- As an operator, I want tested backup and restore procedures so that self-hosting does not put customer data at unacceptable risk.

## 6. Goals

### 6.1 User goals

1. Allow customers to complete a valid multi-service booking without contacting the business.
2. Guarantee that every confirmed service step has a qualified, available and conflict-free provider.
3. Reduce manager coordination time for compound appointments by at least 50% during the pilot.
4. Give managers and providers a clear, mobile-friendly view of each customer visit and its handoffs.
5. Give customers timely transactional notifications and a self-service cancellation path.

### 6.2 Business goals

1. Onboard five design-partner businesses and at least 25 providers.
2. Have at least four of five design partners indicate willingness to pay after the pilot.
3. Demonstrate that one recovered appointment can cover the monthly subscription for a typical business.
4. Establish a platform capable of isolating and operating at least 100 businesses.

### 6.3 Technical goals

1. Prevent confirmed partial assignments and provider double bookings, including concurrent booking attempts.
2. Keep public availability queries at or below 500 ms p95 under the defined MVP load test.
3. Keep booking confirmation at or below 1 second p95, excluding third-party notification delivery.
4. Process reminder jobs idempotently and retain a complete delivery audit trail.
5. Run the core product locally without a required managed SaaS dependency.

## 7. Non-goals for MVP

- **Payments, deposits and invoicing:** valuable fast-follow capabilities, but not required to validate compound scheduling.
- **Class, membership or recurring-billing management:** yoga and fitness studios represent a separate product category.
- **Parallel service execution:** MVP services run sequentially to keep availability understandable and testable.
- **Automatic service reordering:** MVP respects the order selected by the customer or manager.
- **Rooms, equipment and consumable inventory:** the data model should not preclude them, but only providers constrain MVP availability.
- **Native iOS or Android applications:** the responsive web application is the MVP client.
- **AI receptionist or conversational booking:** structured web booking validates the core problem with less complexity.
- **Marketplace or customer discovery:** each business distributes its own public booking link.
- **Multi-location business management:** the schema includes locations, but MVP user flows support one active location per business.
- **Customer accounts:** customers manage appointments using a secure, expiring action link or confirmation credential.
- **Manager approval workflow:** all public MVP bookings are fully assigned and automatically confirmed; approval mode is a P1 feature.

## 8. Product principles

1. **No complete plan, no confirmed booking.**
2. **PostgreSQL is the final concurrency authority.** Availability results are proposals until committed transactionally.
3. **One customer visit, many explicit steps.** Every service has its own provider and time range.
4. **Tenant isolation is structural.** Authorization does not rely on client-provided business identifiers alone.
5. **Notifications are events, not inline side effects.** Booking succeeds independently of transient messaging failures.
6. **External vendors are adapters.** Core behavior remains testable with local fake providers.
7. **Hebrew mobile UX is the default.** English and additional locales are future capabilities.
8. **Explain unavailable states.** Managers should be able to understand why a combination could not be scheduled.

## 9. Core domain definitions

### Business

An isolated tenant that owns locations, staff memberships, customers, services, appointments and notification settings.

### Location

A physical place with a timezone and business hours. MVP supports one actively managed location per business while retaining the entity for future expansion.

### Provider

A staff member who may perform services at a business. Qualification is determined through explicit service skills.

### Availability

A time range during which a provider can accept work. Existing appointments and time off subtract from availability.

### Service

A bookable unit with name, price, duration, active status and eligible providers through their skills.

### Appointment

The customer-level visit. It has an overall start/end, lifecycle status, total price and one or more ordered steps.

### Appointment step

One service within an appointment, including sequence number, assigned provider, start/end and price snapshot.

### Scheduling plan

A complete proposed assignment of every requested service step to a provider and time range.

### Waitlist entry

A customer's request for a service sequence within one or more acceptable time windows.

### Waitlist offer

A temporary, single-customer opportunity to claim a newly feasible appointment plan before it expires.

## 10. Primary user flows

### 10.1 Business onboarding

1. Platform operator creates a business and initial location.
2. Owner account is created and associated through an owner membership.
3. Owner or operator configures services, durations and prices.
4. Owner adds providers and maps provider skills.
5. Owner configures availability and business hours.
6. System validates that at least one future service slot is feasible.
7. Business receives a public booking slug and link.

### 10.2 Customer compound booking

1. Customer opens `/book/:businessSlug`.
2. Customer selects one or more services and orders them.
3. Customer selects a date.
4. System calculates complete provider plans and returns only feasible start times.
5. Customer selects a start time and enters contact details.
6. System transactionally recalculates or validates the plan and reserves every step.
7. If the plan remains valid, the appointment is confirmed and notification events are enqueued.
8. If another booking won the race, no partial appointment is created and the customer receives refreshed alternatives.
9. When two or more distinct providers are assigned, a manager notification is enqueued.

### 10.3 Manager-created booking

1. Manager selects or creates a customer.
2. Manager chooses ordered services and date.
3. System offers feasible plans.
4. Manager may select a feasible plan or an eligible provider preference.
5. System confirms the complete appointment transactionally.

### 10.4 Customer cancellation

1. Customer opens a secure management link.
2. Customer reviews the appointment and chooses cancellation.
3. System applies the configured cancellation rule.
4. All active steps are cancelled atomically and their provider time is released.
5. Cancellation events are enqueued for the customer and manager.
6. The waitlist matcher searches for a compatible candidate.

### 10.5 Cancellation backfill

1. A future appointment is cancelled.
2. The system finds waitlist entries whose ordered services and time preferences fit a newly feasible plan.
3. Candidates are ranked deterministically by eligibility and waitlist creation time.
4. The first candidate receives a time-limited offer with a single-use token.
5. The offer temporarily protects the proposed plan for five minutes.
6. Acceptance creates the appointment transactionally.
7. Expiry or rejection releases the hold and advances to the next candidate.
8. Successful backfill records recovered appointment value.

### 10.6 Staff change

1. Manager changes or removes provider availability.
2. System identifies affected future steps before accepting the change.
3. If alternative complete assignments exist, the manager may apply a reassignment plan.
4. If no complete plan exists, the appointment is flagged for manager action; it is never silently left as valid.

## 11. Functional requirements

### 11.1 P0 — must have

#### P0-01 Tenant isolation

The system shall isolate every business's users, customers, services, availability, appointments, waitlist and notification records.

Acceptance criteria:

- [ ] A user may access a business only through an active membership.
- [ ] Business identifiers are derived from authenticated membership or a validated public slug.
- [ ] Cross-business reads and writes fail even when a valid record identifier is supplied.
- [ ] Customer phone uniqueness is scoped to a business, not globally.
- [ ] Automated integration tests cover cross-tenant access for every protected module.

#### P0-02 Staff authentication and authorization

The system shall support local owner, manager and provider accounts.

Acceptance criteria:

- [ ] Passwords are stored only as modern password hashes.
- [ ] Access and refresh credentials expire and can be revoked.
- [ ] Owners/managers can manage business configuration and schedules.
- [ ] Providers can access only their profile, availability and assigned steps unless granted manager access.
- [ ] Public customers cannot access staff or customer lists.
- [ ] Development invite/reset links can be delivered through a fake or local email adapter.

#### P0-03 Business, service and staff configuration

Managers shall configure the data required to calculate availability.

Acceptance criteria:

- [ ] Manager can create, edit, activate and deactivate services.
- [ ] Every service has a positive duration and non-negative price.
- [ ] Manager can create/deactivate providers and assign service skills.
- [ ] Manager can configure business hours and provider availability.
- [ ] Deactivation cannot silently invalidate future confirmed appointments.
- [ ] Configuration is scoped to the current business.

#### P0-04 Ordered service selection

Customers and managers shall create a visit request containing one or more ordered services.

Acceptance criteria:

- [ ] Selected services have a stable, visible order.
- [ ] Customer can reorder or remove a service before selecting a time.
- [ ] Total price and duration are calculated from server-owned service data.
- [ ] Inactive, unknown or cross-business service identifiers are rejected.
- [ ] Duplicate services are supported only when explicitly selected as separate steps.

#### P0-05 Compound availability calculation

The system shall return only start times for which every ordered service can be assigned sequentially to qualified, available providers.

Acceptance criteria:

- [ ] Each step is assigned to a provider skilled for that service.
- [ ] Each provider is available for the complete assigned step.
- [ ] No proposed step overlaps an existing active assignment for that provider.
- [ ] Steps are back-to-back and follow the selected order.
- [ ] One provider may perform multiple steps when qualified and available.
- [ ] Different steps may use different providers.
- [ ] A time is omitted when any step lacks a valid provider.
- [ ] Results are deterministic for identical availability state and input.
- [ ] Availability calculation does not persist an appointment.

#### P0-06 Atomic compound booking

The system shall create a confirmed appointment only when every proposed step can be committed.

Acceptance criteria:

- [ ] Appointment and every step are inserted in one database transaction.
- [ ] Server recalculates or revalidates price, duration, tenant and plan at commit time.
- [ ] Database constraints reject provider overlap under concurrent requests.
- [ ] A failed booking leaves no appointment, step or active hold behind.
- [ ] Confirmed appointments contain no unassigned step.
- [ ] A stale plan returns a conflict response and refreshed availability can be requested.

#### P0-07 Manager calendar and compound-visit view

Managers shall see customer visits and their individual service handoffs.

Acceptance criteria:

- [ ] Day and week views show appointments for the current business.
- [ ] A visit displays ordered steps, providers and step time ranges.
- [ ] Multi-provider visits are visually identifiable.
- [ ] Manager can create and cancel an appointment.
- [ ] Manager can inspect the reason an appointment requires attention.
- [ ] Calendar remains usable on a phone viewport.

#### P0-08 Provider schedule

Providers shall see their assigned work.

Acceptance criteria:

- [ ] Provider sees current and future assigned steps in chronological order.
- [ ] A compound visit indicates the step before/after the provider's work when relevant.
- [ ] Provider can progress a step through scheduled, in-progress and completed states.
- [ ] Provider cannot modify provider, service, price or time through status controls.

#### P0-09 Customer appointment management

Customers shall view and cancel a future appointment without an account.

Acceptance criteria:

- [ ] Management access uses an unguessable, expiring or revocable credential.
- [ ] View shows complete service sequence and visit start/end.
- [ ] Cancellation cancels every active step atomically.
- [ ] Cancelled provider time becomes available immediately.
- [ ] Repeated cancellation is idempotent and does not duplicate notifications.

#### P0-10 Notification outbox and channel adapters

The system shall persist notification intent independently from channel delivery.

Acceptance criteria:

- [ ] Booking transactions enqueue notification records in the same transaction as relevant state changes.
- [ ] Email, SMS and WhatsApp implement a common provider contract.
- [ ] Local fake provider can exercise every notification without an external account.
- [ ] Worker uses idempotency keys so a retry does not intentionally duplicate a message.
- [ ] Attempts, provider response, status and timestamps are retained.
- [ ] Failed delivery retries with bounded backoff and eventually requires manager/operator attention.
- [ ] A booking remains valid when notification delivery fails.

#### P0-11 Confirmation and reminder policy

The system shall schedule transactional customer and manager notifications.

Acceptance criteria:

- [ ] Booking confirmation is enqueued immediately.
- [ ] Manager notification is enqueued when a visit uses two or more providers.
- [ ] A seven-day reminder is scheduled only when the appointment was booked at least 30 days before its start.
- [ ] A 24-hour reminder is scheduled for every active appointment when enough lead time remains.
- [ ] A one-hour reminder is scheduled for every active appointment when enough lead time remains.
- [ ] Cancelled or completed appointments do not receive pending reminders.
- [ ] Business chooses a primary customer channel and optional fallback order.
- [ ] The system does not send the same reminder through every channel unless explicitly configured.

#### P0-12 Waitlist registration and matching

Customers or managers shall register demand for an unavailable compound visit.

Acceptance criteria:

- [ ] Entry includes ordered services, acceptable date/time window and contact details.
- [ ] Matcher considers only candidates for the same business and location.
- [ ] An offer is created only when a complete scheduling plan exists.
- [ ] Candidate ordering is deterministic and auditable.
- [ ] Duplicate active waitlist entries for the same demand can be prevented.

#### P0-13 Backfill offer lifecycle

The system shall offer newly feasible compound appointments sequentially and safely.

Acceptance criteria:

- [ ] Only one candidate has the active offer for a plan at a time.
- [ ] Default offer hold is five minutes.
- [ ] Offer token is unguessable, single-use and time-limited.
- [ ] Acceptance revalidates and books the complete plan atomically.
- [ ] Expired/rejected offers release their holds and advance automatically.
- [ ] Two candidates cannot accept the same released capacity.
- [ ] Successful backfill records recovered revenue using the appointment price snapshot.

#### P0-14 Auditability and privacy controls

The system shall retain enough history to investigate scheduling and delivery decisions while limiting unnecessary personal-data exposure.

Acceptance criteria:

- [ ] Authentication, booking, cancellation, assignment and notification events have auditable timestamps and actors.
- [ ] Transactional contact data is not automatically treated as marketing consent.
- [ ] Marketing consent, if later collected, is stored separately with source and timestamp.
- [ ] Sensitive values and authentication tokens are excluded from application logs.
- [ ] Customer export/deletion can be performed by the operator during MVP.
- [ ] Data retention policy is documented before paid launch.

#### P0-15 Operational readiness

The self-hosted MVP shall be recoverable and observable.

Acceptance criteria:

- [ ] React, NestJS, PostgreSQL and worker start through documented local containers.
- [ ] API and worker expose health/readiness status.
- [ ] Database migrations are versioned and repeatable.
- [ ] Structured logs carry request/job identifiers.
- [ ] Database backup and restore are exercised before pilot launch.
- [ ] No production secret is present in the repository or frontend bundle.

### 11.2 P1 — fast follows

- P1-01 Customer rescheduling of the complete visit.
- P1-02 Manager approval mode with expiring provisional holds.
- P1-03 Customer preference for a particular provider or “any qualified provider.”
- P1-04 Provider-specific service duration and price.
- P1-05 Configurable service setup, cleanup and handoff buffers.
- P1-06 Recurring appointments.
- P1-07 Operator-assisted CSV import for customers and future appointments.
- P1-08 Google Calendar synchronization.
- P1-09 Payment link or deposit integration.
- P1-10 Israeli invoice-provider integration.
- P1-11 Recovered-revenue and delivery-cost dashboard.
- P1-12 Multi-location manager interface.

### 11.3 P2 — future considerations

- P2-01 Rooms, chairs, equipment and other non-person resources.
- P2-02 Parallel service steps.
- P2-03 Intentional processing gaps where a provider is released.
- P2-04 Automatic service-order optimization.
- P2-05 Group classes, capacity, memberships and packages.
- P2-06 Native staff or customer applications.
- P2-07 AI/conversational booking.
- P2-08 Marketplace discovery.
- P2-09 Advanced workforce optimization and demand forecasting.

## 12. Scheduling rules and decision policy

### 12.1 MVP hard constraints

- Service order is fixed by sequence number.
- Steps cannot overlap and contain no intentional gap.
- Every step requires exactly one provider.
- A provider may perform consecutive steps.
- A provider cannot work on two active steps at the same time.
- A provider must possess the service skill and cover the complete step with availability.
- All steps occur at the same location and on the same local calendar date.
- A confirmed appointment must include the complete assignment plan.

### 12.2 MVP plan preference order

When multiple plans are valid, the scheduler chooses deterministically:

1. satisfy an explicit manager-supplied provider preference, if present;
2. minimize the number of provider handoffs;
3. prefer the least-loaded eligible provider set;
4. use a stable provider identifier tie-breaker.

The customer availability response may expose only start/end, while the booking response and manager calendar retain the selected plan.

### 12.3 Concurrency policy

Availability reads do not reserve capacity. Booking must revalidate within a database transaction. PostgreSQL provider/time exclusion constraints are the final protection against races. A conflict produces no partial state and returns a domain-level `PLAN_NO_LONGER_AVAILABLE` response.

## 13. Notification policy

### 13.1 Channel behavior

- Businesses configure one primary customer channel: WhatsApp, SMS or email.
- An optional fallback channel is attempted only after a definitive or exhausted delivery failure.
- Manager operational notifications use the manager's configured channel.
- Email may be treated as unmetered in product packaging; SMS and WhatsApp usage is recorded independently.
- Development and automated tests use a fake provider with deterministic results.

### 13.2 Required templates

- Customer booking confirmation
- Manager compound-visit notification
- Seven-day customer reminder
- 24-hour customer reminder
- One-hour customer reminder
- Customer cancellation confirmation
- Manager cancellation notification
- Waitlist availability offer
- Waitlist acceptance confirmation
- Manager/staff reassignment notification

Templates are versioned and render from server-owned appointment snapshots. No message contains more personal data than required for its purpose.

## 14. Non-functional requirements

### 14.1 Capacity

The MVP shall support:

- at least 100 businesses;
- at least 10 providers per business without degraded correctness;
- a peak business schedule of 360 appointments per 12-hour day;
- at least 36,000 appointments per day as a synthetic upper-bound platform test;
- at least 100,000 scheduled notification jobs per day in load testing;
- compound requests of up to six sequential service steps in MVP.

These are capacity targets, not expected average usage.

### 14.2 Performance

- Public availability: p95 ≤ 500 ms for a ten-provider business and up to six requested steps.
- Booking commit: p95 ≤ 1 second excluding external notification delivery.
- Authenticated calendar: p95 API response ≤ 750 ms for a one-week view.
- No synchronous dependency on a messaging provider in the booking response.

### 14.3 Reliability

- Zero accepted provider overlaps in concurrency tests.
- Zero confirmed appointments with missing steps or providers.
- Jobs are at-least-once processed and application effects are idempotent.
- Backup target before paid launch: RPO ≤ 24 hours and RTO ≤ 4 hours.

### 14.4 Security

- TLS is mandatory outside local development.
- Passwords use Argon2id or an equivalently current password hash.
- Refresh credentials are revocable and stored securely.
- Public endpoints are rate-limited.
- Authorization is enforced in NestJS and reinforced through scoped database access patterns.
- All request DTOs are allow-listed and validated.
- Secrets are supplied at runtime and never committed.

### 14.5 Accessibility and localization

- Primary UI is Hebrew and RTL.
- Critical customer and manager flows are keyboard usable.
- Inputs have associated labels and errors are programmatically connected.
- Status is not conveyed by color alone.
- Dates and times use the business timezone; MVP defaults to `Asia/Jerusalem`.

## 15. Analytics and success metrics

### 15.1 Required product events

- Booking page opened
- Service added, removed or reordered
- Availability requested
- Availability returned with/without results
- Plan selected
- Booking succeeded or failed by reason
- Compound booking confirmed
- Manager manually created booking
- Customer cancelled
- Waitlist joined
- Offer created, delivered, accepted, rejected or expired
- Reminder enqueued, delivered or failed
- Appointment completed

Analytics may initially be implemented as first-party database events rather than an external analytics service.

### 15.2 Leading pilot indicators

| Metric | Success threshold | Evaluation window |
| --- | ---: | --- |
| Configured design partners | 5 | Before pilot start |
| Providers configured | ≥25 total | Before pilot start |
| Compound appointments per active business | ≥20 | First 30 days |
| Successful public booking completion | ≥80% after a plan is selected | First 30 days |
| Confirmed partial/double bookings | 0 | Continuous |
| Reminder delivery success after provider acceptance | ≥98% | First 30 days |
| Eligible cancellations refilled | ≥20% | First 60 days |
| Manager compound-booking coordination time reduction | ≥50% | First 30 days |

### 15.3 Lagging indicators

| Metric | Success threshold | Evaluation window |
| --- | ---: | --- |
| Design partners willing to pay | ≥4 of 5 | End of pilot |
| Businesses retained | ≥80% | 90 days |
| Subscription covered by recovered value | ≥1 recovered appointment/month for typical business | 60 days |
| Support burden | <2 operator interventions/business/week after onboarding | 30 days |

## 16. Release phases

### Phase A — local differentiated prototype

Multi-tenant schema, compound scheduler, transactional booking, React integration and fake notification outbox. No external services.

Exit criterion: trim-plus-vaccine scenario works end to end for two isolated businesses and passes database concurrency tests.

### Phase B — internal MVP

Manager calendar, provider schedule, local authentication, customer cancellation, reminders with fake/local providers and waitlist offer lifecycle.

Exit criterion: all P0 functional flows pass locally through browser and real PostgreSQL tests.

### Phase C — design-partner pilot

Production deployment, external communication adapters, onboarding, monitoring, backups and privacy procedures.

Exit criterion: five businesses can operate for two weeks without data isolation, scheduling integrity or unresolved delivery incidents.

### Phase D — paid MVP

Pilot fixes, support process, retention/export procedures, pricing enforcement and basic usage reporting.

Exit criterion: at least four pilot businesses agree to pay and operational acceptance targets are met.

## 17. Launch gates

The MVP may not enter a real-business pilot until:

- [ ] tenant isolation tests pass;
- [ ] real PostgreSQL scheduling and booking tests pass;
- [ ] concurrent booking tests demonstrate zero partial or overlapping bookings;
- [ ] reminders can be cancelled and retried idempotently;
- [ ] backup restoration has been demonstrated;
- [ ] customer cancellation and waitlist acceptance use secure tokens;
- [ ] logs exclude secrets and customer tokens;
- [ ] operator can inspect failed jobs and appointments requiring attention;
- [ ] provider credentials and channel costs have explicit limits;
- [ ] privacy notice and transactional-contact handling have been reviewed.

## 18. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Compound appointments are infrequent | Differentiation does not drive purchases | Validate with 50 real examples from 10 businesses before expanding scope |
| Scheduling search becomes slow | Poor customer conversion | Limit MVP to six steps/ten providers, use indexed candidate queries and benchmark early |
| Availability result becomes stale | Double booking or customer frustration | Revalidate in transaction and return refreshed alternatives |
| Vendor delivery is unreliable or expensive | Missed reminders and margin erosion | Channel adapters, fallback policy, metering and delivery audit |
| Manager changes staff availability after booking | Broken future appointments | Impact preview, explicit reassignment workflow and attention state |
| Tenant filter is missed | Severe privacy incident | Central membership guard, repository scoping and cross-tenant integration tests |
| Scope expands into full clinic/fitness ERP | Delayed validation | Enforce non-goals and require a scope trade for every P0 addition |
| Self-hosted operations fail | Downtime or data loss | Health checks, off-host backups, restore rehearsals and documented rollback |

## 19. Open questions

### Blocking before external-channel implementation

- **Product:** Which channel is the default for Israeli pilot businesses: WhatsApp or SMS?
- **Product/Finance:** Are message charges bundled, passed through or billed as credits?
- **Engineering:** Which WhatsApp and SMS providers satisfy official API, delivery-status and Israeli-number requirements?
- **Legal/Product:** Exact wording and consent treatment for transactional versus promotional messages.

### Non-blocking during local implementation

- **Product:** Should provider names be visible to customers by default?
- **Product:** What cancellation cutoff is the pilot default? Proposed: one hour before start.
- **Product:** Should the manager receive every multi-provider notification or only exceptions? Current MVP assumption: every multi-provider booking, configurable later.
- **Product:** Can the same service be selected twice in one visit? Current assumption: yes, as two explicit steps.
- **Engineering:** Should the query layer use Kysely, Prisma with raw migrations, or direct `pg`? Decision should preserve PostgreSQL exclusion constraints.
- **Design:** How should a no-slot explanation balance usefulness with avoiding exposure of staff schedules?
- **Operations:** Required retention period for customer, appointment, audit and notification records.

## 20. Current-code transition notes

Reusable current assets include the React routes and pages, Hebrew RTL styling, API facade, service/staff/availability management concepts, appointment/appointment-item structure, status flows, error mapping, unit tests, browser tests and PostgreSQL exclusion-constraint approach.

Known gaps relative to this PRD:

- current database is single-business;
- current public business-specific routes redirect to the global booking route;
- current scheduler requires one employee to perform all selected services;
- current browser communicates directly with Supabase;
- NestJS backend does not exist;
- notification outbox, channel delivery, reminders, waitlist and backfill do not exist;
- existing browser tests stub the network rather than exercise PostgreSQL.

There is no production customer data, so the implementation may use a clean schema replacement and seed data instead of a compatibility migration.

## 21. PRD definition of done

This PRD is ready for implementation when:

- product accepts the P0/P1/P2 boundary;
- the fixed-order, sequential, fully assigned scheduling policy is accepted;
- the initial ICP is accepted for discovery and pilot recruitment;
- unresolved external-channel questions are acknowledged as non-blocking for local development;
- engineering accepts the scale and launch gates;
- development work is traceable to requirement identifiers in this document.
