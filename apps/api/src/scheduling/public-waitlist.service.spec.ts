import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicActionRateLimiter } from './public-booking-rate-limiter.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { PublicWaitlistService } from './public-waitlist.service';
import {
  DuplicateWaitlistEntryError,
  InvalidWaitlistRequestError,
} from './waitlist.errors';
import { WaitlistRepository } from './waitlist.repository';
import { WaitlistOfferTokenService } from './waitlist-offer-token.service';

const now = new Date('2030-01-01T00:00:00.000Z');
const request = {
  windowStartsAt: '2030-01-07T07:00:00.000Z',
  windowEndsAt: '2030-01-07T15:00:00.000Z',
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

describe('PublicWaitlistService', () => {
  let service: PublicWaitlistService;
  let directory: { findBusinessBySlug: ReturnType<typeof vi.fn> };
  let waitlist: {
    create: ReturnType<typeof vi.fn>;
    accept: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
  };
  let rateLimiter: { assertAllowed: ReturnType<typeof vi.fn> };
  let offerTokens: { hash: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    directory = {
      findBusinessBySlug: vi.fn().mockResolvedValue({
        businessId: '00000000-0000-4000-8000-000000000001',
        businessSlug: 'happy-pets-demo',
        businessName: 'Happy Pets',
        locationId: '00000000-0000-4000-8000-000000000101',
        timezone: 'Asia/Jerusalem',
      }),
    };
    waitlist = {
      create: vi.fn().mockResolvedValue({
        waitlistEntryId: '00000000-0000-4000-8000-000000000501',
        status: 'Active',
        windowStartsAt: new Date(request.windowStartsAt),
        windowEndsAt: new Date(request.windowEndsAt),
        serviceIds: request.serviceIds,
      }),
      accept: vi.fn().mockResolvedValue({
        appointmentId: '00000000-0000-4000-8000-000000000601',
        status: 'Confirmed',
        managementToken: `sm_${'a'.repeat(43)}`,
        managementTokenExpiresAt: new Date('2031-01-07T12:00:00.000Z'),
        startsAt: new Date('2030-01-07T12:00:00.000Z'),
        endsAt: new Date('2030-01-07T13:00:00.000Z'),
        totalPriceMinor: 20_000,
        currency: 'ILS',
        steps: [],
      }),
      reject: vi.fn().mockResolvedValue(undefined),
    };
    rateLimiter = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
    offerTokens = { hash: vi.fn().mockReturnValue('a'.repeat(64)) };
    const module = await Test.createTestingModule({
      providers: [
        PublicWaitlistService,
        { provide: PublicSchedulingRepository, useValue: directory },
        { provide: WaitlistRepository, useValue: waitlist },
        { provide: PublicActionRateLimiter, useValue: rateLimiter },
        { provide: WaitlistOfferTokenService, useValue: offerTokens },
        {
          provide: ConfigService,
          useValue: {
            get: () => 'test-management-token-secret-at-least-32-bytes',
          },
        },
      ],
    }).compile();
    service = module.get(PublicWaitlistService);
  });

  it('creates a tenant-scoped waitlist entry with a keyed demand fingerprint', async () => {
    await expect(
      service.create('happy-pets-demo', request, '203.0.113.10', now),
    ).resolves.toEqual({
      waitlistEntryId: '00000000-0000-4000-8000-000000000501',
      status: 'Active',
      windowStartsAt: request.windowStartsAt,
      windowEndsAt: request.windowEndsAt,
      serviceIds: request.serviceIds,
    });
    expect(rateLimiter.assertAllowed).toHaveBeenCalledWith({
      action: 'public-waitlist',
      businessSlug: 'happy-pets-demo',
      clientAddress: '203.0.113.10',
      phoneE164: request.customer.phoneE164,
    });
    expect(waitlist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: '00000000-0000-4000-8000-000000000001',
      }),
      expect.objectContaining({ businessSlug: 'happy-pets-demo' }),
      expect.objectContaining({
        demandFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects invalid windows before database access', async () => {
    await expect(
      service.create(
        'happy-pets-demo',
        { ...request, windowEndsAt: request.windowStartsAt },
        '203.0.113.10',
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(directory.findBusinessBySlug).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown business without consuming quota', async () => {
    directory.findBusinessBySlug.mockResolvedValue(null);
    await expect(
      service.create('missing', request, '203.0.113.10', now),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rateLimiter.assertAllowed).not.toHaveBeenCalled();
  });

  it.each([
    [new DuplicateWaitlistEntryError(), ConflictException],
    [new InvalidWaitlistRequestError('invalid services'), BadRequestException],
  ])('maps repository domain failures to typed HTTP errors', async (error, type) => {
    waitlist.create.mockRejectedValue(error);
    await expect(
      service.create('happy-pets-demo', request, '203.0.113.10', now),
    ).rejects.toBeInstanceOf(type);
  });

  it('accepts a well-formed bearer offer without exposing provider IDs', async () => {
    const token = `wo_${'b'.repeat(43)}`;
    const accepted = await service.accept(
      'happy-pets-demo',
      `Bearer ${token}`,
    );
    expect(offerTokens.hash).toHaveBeenCalledWith(token);
    expect(waitlist.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: '00000000-0000-4000-8000-000000000001',
      }),
      'a'.repeat(64),
      expect.objectContaining({ businessSlug: 'happy-pets-demo' }),
    );
    expect(accepted).toMatchObject({
      status: 'Confirmed',
      startsAt: '2030-01-07T12:00:00.000Z',
    });
    expect(JSON.stringify(accepted)).not.toContain('providerUserId');
  });

  it('rejects an active offer using the hashed bearer capability', async () => {
    const token = `wo_${'c'.repeat(43)}`;
    await expect(
      service.reject('happy-pets-demo', `Bearer ${token}`),
    ).resolves.toBeUndefined();
    expect(waitlist.reject).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: '00000000-0000-4000-8000-000000000001',
      }),
      'a'.repeat(64),
    );
  });
});
