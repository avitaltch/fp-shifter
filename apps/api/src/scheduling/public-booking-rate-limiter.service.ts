import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationEnvironment } from '../config/environment';
import { RateLimiterService } from '../security/rate-limiter.service';

@Injectable()
export class PublicActionRateLimiter {
  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {}

  assertAllowed(input: {
    action: 'public-booking' | 'public-waitlist';
    businessSlug: string;
    clientAddress: string;
    phoneE164: string;
  }): Promise<void> {
    return this.rateLimiter.assertAllowed(
      [
        {
          limiter: `${input.action}-business-ip`,
          identity: `${input.businessSlug}:${input.clientAddress}`,
          limit: this.config.get('PUBLIC_BOOKING_IP_LIMIT', { infer: true }),
          windowSeconds: this.config.get(
            'PUBLIC_BOOKING_IP_WINDOW_SECONDS',
            { infer: true },
          ),
        },
        {
          limiter: `${input.action}-business-contact`,
          identity: `${input.businessSlug}:${input.phoneE164}`,
          limit: this.config.get('PUBLIC_BOOKING_CONTACT_LIMIT', {
            infer: true,
          }),
          windowSeconds: this.config.get(
            'PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS',
            { infer: true },
          ),
        },
      ],
      {
        code: 'PUBLIC_BOOKING_RATE_LIMITED',
        message: 'Too many booking attempts. Please try again later.',
      },
    );
  }
}
