import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { TenantScope } from '../tenancy/tenant-scope';
import type {
  AvailabilityQueryDto,
  CreateAvailabilityBatchDto,
  CreateLocationDto,
  CreateServiceDto,
  ReplaceBusinessHoursDto,
  ReplaceProviderSkillsDto,
  UpdateLocationDto,
  UpdateServiceDto,
} from './dto/configuration.dto';
import type {
  AvailabilityConfiguration,
  ActiveProviderConfiguration,
  BusinessHoursConfiguration,
  LocationConfiguration,
  ServiceConfiguration,
} from './configuration.types';
import { ConfigurationRepository } from './configuration.repository';
import { AvailabilityOverlapError } from './configuration.errors';

const DAY_MS = 86_400_000;
const MAX_AVAILABILITY_QUERY_DAYS = 93;
const MAX_AVAILABILITY_INTERVAL_DAYS = 31;

interface PostgresError {
  code?: string;
  constraint?: string;
}

@Injectable()
export class ConfigurationService {
  constructor(private readonly repository: ConfigurationRepository) {}

  listLocations(principal: AuthPrincipal): Promise<readonly LocationConfiguration[]> {
    return this.repository.listLocations(this.scope(principal));
  }

  async createLocation(
    principal: AuthPrincipal,
    request: CreateLocationDto,
  ): Promise<LocationConfiguration> {
    assertTimezone(request.timezone);
    try {
      return await this.repository.createLocation(this.scope(principal), principal.userId, {
        name: request.name,
        timezone: request.timezone,
        address: request.address ?? null,
        isPrimary: request.isPrimary ?? false,
      });
    } catch (error) {
      this.rethrowLocationConstraint(error);
    }
  }

  async updateLocation(
    principal: AuthPrincipal,
    locationId: string,
    request: UpdateLocationDto,
  ): Promise<LocationConfiguration> {
    assertNonEmptyUpdate(request);
    const scope = this.scope(principal);
    const current = await this.repository.findLocation(scope, locationId);
    if (!current) throw notFound('LOCATION_NOT_FOUND', 'Location was not found');
    if (request.isPrimary === false && current.isPrimary) {
      throw conflict(
        'PRIMARY_LOCATION_REQUIRED',
        'Promote another location before removing the primary designation',
      );
    }
    const timezone = request.timezone ?? current.timezone;
    assertTimezone(timezone);
    let updated: LocationConfiguration | null;
    try {
      updated = await this.repository.updateLocation(
        scope,
        principal.userId,
        locationId,
        {
          name: request.name ?? current.name,
          timezone,
          address: request.address === undefined ? current.address : request.address,
          isPrimary: request.isPrimary ?? current.isPrimary,
        },
      );
    } catch (error) {
      this.rethrowLocationConstraint(error);
    }
    if (!updated) throw notFound('LOCATION_NOT_FOUND', 'Location was not found');
    return updated;
  }

  async deleteLocation(
    principal: AuthPrincipal,
    locationId: string,
  ): Promise<void> {
    const scope = this.scope(principal);
    const current = await this.repository.findLocation(scope, locationId);
    if (!current) throw notFound('LOCATION_NOT_FOUND', 'Location was not found');
    if (current.isPrimary) {
      throw conflict(
        'PRIMARY_LOCATION_REQUIRED',
        'Promote another location before deleting the primary location',
      );
    }
    try {
      const deleted = await this.repository.deleteLocation(
        scope,
        principal.userId,
        locationId,
      );
      if (!deleted) throw notFound('LOCATION_NOT_FOUND', 'Location was not found');
    } catch (error) {
      if (isPostgresError(error, '23503')) {
        throw conflict('LOCATION_IN_USE', 'Location is referenced by scheduling data');
      }
      throw error;
    }
  }

  listServices(principal: AuthPrincipal): Promise<readonly ServiceConfiguration[]> {
    return this.repository.listServices(this.scope(principal));
  }

  async createService(
    principal: AuthPrincipal,
    request: CreateServiceDto,
  ): Promise<ServiceConfiguration> {
    try {
      return await this.repository.createService(
        this.scope(principal),
        principal.userId,
        {
          name: request.name,
          description: request.description ?? null,
          durationMinutes: request.durationMinutes,
          priceMinor: request.priceMinor,
          currency: request.currency ?? 'ILS',
        },
      );
    } catch (error) {
      this.rethrowServiceConstraint(error);
    }
  }

  async updateService(
    principal: AuthPrincipal,
    serviceId: string,
    request: UpdateServiceDto,
  ): Promise<ServiceConfiguration> {
    assertNonEmptyUpdate(request);
    const scope = this.scope(principal);
    const current = await this.repository.findService(scope, serviceId);
    if (!current) throw notFound('SERVICE_NOT_FOUND', 'Service was not found');
    try {
      const updated = await this.repository.updateService(
        scope,
        principal.userId,
        serviceId,
        {
          name: request.name ?? current.name,
          description:
            request.description === undefined ? current.description : request.description,
          durationMinutes: request.durationMinutes ?? current.durationMinutes,
          priceMinor: request.priceMinor ?? current.priceMinor,
          currency: request.currency ?? current.currency,
          active: request.active ?? current.active,
        },
      );
      if (!updated) throw notFound('SERVICE_NOT_FOUND', 'Service was not found');
      return updated;
    } catch (error) {
      this.rethrowServiceConstraint(error);
    }
  }

