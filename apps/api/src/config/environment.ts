export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ApplicationEnvironment {
  NODE_ENV: NodeEnvironment;
  API_HOST: string;
  API_PORT: number;
  DATABASE_URL: string;
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
