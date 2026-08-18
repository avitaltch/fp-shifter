import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ManagementTokenService } from './management-token.service';

describe('ManagementTokenService', () => {
  it('issues deterministic, tenant-bound tokens and stores only a one-way hash', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ManagementTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                MANAGEMENT_TOKEN_SECRET:
                  'unit-test-management-token-secret-at-least-32-bytes',
                MANAGEMENT_TOKEN_TTL_DAYS: 30,
              })[key],
          },
        },
      ],
    }).compile();
    const service = module.get(ManagementTokenService);
    const issuedAt = new Date('2030-01-01T00:00:00.000Z');

    const first = service.issue('business-a', 'request-a', issuedAt);
    const retry = service.issue('business-a', 'request-a', issuedAt);
    const otherTenant = service.issue('business-b', 'request-a', issuedAt);

    expect(first).toEqual(retry);
    expect(first.token).toMatch(/^sm_[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).not.toContain(first.token);
    expect(first.expiresAt.toISOString()).toBe('2030-01-31T00:00:00.000Z');
    expect(otherTenant.token).not.toBe(first.token);
  });
});
