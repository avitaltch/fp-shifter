import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AuthCookieService } from './auth-cookie.service';

async function createService(nodeEnvironment: 'development' | 'production') {
  const module = await Test.createTestingModule({
    providers: [
      AuthCookieService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'NODE_ENV' ? nodeEnvironment : 30,
        },
      },
    ],
  }).compile();
  return module.get(AuthCookieService);
}

describe('AuthCookieService', () => {
  it('serializes an HttpOnly strict refresh cookie and reads it back', async () => {
    const service = await createService('development');
    const token = `rt_${'a'.repeat(43)}`;
    const cookie = service.serialize(token);

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).not.toContain('Secure');
    expect(service.read(`other=x; ${cookie}`)).toBe(token);
  });

  it('uses Secure in production and rejects malformed capabilities', async () => {
    const service = await createService('production');
    expect(service.serialize(`rt_${'a'.repeat(43)}`)).toContain('Secure');
    expect(service.read('shiftsync_refresh=rt_short')).toBeNull();
    expect(service.read('x'.repeat(8_193))).toBeNull();
  });

  it('clears the same scoped cookie', async () => {
    const service = await createService('production');
    expect(service.clear()).toContain('Max-Age=0');
    expect(service.clear()).toContain('Path=/api/v1/auth');
  });
});
