import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('delegates liveness and readiness to the health service', async () => {
    const liveness = vi.fn().mockReturnValue({ status: 'ok' });
    const readiness = vi.fn().mockResolvedValue({
      status: 'ok',
      checks: { database: 'up' },
    });
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { liveness, readiness } },
      ],
    }).compile();
    const controller = module.get(HealthController);

    expect(controller.liveness()).toEqual({ status: 'ok' });
    await expect(controller.readiness()).resolves.toMatchObject({
      checks: { database: 'up' },
    });
  });
});
