import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthPrincipal } from './auth.types';

const session = {
  refreshToken: `rt_${'r'.repeat(43)}`,
  response: {
    accessToken: 'access-token',
    expiresInSeconds: 900,
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      firstName: 'Dana',
      lastName: 'Owner',
    },
    business: { id: 'business-1', slug: 'happy-pets-demo', role: 'Owner' as const },
  },
};

describe('AuthController', () => {
  let controller: AuthController;
  let auth: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    me: ReturnType<typeof vi.fn>;
  };
  let cookies: {
    serialize: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
  let setHeader: Mock<(name: string, value: string) => void>;
  let response: { setHeader(name: string, value: string): void };

  beforeEach(async () => {
    auth = {
      login: vi.fn().mockResolvedValue(session),
      refresh: vi.fn().mockResolvedValue(session),
      revoke: vi.fn().mockResolvedValue(undefined),
      me: vi.fn().mockReturnValue(session.response),
    };
    cookies = {
      serialize: vi.fn().mockReturnValue('refresh-cookie'),
      clear: vi.fn().mockReturnValue('cleared-cookie'),
      read: vi.fn().mockReturnValue(session.refreshToken),
    };
    setHeader = vi.fn<(name: string, value: string) => void>();
    response = { setHeader };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AuthCookieService, useValue: cookies },
      ],
    }).compile();
    controller = module.get(AuthController);
  });

  it('sets the refresh cookie without returning it in the login body', async () => {
    await expect(
      controller.login(
        { email: 'owner@example.com', password: 'secret' },
        '203.0.113.10',
        response,
      ),
    ).resolves.toEqual(session.response);
    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'refresh-cookie',
    );
    expect(JSON.stringify(session.response)).not.toContain(session.refreshToken);
  });

  it('rotates the cookie and clears it when refresh fails', async () => {
    await expect(
      controller.refresh('cookie-header', response),
    ).resolves.toEqual(session.response);
    expect(auth.refresh).toHaveBeenCalledWith(session.refreshToken);

    auth.refresh.mockRejectedValue(new UnauthorizedException());
    await expect(controller.refresh('cookie-header', response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(setHeader).toHaveBeenLastCalledWith(
      'Set-Cookie',
      'cleared-cookie',
    );
  });

  it('rejects missing refresh cookies, revokes logout, and returns me', async () => {
    cookies.read.mockReturnValueOnce(null);
    await expect(controller.refresh(undefined, response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(setHeader).toHaveBeenLastCalledWith(
      'Set-Cookie',
      'cleared-cookie',
    );

    cookies.read.mockReturnValue(session.refreshToken);
    await expect(controller.logout('cookie-header', response)).resolves.toBeUndefined();
    expect(auth.revoke).toHaveBeenCalledWith(session.refreshToken);
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', 'cleared-cookie');

    const principal = { userId: 'user-1' } as AuthPrincipal;
    controller.me(principal);
    expect(auth.me).toHaveBeenCalledWith(principal);
  });
});
