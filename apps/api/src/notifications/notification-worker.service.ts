import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ApplicationEnvironment } from '../config/environment';
import { FakeNotificationProvider } from './fake-notification.provider';
import { NotificationRendererService } from './notification-renderer.service';
import { NotificationWorkerRepository } from './notification-worker.repository';

export interface NotificationWorkerRunResult {
  claimed: number;
  sent: number;
  retryScheduled: number;
  failed: number;
  cancelled: number;
}

@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID()}`;

  constructor(
    private readonly repository: NotificationWorkerRepository,
    private readonly renderer: NotificationRendererService,
    private readonly provider: FakeNotificationProvider,
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {}

  async runOnce(now = new Date()): Promise<NotificationWorkerRunResult> {
    const jobs = await this.repository.claim(
      this.workerId,
      this.config.get('NOTIFICATION_WORKER_BATCH_SIZE', { infer: true }),
      this.config.get('NOTIFICATION_WORKER_LEASE_SECONDS', { infer: true }),
      now,
    );
    const result: NotificationWorkerRunResult = {
      claimed: jobs.length,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const job of jobs) {
      const startedAt = new Date();
      try {
        if (!(await this.repository.isDeliverable(job, now))) {
          await this.repository.markCancelled(job, new Date());
          result.cancelled += 1;
          continue;
        }
        const rendered = this.renderer.render(job);
        const providerResult = await this.provider.send({
          jobId: job.id,
          businessId: job.businessId,
          channel: job.channel,
          recipient: job.recipient,
          idempotencyKey: job.idempotencyKey,
          ...rendered,
        });
        await this.repository.markSent(
          job,
          providerResult,
          startedAt,
          new Date(),
        );
        result.sent += 1;
      } catch (error) {
        const outcome = await this.repository.markFailed(
          job,
          error instanceof Error ? error : new Error('Unknown provider error'),
          startedAt,
          new Date(),
        );
        result[outcome === 'Failed' ? 'failed' : 'retryScheduled'] += 1;
      }
    }
    return result;
  }

  async runForever(signal: AbortSignal): Promise<void> {
    const pollMs = this.config.get('NOTIFICATION_WORKER_POLL_MS', {
      infer: true,
    });
    this.logger.log({ event: 'notification_worker_started', workerId: this.workerId });
    while (!signal.aborted) {
      const result = await this.runOnce();
      if (result.claimed > 0) {
        this.logger.log({ event: 'notification_worker_batch', ...result });
      }
      if (!signal.aborted && result.claimed === 0) {
        await waitForNextPoll(pollMs, signal);
      }
    }
    this.logger.log({ event: 'notification_worker_stopped', workerId: this.workerId });
  }
}

function waitForNextPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
