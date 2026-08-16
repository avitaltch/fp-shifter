export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ApplicationEnvironment {
  NODE_ENV: NodeEnvironment;
  API_HOST: string;
  API_PORT: number;
  DATABASE_URL: string;
  CORS_ORIGINS: string;
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

  return {
    NODE_ENV: nodeEnvironment as NodeEnvironment,
    API_HOST: String(environment.API_HOST ?? '0.0.0.0').trim(),
    API_PORT: parsePort(environment.API_PORT),
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: String(
      environment.CORS_ORIGINS ??
        'http://localhost:5173,http://127.0.0.1:5173',
    ).trim(),
  };
}

export function parseCorsOrigins(value: string): string[] {
  return [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))];
}
