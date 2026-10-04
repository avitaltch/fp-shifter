# ShiftSync Goal Continuation Plan

**Prepared:** 2026-10-04

**Repository:** `avitaltch/fp-shifter`

**Working branch:** `codex/mvp-foundation-v2`

**Authoritative baseline commit:** `897b9fe` (`feat(booking): refine compound visit flows`)

**Goal state:** Paused by the product owner after the baseline was committed and pushed

**Merge policy:** Do not merge until the product owner explicitly requests it

## 1. Purpose

This is the restart document for the active product goal:

> Complete the self-hosted MVP and its production-readiness work, applying a DRY cleanup and cybersecurity review at every checkpoint, committing and pushing periodically, without merging.

Use this file when work resumes. It records what is actually implemented at the baseline commit, what remains, the order in which to do it, the acceptance evidence required, and which decisions are intentionally blocked on external provider or deployment choices.

This document is more current than the status and “Immediate next action” sections in [`DEVELOPMENT_PLAN_V2.md`](DEVELOPMENT_PLAN_V2.md). The PRD remains the product source of truth; this file is the execution source of truth from commit `897b9fe` forward.

## 2. Product-owner decisions already made

Do not reopen these decisions unless the product owner changes them:

1. Breaking pre-production schema changes are allowed. There are no production customers or accounts to migrate.
2. Email, SMS, and WhatsApp must remain adapter boundaries for now. Do not implement or purchase a real provider yet.
3. The deployment target is undecided. Keep deployment work provider-neutral and do not introduce a cloud-specific dependency.
4. Commit and push periodically. Keep changes reviewable and do not merge.
5. The cheapest viable architecture is preferred over distributed infrastructure.
6. Preserve user-owned working-tree files. At the baseline, `GO_LIVE_CHECKLIST.md` and `atrium.md` are untracked and must not be edited, staged, or deleted unless explicitly requested.

## 3. Capacity and behavior that the MVP must support

### 3.1 Required product behavior

- A customer may select an ordered sequence of one to six services.
- A service may appear more than once as an explicit step.
- The scheduler must return a time only if every step can be assigned sequentially to a qualified, available provider.
- Different steps may use different providers; PostgreSQL remains the final collision authority.
- Booking is atomic: appointment, steps, management capability, audit/notification intent, and idempotency result either commit together or not at all.
- Customers can securely view and cancel without an account.
- Cancellation can create a sequential, five-minute waitlist offer and backfill the complete service sequence.
- Reminders follow the agreed policy:
  - seven-day reminder only when the booking was made at least 30 days before the appointment;
  - 24-hour reminder when enough lead time remains;
  - one-hour reminder when enough lead time remains.
- A multi-provider appointment creates a manager handoff notification.
- Core flows must work locally with fake notification delivery and no external SaaS dependency.

### 3.2 Required scale envelope

- At least 100 isolated businesses.
- First hard acceptance workload: 10 barbers, each taking one customer every 20 minutes.
- A 12-hour, fully utilized 10-barber day is 360 appointments/day before cancellations or backfill.
- The notification model must comfortably support at least 12,000 due messages/day for a large business and retain headroom for retries and backfill offers.
- Scheduler search target: p95 below 500 ms for the agreed representative dataset.
- Booking write target: p95 below 300 ms locally, excluding external provider latency.
- Concurrent booking attempts must produce no partial booking and no overlapping provider steps.

These figures are acceptance workloads, not a reason to add Redis, Kafka, RabbitMQ, Kubernetes, or microservices. Measure the PostgreSQL modular monolith first.

## 4. Current architecture at the baseline

```text
React 19 / Vite SPA
        |
        | JSON REST under /api/v1
        v
NestJS modular monolith ------------------+
  | auth / tenancy / configuration        |
  | scheduling / operations / staffing    |
  | notification outbox                   |
  +----------------------------------------+
        |                                  |
        v                                  v
PostgreSQL 17                       Worker process
  - tenant-owned records              - SKIP LOCKED claims
  - exclusion constraints             - retry/backoff
  - idempotency                       - fake provider token
  - notification jobs                 - waitlist matching
```

Runtime roles are separated:

- the bootstrap owner runs migrations, seed, and role configuration;
- `shiftsync_runtime` is used by API and worker;
- the runtime role has DML/sequence access but no schema-creation privilege.

