import { Injectable } from '@nestjs/common';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../database/tenant-database.service';
import { currentRequestId } from '../observability/request-context';
import type { TenantScope } from '../tenancy/tenant-scope';
import { AvailabilityOverlapError } from './configuration.errors';
import type {
  AvailabilityConfiguration,
  AvailabilityInput,
  BusinessHoursConfiguration,
  ConfigurationAuditAction,
  LocationConfiguration,
  ProviderConfiguration,
  ServiceConfiguration,
} from './configuration.types';

interface BooleanResult {
  exists: boolean;
}

interface AppointmentConflictResult {
  hasConflict: boolean;
}

@Injectable()
export class ConfigurationRepository {
  constructor(private readonly database: TenantDatabaseService) {}

  listLocations(scope: TenantScope): Promise<readonly LocationConfiguration[]> {
    return this.database.query<LocationConfiguration>(
      scope,
      `select id,
              name,
              timezone,
              address,
              is_primary as "isPrimary"
       from locations
       where business_id = $1
       order by is_primary desc, name, id`,
    );
  }

  findLocation(
    scope: TenantScope,
    locationId: string,
  ): Promise<LocationConfiguration | null> {
    return this.database
      .query<LocationConfiguration>(
        scope,
        `select id,
                name,
                timezone,
                address,
                is_primary as "isPrimary"
         from locations
         where business_id = $1 and id = $2`,
        [locationId],
      )
      .then(([location]) => location ?? null);
  }

  createLocation(
    scope: TenantScope,
    actorUserId: string,
    input: Omit<LocationConfiguration, 'id' | 'isPrimary'> & {
      isPrimary: boolean;
    },
  ): Promise<LocationConfiguration> {
    return this.database.transaction(scope, async (transaction) => {
      await this.lockBusiness(transaction);
      if (input.isPrimary) await this.clearPrimaryLocation(transaction);
      const [location] = await transaction.query<LocationConfiguration>(
        `insert into locations
           (business_id, name, timezone, address, is_primary)
         values (
           $1, $2, $3, $4,
           case
             when $5::boolean then true
             else not exists (
               select 1 from locations where business_id = $1 and is_primary
             )
           end
         )
         returning id,
                   name,
                   timezone,
                   address,
                   is_primary as "isPrimary"`,
        [input.name, input.timezone, input.address, input.isPrimary],
      );
      if (!location) throw new Error('Location insert returned no row');
      await this.audit(transaction, actorUserId, 'location.created', 'location', location.id);
      return location;
    });
  }

  updateLocation(
    scope: TenantScope,
    actorUserId: string,
    locationId: string,
    input: Omit<LocationConfiguration, 'id'>,
  ): Promise<LocationConfiguration | null> {
    return this.database.transaction(scope, async (transaction) => {
      await this.lockBusiness(transaction);
      if (input.isPrimary) await this.clearPrimaryLocation(transaction, locationId);
      const [location] = await transaction.query<LocationConfiguration>(
        `update locations
         set name = $3,
             timezone = $4,
             address = $5,
             is_primary = $6
         where business_id = $1 and id = $2
         returning id,
                   name,
                   timezone,
                   address,
                   is_primary as "isPrimary"`,
        [locationId, input.name, input.timezone, input.address, input.isPrimary],
      );
      if (!location) return null;
      await this.audit(transaction, actorUserId, 'location.updated', 'location', location.id);
      return location;
    });
  }

  deleteLocation(
    scope: TenantScope,
    actorUserId: string,
    locationId: string,
  ): Promise<boolean> {
    return this.database.transaction(scope, async (transaction) => {
      await this.lockBusiness(transaction);
      const rows = await transaction.query<{ id: string }>(
        `delete from locations
         where business_id = $1 and id = $2 and not is_primary
         returning id`,
        [locationId],
      );
      if (!rows[0]) return false;
      await this.audit(transaction, actorUserId, 'location.deleted', 'location', locationId);
      return true;
    });
  }

  listServices(scope: TenantScope): Promise<readonly ServiceConfiguration[]> {
    return this.database.query<ServiceConfiguration>(
      scope,
      `select id,
              name::text as name,
              description,
              duration_minutes as "durationMinutes",
              price_minor as "priceMinor",
              currency,
              active
       from services
       where business_id = $1
       order by active desc, name, id`,
    );
  }

  findService(
    scope: TenantScope,
    serviceId: string,
  ): Promise<ServiceConfiguration | null> {
    return this.database
      .query<ServiceConfiguration>(
        scope,
        `select id,
                name::text as name,
                description,
                duration_minutes as "durationMinutes",
                price_minor as "priceMinor",
                currency,
                active
         from services
         where business_id = $1 and id = $2`,
        [serviceId],
      )
      .then(([service]) => service ?? null);
  }

