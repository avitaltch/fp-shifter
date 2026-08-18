import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { WaitlistOfferTokenService } from './waitlist-offer-token.service';

describe('WaitlistOfferTokenService', () => {
  it('issues a deterministic purpose-scoped token with configured expiry', async () => {
    const module = await Test.createTestingModule({
      providers: [
        WaitlistOfferTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'WAITLIST_OFFER_TTL_SECONDS'
                ? 300
                : 'test-management-token-secret-at-least-32-bytes',
          },
        },
      ],
    }).compile();
    const tokens = module.get(WaitlistOfferTokenService);
    const issued = tokens.issue(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000501',
      new Date('2030-01-07T12:00:00.000Z'),
    );
    expect(issued).toMatchObject({
      token: expect.stringMatching(/^wo_[A-Za-z0-9_-]{43}$/),
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: new Date('2030-01-07T12:05:00.000Z'),
    });
    expect(tokens.hash(issued.token)).toBe(issued.hash);
  });
});