The notification worker depends on the `NOTIFICATION_PROVIDER` injection token and the common `NotificationProvider` contract. `FakeNotificationProvider` is the only active implementation by design.

## 5. Completed work through `897b9fe`

### 5.1 Foundation and database

- NestJS API and worker packages with strict configuration validation.
- PostgreSQL migrations, seed, readiness, rollback/reapply coverage, and local Compose stack.
- Tenant-safe businesses, locations, memberships, customers, services, skills, hours, availability, appointments, ordered steps, waitlist, notification, audit, authentication, and rate-limit persistence.
- Composite tenant foreign keys and explicit `business_id` predicates.
- GiST/exclusion enforcement for overlapping provider work.
- Least-privilege runtime database role, applied idempotently by Compose.
- Deterministic multi-tenant demo data including the groomer-to-veterinarian handoff.

### 5.2 Scheduling and public booking

- Pure deterministic ordered multi-provider scheduler.
- Public business catalog and compound-availability search by business slug.
- Atomic booking with server-owned pricing, transactional revalidation, UUID idempotency, and concurrency protection.
- Customer management capabilities stored only as hashes and sent only in authorization headers.
- Public booking quotas by tenant/IP and tenant/contact using keyed identities.
- Anonymous booking cannot overwrite an existing customer profile.
- Booking UI uses only NestJS contracts; no Supabase runtime remains under `src`.
- Customers can visibly order services, move steps, remove steps, and explicitly duplicate a service, capped at six steps in the UI and API.

### 5.3 Staff authentication and configuration

- Argon2id passwords, short-lived access tokens, rotating opaque refresh sessions, replay revocation, and strict HttpOnly refresh cookies.
- Default-deny authentication/role guards.
- Owner, manager, and provider roles resolved from active membership on every protected request.
- Durable login quotas and authentication events.
- First-owner provisioning CLI and staff lifecycle with temporary-password enforcement.
- Tenant configuration APIs/UI for locations, services, provider skills, business hours, and provider availability.
- Provider availability is self-scoped; owner/manager management paths are tenant-scoped and audited.

### 5.4 Daily operations

- Manager calendar with ordered service/provider handoffs and cancellation.
- Provider personal schedule and scheduled → in-progress → completed status transitions.
- Atomic future-step reassignment with deterministic eligibility reasons.
- Staff create/deactivate/reactivate flows with future-assignment protection.
- Manager dashboard links directly to the tenant booking journey for entering a booking.
- Provider schedule includes the adjacent service/provider handoff context for compound visits.

### 5.5 Notifications and waitlist

- PostgreSQL outbox created in the same transaction as relevant booking/cancellation state.
- Reminder policy with boundary tests.
- Fake Email/SMS/WhatsApp delivery through one replaceable provider interface.
- `FOR UPDATE SKIP LOCKED` claim, lease recovery, exponential retry, terminal failure, and fallback-channel behavior.
- Sequential waitlist matching, provider holds, expiring single-use offers, rejection, expiry advancement, and recovered-revenue record.
- Capability fragments are validated, removed from the address bar, held only in memory, and excluded from persistent browser storage.

### 5.6 Browser and CI migration

- Legacy Supabase Playwright mocks were removed.
- Contract-level Playwright journeys cover public booking, waitlist, manager operations, provider operations, and mobile entry.
- An opt-in real-stack journey logs in, provisions groomer/veterinarian availability, and books the two-provider compound visit against real NestJS/PostgreSQL.
- CI provisions PostgreSQL, migrates, seeds, provisions an owner, runs integration tests, validates rollback/reapply, starts the built API, and runs the real-stack browser journey.

### 5.7 Last verified local evidence

At the closing checkpoint:

- frontend lint passed;
- 255 frontend unit tests passed;
- frontend production build passed;
- API typecheck/build passed;
- 153 API tests passed;
- 27 PostgreSQL integration tests passed;
- 7 contract-level Playwright journeys passed and the opt-in real-stack case remained intentionally skipped in the ordinary local run;
- the real-stack Playwright case passed separately in the previous checkpoint;
- complete and production-only npm audits for frontend/API reported zero vulnerabilities in the previous runtime-hardening checkpoint;
- PostgreSQL confirmed `shiftsync_runtime` could read application data and rejected schema creation with `42501`.

## 6. Known documentation drift

Fix this early when work resumes so contributors do not follow obsolete paths:

