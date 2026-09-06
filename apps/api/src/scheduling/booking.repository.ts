import { Injectable } from '@nestjs/common';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../database/tenant-database.service';
import type { TenantScope } from '../tenancy/tenant-scope';
import { NotificationOutboxRepository } from '../notifications/notification-outbox.repository';
import {
  findCompoundAppointmentPlans,
  localDateRangeToInstants,
  SchedulerInputError,
} from './domain/compound-scheduler';
import {
  IdempotencyKeyReusedError,
  InvalidBookingDateError,
  InvalidServiceSelectionError,
  PlanNoLongerAvailableError,
} from './booking.errors';
import type { CreateBookingCommand, CreatedBooking } from './booking.types';
import { CustomerRepository } from './customer.repository';
import type {
  ActiveAppointmentStepRecord,
  BusinessHoursRecord,
  ProviderAvailabilityRecord,
  ProviderSkillRecord,
  PublicBusinessSchedulingContext,
  ServiceRecord,
} from './scheduling.types';

interface AppointmentRow {
  id: string;
  createdAt: Date;
}

interface IdempotentAppointmentRow {
  id: string;
  requestFingerprint: string;
  managementTokenExpiresAt: Date;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
}

interface IdempotentAppointmentStepRow {
  sequenceNumber: number;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class BookingRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly notifications: NotificationOutboxRepository,
    private readonly customers: CustomerRepository,
  ) {}

  async create(
    scope: TenantScope,
    context: PublicBusinessSchedulingContext,
    command: CreateBookingCommand,
  ): Promise<CreatedBooking> {
    try {
      return await this.database.transaction(scope, (transaction) =>
        this.createInTransaction(transaction, context, command),
      );
    } catch (error) {
      if (!isIdempotencyUniqueViolation(error)) throw error;
      const replay = await this.database.transaction(scope, (transaction) =>
        this.findIdempotentBooking(transaction, command),
      );
      if (replay) return replay;
      throw error;
    }
  }

  private async createInTransaction(
    transaction: TenantTransaction,
    context: PublicBusinessSchedulingContext,
    command: CreateBookingCommand,
  ): Promise<CreatedBooking> {
    const replay = await this.findIdempotentBooking(transaction, command);
    if (replay) return replay;

    let localDay: { rangeStart: Date; rangeEnd: Date };
    try {
      localDay = localDateRangeToInstants(command.date, context.timezone);
    } catch (error) {
      if (!(error instanceof SchedulerInputError)) throw error;
      throw new InvalidBookingDateError(error.message);
    }
    if (
      command.startsAt < localDay.rangeStart ||
      command.startsAt >= localDay.rangeEnd
    ) {
      throw new InvalidBookingDateError(
        'Selected start time is outside the requested local date',
      );
    }

    const activeServices = await transaction.query<ServiceRecord>(
      `select id,
              name::text as name,
              duration_minutes as "durationMinutes",
              price_minor as "priceMinor",
              currency
       from services
       where business_id = $1
         and id = any($2::uuid[])
         and active
       order by id`,
      [[...new Set(command.serviceIds)]],
    );
    const serviceById = new Map(activeServices.map((service) => [service.id, service]));
    const selectedServices = command.serviceIds.map((serviceId) =>
      serviceById.get(serviceId),
    );
    if (selectedServices.some((service) => service === undefined)) {
      throw new InvalidServiceSelectionError(
        'One or more selected services are unavailable',
      );
    }
    const services = selectedServices.flatMap((service) =>
      service
        ? [{ serviceId: service.id, durationMinutes: service.durationMinutes }]
        : [],
    );
    const currencies = new Set(selectedServices.map((service) => service?.currency));
    if (currencies.size !== 1) {
      throw new InvalidServiceSelectionError(
        'Selected services must use one currency',
      );
    }

    const businessHours = await transaction.query<BusinessHoursRecord>(
      `select iso_weekday as "isoWeekday",
              starts_at::text as "startsAt",
              ends_at::text as "endsAt"
       from location_business_hours
       where business_id = $1
         and location_id = $2
       order by iso_weekday, starts_at`,
      [context.locationId],
    );
    const providerSkills = await transaction.query<ProviderSkillRecord>(
      `select ps.provider_user_id as "providerUserId",
              ps.service_id as "serviceId"
       from provider_skills ps
       join business_memberships bm
         on bm.business_id = ps.business_id
        and bm.user_id = ps.provider_user_id
       join users u on u.id = bm.user_id
       where ps.business_id = $1
         and ps.service_id = any($2::uuid[])
         and bm.disabled_at is null
         and u.disabled_at is null
       order by ps.service_id, ps.provider_user_id`,
      [[...new Set(command.serviceIds)]],
    );
    const providerAvailability =
      await transaction.query<ProviderAvailabilityRecord>(
        `select provider_user_id as "providerUserId",
                kind,
                starts_at as "startsAt",
                ends_at as "endsAt"
         from provider_availability
         where business_id = $1
           and location_id = $2
           and tstzrange(starts_at, ends_at, '[)')
               && tstzrange($3::timestamptz, $4::timestamptz, '[)')
         order by provider_user_id, starts_at, kind`,
        [context.locationId, localDay.rangeStart, localDay.rangeEnd],
      );
    const reservations =
      await transaction.query<ActiveAppointmentStepRecord>(
        `select appointment_id as "appointmentId",
                provider_user_id as "providerUserId",
                starts_at as "startsAt",
                ends_at as "endsAt"
         from appointment_steps
         where business_id = $1
           and location_id = $2
           and status in ('Scheduled', 'InProgress')
           and tstzrange(starts_at, ends_at, '[)')
               && tstzrange($3::timestamptz, $4::timestamptz, '[)')
         order by starts_at, provider_user_id, appointment_id`,
        [context.locationId, localDay.rangeStart, localDay.rangeEnd],
      );
    const schedulingResult = findCompoundAppointmentPlans({
      timezone: context.timezone,
      rangeStart: command.startsAt,
      rangeEnd: localDay.rangeEnd,
      services,
      businessHours,
      providerSkills,
      providerAvailability,
      reservations,
      maxPlans: 1,
    });
    const plan = schedulingResult.plans[0];
    if (!plan || plan.startsAt.getTime() !== command.startsAt.getTime()) {
      throw new PlanNoLongerAvailableError('Selected plan is no longer available');
    }

    const customer = await this.customers.findOrCreate(
      transaction,
      command.customer,
    );
    const customerId = customer.id;

    const totalPriceMinor = selectedServices.reduce(
      (sum, service) => sum + (service?.priceMinor ?? 0),
      0,
    );
    const currency = selectedServices[0]?.currency ?? 'ILS';
    const appointmentRows = await transaction.query<AppointmentRow>(
      `insert into appointments
         (business_id, location_id, customer_id, status, starts_at, ends_at,
          total_price_minor, currency, notes, idempotency_key,
          idempotency_request_fingerprint, management_token_hash,
          management_token_expires_at)
       values ($1, $2, $3, 'Confirmed', $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id, created_at as "createdAt"`,
      [
        context.locationId,
        customerId,
        plan.startsAt,
        plan.endsAt,
        totalPriceMinor,
        currency,
        command.notes ?? null,
        command.idempotencyKey,
        command.requestFingerprint,
        command.managementTokenHash,
        command.managementTokenExpiresAt,
      ],
    );
    const appointment = appointmentRows[0];
    if (!appointment) throw new Error('Appointment insert did not return an ID');
    const appointmentId = appointment.id;

    for (const step of plan.steps) {
      const service = selectedServices[step.sequenceNumber - 1];
      if (!service) throw new Error('Scheduled service snapshot is missing');
      await transaction.query(
        `insert into appointment_steps
           (business_id, location_id, appointment_id, service_id,
            provider_user_id, sequence_number, status, starts_at, ends_at,
            service_name_snapshot, duration_minutes_snapshot,
            price_minor_snapshot, currency_snapshot)
         values ($1, $2, $3, $4, $5, $6, 'Scheduled', $7, $8, $9, $10, $11, $12)`,
        [
          context.locationId,
          appointmentId,
          service.id,
          step.providerUserId,
          step.sequenceNumber,
          step.startsAt,
          step.endsAt,
          service.name,
          service.durationMinutes,
          service.priceMinor,
          service.currency,
        ],
      );
    }

    await this.notifications.enqueueBooking(transaction, {
      appointmentId,
      appointmentCreatedAt: appointment.createdAt,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      businessName: context.businessName,
      timezone: context.timezone,
      customerFirstName: customer.firstName,
      customerEmail: customer.email ?? undefined,
      customerPhoneE164: customer.phoneE164,
      steps: plan.steps.map((step) => {
        const service = selectedServices[step.sequenceNumber - 1];
        if (!service) throw new Error('Notification service snapshot is missing');
        return {
          sequenceNumber: step.sequenceNumber,
          serviceName: service.name,
          providerUserId: step.providerUserId,
          startsAt: step.startsAt,
          endsAt: step.endsAt,
        };
      }),
    });

    return {
      appointmentId,
      status: 'Confirmed',
      managementTokenExpiresAt: command.managementTokenExpiresAt,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      totalPriceMinor,
      currency,
      steps: plan.steps.map((step) => ({
        sequenceNumber: step.sequenceNumber,
        serviceId: step.serviceId,
        startsAt: step.startsAt,
        endsAt: step.endsAt,
      })),
    };
  }

  private async findIdempotentBooking(
    transaction: TenantTransaction,
    command: Pick<CreateBookingCommand, 'idempotencyKey' | 'requestFingerprint'>,
  ): Promise<CreatedBooking | null> {
    const appointmentRows = await transaction.query<IdempotentAppointmentRow>(
      `select id,
              idempotency_request_fingerprint as "requestFingerprint",
              management_token_expires_at as "managementTokenExpiresAt",
              starts_at as "startsAt",
              ends_at as "endsAt",
              total_price_minor as "totalPriceMinor",
              currency
       from appointments
       where business_id = $1
         and idempotency_key = $2`,
      [command.idempotencyKey],
    );
    const appointment = appointmentRows[0];
    if (!appointment) return null;
    if (appointment.requestFingerprint !== command.requestFingerprint) {
      throw new IdempotencyKeyReusedError(
        'Idempotency key was already used for a different booking request',
      );
    }

    const steps = await transaction.query<IdempotentAppointmentStepRow>(
      `select sequence_number as "sequenceNumber",
              service_id as "serviceId",
              starts_at as "startsAt",
              ends_at as "endsAt"
       from appointment_steps
       where business_id = $1
         and appointment_id = $2
       order by sequence_number`,
      [appointment.id],
    );
    return {
      appointmentId: appointment.id,
      status: 'Confirmed',
      managementTokenExpiresAt: appointment.managementTokenExpiresAt,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      totalPriceMinor: appointment.totalPriceMinor,
      currency: appointment.currency,
      steps,
    };
  }
}

function isIdempotencyUniqueViolation(
  error: unknown,
): error is { code: '23505'; constraint: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'appointments_business_idempotency_unique'
  );
}
