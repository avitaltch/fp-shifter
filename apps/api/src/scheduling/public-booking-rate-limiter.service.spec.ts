import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.service';

const settings: Record<string, string | number> = {
  MANAGEMENT_TOKEN_SECRET: 'test-management-token-secret-at-least-32-bytes',
  PUBLIC_BOOKING_IP_LIMIT: 20,
  PUBLIC_BOOKING_IP_WINDOW_SECONDS: 300,
  PUBLIC_BOOKING_CONTACT_LIMIT: 5,
  PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS: 3_600,
};

describe('PublicBookingRateLimiter', () => {
  let limiter: PublicBookingRateLimiter;
  let database: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    database = {
      query: vi.fn().mockResolvedValue([
        {
          limiter: 'public-booking-business-ip',
          requestCount: 1,
          retryAfterSeconds: 300,
        },
        {
          limiter: 'public-booking-business-contact',
          requestCount: 1,
          retryAfterSeconds: 3_600,
        },
      ]),
    };
    const module = await Test.createTestingModule({
      providers: [
        PublicBookingRateLimiter,
        { provide: DatabaseService, useValue: database },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => settings[key] },
        },
      ],
    }).compile();
    limiter = module.get(PublicBookingRateLimiter);
  });

  it('stores only keyed hashes for the IP and phone identities', async () => {
    await limiter.assertAllowed({
      businessSlug: 'happy-pets-demo',
      clientAddress: '203.0.113.10',
      phoneE164: '+972501234567',
    });

    const values = database.query.mock.calls[0]?.[1] as unknown[][];
    expect(values[1]).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    expect(JSON.stringify(values)).not.toContain('203.0.113.10');
    expect(JSON.stringify(values)).not.toContain('+972501234567');
  });

  it('rejects a request when either quota is exceeded', async () => {
    database.query.mockResolvedValue([
      {
        limiter: 'public-booking-business-ip',
        requestCount: 21,
        retryAfterSeconds: 180,
      },
      {
        limiter: 'public-booking-business-contact',
        requestCount: 3,
        retryAfterSeconds: 3_000,
      },
    ]);

    await expect(
      limiter.assertAllowed({
        businessSlug: 'happy-pets-demo',
        clientAddress: '203.0.113.10',
        phoneE164: '+972501234567',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: expect.objectContaining({
        code: 'PUBLIC_BOOKING_RATE_LIMITED',
        retryAfterSeconds: 180,
      }),
    });
  });
});