| File | Stale statement | Correct baseline state |
|---|---|---|
| `README.md` | Supabase is described as the current product runtime. | React now uses NestJS APIs; Supabase is legacy material only. |
| `docs/SELF_HOSTING.md` | The main guide is a legacy Supabase migration guide. | The supported core is React + NestJS + PostgreSQL + worker. |
| `apps/api/README.md` | Manager/provider endpoints are listed as unimplemented. | They are implemented and used by React. |
| `docs/DEVELOPMENT_PLAN_V2.md` | R3 real-stack journey and R5 operations are listed as incomplete. | Both are implemented at the baseline. |
| `docs/DEVELOPMENT_PLAN_V2.md` | The immediate action says to start R5/Supabase migration. | That work is complete. Use this continuation plan. |
| `docs/SECURITY_REVIEW.md` | SEC-04 says all Compose processes share the bootstrap owner. | API/worker now use the restricted `shiftsync_runtime` role. |

Do not delete the legacy Supabase directory merely to make searches clean. First decide whether it is retained as migration history or removed in a dedicated, reviewable cleanup commit.

## 7. Remaining-work register

### 7.1 Work that can proceed locally without external decisions

| ID | Priority | Work | Why it remains | Done when |
|---|---:|---|---|---|
| REM-01 | P0 | Manager-created booking command with authenticated actor attribution | The dashboard currently opens the public booking journey; it does not distinguish an operator-created booking in audit history or bypass public abuse quotas. | Owner/manager can create through a tenant-derived operator endpoint; booking logic is shared, atomic, audited, and collision-safe. |
| REM-02 | P0 | Manager diagnostics/attention explanation | Reassignment options explain one step, but there is no consolidated explanation for a no-slot request or `RequiresAttention` appointment. | Protected API/UI shows safe, actionable reasons without exposing staff schedules publicly. |
| REM-03 | P0 | Availability impact preview | Destructive availability changes are safely rejected when they cover scheduled work, but managers cannot preview affected steps before deciding. | Manager can preview impacted appointments and no confirmed visit becomes silently invalid. |
| REM-04 | P0 | Local staff invite/reset delivery | Staff creation returns a temporary password, but the fake/local notification workflow does not yet deliver invite/reset intent. | Invite/reset uses a purpose-specific, expiring mechanism and fake Email delivery; secrets are not logged or persisted in plaintext. |
| REM-05 | P0 | Notification-policy configuration API/UI | Policy tables exist and worker behavior consumes them, but business operators cannot configure primary/fallback channels through the application. | Owner/manager can configure allowed channels; tenant, validation, audit, and fallback tests pass. |
| REM-06 | P0 | Operator notification visibility | Failed jobs and queue age exist in PostgreSQL but are not available through an authenticated operational view. | Owner/manager or platform operator can inspect bounded tenant-safe backlog/failure summaries without seeing secrets. |
| REM-07 | P0 | Worker health/readiness | API health exists; the worker has no externally testable heartbeat/readiness signal. | Durable heartbeat/lag signal is exposed safely and stale worker state makes readiness/operations status actionable. |
| REM-08 | P0 | Customer data export and erasure procedure | PRD P0-14 requires an operator procedure; none is implemented/documented. | A tenant-scoped operator command exports a complete customer record and performs audited erasure/pseudonymization under a documented retention rule. |
| REM-09 | P0 | Retention/privacy operations document | Transactional/marketing separation exists as a principle, not an operator policy. | Retention periods, legal hold, export, erasure, backups, audit retention, and transactional contact handling are documented and reviewed before paid launch. |
| REM-10 | P0 | Backup and restore tooling/rehearsal | PostgreSQL is persistent but restore has not been demonstrated. | Encrypted/off-host-compatible backup procedure exists; restore into a disposable database is exercised and integrity checks pass. |
| REM-11 | P0 | Capacity/load proof | Pure scheduler benchmark exists; full database/API/worker workload evidence is incomplete. | Ten-barber, 100-business, concurrent-booking, and 12k-notification/day scenarios meet documented thresholds with results committed. |
| REM-12 | P0 | Final documentation alignment | Main docs still describe obsolete runtime/status. | README, self-hosting guide, API README, V2 status, security review, and runbook agree with the implementation. |
| REM-13 | P0 | Final DRY/security audit and merge-readiness report | Each checkpoint was reviewed, but the completed branch needs one final whole-repository pass. | No unresolved critical/high finding; medium risks are fixed or explicitly accepted; duplicates/dead paths are removed; final evidence is recorded. |

