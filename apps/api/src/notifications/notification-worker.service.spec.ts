import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeNotificationProvider } from './fake-notification.provider';
import { NotificationRendererService } from './notification-renderer.service';
import type { ClaimedNotificationJob } from './notification.types';
import { NotificationWorkerRepository } from './notification-worker.repository';
import { NotificationWorkerService } from './notification-worker.service';

const job: ClaimedNotificationJob = {
  id: '00000000-0000-4000-8000-000000000001',
  businessId: '00000000-0000-4000-8000-000000000002',
  appointmentId: '00000000-0000-4000-8000-000000000003',
  kind: 'Reminder24h',
  channel: 'Sms',
  recipient: '+972501234567',
  fallbackChannel: null,
  fallbackRecipient: null,
  idempotencyKey: 'appointment:test:Reminder24h:Sms:customer',
  attemptCount: 1,
  maxAttempts: 5,
  lockedBy: 'test-worker',
  payload: {
    businessName: 'Happy Pets',
    customerFirstName: 'Ari',
    appointmentStartsAt: '2030-01-07T12:00:00.000Z',
    appointmentEndsAt: '2030-01-07T13:00:00.000Z',
    timezone: 'Asia/Jerusalem',
    services: [
      {
        sequenceNumber: 1,
        serviceName: 'Pet Trim',
        startsAt: '2030-01-07T12:00:00.000Z',
        endsAt: '2030-01-07T13:00:00.000Z',
      },
    ],
  },
};

describe('NotificationWorkerService', () => {
  let service: NotificationWorkerService;
  let repository: {
    claim: ReturnType<typeof vi.fn>;
    isDeliverable: ReturnType<typeof vi.fn>;
    markCancelled: ReturnType<typeof vi.fn>;
    markSent: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
  };
  let renderer: { render: ReturnType<typeof vi.fn> };
  let provider: { send: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repository = {
      claim: vi.fn().mockResolvedValue([job]),
      isDeliverable: vi.fn().mockResolvedValue(true),
      markCancelled: vi.fn().mockResolvedValue(undefined),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue('RetryScheduled'),
    };
    renderer = {
      render: vi.fn().mockReturnValue({ subject: 'Reminder', body: 'Body' }),
    };
    provider = {
      send: vi.fn().mockResolvedValue({
        provider: 'local-fake',
        providerMessageId: 'fake:1',
        response: { accepted: true },
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        NotificationWorkerService,
        { provide: NotificationWorkerRepository, useValue: repository },
        { provide: NotificationRendererService, useValue: renderer },
        { provide: FakeNotificationProvider, useValue: provider },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                NOTIFICATION_WORKER_BATCH_SIZE: 50,
                NOTIFICATION_WORKER_LEASE_SECONDS: 300,
                NOTIFICATION_WORKER_POLL_MS: 1_000,
              })[key],
          },
        },
      ],
    }).compile();
    service = module.get(NotificationWorkerService);
  });

  it('renders and marks a due deliverable job sent', async () => {
    const result = await service.runOnce(new Date('2030-01-06T12:00:00.000Z'));

    expect(result).toEqual({
      claimed: 1,
      sent: 1,
      retryScheduled: 0,
      failed: 0,
      cancelled: 0,
    });
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'Sms',
        recipient: '+972501234567',
        idempotencyKey: job.idempotencyKey,
        body: 'Body',
      }),
    );
    expect(repository.markSent).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ providerMessageId: 'fake:1' }),
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('cancels a stale reminder without calling a provider', async () => {
    repository.isDeliverable.mockResolvedValue(false);

    await expect(service.runOnce()).resolves.toMatchObject({ cancelled: 1 });
    expect(repository.markCancelled).toHaveBeenCalledWith(job, expect.any(Date));
    expect(renderer.render).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('records bounded retry behavior when the provider fails', async () => {
    provider.send.mockRejectedValue(new Error('temporary failure'));

    await expect(service.runOnce()).resolves.toMatchObject({
      retryScheduled: 1,
      sent: 0,
    });
    expect(repository.markFailed).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ message: 'temporary failure' }),
      expect.any(Date),
      expect.any(Date),
    );
  });
});
