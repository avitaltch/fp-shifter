import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('applies safe local defaults and parses the API port', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: 'postgres://user:password@localhost:5432/shiftsync',
        API_PORT: '3100',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3100,
      DATABASE_URL: 'postgres://user:password@localhost:5432/shiftsync',
      CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
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
        API_PORT: '70000',
      }),
    ).toThrow('API_PORT must be an integer between 1 and 65535');
  });
});

describe('parseCorsOrigins', () => {
  it('trims, removes blanks, and deduplicates origins', () => {
    expect(
      parseCorsOrigins('http://localhost:5173, ,http://localhost:5173'),
    ).toEqual(['http://localhost:5173']);
  });
});
