import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BackgroundWorkerService } from './background-worker.service';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new ConsoleLogger({ json: true, colors: false }),
  });
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await application
      .get(BackgroundWorkerService)
      .runForever(abortController.signal);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await application.close();
  }
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('NotificationWorkerBootstrap');
  logger.error(
    'Notification worker bootstrap failed',
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