### 7.2 Intentionally deferred pending product-owner decisions

These are not implementation blockers for the local MVP and must not be guessed:

| ID | Decision needed | Work held behind it |
|---|---|---|
| EXT-01 | Default Israeli delivery channel: WhatsApp, SMS, or email-first | Real provider selection and default notification policy. |
| EXT-02 | Message pricing: bundled, pass-through, or prepaid credits | Usage enforcement, billing model, and plan limits. |
| EXT-03 | Delivery vendors and onboarding approval | Real Email/SMS/WhatsApp adapters, templates, receipts, sender registration. |
| EXT-04 | Deployment target and topology | TLS/reverse proxy implementation, secret store, monitoring vendor, production CSP/CORS smoke tests. |
| EXT-05 | Legal wording and exact retention periods | Final privacy notice, consent language, retention schedule, deletion exceptions. |

Maintain adapter interfaces, configuration seams, and provider-neutral runbooks while these are open. Do not create fake production integrations.

## 8. Execution sequence

Each checkpoint ends with a DRY pass, cybersecurity review, tests, a focused commit, and a push. Never combine unrelated checkpoints merely to reduce commit count.

### Checkpoint C0 — Resume safely and re-establish the baseline

**Objective:** ensure continuation starts from the documented state without overwriting user work.

1. Fetch the remote and inspect, but do not automatically merge or reset.
2. Confirm the branch is `codex/mvp-foundation-v2` and `897b9fe` is in its history.
3. Run `git status --short` and preserve all unrelated/untracked files.
4. Read this file, the PRD P0 checklist, and the current security review.
5. Copy `.env.mvp.example` to ignored `.env.mvp` only if the local file does not already exist.
6. Start only the services needed for the next test.
7. Run the baseline verification commands in section 10 before changing behavior.

**Exit gate:** failures are classified as environment failures or code regressions; no user-owned file is modified.

### Checkpoint C1 — Align source-of-truth documentation

**Objective:** eliminate instructions that point contributors back to Supabase or completed work.

Implementation:

- Rewrite the README around the actual React/NestJS/PostgreSQL architecture and compound-booking value proposition.
- Replace the legacy main self-hosting flow with the provider-neutral MVP Compose flow.
- Move any still-useful Supabase history into a clearly labeled legacy appendix.
- Update `apps/api/README.md` implemented/not-implemented lists.
- Update R3/R5/security statuses in older docs and link back to this plan.
- Document that real delivery and deployment remain decision-gated.

DRY review:

- Keep one canonical quick start in the README.
- Link to the operations runbook for detailed procedures rather than duplicating them.
- Keep API contract examples in the API README/OpenAPI, not in every document.

Security review:

- Never include actual `.env.mvp` values.
- Label all example passwords/secrets as local/test-only.
- Ensure no guide tells users to expose PostgreSQL publicly.

Suggested commit: `docs(project): align self-hosted architecture guidance`

### Checkpoint C2 — Authenticated manager booking and diagnostics

**Objective:** close the remaining daily manager workflow gaps without cloning public booking logic.

Design:

1. Extract a shared booking application command from the public service/repository path.
2. Keep HTTP concerns separate:
   - public controller applies public quotas and anonymous identity rules;
   - operator controller derives tenant and actor from `AuthPrincipal`;
   - both call the same atomic command.
3. Add an owner/manager operator endpoint for creating appointments.
4. Record the authenticated actor and request ID in the audit event.
5. Reuse catalog/availability UI components or a shared hook; do not create a second scheduler UI implementation.
6. Add manager-only diagnostics for:
   - service has no qualified provider;
   - provider has no covering availability;
   - provider is explicitly unavailable;
   - provider is occupied;
   - business/location is closed;
   - request exceeds bounds or contains inactive services.
7. Keep public diagnostics generic enough not to reveal staff-private schedules.

Required tests:

- owner/manager allowed; provider/public denied;
- tenant is derived from membership, not request body;
- cross-tenant IDs return not found/forbidden consistently;
- public and operator paths produce the same valid plan/price snapshots;
- operator creation is idempotent and cannot double-book;
- audit actor/resource/request ID is correct;
- diagnostic output is bounded and redacted publicly.

Suggested commit: `feat(operations): add audited manager booking flow`

### Checkpoint C3 — Availability impact preview and local staff lifecycle delivery

