import { Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../database/tenant-database.service';
import type { TenantScope } from '../tenancy/tenant-scope';
import type {
  ActiveAppointmentStepRecord,
  BusinessHoursRecord,
  ProviderAvailabilityRecord,
  ProviderSkillRecord,
  ServiceRecord,
} from './scheduling.types';

@Injectable()
export class SchedulingRepository {
  constructor(private readonly database: TenantDatabaseService) {}

  listActiveServices(scope: TenantScope): Promise<readonly ServiceRecord[]> {
    return this.database.query<ServiceRecord>(
      scope,
      `select id,
              name::text as name,
              description,
              duration_minutes as "durationMinutes",
              price_minor as "priceMinor",
              currency
       from services
       where business_id = $1
         and active
       order by name, id`,
    );
  }

  listProviderSkills(
    scope: TenantScope,
    serviceIds: readonly string[],
  ): Promise<readonly ProviderSkillRecord[]> {
    if (serviceIds.length === 0) return Promise.resolve([]);
    return this.database.query<ProviderSkillRecord>(
      scope,
      `select ps.provider_user_id as "providerUserId",
              ps.service_id as "serviceId"
       from provider_skills ps
       join services s
         on s.business_id = ps.business_id
        and s.id = ps.service_id
       join business_memberships bm
         on bm.business_id = ps.business_id
        and bm.user_id = ps.provider_user_id
       join users u on u.id = bm.user_id
       where ps.business_id = $1
         and ps.service_id = any($2::uuid[])
         and s.active
         and bm.disabled_at is null
         and u.disabled_at is null
       order by ps.service_id, ps.provider_user_id`,
      [serviceIds],
    );
  }

  listBusinessHours(
    scope: TenantScope,
    locationId: string,
  ): Promise<readonly BusinessHoursRecord[]> {
    return this.database.query<BusinessHoursRecord>(
      scope,
      `select iso_weekday as "isoWeekday",
              starts_at::text as "startsAt",
              ends_at::text as "endsAt"
       from location_business_hours
       where business_id = $1
         and location_id = $2
       order by iso_weekday, starts_at`,
      [locationId],
    );
  }

  listAvailability(
    scope: TenantScope,
    locationId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<readonly ProviderAvailabilityRecord[]> {
    return this.database.query<ProviderAvailabilityRecord>(
      scope,
      `select provider_user_id as "providerUserId",
              kind,
              starts_at as "startsAt",
              ends_at as "endsAt"
       from provider_availability
       where business_id = $1
         and location_id = $2
         and tstzrange(starts_at, ends_at, '[)')
             && tstzrange($3::timestamptz, $4::timestamptz, '[)')
       order by provider_user_id, starts_at, kind`,
      [locationId, rangeStart, rangeEnd],
    );
  }

  listActiveAppointmentSteps(
    scope: TenantScope,
    locationId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<readonly ActiveAppointmentStepRecord[]> {
    return this.database.query<ActiveAppointmentStepRecord>(
      scope,
      `select appointment_id as "appointmentId",
              provider_user_id as "providerUserId",
              starts_at as "startsAt",
              ends_at as "endsAt"
       from appointment_steps
       where business_id = $1
         and location_id = $2
         and status in ('Scheduled', 'InProgress')
         and tstzrange(starts_at, ends_at, '[)')
             && tstzrange($3::timestamptz, $4::timestamptz, '[)')
       order by starts_at, provider_user_id, appointment_id`,
      [locationId, rangeStart, rangeEnd],
    );
  }
}
