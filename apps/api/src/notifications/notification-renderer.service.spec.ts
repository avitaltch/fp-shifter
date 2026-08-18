import { describe, expect, it } from 'vitest';
import type { ClaimedNotificationJob } from './notification.types';
import { NotificationRendererService } from './notification-renderer.service';

describe('NotificationRendererService', () => {
  it('renders the complete provider handoff for a compound manager alert', () => {
    const renderer = new NotificationRendererService();
    const rendered = renderer.render({
      id: 'job',
      businessId: 'business',
      appointmentId: 'appointment',
      kind: 'ManagerCompoundVisit',
      channel: 'Email',
      recipient: 'manager@example.test',
      fallbackChannel: null,
      fallbackRecipient: null,
      idempotencyKey: 'key',
      attemptCount: 1,
      maxAttempts: 5,
      lockedBy: 'worker',
      payload: {
        businessName: 'Happy Pets',
        customerFirstName: 'Ari',
        appointmentStartsAt: '2030-01-07T07:00:00.000Z',
        appointmentEndsAt: '2030-01-07T08:00:00.000Z',
        timezone: 'Asia/Jerusalem',
        services: [
          {
            sequenceNumber: 1,
            serviceName: 'Pet Trim',
            providerName: 'Dana Groomer',
            startsAt: '2030-01-07T07:00:00.000Z',
            endsAt: '2030-01-07T07:45:00.000Z',
          },
          {
            sequenceNumber: 2,
            serviceName: 'Vaccination',
            providerName: 'Noa Veterinarian',
            startsAt: '2030-01-07T07:45:00.000Z',
            endsAt: '2030-01-07T08:00:00.000Z',
          },
        ],
      },
    } satisfies ClaimedNotificationJob);

    expect(rendered.body).toContain('Pet Trim — Dana Groomer');
    expect(rendered.body).toContain('Vaccination — Noa Veterinarian');
  });
});
