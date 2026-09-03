import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ApplicationEnvironment } from '../config/environment';
import type { AuthPrincipal } from './auth.types';

interface AccessTokenPayload {
  sub: string;
  sid: string;
  bid: string;
  typ: 'access';
}

@Injectable()
export class AccessTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<ApplicationEnvironment, true>,
  ) {
    this.secret = config.get('AUTH_TOKEN_SECRET', { infer: true });
    this.ttlSeconds = config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', {
      infer: true,
    });
  }

  async issue(principal: AuthPrincipal): Promise<{
    accessToken: string;
    expiresInSeconds: number;
  }> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: principal.userId,
        sid: principal.sessionId,
        bid: principal.businessId,
        typ: 'access',
      } satisfies AccessTokenPayload,
      {
        secret: this.secret,
        algorithm: 'HS256',
        issuer: 'shiftsync-api',
        audience: 'shiftsync-web',
        expiresIn: this.ttlSeconds,
      },
    );
    return { accessToken, expiresInSeconds: this.ttlSeconds };
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
        issuer: 'shiftsync-api',
        audience: 'shiftsync-web',
      });
      if (
        payload.typ !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.bid !== 'string'
      ) {
        throw new Error('Invalid access token claims');
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Authentication is required',
      });
    }
  }
}
