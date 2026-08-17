# ADR 0005: Tenant-scoped data access

- Status: Accepted
- Date: 2026-08-16

## Context

The MVP serves many businesses from one PostgreSQL database. A forgotten `business_id` predicate could expose customers, staff schedules, services, or appointments across tenants. Browser-provided identifiers cannot establish authorization, and globally unique UUIDs alone do not prove that related records belong to the same business.

## Decision

Resolve tenancy server-side from an authenticated membership or, for public endpoints, from a validated public business slug. Convert that result into an immutable `TenantScope`; controllers and request DTOs do not construct scopes from arbitrary business IDs.

Tenant-owned data access follows one path:

1. Controllers call a domain service or repository, never the PostgreSQL pool.
2. Tenant repositories require `TenantScope` for every method.
3. `TenantDatabaseService` prepends the trusted business UUID as SQL parameter `$1` and rejects SQL that omits `$1`.
4. Repository SQL includes an explicit `business_id = $1` predicate and uses parameterized values for all other input.
5. Composite foreign keys include `business_id` for locations, customers, services, providers, appointments, and appointment steps, rejecting cross-tenant relationships even if application validation fails.

The MVP backend uses one database role and application-enforced tenant predicates. PostgreSQL row-level security may be added as defense in depth after authentication and worker access patterns are stable; it does not replace repository scoping or composite constraints.

Cross-tenant reads return an empty/not-found result unless the authenticated role explicitly supports platform-wide administration. They do not reveal that another tenant owns the requested identifier.

## Consequences

- Query review has one predictable tenant parameter and repository boundary.
- UUID possession is insufficient to access or relate another tenant's record.
- Background jobs must carry a trusted tenant identifier and use the same repositories.
- Direct pool access outside database infrastructure and explicitly reviewed transaction coordinators is prohibited.
- Platform-wide support/reporting queries require a separate audited interface rather than bypassing the tenant repository.

## Validation

- Unit tests reject repository SQL without the tenant parameter.
- Every scheduling repository method has positive and cross-tenant integration coverage.
- The second demo tenant's service, location, availability, and provider identifiers return no data through a Happy Pets scope.
- A provider-skill insert combining one tenant with another tenant's provider fails with foreign-key error `23503`.
- Future protected modules must add the same cross-tenant matrix before their endpoints are considered complete.
