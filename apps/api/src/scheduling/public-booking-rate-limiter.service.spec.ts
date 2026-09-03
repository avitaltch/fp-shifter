import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiterService } from '../security/rate-limiter.service';
import { PublicActionRateLimiter } from './public-booking-rate-limiter.service';

const settings: Record<string, number> = {
  PUBLIC_BOOKING_IP_LIMIT: 20,
  PUBLIC_BOOKING_IP_WINDOW_SECONDS: 300,
  PUBLIC_BOOKING_CONTACT_LIMIT: 5,
  PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS: 3_600,
};

describe('PublicActionRateLimiter', () => {
  let limiter: PublicActionRateLimiter;
  let sharedLimiter: { assertAllowed: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    sharedLimiter = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        PublicActionRateLimiter,
        { provide: RateLimiterService, useValue: sharedLimiter },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => settings[key] },
        },
      ],
    }).compile();
    limiter = module.get(PublicActionRateLimiter);
  });

  it('applies business-scoped IP and contact quotas', async () => {
    await limiter.assertAllowed({
      action: 'public-booking',
      businessSlug: 'happy-pets-demo',
      clientAddress: '203.0.113.10',
      phoneE164: '+972501234567',
    });

    expect(sharedLimiter.assertAllowed).toHaveBeenCalledWith(
      [
        {
          limiter: 'public-booking-business-ip',
          identity: 'happy-pets-demo:203.0.113.10',
          limit: 20,
          windowSeconds: 300,
        },
        {
          limiter: 'public-booking-business-contact',
          identity: 'happy-pets-demo:+972501234567',
          limit: 5,
          windowSeconds: 3_600,
        },
      ],
      expect.objectContaining({ code: 'PUBLIC_BOOKING_RATE_LIMITED' }),
    );
  });
});
