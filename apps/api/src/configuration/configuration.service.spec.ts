import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import { ConfigurationRepository } from './configuration.repository';
import { ConfigurationService } from './configuration.service';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000201';
const PROVIDER_ID = '00000000-0000-4000-8000-000000000202';
const LOCATION_ID = '00000000-0000-4000-8000-000000000101';
const SERVICE_ID = '00000000-0000-4000-8000-000000000401';
const AVAILABILITY_ID = '00000000-0000-4000-8000-000000000801';
const DAY_MS = 86_400_000;

const owner: AuthPrincipal = {
  sessionId: '00000000-0000-4000-8000-000000009001',
  userId: USER_ID,
  email: 'owner@example.test',
  firstName: 'Owner',
  lastName: 'User',
  phoneE164: null,
  businessId: BUSINESS_ID,
  businessSlug: 'happy-pets-demo',
  membershipId: '00000000-0000-4000-8000-000000000301',
  role: 'Owner',
  mustChangePassword: false,
};

const provider: AuthPrincipal = {
  ...owner,
  userId: PROVIDER_ID,
  role: 'Provider',
};

const location = {
  id: LOCATION_ID,
  name: 'Main',
  timezone: 'Asia/Jerusalem',
  address: null,
  isPrimary: true,
};

const service = {
  id: SERVICE_ID,
  name: 'Trim',
  description: null,
  durationMinutes: 30,
  priceMinor: 5_000,
  currency: 'ILS',
  active: true,
};

const providerRecord = {
  userId: PROVIDER_ID,
  firstName: 'Noa',
  lastName: 'Vet',
  email: 'noa@example.test',
  role: 'Provider' as const,
  disabledAt: null,
  serviceIds: [SERVICE_ID],
};

function repositoryMock() {
  return {
    listLocations: vi.fn().mockResolvedValue([location]),
    findLocation: vi.fn().mockResolvedValue(location),
    createLocation: vi.fn().mockResolvedValue(location),
    updateLocation: vi.fn().mockResolvedValue(location),
    deleteLocation: vi.fn().mockResolvedValue(true),
    listServices: vi.fn().mockResolvedValue([service]),
    findService: vi.fn().mockResolvedValue(service),
    createService: vi.fn().mockResolvedValue(service),
    updateService: vi.fn().mockResolvedValue(service),
    deactivateService: vi.fn().mockResolvedValue({ ...service, active: false }),
    listProviders: vi.fn().mockResolvedValue([providerRecord]),
    providerExists: vi.fn().mockResolvedValue(true),
    activeServicesExist: vi.fn().mockResolvedValue(true),
    replaceProviderSkills: vi.fn().mockResolvedValue(undefined),
    locationExists: vi.fn().mockResolvedValue(true),
    locationsExist: vi.fn().mockResolvedValue(true),
    listBusinessHours: vi.fn().mockResolvedValue([]),
    replaceBusinessHours: vi.fn().mockResolvedValue([]),
    listAvailability: vi.fn().mockResolvedValue([]),
    createAvailability: vi.fn().mockResolvedValue([]),
    deleteAvailability: vi.fn().mockResolvedValue('deleted'),
  };
}

