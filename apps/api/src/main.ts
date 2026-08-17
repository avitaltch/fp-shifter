import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';
import {
  type ApplicationEnvironment,
  parseCorsOrigins,
} from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true, colors: false }),
  });
  const config = app.get(ConfigService<ApplicationEnvironment, true>);
  const host = config.get('API_HOST', { infer: true });
  const port = config.get('API_PORT', { infer: true });

  configureApplication(app, {
    corsOrigins: parseCorsOrigins(
      config.get('CORS_ORIGINS', { infer: true }),
    ),
    enableSwagger: config.get('SWAGGER_ENABLED', { infer: true }),
  });

  await app.listen(port, host);
  Logger.log({ event: 'api_listening', host, port }, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    'API bootstrap failed',
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