  createService(
    scope: TenantScope,
    actorUserId: string,
    input: Omit<ServiceConfiguration, 'id' | 'active'>,
  ): Promise<ServiceConfiguration> {
    return this.database.transaction(scope, async (transaction) => {
      const [service] = await transaction.query<ServiceConfiguration>(
        `insert into services
           (business_id, name, description, duration_minutes, price_minor, currency)
         values ($1, $2, $3, $4, $5, $6)
         returning id,
                   name::text as name,
                   description,
                   duration_minutes as "durationMinutes",
                   price_minor as "priceMinor",
                   currency,
                   active`,
        [
          input.name,
          input.description,
          input.durationMinutes,
          input.priceMinor,
          input.currency,
        ],
      );
      if (!service) throw new Error('Service insert returned no row');
      await this.audit(transaction, actorUserId, 'service.created', 'service', service.id);
      return service;
    });
  }

  updateService(
    scope: TenantScope,
    actorUserId: string,
    serviceId: string,
    input: Omit<ServiceConfiguration, 'id'>,
  ): Promise<ServiceConfiguration | null> {
    return this.database.transaction(scope, async (transaction) => {
      const [service] = await transaction.query<ServiceConfiguration>(
        `update services
         set name = $3,
             description = $4,
             duration_minutes = $5,
             price_minor = $6,
             currency = $7,
             active = $8
         where business_id = $1 and id = $2
         returning id,
                   name::text as name,
                   description,
                   duration_minutes as "durationMinutes",
                   price_minor as "priceMinor",
                   currency,
                   active`,
        [
          serviceId,
          input.name,
          input.description,
          input.durationMinutes,
          input.priceMinor,
          input.currency,
          input.active,
        ],
      );
      if (!service) return null;
      await this.audit(transaction, actorUserId, 'service.updated', 'service', service.id);
      return service;
    });
  }

  deactivateService(
    scope: TenantScope,
    actorUserId: string,
    serviceId: string,
  ): Promise<ServiceConfiguration | null> {
    return this.database.transaction(scope, async (transaction) => {
      const [service] = await transaction.query<ServiceConfiguration>(
        `update services
         set active = false
         where business_id = $1 and id = $2
         returning id,
                   name::text as name,
                   description,
                   duration_minutes as "durationMinutes",
                   price_minor as "priceMinor",
                   currency,
                   active`,
        [serviceId],
      );
      if (!service) return null;
      await this.audit(
        transaction,
        actorUserId,
        'service.deactivated',
        'service',
        service.id,
      );
      return service;
    });
  }

  listProviders(scope: TenantScope): Promise<readonly ProviderConfiguration[]> {
    return this.database.query<ProviderConfiguration>(
      scope,
      `select u.id as "userId",
              u.first_name as "firstName",
              u.last_name as "lastName",
              u.email::text as email,
              m.role,
              u.disabled_at as "disabledAt",
              coalesce(
                array_agg(ps.service_id order by ps.service_id)
                  filter (where ps.service_id is not null),
                '{}'
              ) as "serviceIds"
       from business_memberships m
       join users u on u.id = m.user_id
       left join provider_skills ps
         on ps.business_id = m.business_id
        and ps.provider_user_id = m.user_id
       where m.business_id = $1
       group by u.id, m.role
       order by u.disabled_at nulls first, u.first_name, u.last_name, u.id`,
    );
  }

  async providerExists(
    scope: TenantScope,
    providerUserId: string,
  ): Promise<boolean> {
    const [row] = await this.database.query<BooleanResult>(
      scope,
      `select exists (
         select 1
         from business_memberships m
         join users u on u.id = m.user_id
         where m.business_id = $1
           and m.user_id = $2
           and u.disabled_at is null
       ) as exists`,
      [providerUserId],
    );
    return row?.exists ?? false;
  }

  async activeServicesExist(
    scope: TenantScope,
    serviceIds: readonly string[],
  ): Promise<boolean> {
    if (serviceIds.length === 0) return true;
    const [row] = await this.database.query<BooleanResult>(
      scope,
      `select count(*) = cardinality($2::uuid[]) as exists
       from services
       where business_id = $1
         and id = any($2::uuid[])
         and active`,
      [serviceIds],
    );
    return row?.exists ?? false;
  }

  replaceProviderSkills(
    scope: TenantScope,
    actorUserId: string,
    providerUserId: string,
    serviceIds: readonly string[],
  ): Promise<void> {
    return this.database.transaction(scope, async (transaction) => {
      await transaction.query(
        `select id
         from business_memberships
         where business_id = $1 and user_id = $2
         for update`,
        [providerUserId],
      );
      await transaction.query(
        `delete from provider_skills
         where business_id = $1 and provider_user_id = $2`,
        [providerUserId],
      );
      if (serviceIds.length > 0) {
        await transaction.query(
          `insert into provider_skills
             (business_id, provider_user_id, service_id)
           select $1, $2, service_id
           from unnest($3::uuid[]) as requested(service_id)`,
          [providerUserId, serviceIds],
        );
      }
      await this.audit(
        transaction,
        actorUserId,
        'provider.skills_replaced',
        'provider',
        providerUserId,
        { serviceCount: serviceIds.length },
      );
    });
  }