**Objective:** make staff changes operationally understandable and complete the local invite/reset loop.

Availability work:

- Add a read-only impact query for a proposed delete/unavailable interval.
- Return affected future appointments/steps only within the active tenant.
- Preserve the current safe default: a change that would invalidate scheduled work is rejected until explicit reassignment/cancellation resolves it.
- Link impacted steps to existing reassignment options.
- Audit the final accepted mutation, not the preview.

Staff lifecycle work:

- Define purpose-specific, expiring invite/reset capabilities.
- Store only hashes; never log plaintext capabilities or temporary passwords.
- Enqueue fake Email delivery through the existing notification boundary.
- Revoke prior active capability when a newer one is issued.
- Force password change and revoke existing sessions after successful reset.
- Keep public signup disabled.

Required tests:

- preview is tenant-scoped and provider role is denied;
- no mutation occurs during preview;
- invite/reset replay and expiry fail generically;
- notification retry does not issue a new logical invite;
- sensitive values are absent from logs, database payloads, and API list responses.

Suggested commit: `feat(staff): complete safe availability and invite workflows`

### Checkpoint C4 — Notification policy and operational visibility

**Objective:** let a business configure channels and let operators see whether the worker is healthy.

Implementation:

- Add owner/manager read/update endpoints for the existing business notification policy.
- Validate primary/fallback channels and prevent identical fallback configuration.
- Add a small configuration UI using the existing API/action hooks.
- Add a durable worker heartbeat containing worker identity, observed time, and last successful loop/result summary.
- Add a bounded tenant-safe operational endpoint/UI for:
  - due pending count;
  - oldest due job age;
  - processing count and oldest lease;
  - retry count;
  - terminal failure count;
  - recent redacted failures by kind/channel;
  - waitlist match backlog;
  - worker heartbeat age.
- Do not return recipients, message bodies, tokens, provider secrets, or raw provider responses in summaries.
- Define readiness/degraded thresholds in configuration with conservative defaults.

DRY review:

- Put queue aggregation SQL in one repository.
- Share channel enum/types with renderer/worker policy code.
- Do not build a second logging or metrics framework.

Security review:

- Restrict business detail to Owner/Manager.
- If platform-wide metrics are later needed, create a distinct platform-operator authorization model; do not overload tenant owners.
- Bound date ranges, row counts, and failure text.

Suggested commit: `feat(operations): expose notification health and policy`

### Checkpoint C5 — Privacy export, erasure, and retention

**Objective:** satisfy PRD P0-14 with the cheapest auditable operator workflow.

Recommended MVP shape:

- Implement an operator CLI first; do not add a public customer-account surface.
- Identify the tenant by exact business slug and customer by exact normalized phone or UUID.
- Require an explicit operation mode: `export` or `erase`.
- Require an explicit confirmation value for erasure.
- Export structured JSON containing customer profile, appointments/steps, waitlist entries/offers, notification metadata, and relevant audit/recovered-value records.
- Exclude password hashes, session tokens, capability hashes, rate-limit identity hashes, internal secrets, and unrelated customers.
- For erasure, preserve legally/operationally required appointment/audit facts while pseudonymizing direct contact fields and cancelling active waitlist/notification work.
- Record an immutable operator audit event with reason and record counts, not the exported personal data.
- Document what cannot be removed from retained backups immediately and when backup expiry completes erasure.

Required tests:

- cross-tenant lookup cannot export/erase;
- export is complete but secret-safe;
- erasure is idempotent;
- active offers/jobs are invalidated atomically;
- historical financial/scheduling integrity remains valid;
- erased contact cannot be used to claim old capabilities.

Suggested commit: `feat(privacy): add audited customer data operations`

### Checkpoint C6 — Backup, restore, and provider-neutral runbook

**Objective:** demonstrate recoverability before any pilot data exists.

Implementation:

- Add scripts or documented commands for PostgreSQL custom-format backups.
- Make the destination explicit; never infer a broad path or overwrite silently.
- Record database version, application commit, migration state, timestamp, and checksum beside the backup.
- Document encryption and off-host copy requirements without choosing a cloud vendor.
- Add a restore rehearsal that creates a uniquely named disposable database, restores, runs integrity queries, starts an API against it, checks readiness/catalog, and then removes only that verified disposable database.
- Require an explicit confirmation guard for any restore into a non-disposable target.
- Add recovery-point and recovery-time objectives for the pilot.
- Add rollback steps for application deployment and migration failure.

