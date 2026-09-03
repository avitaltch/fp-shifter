import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  let limiter: RateLimiterService;
  let database: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    database = {
      query: vi.fn().mockResolvedValue([
        { limiter: 'auth-login-ip', requestCount: 1, retryAfterSeconds: 300 },
      ]),
    };
    const module = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        { provide: DatabaseService, useValue: database },
        {
          provide: ConfigService,
          useValue: {
            get: () => 'test-management-token-secret-at-least-32-bytes',
          },
        },
      ],
    }).compile();
    limiter = module.get(RateLimiterService);
  });

  it('persists only a keyed identity hash', async () => {
    await limiter.assertAllowed(
      [{ limiter: 'auth-login-ip', identity: '203.0.113.10', limit: 5, windowSeconds: 300 }],
      { code: 'LIMITED', message: 'Too many requests' },
    );

    const values = database.query.mock.calls[0]?.[1] as unknown[][];
    expect(values[1]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
    expect(JSON.stringify(values)).not.toContain('203.0.113.10');
  });

  it('returns a bounded retry delay when a quota is exceeded', async () => {
    database.query.mockResolvedValue([
      { limiter: 'auth-login-ip', requestCount: 6, retryAfterSeconds: 180 },
    ]);

    await expect(
      limiter.assertAllowed(
        [{ limiter: 'auth-login-ip', identity: '203.0.113.10', limit: 5, windowSeconds: 300 }],
        { code: 'AUTH_RATE_LIMITED', message: 'Too many attempts' },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: expect.objectContaining({
        code: 'AUTH_RATE_LIMITED',
        retryAfterSeconds: 180,
      }),
    });
  });
});
