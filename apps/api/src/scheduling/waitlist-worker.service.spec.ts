import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistRepository } from './waitlist.repository';
import { WaitlistWorkerService } from './waitlist-worker.service';

describe('WaitlistWorkerService', () => {
  let worker: WaitlistWorkerService;
  let waitlist: {
    expireNextOffer: ReturnType<typeof vi.fn>;
    processNextMatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    waitlist = {
      expireNextOffer: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false),
      processNextMatch: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false),
    };
    const module = await Test.createTestingModule({
      providers: [
        WaitlistWorkerService,
        { provide: WaitlistRepository, useValue: waitlist },
        { provide: ConfigService, useValue: { get: () => 10 } },
      ],
    }).compile();
    worker = module.get(WaitlistWorkerService);
  });

  it('expires holds before advancing durable match work', async () => {
    const now = new Date('2030-01-07T12:00:00.000Z');
    await expect(worker.runOnce(now)).resolves.toEqual({
      expired: 1,
      matched: 1,
    });
    expect(waitlist.expireNextOffer).toHaveBeenCalledWith(now);
    expect(waitlist.processNextMatch).toHaveBeenCalledWith(now);
    expect(
      waitlist.expireNextOffer.mock.invocationCallOrder[0],
    ).toBeLessThan(waitlist.processNextMatch.mock.invocationCallOrder[0] ?? 0);
  });
});
