import { Injectable } from '@nestjs/common';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../database/tenant-database.service';
import type { TenantScope } from '../tenancy/tenant-scope';
import { NotificationOutboxRepository } from '../notifications/notification-outbox.repository';
import {
  AppointmentCancellationNotAllowedError,
  AppointmentCancellationTooLateError,
  AppointmentManagementTokenInvalidError,
} from './booking.errors';
import type {
  ManagedAppointment,
  ManagedAppointmentStatus,
  ManagedAppointmentStep,
} from './appointment-management.types';

interface ManagedAppointmentRow {
  appointmentId: string;
  status: ManagedAppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
  customerFirstName: string;
  customerEmail: string | null;
  customerPhoneE164: string;
}

export interface AppointmentNotificationContext {
  businessName: string;
  timezone: string;
}

@Injectable()
export class AppointmentManagementRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly notifications: NotificationOutboxRepository,
  ) {}

  async find(
    scope: TenantScope,
    managementTokenHash: string,
  ): Promise<ManagedAppointment | null> {
    return this.database.transaction(scope, async (transaction) => {
      const appointment = await this.findAppointment(
        transaction,
        managementTokenHash,
      );
      return appointment
        ? this.withSteps(transaction, appointment)
        : null;
    });
  }

  async cancel(
    scope: TenantScope,
    managementTokenHash: string,
    notificationContext: AppointmentNotificationContext,
    now = new Date(),
  ): Promise<ManagedAppointment> {
    return this.database.transaction(scope, async (transaction) => {
      const appointment = await this.findAppointment(
        transaction,
        managementTokenHash,
        true,
      );
      if (!appointment) throw new AppointmentManagementTokenInvalidError();
      if (appointment.status === 'Cancelled') {
        return this.withSteps(transaction, appointment);
      }
      if (appointment.status === 'Completed') {
        throw new AppointmentCancellationNotAllowedError(
          'Completed appointments cannot be cancelled',
        );
      }
      if (appointment.startsAt.getTime() <= now.getTime()) {
        throw new AppointmentCancellationTooLateError(
          'Appointments cannot be cancelled after they have started',
        );
      }

      await transaction.query(
        `update appointments
         set status = 'Cancelled',
             cancelled_at = $2,
             updated_at = $2
         where business_id = $1
           and id = $3`,
        [now, appointment.appointmentId],
      );
      await transaction.query(
        `update appointment_steps
         set status = 'Cancelled',
             updated_at = $2
         where business_id = $1
           and appointment_id = $3
           and status in ('Scheduled', 'InProgress')`,
        [now, appointment.appointmentId],
      );
      const cancelledAppointment = await this.withSteps(transaction, {
        ...appointment,
        status: 'Cancelled',
      });
      await this.notifications.handleCancellation(transaction, {
        appointmentId: appointment.appointmentId,
        cancelledAt: now,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        businessName: notificationContext.businessName,
        timezone: notificationContext.timezone,
        customerFirstName: appointment.customerFirstName,
        customerEmail: appointment.customerEmail,
        customerPhoneE164: appointment.customerPhoneE164,
        steps: cancelledAppointment.steps.map((step) => ({
          sequenceNumber: step.sequenceNumber,
          serviceName: step.serviceName,
          startsAt: step.startsAt,
          endsAt: step.endsAt,
        })),
      });
      return cancelledAppointment;
    });
  }

  private async findAppointment(
    transaction: TenantTransaction,
    managementTokenHash: string,
    lock = false,
  ): Promise<ManagedAppointmentRow | null> {
    const rows = await transaction.query<ManagedAppointmentRow>(
      `select a.id as "appointmentId",
              a.status,
              a.starts_at as "startsAt",
              a.ends_at as "endsAt",
              a.total_price_minor as "totalPriceMinor",
              a.currency,
              c.first_name as "customerFirstName",
              c.email::text as "customerEmail",
              c.phone_e164 as "customerPhoneE164"
       from appointments a
       join customers c
         on c.business_id = a.business_id
        and c.id = a.customer_id
       where a.business_id = $1
         and a.management_token_hash = $2
         and a.management_token_expires_at > now()
         and a.management_token_revoked_at is null
       ${lock ? 'for update of a' : ''}`,
      [managementTokenHash],
    );
    return rows[0] ?? null;
  }

  private async withSteps(
    transaction: TenantTransaction,
    appointment: ManagedAppointmentRow,
  ): Promise<ManagedAppointment> {
    const steps = await transaction.query<ManagedAppointmentStep>(
      `select sequence_number as "sequenceNumber",
              service_id as "serviceId",
              service_name_snapshot as "serviceName",
              starts_at as "startsAt",
              ends_at as "endsAt"
       from appointment_steps
       where business_id = $1
         and appointment_id = $2
       order by sequence_number`,
      [appointment.appointmentId],
    );
    return { ...appointment, steps };
  }
}
