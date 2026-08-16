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

## Local container stack

The replacement stack uses a separate Compose file so the existing self-hosted Supabase path remains available during development.

```bash
docker compose -f compose.mvp.yaml up -d --build
docker compose -f compose.mvp.yaml --profile tools run --rm seed
docker compose -f compose.mvp.yaml ps
```

Services:

- PostgreSQL: `127.0.0.1:54320`
- NestJS API: `http://127.0.0.1:3000`
- OpenAPI UI: `http://127.0.0.1:3000/api/docs`
- Liveness: `GET /api/v1/health/live`
- Readiness: `GET /api/v1/health/ready`

The default password in `compose.mvp.yaml` is only for an isolated local machine. Copy `.env.mvp.example` and replace it before using any shared environment.

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

## Current boundary

Implemented:

- strict runtime environment validation;
- versioned REST and OpenAPI foundation;
- liveness and database-backed readiness;
- injected PostgreSQL pool;
- businesses, locations, users and memberships migration;
- deterministic multi-business seed;
- unit/controller/HTTP endpoint tests.

Not implemented yet:

- authentication endpoints;
- tenant guards;
- services, provider skills and availability;
- compound scheduling and booking;
- notification worker and waitlist.
