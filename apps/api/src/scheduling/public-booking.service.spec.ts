import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IdempotencyKeyReusedError,
  InvalidBookingDateError,
  PlanNoLongerAvailableError,
} from './booking.errors';
import { BookingRepository } from './booking.repository';
import { ManagementTokenService } from './management-token.service';
import { PublicBookingService } from './public-booking.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';

const request = {
  date: '2030-01-07',
  startsAt: '2030-01-07T12:00:00.000Z',
  serviceIds: [
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000402',
  ],
  customer: {
    firstName: 'Ari',
    lastName: 'Cohen',
    email: 'ari@example.test',
    phoneE164: '+972501234567',
  },
};
const idempotencyKey = '00000000-0000-4000-8000-000000000444';

describe('PublicBookingService', () => {
  let service: PublicBookingService;
  let directory: { findBusinessBySlug: ReturnType<typeof vi.fn> };
  let bookings: { create: ReturnType<typeof vi.fn> };
  let managementTokens: { issue: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    directory = {
      findBusinessBySlug: vi.fn().mockResolvedValue({
        businessId: '00000000-0000-4000-8000-000000000001',
        businessSlug: 'happy-pets-demo',
        locationId: '00000000-0000-4000-8000-000000000101',
        timezone: 'Asia/Jerusalem',
      }),
    };
    bookings = {
      create: vi.fn().mockResolvedValue({
        appointmentId: '00000000-0000-4000-8000-000000000999',
        status: 'Confirmed',
        managementTokenExpiresAt: new Date('2031-01-07T12:00:00.000Z'),
        startsAt: new Date('2030-01-07T12:00:00.000Z'),
        endsAt: new Date('2030-01-07T13:00:00.000Z'),
        totalPriceMinor: 20000,
        currency: 'ILS',
        steps: [
          {
            sequenceNumber: 1,
            serviceId: request.serviceIds[0],
            startsAt: new Date('2030-01-07T12:00:00.000Z'),
            endsAt: new Date('2030-01-07T12:45:00.000Z'),
          },
          {
            sequenceNumber: 2,
            serviceId: request.serviceIds[1],
            startsAt: new Date('2030-01-07T12:45:00.000Z'),
            endsAt: new Date('2030-01-07T13:00:00.000Z'),
          },
        ],
      }),
    };
    managementTokens = {
      issue: vi.fn().mockReturnValue({
        token: 'sm_management-token',
        hash: 'a'.repeat(64),
        expiresAt: new Date('2031-01-07T12:00:00.000Z'),
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        PublicBookingService,
        { provide: PublicSchedulingRepository, useValue: directory },
        { provide: BookingRepository, useValue: bookings },
        { provide: ManagementTokenService, useValue: managementTokens },
      ],
    }).compile();
    service = module.get(PublicBookingService);
  });

  it('returns the confirmed compound visit without provider identifiers', async () => {
    const response = await service.create(
      'happy-pets-demo',
      request,
      idempotencyKey,
    );

    expect(response).toMatchObject({
      appointmentId: '00000000-0000-4000-8000-000000000999',
      status: 'Confirmed',
      startsAt: '2030-01-07T12:00:00.000Z',
      endsAt: '2030-01-07T13:00:00.000Z',
      totalPriceMinor: 20000,
      currency: 'ILS',
      managementToken: 'sm_management-token',
      managementTokenExpiresAt: '2031-01-07T12:00:00.000Z',
    });
    expect(response.steps).toHaveLength(2);
    expect(JSON.stringify(response)).not.toContain('providerUserId');
    expect(bookings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: '00000000-0000-4000-8000-000000000001',
      }),
      expect.objectContaining({ locationId: expect.any(String) }),
      expect.objectContaining({
        idempotencyKey,
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        managementTokenHash: 'a'.repeat(64),
        managementTokenExpiresAt: new Date('2031-01-07T12:00:00.000Z'),
        startsAt: new Date(request.startsAt),
        serviceIds: request.serviceIds,
      }),
    );
  });

  it('returns not found without starting a booking transaction', async () => {
    directory.findBusinessBySlug.mockResolvedValue(null);

    await expect(
      service.create('missing', request, idempotencyKey),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed idempotency key before database access', async () => {
    await expect(
      service.create('happy-pets-demo', request, undefined),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_IDEMPOTENCY_KEY' }),
    });
    expect(directory.findBusinessBySlug).not.toHaveBeenCalled();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('maps invalid dates to a typed bad request', async () => {
    bookings.create.mockRejectedValue(
      new InvalidBookingDateError('Date is invalid'),
    );

    await expect(
      service.create('happy-pets-demo', request, idempotencyKey),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    new PlanNoLongerAvailableError('stale'),
    { code: '23P01' },
  ])('maps stale and database exclusion conflicts to HTTP 409', async (error) => {
    bookings.create.mockRejectedValue(error);

    await expect(
      service.create('happy-pets-demo', request, idempotencyKey),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PLAN_NO_LONGER_AVAILABLE' }),
    });
  });

  it('maps reuse of a key with different input to a typed conflict', async () => {
    bookings.create.mockRejectedValue(
      new IdempotencyKeyReusedError('already used'),
    );

    await expect(
      service.create('happy-pets-demo', request, idempotencyKey),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }),
    });
  });
});
