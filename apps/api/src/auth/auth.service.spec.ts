import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenService } from './access-token.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import type { AuthPrincipal, LoginCandidate } from './auth.types';

const candidate: LoginCandidate = {
  userId: '00000000-0000-4000-8000-000000000201',
  email: 'owner@example.com',
  passwordHash: '$argon2id$hash',
  firstName: 'Dana',
  lastName: 'Owner',
  businessId: '00000000-0000-4000-8000-000000000001',
  businessSlug: 'happy-pets-demo',
  membershipId: '00000000-0000-4000-8000-000000000301',
  role: 'Owner',
};
const principal: AuthPrincipal = {
  ...candidate,
  sessionId: '00000000-0000-4000-8000-000000000901',
};

describe('AuthService', () => {
  let service: AuthService;
  let repository: {
    findLoginCandidates: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
    recordFailedLogin: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let passwords: { verify: ReturnType<typeof vi.fn> };
  let rateLimiter: { assertLoginAllowed: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repository = {
      findLoginCandidates: vi.fn().mockResolvedValue([candidate]),
      createSession: vi.fn().mockResolvedValue({
        principal,
        refreshToken: `rt_${'r'.repeat(43)}`,
      }),
      recordFailedLogin: vi.fn().mockResolvedValue(undefined),
      rotate: vi.fn(),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    passwords = { verify: vi.fn().mockResolvedValue(true) };
    rateLimiter = { assertLoginAllowed: vi.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: repository },
        { provide: PasswordService, useValue: passwords },
        {
          provide: AccessTokenService,
          useValue: {
            issue: vi.fn().mockResolvedValue({
              accessToken: 'access-token',
              expiresInSeconds: 900,
            }),
          },
        },
        { provide: AuthRateLimiterService, useValue: rateLimiter },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('rate-limits, verifies, and creates a scoped session', async () => {
    const result = await service.login(
      { email: candidate.email, password: 'correct password' },
      '203.0.113.10',
    );

    expect(rateLimiter.assertLoginAllowed).toHaveBeenCalledWith(
      '203.0.113.10',
      candidate.email,
    );
    expect(passwords.verify).toHaveBeenCalledWith(
      'correct password',
      candidate.passwordHash,
    );
    expect(result).toMatchObject({
      refreshToken: expect.stringMatching(/^rt_/),
      response: {
        accessToken: 'access-token',
        business: { slug: 'happy-pets-demo', role: 'Owner' },
        user: { email: candidate.email },
      },
    });
  });

  it('uses the same generic error and dummy verification for an unknown email', async () => {
    repository.findLoginCandidates.mockResolvedValue([]);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login(
        { email: 'missing@example.com', password: 'wrong' },
        '203.0.113.10',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith('wrong', undefined);
    expect(repository.recordFailedLogin).toHaveBeenCalledWith(
      'missing@example.com',
    );
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('requires an explicit business only after valid credentials', async () => {
    repository.findLoginCandidates.mockResolvedValue([
      candidate,
      { ...candidate, businessId: 'business-2', businessSlug: 'second-business' },
    ]);

    await expect(
      service.login(
        { email: candidate.email, password: 'correct password' },
        '203.0.113.10',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh session and rejects reuse', async () => {
    repository.rotate.mockResolvedValueOnce({
      status: 'rotated',
      session: { principal, refreshToken: `rt_${'n'.repeat(43)}` },
    });
    await expect(service.refresh(`rt_${'o'.repeat(43)}`)).resolves.toMatchObject({
      response: { accessToken: 'access-token' },
    });

    repository.rotate.mockResolvedValueOnce({ status: 'reused' });
    await expect(service.refresh(`rt_${'o'.repeat(43)}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes refresh sessions and returns the current principal view', async () => {
    const refreshToken = `rt_${'o'.repeat(43)}`;
    await expect(service.revoke(refreshToken)).resolves.toBeUndefined();
    expect(repository.revoke).toHaveBeenCalledWith(refreshToken);
    expect(service.me(principal)).toMatchObject({
      user: { id: principal.userId },
      business: { id: principal.businessId, role: 'Owner' },
    });
  });
});
