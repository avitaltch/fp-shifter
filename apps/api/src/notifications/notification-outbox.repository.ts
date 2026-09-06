import { Injectable } from '@nestjs/common';
import type { TenantTransaction } from '../database/tenant-database.service';
import type {
  NotificationChannel,
  NotificationKind,
  NotificationPayload,
} from './notification.types';
import { scheduleAppointmentReminders } from './reminder-policy';

interface NotificationPolicyRow {
  customerPrimaryChannel: NotificationChannel;
  customerFallbackChannel: NotificationChannel | null;
  managerChannel: NotificationChannel;
  bookingConfirmationEnabled: boolean;
  remindersEnabled: boolean;
  managerCompoundEnabled: boolean;
  cancellationEnabled: boolean;
}

interface ManagerRecipientRow {
  userId: string;
  email: string;
  phoneE164: string | null;
}

interface ProviderNameRow {
  id: string;
  name: string;
}

export interface NotificationAppointmentStepInput {
  sequenceNumber: number;
  serviceName: string;
  providerUserId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface BookingNotificationInput {
  appointmentId: string;
  appointmentCreatedAt: Date;
  startsAt: Date;
  endsAt: Date;
  businessName: string;
  timezone: string;
  customerFirstName: string;
  customerEmail?: string;
  customerPhoneE164: string;
  steps: readonly NotificationAppointmentStepInput[];
  confirmationKind?: 'BookingConfirmation' | 'WaitlistAccepted';
}

export interface WaitlistOfferNotificationInput {
  offerId: string;
  holdAppointmentId: string;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  businessName: string;
  businessSlug: string;
  timezone: string;
  customerFirstName: string;
  customerEmail?: string;
  customerPhoneE164: string;
  offerToken: string;
  offeredAt: Date;
  steps: readonly Omit<NotificationAppointmentStepInput, 'providerUserId'>[];
}

export interface CancellationNotificationInput {
  appointmentId: string;
  cancelledAt: Date;
  startsAt: Date;
  endsAt: Date;
  businessName: string;
  timezone: string;
  customerFirstName: string;
  customerEmail: string | null;
  customerPhoneE164: string;
  steps: readonly Omit<NotificationAppointmentStepInput, 'providerUserId'>[];
}

interface DeliveryTarget {
  channel: NotificationChannel;
  recipient: string;
  fallbackChannel: NotificationChannel | null;
  fallbackRecipient: string | null;
}

@Injectable()
export class NotificationOutboxRepository {
  async enqueueBooking(
    transaction: TenantTransaction,
    input: BookingNotificationInput,
  ): Promise<void> {
    const policy = await this.getPolicy(transaction);
    const target = customerTarget(
      policy,
      input.customerEmail,
      input.customerPhoneE164,
    );
    const customerPayload = payloadFor(input, input.steps);

    if (target && policy.bookingConfirmationEnabled) {
      await this.enqueue(
        transaction,
        input.appointmentId,
        input.confirmationKind ?? 'BookingConfirmation',
        target,
        input.appointmentCreatedAt,
        customerPayload,
      );
    }
    if (target && policy.remindersEnabled) {
      for (const reminder of scheduleAppointmentReminders(
        input.appointmentCreatedAt,
        input.startsAt,
      )) {
        await this.enqueue(
          transaction,
          input.appointmentId,
          reminder.kind,
          target,
          reminder.scheduledFor,
          customerPayload,
        );
      }
    }

    const providerIds = [...new Set(input.steps.map((step) => step.providerUserId))];
    if (providerIds.length < 2 || !policy.managerCompoundEnabled) return;
    const manager = await this.getManagerRecipient(transaction);
    if (!manager) return;
    const providerNames = await this.getProviderNames(transaction, providerIds);
    const managerPayload = payloadFor(
      input,
      input.steps.map((step) => ({
        ...step,
        providerName: providerNames.get(step.providerUserId),
      })),
    );
    const managerDeliveryTarget = managerTarget(policy, manager);
    if (!managerDeliveryTarget) return;
    await this.enqueue(
      transaction,
      input.appointmentId,
      'ManagerCompoundVisit',
      managerDeliveryTarget,
      input.appointmentCreatedAt,
      managerPayload,
      manager.userId,
    );
  }