  async locationExists(scope: TenantScope, locationId: string): Promise<boolean> {
    const [row] = await this.database.query<BooleanResult>(
      scope,
      `select exists (
         select 1 from locations where business_id = $1 and id = $2
       ) as exists`,
      [locationId],
    );
    return row?.exists ?? false;
  }

  async locationsExist(
    scope: TenantScope,
    locationIds: readonly string[],
  ): Promise<boolean> {
    if (locationIds.length === 0) return true;
    const uniqueIds = [...new Set(locationIds)];
    const [row] = await this.database.query<BooleanResult>(
      scope,
      `select count(*) = cardinality($2::uuid[]) as exists
       from locations
       where business_id = $1 and id = any($2::uuid[])`,
      [uniqueIds],
    );
    return row?.exists ?? false;
  }

  listBusinessHours(
    scope: TenantScope,
    locationId: string,
  ): Promise<readonly BusinessHoursConfiguration[]> {
    return this.database.query<BusinessHoursConfiguration>(
      scope,
      `select id,
              iso_weekday as "isoWeekday",
              to_char(starts_at, 'HH24:MI') as "startsAt",
              to_char(ends_at, 'HH24:MI') as "endsAt"
       from location_business_hours
       where business_id = $1 and location_id = $2
       order by iso_weekday, starts_at, id`,
      [locationId],
    );
  }

  replaceBusinessHours(
    scope: TenantScope,
    actorUserId: string,
    locationId: string,
    intervals: readonly Omit<BusinessHoursConfiguration, 'id'>[],
  ): Promise<readonly BusinessHoursConfiguration[]> {
    return this.database.transaction(scope, async (transaction) => {
      await transaction.query(
        `select id
         from locations
         where business_id = $1 and id = $2
         for update`,
        [locationId],
      );
      await transaction.query(
        `delete from location_business_hours
         where business_id = $1 and location_id = $2`,
        [locationId],
      );
      let hours: readonly BusinessHoursConfiguration[] = [];
      if (intervals.length > 0) {
        hours = await transaction.query<BusinessHoursConfiguration>(
          `insert into location_business_hours
             (business_id, location_id, iso_weekday, starts_at, ends_at)
           select $1, $2, iso_weekday, starts_at::time, ends_at::time
           from unnest($3::smallint[], $4::text[], $5::text[])
             as requested(iso_weekday, starts_at, ends_at)
           returning id,
                     iso_weekday as "isoWeekday",
                     to_char(starts_at, 'HH24:MI') as "startsAt",
                     to_char(ends_at, 'HH24:MI') as "endsAt"`,
          [
            locationId,
            intervals.map(({ isoWeekday }) => isoWeekday),
            intervals.map(({ startsAt }) => startsAt),
            intervals.map(({ endsAt }) => endsAt),
          ],
        );
      }
      await this.audit(
        transaction,
        actorUserId,
        'location.hours_replaced',
        'location',
        locationId,
        { intervalCount: intervals.length },
      );
      return [...hours].sort(
        (left, right) =>
          left.isoWeekday - right.isoWeekday ||
          left.startsAt.localeCompare(right.startsAt),
      );
    });
  }

