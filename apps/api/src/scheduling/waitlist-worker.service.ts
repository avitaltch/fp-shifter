import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationEnvironment } from '../config/environment';
import { WaitlistRepository } from './waitlist.repository';

export interface WaitlistWorkerRunResult {
  expired: number;
  matched: number;
}

@Injectable()
export class WaitlistWorkerService {
  constructor(
    private readonly waitlist: WaitlistRepository,
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {}

  async runOnce(now = new Date()): Promise<WaitlistWorkerRunResult> {
    const batchSize = this.config.get('NOTIFICATION_WORKER_BATCH_SIZE', {
      infer: true,
    });
    const result = { expired: 0, matched: 0 };
    for (let index = 0; index < batchSize; index += 1) {
      if (!(await this.waitlist.expireNextOffer(now))) break;
      result.expired += 1;
    }
    for (let index = 0; index < batchSize; index += 1) {
      if (!(await this.waitlist.processNextMatch(now))) break;
      result.matched += 1;
    }
    return result;
  }
}
