import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiterService } from '../security/rate-limiter.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';

const settings: Record<string, number> = {
  AUTH_LOGIN_WINDOW_SECONDS: 900,
  AUTH_LOGIN_IP_LIMIT: 20,
  AUTH_LOGIN_EMAIL_LIMIT: 5,
};

describe('AuthRateLimiterService', () => {
  let service: AuthRateLimiterService;
  let limiter: { assertAllowed: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    limiter = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        AuthRateLimiterService,
        { provide: RateLimiterService, useValue: limiter },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => settings[key] },
        },
      ],
    }).compile();
    service = module.get(AuthRateLimiterService);
  });

  it('limits normalized email and IP identities independently', async () => {
    await service.assertLoginAllowed('203.0.113.10', ' Owner@Example.COM ');

    expect(limiter.assertAllowed).toHaveBeenCalledWith(
      [
        {
          limiter: 'auth-login-ip',
          identity: '203.0.113.10',
          limit: 20,
          windowSeconds: 900,
        },
        {
          limiter: 'auth-login-email',
          identity: 'owner@example.com',
          limit: 5,
          windowSeconds: 900,
        },
      ],
      expect.objectContaining({ code: 'AUTH_RATE_LIMITED' }),
    );
  });
});