  listAvailability(
    scope: TenantScope,
    providerUserId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<readonly AvailabilityConfiguration[]> {
    return this.database.query<AvailabilityConfiguration>(
      scope,
      `select id,
              location_id as "locationId",
              provider_user_id as "providerUserId",
              kind,
              starts_at as "startsAt",
              ends_at as "endsAt",
              notes
       from provider_availability
       where business_id = $1
         and provider_user_id = $2
         and tstzrange(starts_at, ends_at, '[)')
             && tstzrange($3::timestamptz, $4::timestamptz, '[)')
       order by starts_at, ends_at, id`,
      [providerUserId, rangeStart, rangeEnd],
    );
  }

  createAvailability(
    scope: TenantScope,
    actorUserId: string,
    providerUserId: string,
    intervals: readonly AvailabilityInput[],
  ): Promise<readonly AvailabilityConfiguration[]> {
    return this.database.transaction(scope, async (transaction) => {
      await transaction.query(
        `select id
         from business_memberships
         where business_id = $1 and user_id = $2
         for update`,
        [providerUserId],
      );
      const [overlap] = await transaction.query<BooleanResult>(
        `with requested as (
           select *
           from unnest(
             $3::uuid[],
             $4::text[],
             $5::timestamptz[],
             $6::timestamptz[]
           ) as input(location_id, kind, starts_at, ends_at)
         )
         select exists (
           select 1
           from provider_availability a
           join requested r
             on r.location_id = a.location_id
            and r.kind::availability_kind = a.kind
            and tstzrange(r.starts_at, r.ends_at, '[)')
                && tstzrange(a.starts_at, a.ends_at, '[)')
           where a.business_id = $1
             and a.provider_user_id = $2
         ) as exists`,
        [
          providerUserId,
          intervals.map(({ locationId }) => locationId),
          intervals.map(({ kind }) => kind),
          intervals.map(({ startsAt }) => startsAt),
          intervals.map(({ endsAt }) => endsAt),
        ],
      );
      if (overlap?.exists) {
        throw new AvailabilityOverlapError(
          'Availability overlaps an existing interval of the same kind',
        );
      }
      const created = await transaction.query<AvailabilityConfiguration>(
        `insert into provider_availability
           (business_id, location_id, provider_user_id, kind, starts_at, ends_at, notes)
         select $1,
                location_id,
                $2,
                kind::availability_kind,
                starts_at,
                ends_at,
                notes
         from unnest(
           $3::uuid[],
           $4::text[],
           $5::timestamptz[],
           $6::timestamptz[],
           $7::text[]
         ) as requested(location_id, kind, starts_at, ends_at, notes)
         returning id,
                   location_id as "locationId",
                   provider_user_id as "providerUserId",
                   kind,
                   starts_at as "startsAt",
                   ends_at as "endsAt",
                   notes`,
        [
          providerUserId,
          intervals.map(({ locationId }) => locationId),
          intervals.map(({ kind }) => kind),
          intervals.map(({ startsAt }) => startsAt),
          intervals.map(({ endsAt }) => endsAt),
          intervals.map(({ notes }) => notes),
        ],
      );
      await this.audit(
        transaction,
        actorUserId,
        'provider.availability_created',
        'provider',
        providerUserId,
        { intervalCount: intervals.length },
      );
      return [...created].sort(
        (left, right) =>
          left.startsAt.getTime() - right.startsAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    });
  }

  async availabilityHasAppointments(
    scope: TenantScope,
    availabilityId: string,
    providerUserId?: string,
  ): Promise<boolean | null> {
    const [row] = await this.database.query<
      AppointmentConflictResult & { kind: string }
    >(
      scope,
      `select a.kind::text as kind,
              case
                when a.kind = 'Unavailable' then false
                else exists (
                  select 1
                  from appointment_steps s
                  where s.business_id = a.business_id
                    and s.provider_user_id = a.provider_user_id
                    and s.status in ('Scheduled', 'InProgress')
                    and tstzrange(s.starts_at, s.ends_at, '[)')
                        && tstzrange(a.starts_at, a.ends_at, '[)')
                )
              end as "hasConflict"
       from provider_availability a
       where a.business_id = $1
         and a.id = $2
         and ($3::uuid is null or a.provider_user_id = $3)`,
      [availabilityId, providerUserId ?? null],
    );
    return row ? row.hasConflict : null;
  }

  deleteAvailability(
    scope: TenantScope,
    actorUserId: string,
    availabilityId: string,
    providerUserId?: string,
  ): Promise<boolean> {
    return this.database.transaction(scope, async (transaction) => {
      const [deleted] = await transaction.query<{ id: string; providerUserId: string }>(
        `delete from provider_availability
         where business_id = $1
           and id = $2
           and ($3::uuid is null or provider_user_id = $3)
         returning id, provider_user_id as "providerUserId"`,
        [availabilityId, providerUserId ?? null],
      );
      if (!deleted) return false;
      await this.audit(
        transaction,
        actorUserId,
        'provider.availability_deleted',
        'provider_availability',
        availabilityId,
        { providerUserId: deleted.providerUserId },
      );
      return true;
    });
  }

  private clearPrimaryLocation(
    transaction: TenantTransaction,
    exceptLocationId?: string,
  ): Promise<readonly never[]> {
    return transaction.query(
      `update locations
       set is_primary = false
       where business_id = $1
         and ($2::uuid is null or id <> $2)`,
      [exceptLocationId ?? null],
    );
  }

  private lockBusiness(transaction: TenantTransaction): Promise<readonly never[]> {
    return transaction.query(
      `select id from businesses where id = $1 for update`,
    );
  }

  private audit(
    transaction: TenantTransaction,
    actorUserId: string,
    action: ConfigurationAuditAction,
    resourceType: string,
    resourceId: string | null,
    details: Readonly<Record<string, unknown>> = {},
  ): Promise<readonly never[]> {
    return transaction.query(
      `insert into operator_audit_events
         (business_id, actor_user_id, action, resource_type, resource_id, details, request_id)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        actorUserId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(details),
        currentRequestId() ?? null,
      ],
    );
  }
}
