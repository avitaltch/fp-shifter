import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantScope } from '../tenancy/tenant-scope';
import { AppointmentManagementRepository } from './appointment-management.repository';
import type { ManagedAppointment } from './appointment-management.types';
import {
  AppointmentCancellationNotAllowedError,
  AppointmentCancellationTooLateError,
  AppointmentManagementTokenInvalidError,
} from './booking.errors';
import type { PublicManagedAppointmentResponseDto } from './dto/public-managed-appointment-response.dto';
import { ManagementTokenService } from './management-token.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';

const MANAGEMENT_TOKEN_PATTERN = /^sm_[A-Za-z0-9_-]{43}$/;

@Injectable()
export class PublicAppointmentManagementService {
  constructor(
    private readonly directory: PublicSchedulingRepository,
    private readonly appointments: AppointmentManagementRepository,
    private readonly tokens: ManagementTokenService,
  ) {}

  async get(
    businessSlug: string,
    authorization: string | undefined,
  ): Promise<PublicManagedAppointmentResponseDto> {
    const { scope, tokenHash, timezone } = await this.resolveAccess(
      businessSlug,
      authorization,
    );
    const appointment = await this.appointments.find(scope, tokenHash);
    if (!appointment) throw appointmentNotFound();
    return serializeAppointment(appointment, timezone);
  }

  async cancel(
    businessSlug: string,
    authorization: string | undefined,
  ): Promise<PublicManagedAppointmentResponseDto> {
    const { scope, tokenHash, timezone, businessName } = await this.resolveAccess(
      businessSlug,
      authorization,
    );
    try {
      return serializeAppointment(
        await this.appointments.cancel(scope, tokenHash, {
          businessName,
          timezone,
        }),
        timezone,
      );
    } catch (error) {
      if (error instanceof AppointmentManagementTokenInvalidError) {
        throw appointmentNotFound();
      }
      if (
        error instanceof AppointmentCancellationTooLateError ||
        error instanceof AppointmentCancellationNotAllowedError
      ) {
        throw new ConflictException({
          code: 'CANCELLATION_NOT_ALLOWED',
          message: error.message,
        });
      }
      throw error;
    }
  }

  private async resolveAccess(
    businessSlug: string,
    authorization: string | undefined,
  ): Promise<{
    scope: TenantScope;
    tokenHash: string;
    timezone: string;
    businessName: string;
  }> {
    const token = readBearerToken(authorization);
    if (!token) throw appointmentNotFound();
    const context = await this.directory.findBusinessBySlug(businessSlug);
    if (!context) throw appointmentNotFound();
    return {
      scope: TenantScope.forBusiness(context.businessId),
      tokenHash: this.tokens.hash(token),
      timezone: context.timezone,
      businessName: context.businessName,
    };
  }
}

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  return MANAGEMENT_TOKEN_PATTERN.test(token) ? token : null;
}

function appointmentNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'APPOINTMENT_NOT_FOUND',
    message: 'Appointment was not found',
  });
}

function serializeAppointment(
  appointment: ManagedAppointment,
  timezone: string,
): PublicManagedAppointmentResponseDto {
  return {
    appointmentId: appointment.appointmentId,
    status: appointment.status,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    totalPriceMinor: appointment.totalPriceMinor,
    currency: appointment.currency,
    timezone,
    customerFirstName: appointment.customerFirstName,
    steps: appointment.steps.map((step) => ({
      sequenceNumber: step.sequenceNumber,
      serviceId: step.serviceId,
      serviceName: step.serviceName,
      startsAt: step.startsAt.toISOString(),
      endsAt: step.endsAt.toISOString(),
    })),
  };
}
