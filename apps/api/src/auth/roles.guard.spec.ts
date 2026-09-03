import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedRequest } from './auth.types';

function contextWith(role: 'Owner' | 'Manager' | 'Provider'): ExecutionContext {
  return {
    getHandler: () => contextWith,
    getClass: () => RolesGuard,
    switchToHttp: () => ({
      getRequest: () => ({ auth: { role } }) as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    reflector = { getAllAndOverride: vi.fn() };
    const module = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();
    guard = module.get(RolesGuard);
  });

  it('allows endpoints without a role requirement', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextWith('Provider'))).toBe(true);
  });

  it('allows an accepted current role and rejects vertical escalation', () => {
    reflector.getAllAndOverride.mockReturnValue(['Owner', 'Manager']);
    expect(guard.canActivate(contextWith('Manager'))).toBe(true);
    expect(() => guard.canActivate(contextWith('Provider'))).toThrow(
      ForbiddenException,
    );
  });
});