  async deactivateService(
    principal: AuthPrincipal,
    serviceId: string,
  ): Promise<ServiceConfiguration> {
    const service = await this.repository.deactivateService(
      this.scope(principal),
      principal.userId,
      serviceId,
    );
    if (!service) throw notFound('SERVICE_NOT_FOUND', 'Service was not found');
    return service;
  }

  async listProviders(principal: AuthPrincipal): Promise<readonly ActiveProviderConfiguration[]> {
    const providers = await this.repository.listProviders(this.scope(principal));
    return providers
      .filter(({ disabledAt }) => disabledAt === null)
      .map(({ disabledAt: _disabledAt, ...provider }) => provider);
  }

  async replaceProviderSkills(
    principal: AuthPrincipal,
    providerUserId: string,
    request: ReplaceProviderSkillsDto,
  ): Promise<ActiveProviderConfiguration> {
    const scope = this.scope(principal);
    if (!(await this.repository.providerExists(scope, providerUserId))) {
      throw notFound('PROVIDER_NOT_FOUND', 'Provider was not found');
    }
    if (!(await this.repository.activeServicesExist(scope, request.serviceIds))) {
      throw badRequest(
        'INVALID_SERVICE_SELECTION',
        'Every selected service must be active and belong to this business',
      );
    }
    await this.repository.replaceProviderSkills(
      scope,
      principal.userId,
      providerUserId,
      request.serviceIds,
    );
    const provider = (await this.repository.listProviders(scope)).find(
      ({ userId }) => userId === providerUserId,
    );
    if (!provider) throw notFound('PROVIDER_NOT_FOUND', 'Provider was not found');
    const { disabledAt: _disabledAt, ...activeProvider } = provider;
    return activeProvider;
  }

  async listBusinessHours(
    principal: AuthPrincipal,
    locationId: string,
  ): Promise<readonly BusinessHoursConfiguration[]> {
    const scope = this.scope(principal);
    await this.assertLocation(scope, locationId);
    return this.repository.listBusinessHours(scope, locationId);
  }

  async replaceBusinessHours(
    principal: AuthPrincipal,
    locationId: string,
    request: ReplaceBusinessHoursDto,
  ): Promise<readonly BusinessHoursConfiguration[]> {
    const scope = this.scope(principal);
    await this.assertLocation(scope, locationId);
    assertNonOverlappingHours(request.intervals);
    return this.repository.replaceBusinessHours(
      scope,
      principal.userId,
      locationId,
      request.intervals,
    );
  }

  async listAvailability(
    principal: AuthPrincipal,
    request: AvailabilityQueryDto,
  ): Promise<readonly AvailabilityConfiguration[]> {
    const providerUserId = this.providerFor(principal, request.providerUserId);
    const { startsAt, endsAt } = parseRange(
      request.from,
      request.to,
      MAX_AVAILABILITY_QUERY_DAYS,
      'AVAILABILITY_QUERY_RANGE_INVALID',
    );
    const scope = this.scope(principal);
    if (!(await this.repository.providerExists(scope, providerUserId))) {
      throw notFound('PROVIDER_NOT_FOUND', 'Provider was not found');
    }
    return this.repository.listAvailability(scope, providerUserId, startsAt, endsAt);
  }

  async createAvailability(
    principal: AuthPrincipal,
    request: CreateAvailabilityBatchDto,
  ): Promise<readonly AvailabilityConfiguration[]> {
    const providerUserId = this.providerFor(principal, request.providerUserId);
    const scope = this.scope(principal);
    if (!(await this.repository.providerExists(scope, providerUserId))) {
      throw notFound('PROVIDER_NOT_FOUND', 'Provider was not found');
    }
    if (
      !(await this.repository.locationsExist(
        scope,
        request.intervals.map(({ locationId }) => locationId),
      ))
    ) {
      throw notFound('LOCATION_NOT_FOUND', 'Location was not found');
    }
    const intervals = request.intervals.map((interval) => {
      const range = parseRange(
        interval.startsAt,
        interval.endsAt,
        MAX_AVAILABILITY_INTERVAL_DAYS,
        'AVAILABILITY_RANGE_INVALID',
      );
      if (range.endsAt.getTime() <= Date.now()) {
        throw badRequest(
          'AVAILABILITY_IN_PAST',
          'Availability must end in the future',
        );
      }
      return {
        locationId: interval.locationId,
        kind: interval.kind,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        notes: interval.notes ?? null,
      };
    });
    assertNoDuplicateAvailability(intervals);
    try {
      return await this.repository.createAvailability(
        scope,
        principal.userId,
        providerUserId,
        intervals,
      );
    } catch (error) {
      if (error instanceof AvailabilityOverlapError) {
        throw conflict('AVAILABILITY_OVERLAP', error.message);
      }
      throw error;
    }
  }