Restore integrity checks should include:

- migrations table and expected latest migration;
- business/customer/appointment/step counts;
- no orphan tenant-owned rows;
- no active provider overlap;
- notification idempotency uniqueness;
- management/waitlist capability hashes retained without plaintext;
- API readiness and one tenant catalog read.

Suggested commit: `ops(database): add tested backup and restore workflow`

### Checkpoint C7 — Capacity and reliability proof

**Objective:** turn the capacity assumptions into repeatable evidence.

Workloads:

1. **Scheduler benchmark:** retain the deterministic 5-provider studio and 10-barber cases; report p50/p95/p99 and worst case.
2. **Ten-barber API test:** 10 providers, 20-minute services, 12-hour availability, realistic existing reservations, concurrent availability searches and booking attempts.
3. **Hundred-business isolation test:** create representative tenant metadata and prove query latency does not degrade unexpectedly or leak data.
4. **Notification throughput test:** enqueue/process at least 12,000 fake deliveries with confirmations/reminders/backfill mix; include retry samples; report jobs/sec and oldest-job age.
5. **Concurrency test:** race conflicting bookings repeatedly and prove one success/no partial rows/no overlap.
6. **Worker recovery test:** terminate after claim, expire lease, restart, and prove no intentional duplicate logical delivery.
7. **Soak test:** run a bounded local workload long enough to catch pool, lease, memory, or timestamp drift issues.

Evidence to commit:

- exact hardware/runtime context;
- fixture sizes and commands;
- p50/p95/p99 latency;
- throughput and error counts;
- database CPU/memory/connection observations where available;
- pass/fail against the targets in section 3.2;
- identified bottlenecks and the cheapest remediation.

Do not add a cache or queue service unless measurements show PostgreSQL cannot meet the stated envelope after query/index/batch tuning.

Suggested commit: `test(capacity): prove MVP workload envelope`

### Checkpoint C8 — Final DRY and cybersecurity audit

**Objective:** close the branch with an evidence-backed review, not an assumption.

DRY review checklist:

- search for duplicate DTO validation, date/phone normalization, tenant scoping, API fetch wrappers, action/loading state, error mapping, booking command logic, notification policy selection, and audit writes;
- remove dead Supabase runtime code and obsolete routes only in a dedicated cleanup with coverage;
- consolidate only duplication that represents the same invariant; do not create generic abstractions for unrelated code;
- confirm each abstraction has direct tests and fewer call-site rules than before.

Cybersecurity checklist:

- authentication/session rotation/revocation and forced-password-change paths;
- authorization matrix and tenant scope for every new protected endpoint;
- anonymous quota/bot-cost exposure;
- SQL parameterization and bounded queries;
- concurrency/transaction/isolation behavior;
- capability purpose, entropy, expiry, revocation, hashing, URL/storage handling;
- PII minimization, export, erasure, logs, notification payloads, and backups;
- CSP, framing, referrer, permissions, CORS, cookies, TLS assumptions;
- least-privilege runtime database permissions;
- dependency and container-image advisories;
- secrets in repository, history-facing diffs, frontend bundles, CI logs, and examples;
- abuse of notification retries/fallbacks and cost amplification;
- backup confidentiality and destructive restore guards.

Required outputs:

- update `docs/SECURITY_REVIEW.md` with resolved/current findings and evidence;
- list any accepted medium/low risks, owner, reason, and re-review trigger;
- no unresolved critical/high finding;
- smoke-test Nginx CSP in the container;
- rerun complete and production-only npm audits for both packages;
- run secret scanning available in the environment or a documented equivalent search;
- document deployment-dependent checks that cannot close before EXT-04.

Suggested commit: `security(review): close local MVP findings`

### Checkpoint C9 — Final documentation and handoff

**Objective:** leave the branch ready for a product-owner deployment/provider decision or pull-request review.

- Update every status table to match the code.
- Add the operations runbook, incident checks, backup/restore results, capacity report, and privacy procedure.
- Record the final commit, commands, test counts, and known accepted risks.
- Confirm CI on a pull request or manual equivalent if no PR exists.
- Confirm the remote branch contains every intended commit.
- Confirm only user-owned untracked files remain locally.
- Do not merge.

Suggested commit: `docs(release): finalize MVP operating handoff`

## 9. Commit and push policy

