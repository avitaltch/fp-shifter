import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.constants';
import type {
  NotificationProvider,
  NotificationProviderMessage,
  NotificationProviderResult,
} from './notification.types';

interface FakeDeliveryRow {
  id: string;
}

@Injectable()
export class FakeNotificationProvider implements NotificationProvider {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async send(
    message: NotificationProviderMessage,
  ): Promise<NotificationProviderResult> {
    const result = await this.pool.query<FakeDeliveryRow>(
      `insert into notification_fake_deliveries
         (business_id, notification_job_id, channel, recipient,
          provider_idempotency_key, subject, body)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (provider_idempotency_key)
       do update set provider_idempotency_key = excluded.provider_idempotency_key
       returning id`,
      [
        message.businessId,
        message.jobId,
        message.channel,
        message.recipient,
        message.idempotencyKey,
        message.subject ?? null,
        message.body,
      ],
    );
    const deliveryId = result.rows[0]?.id;
    if (!deliveryId) throw new Error('Fake provider did not return a delivery ID');
    return {
      provider: 'local-fake',
      providerMessageId: `fake:${deliveryId}`,
      response: { accepted: true, channel: message.channel },
    };
  }
}
