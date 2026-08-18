import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import type { ApplicationEnvironment } from '../config/environment';

@Injectable()
export class WaitlistOfferTokenService {
  constructor(
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {}

  issue(businessId: string, offerId: string, issuedAt = new Date()) {
    const secret = this.config.get('MANAGEMENT_TOKEN_SECRET', { infer: true });
    const ttlSeconds = this.config.get('WAITLIST_OFFER_TTL_SECONDS', {
      infer: true,
    });
    const digest = createHmac('sha256', secret)
      .update(`shiftsync-waitlist-offer-v1:${businessId}:${offerId}`)
      .digest('base64url');
    const token = `wo_${digest}`;
    return {
      token,
      hash: this.hash(token),
      expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1_000),
    };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
