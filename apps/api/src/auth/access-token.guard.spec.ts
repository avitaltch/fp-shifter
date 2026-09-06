import {
  ForbiddenException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthRepository } from './auth.repository';
import type { AuthenticatedRequest, AuthPrincipal } from './auth.types';

const principal: AuthPrincipal = {
  sessionId: 'session-1',
  userId: 'user-1',
  email: 'owner@example.com',
  firstName: 'Dana',
  lastName: 'Owner',
  phoneE164: null,
  businessId: 'business-1',
  businessSlug: 'happy-pets-demo',
  membershipId: 'membership-1',
  role: 'Owner',
  mustChangePassword: false,
};

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    getHandler: () => contextFor,
    getClass: () => AccessTokenGuard,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AccessTokenGuard', () => {
  let guard: AccessTokenGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let tokens: { verify: ReturnType<typeof vi.fn> };
  let repository: { resolvePrincipal: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    tokens = {
      verify: vi.fn().mockResolvedValue({
        sid: principal.sessionId,
        sub: principal.userId,
        bid: principal.businessId,
      }),
    };
    repository = { resolvePrincipal: vi.fn().mockResolvedValue(principal) };
    const module = await Test.createTestingModule({
      providers: [
        AccessTokenGuard,
        { provide: Reflector, useValue: reflector },
        { provide: AccessTokenService, useValue: tokens },
        { provide: AuthRepository, useValue: repository },
      ],
    }).compile();
    guard = module.get(AccessTokenGuard);
  });

  it('bypasses only explicitly public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const request = { get: vi.fn() } as unknown as AuthenticatedRequest;
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it('resolves the current server-side session and membership', async () => {
    const request = {
      get: vi.fn().mockReturnValue('Bearer signed.access.token'),
    } as unknown as AuthenticatedRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(repository.resolvePrincipal).toHaveBeenCalledWith({
      sessionId: principal.sessionId,
      userId: principal.userId,
      businessId: principal.businessId,
    });
    expect(request.auth).toEqual(principal);
  });

  it('rejects missing bearer tokens and revoked server-side sessions', async () => {
    const missing = { get: vi.fn() } as unknown as AuthenticatedRequest;
    await expect(guard.canActivate(contextFor(missing))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    repository.resolvePrincipal.mockResolvedValue(null);
    const revoked = {
      get: vi.fn().mockReturnValue('Bearer signed.access.token'),
    } as unknown as AuthenticatedRequest;
    await expect(guard.canActivate(contextFor(revoked))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('blocks temporary-password sessions outside password-safe routes', async () => {
    repository.resolvePrincipal.mockResolvedValue({
      ...principal,
      mustChangePassword: true,
    });
    const request = {
      get: vi.fn().mockReturnValue('Bearer signed.access.token'),
    } as unknown as AuthenticatedRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: 'PASSWORD_CHANGE_REQUIRED' },
    });
  });

  it('allows explicitly password-safe routes during forced password change', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    repository.resolvePrincipal.mockResolvedValue({
      ...principal,
      mustChangePassword: true,
    });
    const request = {
      get: vi.fn().mockReturnValue('Bearer signed.access.token'),
    } as unknown as AuthenticatedRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });
});
