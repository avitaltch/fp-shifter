import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationEnvironment } from './config/environment';
import { NotificationWorkerService } from './notifications/notification-worker.service';
import { WaitlistWorkerService } from './scheduling/waitlist-worker.service';

@Injectable()
export class BackgroundWorkerService {
  private readonly logger = new Logger(BackgroundWorkerService.name);

  constructor(
    private readonly notifications: NotificationWorkerService,
    private readonly waitlist: WaitlistWorkerService,
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {}

  async runForever(signal: AbortSignal): Promise<void> {
    const pollMs = this.config.get('NOTIFICATION_WORKER_POLL_MS', {
      infer: true,
    });
    this.logger.log({ event: 'background_worker_started' });
    while (!signal.aborted) {
      const waitlist = await this.waitlist.runOnce();
      const notifications = await this.notifications.runOnce();
      const handled =
        waitlist.expired + waitlist.matched + notifications.claimed;
      if (handled > 0) {
        this.logger.log({
          event: 'background_worker_batch',
          waitlist,
          notifications,
        });
      }
      if (!signal.aborted && handled === 0) {
        await waitForNextPoll(pollMs, signal);
      }
    }
    this.logger.log({ event: 'background_worker_stopped' });
  }
}

function waitForNextPoll(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
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
