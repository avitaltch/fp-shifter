export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ApplicationEnvironment {
  NODE_ENV: NodeEnvironment;
  API_HOST: string;
  API_PORT: number;
  DATABASE_URL: string;
  MANAGEMENT_TOKEN_SECRET: string;
  MANAGEMENT_TOKEN_TTL_DAYS: number;
  AUTH_TOKEN_SECRET: string;
  AUTH_ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_REFRESH_TOKEN_TTL_DAYS: number;
  AUTH_LOGIN_IP_LIMIT: number;
  AUTH_LOGIN_EMAIL_LIMIT: number;
  AUTH_LOGIN_WINDOW_SECONDS: number;
  PUBLIC_BOOKING_IP_LIMIT: number;
  PUBLIC_BOOKING_IP_WINDOW_SECONDS: number;
  PUBLIC_BOOKING_CONTACT_LIMIT: number;
  PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS: number;
  WAITLIST_OFFER_TTL_SECONDS: number;
  NOTIFICATION_WORKER_BATCH_SIZE: number;
  NOTIFICATION_WORKER_LEASE_SECONDS: number;
  NOTIFICATION_WORKER_POLL_MS: number;
  CORS_ORIGINS: string;
  SWAGGER_ENABLED: boolean;
}

const NODE_ENVIRONMENTS = new Set<NodeEnvironment>([
  'development',
  'test',
  'production',
]);