For every checkpoint:

1. Inspect `git status --short` before editing.
2. Preserve unrelated/user-owned changes.
3. Stage explicit paths, not `git add .`.
4. Run `git diff --cached --check` and inspect the staged stat/diff.
5. Use one focused conventional commit.
6. Push `codex/mvp-foundation-v2` after the checkpoint is green.
7. Do not amend published commits unless explicitly requested.
8. Do not merge or open a ready-for-merge PR without explicit authorization.

If a checkpoint becomes too broad, split it by invariant—not by arbitrary file count. Good splits are API/domain, UI journey, operations tooling, and documentation/evidence.

## 10. Verification commands

Run the smallest relevant set during development and the full set before each pushed checkpoint.

### 10.1 Static and unit gates

```bash
npm run lint
npm test
npm run build
npm run api:lint
npm run api:typecheck
npm run api:test
npm run api:build
```

### 10.2 Local PostgreSQL gates

```bash
docker compose -f compose.mvp.yaml --env-file .env.mvp up -d postgres db_roles migrate

set -a
source .env.mvp
set +a
MVP_TEST_DATABASE_URL="postgres://shiftsync:${MVP_POSTGRES_PASSWORD:-shiftsync_local}@127.0.0.1:${MVP_POSTGRES_PORT:-54320}/shiftsync"
DATABASE_URL="$MVP_TEST_DATABASE_URL" \
MANAGEMENT_TOKEN_SECRET="$MVP_MANAGEMENT_TOKEN_SECRET" \
AUTH_TOKEN_SECRET="$MVP_AUTH_TOKEN_SECRET" \
npm run api:test:integration
```

Never print `.env.mvp` or its expanded secrets in logs/reports.

### 10.3 Browser gates

```bash
npm run e2e
```

The real-stack case is opt-in and requires a running built API plus an owner provisioned with test-only credentials. Prefer the CI workflow as the canonical real-stack execution rather than copying credentials into shell history.

### 10.4 Migration and generated SQL gates

```bash
npm --prefix apps/api run db:migrate
npm --prefix apps/api run db:migrate:down
npm --prefix apps/api run db:migrate
npm run sql:check
```

Run rollback only against the disposable/local test database, never an unverified shared target.

### 10.5 Dependency gates

```bash
npm audit
npm audit --omit=dev
npm audit --prefix apps/api
npm audit --prefix apps/api --omit=dev
```

### 10.6 Capacity gate

```bash
npm run api:benchmark:scheduler
```

Add stable scripts for the database/API/notification workloads in C7 rather than relying on one-off commands.

## 11. Definition of done for every future change

- The behavior is expressed by tests.
- Tenant-owned reads/writes have positive and cross-tenant negative coverage.
- Public inputs have count/size/time bounds.
- Mutations are atomic and idempotent where retries are plausible.
- Errors are stable and do not reveal internal or cross-tenant state.
- Sensitive values do not enter logs, URLs, persistent browser storage, audit details, or API list responses.
- Migrations apply from empty/current schema and have a tested rollback strategy.
- DRY review was performed after functional correctness, not before.
- Cybersecurity review explicitly covers the new boundary.
- Documentation changes with behavior.
- Lint, tests, builds, integration, browser, and applicable audits pass.
- Only intended paths are staged.
- The checkpoint is committed and pushed; no merge occurs.

## 12. Stop/escalation conditions

Stop and ask the product owner instead of guessing when:

- work requires choosing a real email/SMS/WhatsApp vendor;
- work would incur external messaging spend;
- deployment-specific infrastructure or a cloud account is required;
- legal retention/consent wording must be finalized;
- a destructive operation targets anything other than an explicit disposable test database;
- existing user changes overlap the files needed and cannot be preserved safely;
- a schema/data action could affect non-mock data;
- a critical/high security finding requires a materially different product decision.

Environment failures, slow tests, and implementation difficulty are not reasons to expand architecture. Diagnose and exhaust the current modular-monolith design first.

## 13. Recommended first session on resume

The highest-value restart sequence is:

1. Complete C0 baseline verification.
2. Complete C1 documentation alignment so all contributors see the real architecture.
3. Implement C2 authenticated manager booking by extracting one shared atomic command.
4. Commit and push.
5. Re-audit the remaining register before beginning C3.

Do not begin with external adapters or deployment. The local product/operations gaps provide more value and can be completed without vendor commitments.
