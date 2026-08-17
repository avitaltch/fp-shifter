import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicAvailabilityService } from './public-availability.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

const TRIM = '00000000-0000-4000-8000-000000000401';
const VACCINE = '00000000-0000-4000-8000-000000000402';
const GROOMER = '00000000-0000-4000-8000-000000000201';
const VET = '00000000-0000-4000-8000-000000000202';

describe('PublicAvailabilityService', () => {
  let service: PublicAvailabilityService;
  let directory: { findBusinessBySlug: ReturnType<typeof vi.fn> };
  let scheduling: {
    listActiveServices: ReturnType<typeof vi.fn>;
    listBusinessHours: ReturnType<typeof vi.fn>;
    listProviderSkills: ReturnType<typeof vi.fn>;
    listAvailability: ReturnType<typeof vi.fn>;
    listActiveAppointmentSteps: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    directory = {
      findBusinessBySlug: vi.fn().mockResolvedValue({
        businessId: '00000000-0000-4000-8000-000000000001',
        businessSlug: 'happy-pets-demo',
        locationId: '00000000-0000-4000-8000-000000000101',
        timezone: 'Asia/Jerusalem',
      }),
    };
    scheduling = {
      listActiveServices: vi.fn().mockResolvedValue([
        {
          id: TRIM,
          name: 'Pet Trim',
          durationMinutes: 45,
          priceMinor: 12000,
          currency: 'ILS',
        },
        {
          id: VACCINE,
          name: 'Vaccination',
          durationMinutes: 15,
          priceMinor: 8000,
          currency: 'ILS',
        },
      ]),
      listBusinessHours: vi.fn().mockResolvedValue([
        { isoWeekday: 1, startsAt: '09:00:00', endsAt: '12:00:00' },
      ]),
      listProviderSkills: vi.fn().mockResolvedValue([
        { providerUserId: GROOMER, serviceId: TRIM },
        { providerUserId: VET, serviceId: VACCINE },
      ]),
      listAvailability: vi.fn().mockResolvedValue([
        {
          providerUserId: GROOMER,
          kind: 'Available',
          startsAt: new Date('2030-01-07T07:00:00.000Z'),
          endsAt: new Date('2030-01-07T10:00:00.000Z'),
        },
        {
          providerUserId: VET,
          kind: 'Available',
          startsAt: new Date('2030-01-07T07:00:00.000Z'),
          endsAt: new Date('2030-01-07T10:00:00.000Z'),
        },
      ]),
      listActiveAppointmentSteps: vi.fn().mockResolvedValue([]),
    };
    const module = await Test.createTestingModule({
      providers: [
        PublicAvailabilityService,
        { provide: PublicSchedulingRepository, useValue: directory },
        { provide: SchedulingRepository, useValue: scheduling },
      ],
    }).compile();
    service = module.get(PublicAvailabilityService);
  });

  it('returns customer-safe slots and server-owned totals', async () => {
    const result = await service.search('happy-pets-demo', {
      date: '2030-01-07',
      serviceIds: [TRIM, VACCINE],
    });

    expect(result).toMatchObject({
      businessSlug: 'happy-pets-demo',
      date: '2030-01-07',
      serviceCount: 2,
      totalDurationMinutes: 60,
      totalPriceMinor: 20000,
      currency: 'ILS',
      diagnostics: [],
    });
    expect(result.slots[0]).toEqual({
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T08:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('providerUserId');
    expect(scheduling.listProviderSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: '00000000-0000-4000-8000-000000000001',
      }),
      [TRIM, VACCINE],
    );
  });

  it('rejects unknown businesses before tenant data access', async () => {
    directory.findBusinessBySlug.mockResolvedValue(null);

    await expect(
      service.search('missing-business', {
        date: '2030-01-07',
        serviceIds: [TRIM],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(scheduling.listActiveServices).not.toHaveBeenCalled();
  });

  it('rejects inactive, unknown, or cross-tenant service identifiers', async () => {
    await expect(
      service.search('happy-pets-demo', {
        date: '2030-01-07',
        serviceIds: ['00000000-0000-4000-8000-000000000499'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(scheduling.listProviderSkills).not.toHaveBeenCalled();
  });

  it('preserves explicitly duplicated service steps', async () => {
    scheduling.listProviderSkills.mockResolvedValue([
      { providerUserId: GROOMER, serviceId: TRIM },
    ]);

    const result = await service.search('happy-pets-demo', {
      date: '2030-01-07',
      serviceIds: [TRIM, TRIM],
    });

    expect(result.serviceCount).toBe(2);
    expect(result.totalDurationMinutes).toBe(90);
    expect(scheduling.listProviderSkills).toHaveBeenCalledWith(
      expect.anything(),
      [TRIM],
    );
  });
});
