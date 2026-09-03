import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, validateEnvironment } from './environment';

const managementTokenSecret = 'test-management-token-secret-at-least-32-bytes';
const authTokenSecret = 'test-auth-token-secret-different-at-least-32-bytes';

describe('validateEnvironment', () => {
  it('applies safe local defaults and parses the API port', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: 'postgres://user:password@localhost:5432/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        API_PORT: '3100',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3100,
      DATABASE_URL: 'postgres://user:password@localhost:5432/shiftsync',
      MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
      MANAGEMENT_TOKEN_TTL_DAYS: 365,
      AUTH_TOKEN_SECRET: managementTokenSecret,
      AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
      AUTH_REFRESH_TOKEN_TTL_DAYS: 30,
      AUTH_LOGIN_IP_LIMIT: 20,
      AUTH_LOGIN_EMAIL_LIMIT: 5,
      AUTH_LOGIN_WINDOW_SECONDS: 900,
      PUBLIC_BOOKING_IP_LIMIT: 20,
      PUBLIC_BOOKING_IP_WINDOW_SECONDS: 300,
      PUBLIC_BOOKING_CONTACT_LIMIT: 5,
      PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS: 3_600,
      WAITLIST_OFFER_TTL_SECONDS: 300,
      NOTIFICATION_WORKER_BATCH_SIZE: 50,
      NOTIFICATION_WORKER_LEASE_SECONDS: 300,
      NOTIFICATION_WORKER_POLL_MS: 1_000,
      CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
      SWAGGER_ENABLED: true,
    });
  });

  it('rejects a missing database URL', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL is required');
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'https://database.example.com' }),
    ).toThrow('DATABASE_URL must use the postgres protocol');
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        API_PORT: '70000',
      }),
    ).toThrow('API_PORT must be an integer between 1 and 65535');
  });

  it('rejects a blank API host', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        API_HOST: ' ',
      }),
    ).toThrow('API_HOST is required');
  });

  it('disables Swagger by default in production', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        AUTH_TOKEN_SECRET: authTokenSecret,
      }).SWAGGER_ENABLED,
    ).toBe(false);
  });

  it('accepts an explicit Swagger setting', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        AUTH_TOKEN_SECRET: authTokenSecret,
        SWAGGER_ENABLED: 'true',
      }).SWAGGER_ENABLED,
    ).toBe(true);
  });

  it('rejects a malformed Swagger setting', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        AUTH_TOKEN_SECRET: authTokenSecret,
        SWAGGER_ENABLED: 'yes',
      }),
    ).toThrow('SWAGGER_ENABLED must be true or false');
  });

  it('requires a sufficiently long management-token secret', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: 'too-short',
      }),
    ).toThrow('MANAGEMENT_TOKEN_SECRET must be at least 32 bytes');
  });

  it('validates the management-token lifetime', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        MANAGEMENT_TOKEN_TTL_DAYS: 0,
      }),
    ).toThrow('MANAGEMENT_TOKEN_TTL_DAYS must be an integer between 1 and 3650');
  });

  it('requires a separate authentication secret in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
      }),
    ).toThrow('AUTH_TOKEN_SECRET is required in production');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        AUTH_TOKEN_SECRET: managementTokenSecret,
      }),
    ).toThrow('AUTH_TOKEN_SECRET must be different');
  });

  it.each([
    ['NOTIFICATION_WORKER_BATCH_SIZE', 0, 1, 500],
    ['NOTIFICATION_WORKER_LEASE_SECONDS', 9, 10, 3_600],
    ['NOTIFICATION_WORKER_POLL_MS', 60_001, 100, 60_000],
    ['AUTH_ACCESS_TOKEN_TTL_SECONDS', 59, 60, 3_600],
    ['AUTH_REFRESH_TOKEN_TTL_DAYS', 366, 1, 365],
    ['AUTH_LOGIN_WINDOW_SECONDS', 59, 60, 86_400],
  ])('validates %s bounds', (key, value, minimum, maximum) => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgres://localhost/shiftsync',
        MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
        [key]: value,
      }),
    ).toThrow(`${key} must be an integer between ${minimum} and ${maximum}`);
  });
});

describe('parseCorsOrigins', () => {
  it('trims, removes blanks, and deduplicates origins', () => {
    expect(
      parseCorsOrigins('http://localhost:5173, ,http://localhost:5173'),
    ).toEqual(['http://localhost:5173']);
  });

  it('normalizes origin trailing slashes', () => {
    expect(parseCorsOrigins('https://app.example.com/')).toEqual([
      'https://app.example.com',
    ]);
  });

  it('rejects paths and non-HTTP origins', () => {
    expect(() => parseCorsOrigins('https://app.example.com/path')).toThrow(
      'CORS origin must be an HTTP(S) origin',
    );
    expect(() => parseCorsOrigins('file:///tmp/app')).toThrow(
      'CORS origin must be an HTTP(S) origin',
    );
  });
});
