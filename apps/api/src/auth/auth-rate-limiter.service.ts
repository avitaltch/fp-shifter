import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationEnvironment } from '../config/environment';
import { RateLimiterService } from '../security/rate-limiter.service';

@Injectable()
export class AuthRateLimiterService {
  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {}

  assertLoginAllowed(clientAddress: string, email: string): Promise<void> {
    const windowSeconds = this.config.get('AUTH_LOGIN_WINDOW_SECONDS', {
      infer: true,
    });
    return this.rateLimiter.assertAllowed(
      [
        {
          limiter: 'auth-login-ip',
          identity: clientAddress,
          limit: this.config.get('AUTH_LOGIN_IP_LIMIT', { infer: true }),
          windowSeconds,
        },
        {
          limiter: 'auth-login-email',
          identity: email.trim().toLowerCase(),
          limit: this.config.get('AUTH_LOGIN_EMAIL_LIMIT', { infer: true }),
          windowSeconds,
        },
      ],
      {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      },
    );
  }
}
