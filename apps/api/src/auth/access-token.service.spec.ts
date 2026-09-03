import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccessTokenService } from './access-token.service';
import type { AuthPrincipal } from './auth.types';

const secret = 'test-auth-token-secret-at-least-32-bytes-long';
const principal: AuthPrincipal = {
  sessionId: '00000000-0000-4000-8000-000000000901',
  userId: '00000000-0000-4000-8000-000000000201',
  email: 'owner@example.com',
  firstName: 'Dana',
  lastName: 'Owner',
  businessId: '00000000-0000-4000-8000-000000000001',
  businessSlug: 'happy-pets-demo',
  membershipId: '00000000-0000-4000-8000-000000000301',
  role: 'Owner',
};

describe('AccessTokenService', () => {
  let service: AccessTokenService;
  let jwt: JwtService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        AccessTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'AUTH_TOKEN_SECRET' ? secret : 900,
          },
        },
      ],
    }).compile();
    service = module.get(AccessTokenService);
    jwt = module.get(JwtService);
  });

  it('issues and verifies a tenant/session-scoped HS256 access token', async () => {
    const issued = await service.issue(principal);
    const payload = await service.verify(issued.accessToken);

    expect(issued.expiresInSeconds).toBe(900);
    expect(payload).toMatchObject({
      sub: principal.userId,
      sid: principal.sessionId,
      bid: principal.businessId,
      typ: 'access',
      iss: 'shiftsync-api',
      aud: 'shiftsync-web',
    });
  });

  it('rejects a correctly signed token with the wrong purpose', async () => {
    const refreshLikeToken = await jwt.signAsync(
      {
        sub: principal.userId,
        sid: principal.sessionId,
        bid: principal.businessId,
        typ: 'refresh',
      },
      {
        secret,
        algorithm: 'HS256',
        issuer: 'shiftsync-api',
        audience: 'shiftsync-web',
        expiresIn: 900,
      },
    );

    await expect(service.verify(refreshLikeToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a tampered token', async () => {
    const { accessToken } = await service.issue(principal);
    await expect(service.verify(`${accessToken}x`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