describe('ConfigurationService', () => {
  let configuration: ConfigurationService;
  let repository: ReturnType<typeof repositoryMock>;

  beforeEach(async () => {
    repository = repositoryMock();
    const module = await Test.createTestingModule({
      providers: [
        ConfigurationService,
        { provide: ConfigurationRepository, useValue: repository },
      ],
    }).compile();
    configuration = module.get(ConfigurationService);
  });

  it('lists tenant locations and creates a normalized location', async () => {
    await expect(configuration.listLocations(owner)).resolves.toEqual([location]);
    await expect(
      configuration.createLocation(owner, {
        name: 'North',
        timezone: 'Asia/Jerusalem',
        address: undefined,
      }),
    ).resolves.toEqual(location);
    expect(repository.createLocation).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      USER_ID,
      {
        name: 'North',
        timezone: 'Asia/Jerusalem',
        address: null,
        isPrimary: false,
      },
    );
  });

  it('rejects invalid timezones and removal of the primary designation', async () => {
    await expect(
      configuration.createLocation(owner, {
        name: 'Bad',
        timezone: 'Not/A_Timezone',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      configuration.updateLocation(owner, LOCATION_ID, { isPrimary: false }),
    ).rejects.toMatchObject({ response: { code: 'PRIMARY_LOCATION_REQUIRED' } });
  });

  it('updates non-primary locations and rejects empty or cross-tenant-looking IDs', async () => {
    repository.findLocation.mockResolvedValue({ ...location, isPrimary: false });
    await expect(
      configuration.updateLocation(owner, LOCATION_ID, { name: 'Updated' }),
    ).resolves.toEqual(location);
    expect(repository.updateLocation).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      USER_ID,
      LOCATION_ID,
      expect.objectContaining({ name: 'Updated' }),
    );

    await expect(configuration.updateLocation(owner, LOCATION_ID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    repository.findLocation.mockResolvedValue(null);
    await expect(
      configuration.updateLocation(owner, LOCATION_ID, { name: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only unused non-primary locations', async () => {
    repository.findLocation.mockResolvedValue({ ...location, isPrimary: false });
    await expect(configuration.deleteLocation(owner, LOCATION_ID)).resolves.toBeUndefined();

    repository.findLocation.mockResolvedValue(location);
    await expect(configuration.deleteLocation(owner, LOCATION_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );

    repository.findLocation.mockResolvedValue({ ...location, isPrimary: false });
    repository.deleteLocation.mockRejectedValue({ code: '23503' });
    await expect(configuration.deleteLocation(owner, LOCATION_ID)).rejects.toMatchObject({
      response: { code: 'LOCATION_IN_USE' },
    });
  });

  it('lists, creates, updates, and deactivates services without deleting history', async () => {
    await expect(configuration.listServices(owner)).resolves.toEqual([service]);
    await configuration.createService(owner, {
      name: 'Trim',
      durationMinutes: 30,
      priceMinor: 5_000,
    });
    expect(repository.createService).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      USER_ID,
      expect.objectContaining({ currency: 'ILS', description: null }),
    );

    await configuration.updateService(owner, SERVICE_ID, { priceMinor: 5_500 });
    expect(repository.updateService).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      SERVICE_ID,
      { ...service, id: undefined, priceMinor: 5_500 },
    );
    await expect(configuration.deactivateService(owner, SERVICE_ID)).resolves.toMatchObject({
      active: false,
    });
  });

  it('maps duplicate service names and absent services to stable errors', async () => {
    repository.createService.mockRejectedValue({ code: '23505' });
    await expect(
      configuration.createService(owner, {
        name: 'Trim',
        durationMinutes: 30,
        priceMinor: 1,
      }),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_NAME_EXISTS' } });

    repository.findService.mockResolvedValue(null);
    await expect(
      configuration.updateService(owner, SERVICE_ID, { active: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    repository.deactivateService.mockResolvedValue(null);
    await expect(configuration.deactivateService(owner, SERVICE_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists only enabled providers without leaking disabled timestamps', async () => {
    repository.listProviders.mockResolvedValue([
      providerRecord,
      { ...providerRecord, userId: USER_ID, disabledAt: new Date() },
    ]);
    const result = await configuration.listProviders(owner);
    expect(result).toEqual([
      {
        userId: PROVIDER_ID,
        firstName: 'Noa',
        lastName: 'Vet',
        email: 'noa@example.test',
        role: 'Provider',
        serviceIds: [SERVICE_ID],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('disabledAt');
  });

  it('atomically replaces skills only for tenant-owned providers and services', async () => {
    await expect(
      configuration.replaceProviderSkills(owner, PROVIDER_ID, {
        serviceIds: [SERVICE_ID],
      }),
    ).resolves.toMatchObject({ userId: PROVIDER_ID, serviceIds: [SERVICE_ID] });
    expect(repository.replaceProviderSkills).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      USER_ID,
      PROVIDER_ID,
      [SERVICE_ID],
    );

    repository.providerExists.mockResolvedValue(false);
    await expect(
      configuration.replaceProviderSkills(owner, PROVIDER_ID, { serviceIds: [] }),
    ).rejects.toMatchObject({ response: { code: 'PROVIDER_NOT_FOUND' } });
    repository.providerExists.mockResolvedValue(true);
    repository.activeServicesExist.mockResolvedValue(false);
    await expect(
      configuration.replaceProviderSkills(owner, PROVIDER_ID, {
        serviceIds: [SERVICE_ID],
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_SERVICE_SELECTION' } });
  });

  it('lists and atomically replaces valid non-overlapping business hours', async () => {
    await expect(configuration.listBusinessHours(owner, LOCATION_ID)).resolves.toEqual([]);
    const intervals = [
      { isoWeekday: 1, startsAt: '08:00', endsAt: '12:00' },
      { isoWeekday: 1, startsAt: '13:00', endsAt: '18:00' },
    ];
    await expect(
      configuration.replaceBusinessHours(owner, LOCATION_ID, { intervals }),
    ).resolves.toEqual([]);
    expect(repository.replaceBusinessHours).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      USER_ID,
      LOCATION_ID,
      intervals,
    );
  });

  it('rejects missing locations and overlapping or backwards business hours', async () => {
    repository.locationExists.mockResolvedValue(false);
    await expect(configuration.listBusinessHours(owner, LOCATION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    repository.locationExists.mockResolvedValue(true);
    await expect(
      configuration.replaceBusinessHours(owner, LOCATION_ID, {
        intervals: [
          { isoWeekday: 1, startsAt: '08:00', endsAt: '12:00' },
          { isoWeekday: 1, startsAt: '11:00', endsAt: '13:00' },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'BUSINESS_HOURS_OVERLAP' } });
    await expect(
      configuration.replaceBusinessHours(owner, LOCATION_ID, {
        intervals: [{ isoWeekday: 1, startsAt: '12:00', endsAt: '08:00' }],
      }),
    ).rejects.toMatchObject({ response: { code: 'BUSINESS_HOURS_INVALID' } });
  });

  it('limits providers to their own availability while operators may select staff', async () => {
    await configuration.listAvailability(provider, {
      from: '2030-01-01T00:00:00.000Z',
      to: '2030-02-01T00:00:00.000Z',
    });
    expect(repository.listAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      PROVIDER_ID,
      expect.any(Date),
      expect.any(Date),
    );
    await expect(
      configuration.listAvailability(provider, {
        from: '2030-01-01T00:00:00.000Z',
        to: '2030-02-01T00:00:00.000Z',
        providerUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unbounded queries and tenant-unknown providers', async () => {
    await expect(
      configuration.listAvailability(owner, {
        from: '2030-01-01T00:00:00.000Z',
        to: '2031-01-01T00:00:00.000Z',
        providerUserId: PROVIDER_ID,
      }),
    ).rejects.toMatchObject({ response: { code: 'AVAILABILITY_QUERY_RANGE_INVALID' } });
    repository.providerExists.mockResolvedValue(false);
    await expect(
      configuration.listAvailability(owner, {
        from: '2030-01-01T00:00:00.000Z',
        to: '2030-01-02T00:00:00.000Z',
        providerUserId: PROVIDER_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates bounded future availability for validated tenant locations', async () => {
    const startsAt = new Date(Date.now() + DAY_MS).toISOString();
    const endsAt = new Date(Date.now() + DAY_MS + 3_600_000).toISOString();
    await expect(
      configuration.createAvailability(provider, {
        intervals: [
          { locationId: LOCATION_ID, kind: 'Available', startsAt, endsAt },
        ],
      }),
    ).resolves.toEqual([]);
    expect(repository.createAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      PROVIDER_ID,
      PROVIDER_ID,
      [
        expect.objectContaining({
          locationId: LOCATION_ID,
          kind: 'Available',
          notes: null,
        }),
      ],
    );
  });

  it('rejects unknown locations, past intervals, and duplicate availability', async () => {
    const future = Date.now() + DAY_MS;
    repository.locationsExist.mockResolvedValue(false);
    await expect(
      configuration.createAvailability(provider, {
        intervals: [
          {
            locationId: LOCATION_ID,
            kind: 'Available',
            startsAt: new Date(future).toISOString(),
            endsAt: new Date(future + 3_600_000).toISOString(),
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_NOT_FOUND' } });

    repository.locationsExist.mockResolvedValue(true);
    await expect(
      configuration.createAvailability(provider, {
        intervals: [
          {
            locationId: LOCATION_ID,
            kind: 'Available',
            startsAt: '2020-01-01T00:00:00.000Z',
            endsAt: '2020-01-01T01:00:00.000Z',
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'AVAILABILITY_IN_PAST' } });

    await expect(
      configuration.createAvailability(provider, {
        intervals: [
          {
            locationId: LOCATION_ID,
            kind: 'Available',
            startsAt: new Date(future).toISOString(),
            endsAt: new Date(future + 7_200_000).toISOString(),
          },
          {
            locationId: LOCATION_ID,
            kind: 'Available',
            startsAt: new Date(future + 3_600_000).toISOString(),
            endsAt: new Date(future + 10_800_000).toISOString(),
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'AVAILABILITY_OVERLAP' } });
  });

  it('deletes only scoped availability that does not cover scheduled work', async () => {
    await expect(
      configuration.deleteAvailability(provider, AVAILABILITY_ID),
    ).resolves.toBeUndefined();
    expect(repository.deleteAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      PROVIDER_ID,
      AVAILABILITY_ID,
      PROVIDER_ID,
    );

    repository.deleteAvailability.mockResolvedValue('has_appointments');
    await expect(
      configuration.deleteAvailability(provider, AVAILABILITY_ID),
    ).rejects.toMatchObject({ response: { code: 'AVAILABILITY_HAS_APPOINTMENTS' } });
    repository.deleteAvailability.mockResolvedValue('not_found');
    await expect(
      configuration.deleteAvailability(provider, AVAILABILITY_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
