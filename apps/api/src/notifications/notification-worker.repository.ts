import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.constants';
import type {
  ClaimedNotificationJob,
  NotificationProviderResult,
} from './notification.types';

export type FailedJobOutcome = 'RetryScheduled' | 'Failed';

@Injectable()
export class NotificationWorkerRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async claim(
    workerId: string,
    batchSize: number,
    leaseSeconds: number,
    now: Date,
  ): Promise<ClaimedNotificationJob[]> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into notification_jobs
           (business_id, appointment_id, kind, channel, recipient,
            scheduled_for, available_at, max_attempts, idempotency_key, payload)
         select business_id,
                appointment_id,
                kind,
                fallback_channel,
                fallback_recipient,
                $1::timestamptz,
                $1::timestamptz,
                max_attempts,
                idempotency_key || ':fallback:' || fallback_channel::text,
                payload
         from notification_jobs
         where status = 'Processing'
           and locked_at < $1::timestamptz - ($2::integer * interval '1 second')
           and attempt_count >= max_attempts
           and fallback_channel is not null
           and fallback_recipient is not null
         on conflict (business_id, idempotency_key) do nothing`,
        [now, leaseSeconds],
      );
      await client.query(
        `update notification_jobs
         set status = case
               when attempt_count >= max_attempts then 'Failed'::notification_job_status
               else 'RetryScheduled'::notification_job_status
             end,
             available_at = $1::timestamptz,
             locked_at = null,
             locked_by = null,
             last_error = coalesce(last_error, 'Worker lease expired')
         where status = 'Processing'
           and locked_at < $1::timestamptz - ($2::integer * interval '1 second')`,
        [now, leaseSeconds],
      );
      const result = await client.query<ClaimedNotificationJob>(
        `with candidates as (
           select id
           from notification_jobs
           where status in ('Pending', 'RetryScheduled')
             and scheduled_for <= $1::timestamptz
             and available_at <= $1::timestamptz
           order by available_at, scheduled_for, created_at, id
           for update skip locked
           limit $2
         )
         update notification_jobs j
         set status = 'Processing',
             attempt_count = j.attempt_count + 1,
             locked_at = $1::timestamptz,
             locked_by = $3
         from candidates c
         where j.id = c.id
         returning j.id,
                   j.business_id as "businessId",
                   j.appointment_id as "appointmentId",
                   j.kind,
                   j.channel,
                   j.recipient,
                   j.fallback_channel as "fallbackChannel",
                   j.fallback_recipient as "fallbackRecipient",
                   j.idempotency_key as "idempotencyKey",
                   j.payload,
                   j.attempt_count as "attemptCount",
                   j.max_attempts as "maxAttempts",
                   j.locked_by as "lockedBy"`,
        [now, batchSize, workerId],
      );
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async isDeliverable(job: ClaimedNotificationJob, now: Date): Promise<boolean> {
    const result = await this.pool.query<{ deliverable: boolean }>(
      `select exists (
         select 1
         from notification_jobs j
         left join appointments a
           on a.business_id = j.business_id
          and a.id = j.appointment_id
         where j.id = $1
           and j.business_id = $2
           and j.status = 'Processing'
           and j.locked_by = $3
           and (
             j.kind not in ('Reminder7d', 'Reminder24h', 'Reminder1h')
             or (
               a.status in ('Pending', 'Confirmed', 'RequiresAttention')
               and a.starts_at > $4
             )
           )
       ) as deliverable`,
      [job.id, job.businessId, job.lockedBy, now],
    );
    return result.rows[0]?.deliverable ?? false;
  }

  async markCancelled(job: ClaimedNotificationJob, now: Date): Promise<void> {
    await this.pool.query(
      `update notification_jobs
       set status = 'Cancelled',
           cancelled_at = $1,
           locked_at = null,
           locked_by = null
       where id = $2
         and business_id = $3
         and status = 'Processing'
         and locked_by = $4`,
      [now, job.id, job.businessId, job.lockedBy],
    );
  }

  async markSent(
    job: ClaimedNotificationJob,
    result: NotificationProviderResult,
    startedAt: Date,
    finishedAt: Date,
  ): Promise<void> {
    await this.withAttemptTransaction(async (client) => {
      await this.insertAttempt(client, job, {
        provider: result.provider,
        status: 'Succeeded',
        providerMessageId: result.providerMessageId,
        providerResponse: result.response,
        error: null,
        startedAt,
        finishedAt,
      });
      await client.query(
        `update notification_jobs
         set status = 'Sent',
             sent_at = $1,
             locked_at = null,
             locked_by = null,
             last_error = null
         where id = $2
           and business_id = $3
           and status = 'Processing'
           and locked_by = $4`,
        [finishedAt, job.id, job.businessId, job.lockedBy],
      );
    });
  }

  async markFailed(
    job: ClaimedNotificationJob,
    error: Error,
    startedAt: Date,
    finishedAt: Date,
  ): Promise<FailedJobOutcome> {
    const terminal = job.attemptCount >= job.maxAttempts;
    const outcome: FailedJobOutcome = terminal ? 'Failed' : 'RetryScheduled';
    const errorMessage = error.message.slice(0, 2_000);
    await this.withAttemptTransaction(async (client) => {
      await this.insertAttempt(client, job, {
        provider: 'local-fake',
        status: 'Failed',
        providerMessageId: null,
        providerResponse: null,
        error: errorMessage,
        startedAt,
        finishedAt,
      });
      const backoffSeconds = Math.min(
        3_600,
        30 * 2 ** Math.max(0, job.attemptCount - 1),
      );
      await client.query(
        `update notification_jobs
         set status = $1::notification_job_status,
             available_at = case
               when $1::notification_job_status = 'RetryScheduled'
                 then $2::timestamptz + ($3::integer * interval '1 second')
               else available_at
             end,
             locked_at = null,
             locked_by = null,
             last_error = $4
         where id = $5
           and business_id = $6
           and status = 'Processing'
           and locked_by = $7`,
        [
          outcome,
          finishedAt,
          backoffSeconds,
          errorMessage,
          job.id,
          job.businessId,
          job.lockedBy,
        ],
      );
      if (
        terminal &&
        job.fallbackChannel &&
        job.fallbackRecipient
      ) {
        await client.query(
          `insert into notification_jobs
             (business_id, appointment_id, kind, channel, recipient,
              scheduled_for, available_at, max_attempts, idempotency_key, payload)
           values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9::jsonb)
           on conflict (business_id, idempotency_key) do nothing`,
          [
            job.businessId,
            job.appointmentId,
            job.kind,
            job.fallbackChannel,
            job.fallbackRecipient,
            finishedAt,
            job.maxAttempts,
            `${job.idempotencyKey}:fallback:${job.fallbackChannel}`,
            JSON.stringify(job.payload),
          ],
        );
      }
    });
    return outcome;
  }

  private async withAttemptTransaction(
    work: (client: PoolClient) => Promise<void>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await work(client);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertAttempt(
    client: PoolClient,
    job: ClaimedNotificationJob,
    attempt: {
      provider: string;
      status: 'Succeeded' | 'Failed';
      providerMessageId: string | null;
      providerResponse: Record<string, unknown> | null;
      error: string | null;
      startedAt: Date;
      finishedAt: Date;
    },
  ): Promise<void> {
    await client.query(
      `insert into notification_attempts
         (business_id, notification_job_id, attempt_number, provider, status,
          provider_message_id, provider_response, error, started_at, finished_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
       on conflict (notification_job_id, attempt_number) do nothing`,
      [
        job.businessId,
        job.id,
        job.attemptCount,
        attempt.provider,
        attempt.status,
        attempt.providerMessageId,
        attempt.providerResponse
          ? JSON.stringify(attempt.providerResponse)
          : null,
        attempt.error,
        attempt.startedAt,
        attempt.finishedAt,
      ],
    );
  }
}