  async enqueueWaitlistOffer(
    transaction: TenantTransaction,
    input: WaitlistOfferNotificationInput,
  ): Promise<void> {
    const policy = await this.getPolicy(transaction);
    const target = customerTarget(
      policy,
      input.customerEmail,
      input.customerPhoneE164,
    );
    if (!target) return;
    const payload: NotificationPayload = {
      ...payloadFor(input, input.steps),
      actionPath: `/waitlist/claim/${input.businessSlug}#token=${encodeURIComponent(input.offerToken)}`,
      offerExpiresAt: input.expiresAt.toISOString(),
    };
    await this.enqueue(
      transaction,
      input.holdAppointmentId,
      'WaitlistAvailability',
      target,
      input.offeredAt,
      payload,
      `waitlist:${input.offerId}`,
    );
  }

  async handleCancellation(
    transaction: TenantTransaction,
    input: CancellationNotificationInput,
  ): Promise<void> {
    await transaction.query(
      `update notification_jobs
       set status = 'Cancelled',
           cancelled_at = $2,
           locked_at = null,
           locked_by = null
       where business_id = $1
         and appointment_id = $3
         and status in ('Pending', 'Processing', 'RetryScheduled')`,
      [input.cancelledAt, input.appointmentId],
    );

    const policy = await this.getPolicy(transaction);
    if (!policy.cancellationEnabled) return;
    const target = customerTarget(
      policy,
      input.customerEmail ?? undefined,
      input.customerPhoneE164,
    );
    const payload = payloadFor(input, input.steps);
    if (target) {
      await this.enqueue(
        transaction,
        input.appointmentId,
        'CustomerCancellation',
        target,
        input.cancelledAt,
        payload,
      );
    }
    const manager = await this.getManagerRecipient(transaction);
    if (!manager) return;
    const managerDeliveryTarget = managerTarget(policy, manager);
    if (!managerDeliveryTarget) return;
    await this.enqueue(
      transaction,
      input.appointmentId,
      'ManagerCancellation',
      managerDeliveryTarget,
      input.cancelledAt,
      payload,
      manager.userId,
    );
  }

  private async getPolicy(
    transaction: TenantTransaction,
  ): Promise<NotificationPolicyRow> {
    const rows = await transaction.query<NotificationPolicyRow>(
      `select coalesce(p.customer_primary_channel, 'Sms') as "customerPrimaryChannel",
              p.customer_fallback_channel as "customerFallbackChannel",
              coalesce(p.manager_channel, 'Email') as "managerChannel",
              coalesce(p.booking_confirmation_enabled, true) as "bookingConfirmationEnabled",
              coalesce(p.reminders_enabled, true) as "remindersEnabled",
              coalesce(p.manager_compound_enabled, true) as "managerCompoundEnabled",
              coalesce(p.cancellation_enabled, true) as "cancellationEnabled"
       from businesses b
       left join business_notification_policies p on p.business_id = b.id
       where b.id = $1`,
    );
    const policy = rows[0];
    if (!policy) throw new Error('Notification policy business was not found');
    return policy;
  }

  private async getManagerRecipient(
    transaction: TenantTransaction,
  ): Promise<ManagerRecipientRow | null> {
    const rows = await transaction.query<ManagerRecipientRow>(
      `select u.id as "userId",
              u.email::text as email,
              u.phone_e164 as "phoneE164"
       from business_memberships bm
       join users u on u.id = bm.user_id
       where bm.business_id = $1
         and bm.role in ('Owner', 'Manager')
         and bm.disabled_at is null
         and u.disabled_at is null
       order by case bm.role when 'Owner' then 0 else 1 end, bm.created_at, u.id
       limit 1`,
    );
    return rows[0] ?? null;
  }

