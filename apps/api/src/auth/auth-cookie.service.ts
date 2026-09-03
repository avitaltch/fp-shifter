import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationEnvironment } from '../config/environment';
import { REFRESH_COOKIE_NAME } from './auth.constants';

@Injectable()
export class AuthCookieService {
  private readonly secure: boolean;
  private readonly maxAgeSeconds: number;

  constructor(config: ConfigService<ApplicationEnvironment, true>) {
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
    this.maxAgeSeconds =
      config.get('AUTH_REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400;
  }

  serialize(refreshToken: string): string {
    return this.parts(
      `${REFRESH_COOKIE_NAME}=${refreshToken}`,
      `Max-Age=${this.maxAgeSeconds}`,
    );
  }

  clear(): string {
    return this.parts(`${REFRESH_COOKIE_NAME}=`, 'Max-Age=0');
  }

  read(cookieHeader: string | undefined): string | null {
    if (!cookieHeader || cookieHeader.length > 8_192) return null;
    for (const part of cookieHeader.split(';')) {
      const [rawName, ...rawValue] = part.trim().split('=');
      if (rawName !== REFRESH_COOKIE_NAME) continue;
      const value = rawValue.join('=');
      return /^rt_[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
    return null;
  }

  private parts(value: string, maxAge: string): string {
    return [
      value,
      'Path=/api/v1/auth',
      maxAge,
      'HttpOnly',
      'SameSite=Strict',
      ...(this.secure ? ['Secure'] : []),
    ].join('; ');
  }
}
