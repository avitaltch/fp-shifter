import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';
import {
  type ApplicationEnvironment,
  parseCorsOrigins,
} from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<ApplicationEnvironment, true>);
  const host = config.get('API_HOST', { infer: true });
  const port = config.get('API_PORT', { infer: true });

  configureApplication(app, {
    corsOrigins: parseCorsOrigins(
      config.get('CORS_ORIGINS', { infer: true }),
    ),
  });

  await app.listen(port, host);
  Logger.log(`ShiftSync API listening on ${host}:${port}`, 'Bootstrap');
}

void bootstrap();
