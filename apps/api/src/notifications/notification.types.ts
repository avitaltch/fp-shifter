export type NotificationChannel = 'Email' | 'Sms' | 'WhatsApp';

export type NotificationKind =
  | 'BookingConfirmation'
  | 'ManagerCompoundVisit'
  | 'Reminder7d'
  | 'Reminder24h'
  | 'Reminder1h'
  | 'CustomerCancellation'
  | 'ManagerCancellation'
  | 'WaitlistAvailability'
  | 'WaitlistAccepted'
  | 'ManagerReassignment';

export type NotificationJobStatus =
  | 'Pending'
  | 'Processing'
  | 'RetryScheduled'
  | 'Sent'
  | 'Failed'
  | 'Cancelled';

export interface NotificationPayload {
  businessName: string;
  customerFirstName: string;
  appointmentStartsAt: string;
  appointmentEndsAt: string;
  timezone: string;
  actionPath?: string;
  offerExpiresAt?: string;
  services: readonly {
    sequenceNumber: number;
    serviceName: string;
    startsAt: string;
    endsAt: string;
    providerName?: string;
  }[];
}

export interface ClaimedNotificationJob {
  id: string;
  businessId: string;
  appointmentId: string | null;
  kind: NotificationKind;
  channel: NotificationChannel;
  recipient: string;
  fallbackChannel: NotificationChannel | null;
  fallbackRecipient: string | null;
  idempotencyKey: string;
  payload: NotificationPayload;
  attemptCount: number;
  maxAttempts: number;
  lockedBy: string;
}

export interface RenderedNotification {
  subject?: string;
  body: string;
}

export interface NotificationProviderResult {
  provider: string;
  providerMessageId: string;
  response: Record<string, unknown>;
}

export interface NotificationProviderMessage extends RenderedNotification {
  jobId: string;
  businessId: string;
  channel: NotificationChannel;
  recipient: string;
  idempotencyKey: string;
}

export interface NotificationProvider {
  send(
    message: NotificationProviderMessage,
  ): Promise<NotificationProviderResult>;
}
