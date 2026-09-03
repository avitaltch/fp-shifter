# Security review

**Review date:** 2026-08-18  
**Target:** `codex/mvp-foundation-v2`  
**Bar:** OWASP ASVS Level 2–inspired review for the pre-production, self-hosted MVP

## Current result

No critical findings were identified. The two high-risk findings from the baseline review are remediated or reduced below high severity by the current checkpoint. One medium deployment hardening item remains in the production-readiness backlog.

| ID | Severity | Finding | Status |
|---|---|---|---|
| SEC-01 | High | Anonymous booking could consume availability and notification budget without quotas. | Mitigated: durable per-business/IP and per-business/contact quotas now return HTTP 429. Bucket identities are HMAC-hashed. Contact verification or bot challenge remains a pilot hardening option once a delivery/provider decision exists. |
| SEC-02 | High | An anonymous request using an existing phone number could overwrite the stored customer name/email and redirect communication. | Fixed: anonymous booking never updates an existing profile and notification routing uses the stored customer identity. |
| SEC-03 | Medium | A long-lived appointment-management capability is stored in browser `sessionStorage`, increasing XSS impact. | Fixed: public confirmations persist only non-capability details; waitlist and management fragments are validated, captured only in memory, and removed from the address bar before API use. |
| SEC-04 | Medium | Compose processes currently share the PostgreSQL bootstrap owner. | Open: define migration and least-privilege runtime roles before deployment; deployment target is intentionally undecided. |
| SEC-05 | Medium | The frontend Nginx configuration does not send a Content Security Policy. | Fixed in configuration: Nginx now denies framing/plugins, restricts scripts to same-origin, and limits other resource types; the production smoke test must verify the emitted header on the eventual deployment target. |
| SEC-06 | Medium | Development/build dependencies had high-severity advisories while production dependency audits were clean. | Fixed: compatible transitive dependencies were refreshed; complete frontend and API audits now report zero vulnerabilities. |

## Positive controls observed

- No production credentials are committed.
- SQL values are parameterized.
- Tenant-owned scheduling and management queries apply business predicates and composite tenant foreign keys.
- Request logging excludes query strings and authorization headers.
- Appointment-management tokens are stored as hashes, expire, and can be revoked.
- Waitlist offer capabilities are purpose-separated, hashed, single-effect, and expire after five minutes by default.
- Browser capability handoff is fragment-only, validated by purpose, removed from the address bar, sent to the API only in authorization headers after explicit customer confirmation, and excluded from persistent browser storage.
- Staff passwords use Argon2id; refresh sessions rotate as hashed opaque capabilities, replay revokes active sessions, and protected requests re-resolve the current tenant membership and role from PostgreSQL.
- Authentication entry points use durable IP/email quotas with generic invalid-credential responses and keyed audit identities.
- Operator configuration never accepts a tenant identifier: the active membership supplies the immutable scope, cross-tenant UUIDs resolve as not found, providers can mutate only their own availability, and every successful configuration mutation is audited.
- Configuration payload counts and time ranges are bounded; parent-row locks serialize replace operations and prevent concurrent updates from interleaving partial state.
- PostgreSQL exclusion constraints remain the final double-booking authority.

## Verification required at every checkpoint

- Add negative tests for every new public, authenticated, and tenant-owned path.
- Review new persistence for tenant scoping, atomicity, sensitive-data handling, and bounded resource use.
- Run production dependency audits, unit/integration tests, migration rollback/reapply, and a focused DRY pass.
- Do not mark the production-readiness security gate complete while SEC-04 remains open and the configured CSP has not been smoke-tested on the eventual deployment target.