function requiredString(
  environment: Record<string, unknown>,
  key: string,
): string {
  const value = environment[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function parsePort(value: unknown): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseInteger(
  value: unknown,
  fallback: number,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseBoolean(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): ApplicationEnvironment {
  const nodeEnvironment = String(environment.NODE_ENV ?? 'development');
  if (!NODE_ENVIRONMENTS.has(nodeEnvironment as NodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const databaseUrl = requiredString(environment, 'DATABASE_URL');
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the postgres protocol');
  }
  const managementTokenSecret = requiredString(
    environment,
    'MANAGEMENT_TOKEN_SECRET',
  );
  if (Buffer.byteLength(managementTokenSecret, 'utf8') < 32) {
    throw new Error('MANAGEMENT_TOKEN_SECRET must be at least 32 bytes');
  }
  const configuredAuthSecret = environment.AUTH_TOKEN_SECRET;
  if (
    nodeEnvironment === 'production' &&
    (typeof configuredAuthSecret !== 'string' || configuredAuthSecret.trim() === '')
  ) {
    throw new Error('AUTH_TOKEN_SECRET is required in production');
  }
  const authTokenSecret =
    typeof configuredAuthSecret === 'string' && configuredAuthSecret.trim()
      ? configuredAuthSecret.trim()
      : managementTokenSecret;
  if (Buffer.byteLength(authTokenSecret, 'utf8') < 32) {
    throw new Error('AUTH_TOKEN_SECRET must be at least 32 bytes');
  }
  if (
    nodeEnvironment === 'production' &&
    authTokenSecret === managementTokenSecret
  ) {
    throw new Error(
      'AUTH_TOKEN_SECRET must be different from MANAGEMENT_TOKEN_SECRET in production',
    );
  }

  const apiHost = String(environment.API_HOST ?? '0.0.0.0').trim();
  if (!apiHost) throw new Error('API_HOST is required');
  const corsOrigins = String(
    environment.CORS_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173',
  ).trim();
  parseCorsOrigins(corsOrigins);

  return {
    NODE_ENV: nodeEnvironment as NodeEnvironment,
    API_HOST: apiHost,
    API_PORT: parsePort(environment.API_PORT),
    DATABASE_URL: databaseUrl,
    MANAGEMENT_TOKEN_SECRET: managementTokenSecret,
    MANAGEMENT_TOKEN_TTL_DAYS: parseInteger(
      environment.MANAGEMENT_TOKEN_TTL_DAYS,
      365,
      'MANAGEMENT_TOKEN_TTL_DAYS',
      1,
      3_650,
    ),
    AUTH_TOKEN_SECRET: authTokenSecret,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: parseInteger(
      environment.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      900,
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      60,
      3_600,
    ),
    AUTH_REFRESH_TOKEN_TTL_DAYS: parseInteger(
      environment.AUTH_REFRESH_TOKEN_TTL_DAYS,
      30,
      'AUTH_REFRESH_TOKEN_TTL_DAYS',
      1,
      365,
    ),
    AUTH_LOGIN_IP_LIMIT: parseInteger(
      environment.AUTH_LOGIN_IP_LIMIT,
      20,
      'AUTH_LOGIN_IP_LIMIT',
      1,
      1_000,
    ),
    AUTH_LOGIN_EMAIL_LIMIT: parseInteger(
      environment.AUTH_LOGIN_EMAIL_LIMIT,
      5,
      'AUTH_LOGIN_EMAIL_LIMIT',
      1,
      1_000,
    ),
    AUTH_LOGIN_WINDOW_SECONDS: parseInteger(
      environment.AUTH_LOGIN_WINDOW_SECONDS,
      900,
      'AUTH_LOGIN_WINDOW_SECONDS',
      60,
      86_400,
    ),
    PUBLIC_BOOKING_IP_LIMIT: parseInteger(
      environment.PUBLIC_BOOKING_IP_LIMIT,
      20,
      'PUBLIC_BOOKING_IP_LIMIT',
      1,
      10_000,
    ),
    PUBLIC_BOOKING_IP_WINDOW_SECONDS: parseInteger(
      environment.PUBLIC_BOOKING_IP_WINDOW_SECONDS,
      300,
      'PUBLIC_BOOKING_IP_WINDOW_SECONDS',
      1,
      86_400,
    ),
    PUBLIC_BOOKING_CONTACT_LIMIT: parseInteger(
      environment.PUBLIC_BOOKING_CONTACT_LIMIT,
      5,
      'PUBLIC_BOOKING_CONTACT_LIMIT',
      1,
      10_000,
    ),
    PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS: parseInteger(
      environment.PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS,
      3_600,
      'PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS',
      1,
      86_400,
    ),
    WAITLIST_OFFER_TTL_SECONDS: parseInteger(
      environment.WAITLIST_OFFER_TTL_SECONDS,
      300,
      'WAITLIST_OFFER_TTL_SECONDS',
      60,
      3_600,
    ),
    NOTIFICATION_WORKER_BATCH_SIZE: parseInteger(
      environment.NOTIFICATION_WORKER_BATCH_SIZE,
      50,
      'NOTIFICATION_WORKER_BATCH_SIZE',
      1,
      500,
    ),
    NOTIFICATION_WORKER_LEASE_SECONDS: parseInteger(
      environment.NOTIFICATION_WORKER_LEASE_SECONDS,
      300,
      'NOTIFICATION_WORKER_LEASE_SECONDS',
      10,
      3_600,
    ),
    NOTIFICATION_WORKER_POLL_MS: parseInteger(
      environment.NOTIFICATION_WORKER_POLL_MS,
      1_000,
      'NOTIFICATION_WORKER_POLL_MS',
      100,
      60_000,
    ),
    CORS_ORIGINS: corsOrigins,
    SWAGGER_ENABLED: parseBoolean(
      environment.SWAGGER_ENABLED,
      nodeEnvironment !== 'production',
      'SWAGGER_ENABLED',
    ),
  };
}

export function parseCorsOrigins(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => {
          let parsed: URL;
          try {
            parsed = new URL(origin);
          } catch {
            throw new Error(`CORS origin is invalid: ${origin}`);
          }
          if (
            !['http:', 'https:'].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password ||
            parsed.pathname !== '/' ||
            parsed.search ||
            parsed.hash
          ) {
            throw new Error(`CORS origin must be an HTTP(S) origin: ${origin}`);
          }
          return parsed.origin;
        }),
    ),
  ];
}
