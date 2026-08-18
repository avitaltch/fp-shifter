# ShiftSync NestJS API

This package is the self-hosted backend being developed from the MVP PRD. It is intentionally isolated from the existing React/Supabase prototype while endpoints are migrated incrementally.

## Local package commands

```bash
cp .env.example .env
npm install
npm run dev
```

From the repository root:

```bash
npm run api:lint
npm run api:typecheck
npm run api:test
npm run api:build
```

The database integration suite uses the real AppModule and requires a migrated, seeded PostgreSQL database:

```bash
DATABASE_URL=postgres://shiftsync:shiftsync_local@127.0.0.1:54320/shiftsync \
  MANAGEMENT_TOKEN_SECRET=replace-with-at-least-32-random-bytes \
  NODE_ENV=test \
  SWAGGER_ENABLED=false \
npm run api:test:integration
```

Run the deterministic large-studio and fully-booked ten-barber scheduler benchmark:

```bash
npm run api:benchmark:scheduler
```

Public compound availability is exposed without provider identities:

```http
POST /api/v1/public/businesses/:businessSlug/availability/search
Content-Type: application/json

{"date":"2030-01-07","serviceIds":["service-uuid-1","service-uuid-2"]}
```

Commit a selected plan as one PostgreSQL transaction:

```http
POST /api/v1/public/businesses/:businessSlug/bookings
Content-Type: application/json
Idempotency-Key: 01943f67-6ec3-4e0f-8a69-2df69f48f113

{"date":"2030-01-07","startsAt":"2030-01-07T12:00:00.000Z","serviceIds":["service-uuid-1","service-uuid-2"],"customer":{"firstName":"Ari","lastName":"Cohen","phoneE164":"+972501234567"}}
```

The command reloads server-owned services and scheduling state. Provider exclusion
conflicts return HTTP `409` with code `PLAN_NO_LONGER_AVAILABLE`; failed commands
leave no partial appointment or steps. Retry an uncertain request with the same
UUID v4 idempotency key and unchanged body to receive the original booking.
Reusing a key with different input returns `IDEMPOTENCY_KEY_REUSED`.

The booking response includes a capability token for customer
self-service. Send it as a bearer token; never put it in the API path or query
string:

```http
GET /api/v1/public/businesses/:businessSlug/appointments/manage
Authorization: Bearer sm_...

POST /api/v1/public/businesses/:businessSlug/appointments/manage/cancel
Authorization: Bearer sm_...
```

Only a SHA-256 hash is stored in PostgreSQL. Tokens are scoped to the business,
expire according to `MANAGEMENT_TOKEN_TTL_DAYS`, can be revoked, and return the
same generic not-found response when invalid to avoid leaking appointments.

## Local container stack

The replacement stack uses a separate Compose file so the existing self-hosted Supabase path remains available during development.

```bash
cp .env.mvp.example .env.mvp
# Replace MVP_POSTGRES_PASSWORD and generate a random MVP_MANAGEMENT_TOKEN_SECRET.
docker compose --env-file .env.mvp -f compose.mvp.yaml up -d --build
docker compose --env-file .env.mvp -f compose.mvp.yaml --profile tools run --rm --build seed
docker compose --env-file .env.mvp -f compose.mvp.yaml ps
```

Services:

- PostgreSQL: `127.0.0.1:54320`
- NestJS API: `http://127.0.0.1:3000`
- OpenAPI UI: `http://127.0.0.1:3000/api/docs`
- Liveness: `GET /api/v1/health/live`
- Readiness: `GET /api/v1/health/ready`

Published development ports bind to `127.0.0.1`. The default password in `compose.mvp.yaml` is only for an isolated local machine. Copy `.env.mvp.example`, replace the password, and keep PostgreSQL unexposed before using any shared environment.

Swagger is enabled by default in development and disabled by default in production. Set `SWAGGER_ENABLED` explicitly when an environment needs different behavior. `CORS_ORIGINS` accepts only comma-separated HTTP(S) origins without paths.

## Database lifecycle

Migrations run through `node-pg-migrate` before the API container starts. They are authoritative for the NestJS/PostgreSQL replacement schema.

```bash
DATABASE_URL=postgres://... npm run db:migrate
DATABASE_URL=postgres://... npm run db:migrate:down
DATABASE_URL=postgres://... npm run db:seed
```

The seed is idempotent and currently creates two tenant fixtures:

- `happy-pets-demo`
- `compound-beauty-demo`

Load the public business context and active service catalog in one request:

```http
GET /api/v1/public/businesses/happy-pets-demo/catalog
```

The response contains display-safe business and primary-location details plus
active service snapshots. Internal tenant and location identifiers are not
exposed.

## Current boundary

Implemented:

- strict runtime environment validation;
- versioned REST and OpenAPI foundation;
- liveness and database-backed readiness;
- JSON application logs and validated `x-request-id` propagation;
- injected PostgreSQL pool;
- idle PostgreSQL pool failure handling;
- businesses, locations, users and memberships migration;
- tenant-safe customers, services, provider skills, hours, availability, appointments, and ordered-step schema;
- composite tenant foreign keys and provider-time exclusion constraints;
- deterministic multi-business seed with a groomer-to-veterinarian handoff;
- tenant-scoped scheduling candidate repository;
- deterministic ordered multi-provider scheduler and public availability endpoint;
- atomic compound booking command with PostgreSQL concurrency protection;
- tenant-scoped booking idempotency with concurrent replay protection;
- expiring, revocable customer-management tokens with appointment cancellation;
- unit/controller/HTTP endpoint tests;
- real AppModule/PostgreSQL readiness and seed integration coverage;
- CI migration rollback and reapply validation.

Not implemented yet:

- authentication endpoints;
- tenant guards;
- configuration endpoints for services, provider skills and availability;
- notification worker and waitlist.