  private async getProviderNames(
    transaction: TenantTransaction,
    providerIds: readonly string[],
  ): Promise<Map<string, string>> {
    const rows = await transaction.query<ProviderNameRow>(
      `select u.id, concat_ws(' ', u.first_name, u.last_name) as name
       from business_memberships bm
       join users u on u.id = bm.user_id
       where bm.business_id = $1
         and u.id = any($2::uuid[])
       order by u.id`,
      [providerIds],
    );
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async enqueue(
    transaction: TenantTransaction,
    appointmentId: string,
    kind: NotificationKind,
    target: DeliveryTarget,
    scheduledFor: Date,
    payload: NotificationPayload,
    recipientKey = 'customer',
  ): Promise<void> {
    const idempotencyKey = [
      'appointment',
      appointmentId,
      kind,
      target.channel,
      recipientKey,
    ].join(':');
    await transaction.query(
      `insert into notification_jobs
         (business_id, appointment_id, kind, channel, recipient,
          fallback_channel, fallback_recipient, scheduled_for, available_at,
          idempotency_key, payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10::jsonb)
       on conflict (business_id, idempotency_key) do nothing`,
      [
        appointmentId,
        kind,
        target.channel,
        target.recipient,
        target.fallbackChannel,
        target.fallbackRecipient,
        scheduledFor,
        idempotencyKey,
        JSON.stringify(payload),
      ],
    );
  }
}

function customerTarget(
  policy: NotificationPolicyRow,
  email: string | undefined,
  phoneE164: string,
): DeliveryTarget | null {
  const primaryRecipient = recipientFor(
    policy.customerPrimaryChannel,
    email,
    phoneE164,
  );
  const fallbackRecipient = policy.customerFallbackChannel
    ? recipientFor(policy.customerFallbackChannel, email, phoneE164)
    : null;
  if (primaryRecipient) {
    return {
      channel: policy.customerPrimaryChannel,
      recipient: primaryRecipient,
      fallbackChannel: fallbackRecipient
        ? policy.customerFallbackChannel
        : null,
      fallbackRecipient,
    };
  }
  if (!policy.customerFallbackChannel || !fallbackRecipient) return null;
  return {
    channel: policy.customerFallbackChannel,
    recipient: fallbackRecipient,
    fallbackChannel: null,
    fallbackRecipient: null,
  };
}

function managerTarget(
  policy: NotificationPolicyRow,
  manager: ManagerRecipientRow,
): DeliveryTarget | null {
  const recipient = recipientFor(
    policy.managerChannel,
    manager.email,
    manager.phoneE164 ?? '',
  );
  return recipient
    ? {
        channel: policy.managerChannel,
        recipient,
        fallbackChannel: null,
        fallbackRecipient: null,
      }
    : null;
}

function recipientFor(
  channel: NotificationChannel,
  email: string | undefined,
  phoneE164: string,
): string | null {
  return channel === 'Email' ? email ?? null : phoneE164 || null;
}

function payloadFor(
  input: Pick<
    BookingNotificationInput,
    | 'businessName'
    | 'customerFirstName'
    | 'startsAt'
    | 'endsAt'
    | 'timezone'
  >,
  steps: readonly (Omit<NotificationAppointmentStepInput, 'providerUserId'> & {
    providerName?: string;
  })[],
): NotificationPayload {
  return {
    businessName: input.businessName,
    customerFirstName: input.customerFirstName,
    appointmentStartsAt: input.startsAt.toISOString(),
    appointmentEndsAt: input.endsAt.toISOString(),
    timezone: input.timezone,
    services: steps.map((step) => ({
      sequenceNumber: step.sequenceNumber,
      serviceName: step.serviceName,
      startsAt: step.startsAt.toISOString(),
      endsAt: step.endsAt.toISOString(),
      ...(step.providerName ? { providerName: step.providerName } : {}),
    })),
  };
}