  async deleteAvailability(
    principal: AuthPrincipal,
    availabilityId: string,
  ): Promise<void> {
    const scope = this.scope(principal);
    const providerUserId = principal.role === 'Provider' ? principal.userId : undefined;
    const outcome = await this.repository.deleteAvailability(
      scope,
      principal.userId,
      availabilityId,
      providerUserId,
    );
    if (outcome === 'not_found') {
      throw notFound('AVAILABILITY_NOT_FOUND', 'Availability was not found');
    }
    if (outcome === 'has_appointments') {
      throw conflict(
        'AVAILABILITY_HAS_APPOINTMENTS',
        'Availability covering scheduled work cannot be deleted',
      );
    }
  }

  private scope(principal: AuthPrincipal): TenantScope {
    return TenantScope.forBusiness(principal.businessId);
  }

  private providerFor(principal: AuthPrincipal, requested?: string): string {
    if (principal.role === 'Provider') {
      if (requested && requested !== principal.userId) {
        throw new ForbiddenException({
          code: 'PROVIDER_SCOPE_FORBIDDEN',
          message: 'Providers may manage only their own availability',
        });
      }
      return principal.userId;
    }
    return requested ?? principal.userId;
  }

  private async assertLocation(scope: TenantScope, locationId: string): Promise<void> {
    if (!(await this.repository.locationExists(scope, locationId))) {
      throw notFound('LOCATION_NOT_FOUND', 'Location was not found');
    }
  }

  private rethrowServiceConstraint(error: unknown): never {
    if (isPostgresError(error, '23505')) {
      throw conflict('SERVICE_NAME_EXISTS', 'A service with this name already exists');
    }
    throw error;
  }

  private rethrowLocationConstraint(error: unknown): never {
    if (
      isPostgresError(error, '23505') &&
      error.constraint === 'locations_one_primary_per_business'
    ) {
      throw conflict(
        'PRIMARY_LOCATION_CONFLICT',
        'The primary location changed concurrently; retry the request',
      );
    }
    throw error;
  }
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date());
  } catch {
    throw badRequest('INVALID_TIMEZONE', 'Timezone must be a valid IANA timezone');
  }
}

function assertNonEmptyUpdate(request: object): void {
  if (Object.keys(request).length === 0) {
    throw badRequest('EMPTY_UPDATE', 'At least one editable field is required');
  }
}

function assertNonOverlappingHours(
  intervals: readonly { isoWeekday: number; startsAt: string; endsAt: string }[],
): void {
  const byDay = new Map<number, { startsAt: string; endsAt: string }[]>();
  for (const interval of intervals) {
    if (interval.startsAt >= interval.endsAt) {
      throw badRequest('BUSINESS_HOURS_INVALID', 'Opening time must precede closing time');
    }
    const day = byDay.get(interval.isoWeekday) ?? [];
    day.push(interval);
    byDay.set(interval.isoWeekday, day);
  }
  for (const day of byDay.values()) {
    day.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    for (let index = 1; index < day.length; index += 1) {
      if ((day[index]?.startsAt ?? '') < (day[index - 1]?.endsAt ?? '')) {
        throw badRequest(
          'BUSINESS_HOURS_OVERLAP',
          'Business-hour intervals may not overlap',
        );
      }
    }
  }
}

function parseRange(
  rawStart: string,
  rawEnd: string,
  maximumDays: number,
  code: string,
): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(rawStart);
  const endsAt = new Date(rawEnd);
  const duration = endsAt.getTime() - startsAt.getTime();
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    duration <= 0 ||
    duration > maximumDays * DAY_MS
  ) {
    throw badRequest(code, `Range must be positive and at most ${maximumDays} days`);
  }
  return { startsAt, endsAt };
}

function assertNoDuplicateAvailability(
  intervals: readonly {
    locationId: string;
    kind: string;
    startsAt: Date;
    endsAt: Date;
  }[],
): void {
  const ordered = [...intervals].sort(
    (left, right) =>
      left.locationId.localeCompare(right.locationId) ||
      left.kind.localeCompare(right.kind) ||
      left.startsAt.getTime() - right.startsAt.getTime(),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous &&
      current &&
      previous.locationId === current.locationId &&
      previous.kind === current.kind &&
      current.startsAt < previous.endsAt
    ) {
      throw badRequest(
        'AVAILABILITY_OVERLAP',
        'Availability intervals of the same kind may not overlap',
      );
    }
  }
}

function isPostgresError(error: unknown, code: string): error is PostgresError {
  return typeof error === 'object' && error !== null && (error as PostgresError).code === code;
}

function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}
