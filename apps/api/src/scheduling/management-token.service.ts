import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import type { ApplicationEnvironment } from '../config/environment';

export interface IssuedManagementToken {
  token: string;
  hash: string;
  expiresAt: Date;
}

@Injectable()
export class ManagementTokenService {
  constructor(
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {}

  issue(
    businessId: string,
    idempotencyKey: string,
    issuedAt = new Date(),
  ): IssuedManagementToken {
    const secret = this.config.get('MANAGEMENT_TOKEN_SECRET', { infer: true });
    const ttlDays = this.config.get('MANAGEMENT_TOKEN_TTL_DAYS', {
      infer: true,
    });
    const digest = createHmac('sha256', secret)
      .update(`shiftsync-management-v1:${businessId}:${idempotencyKey}`)
      .digest('base64url');
    const token = `sm_${digest}`;
    return {
      token,
      hash: this.hash(token),
      expiresAt: new Date(issuedAt.getTime() + ttlDays * 86_400_000),
    };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
