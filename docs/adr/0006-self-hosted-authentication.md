# ADR 0006: Self-hosted staff authentication and tenant sessions

**Status:** Accepted  
**Date:** 2026-08-18

## Context

The target MVP cannot depend on Supabase Auth. Staff access must be inexpensive,
tenant-safe, revocable, and practical for one PostgreSQL-backed NestJS
deployment. A signed role claim alone is insufficient because a membership may
be removed, downgraded, or disabled while an access token is still valid.

## Decision

- Store staff password verifiers as Argon2id hashes using 19 MiB memory, two
  iterations, and one lane. Public registration is disabled; an operator-only
  CLI provisions the first owner.
- Issue 15-minute HS256 access tokens with issuer, audience, user, session, and
  business claims. Production requires an authentication secret distinct from
  appointment/waitlist capability secrets.
- Store refresh sessions in PostgreSQL. Refresh tokens are 256-bit opaque
  capabilities, returned only as `HttpOnly; SameSite=Strict` cookies, and stored
  only as SHA-256 hashes.
- Rotate the refresh token on every use. Reuse of a rotated token revokes every
  active refresh session for that user and records an audit event.
- Resolve the session, enabled user, membership, current role, and business from
  PostgreSQL on every protected request. JWT role or tenant input never replaces
  that lookup.
- Protect routes by default through global access and role guards. Health,
  public scheduling, and authentication-entry endpoints must opt out explicitly
  with `@Public()`.
- Use the shared PostgreSQL rate-limit buckets for both IP and normalized-email
  login quotas; keyed hashes prevent raw identifiers from being retained in the
  limiter table.

## Consequences

- Revocation, role changes, and tenant removal take effect immediately at the
  cost of one indexed session/membership read per protected request. This is the
  appropriate tradeoff at the MVP scale and avoids Redis.
- Rotating a refresh session invalidates access tokens tied to the old session,
  so clients must replace the access token atomically after refresh.
- SameSite cookies assume the web application and API are deployed same-site.
  A later cross-site deployment would require an explicit CSRF design rather
  than weakening the cookie silently.
- Password reset and invitation delivery remain separate product work; they
  will use provider adapters and must not introduce public account creation.
