import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { AppointmentManagementRepository } from '../scheduling/appointment-management.repository';
import type { ManagedAppointment } from '../scheduling/appointment-management.types';
import {
  AppointmentCancellationNotAllowedError,
  AppointmentCancellationTooLateError,
} from '../scheduling/booking.errors';
import { TenantScope } from '../tenancy/tenant-scope';
import type {
  AppointmentFilterQueryDto,
  OperatorRangeQueryDto,
} from './dto/operations.dto';
import { OperationConflictError } from './operations.errors';
import { OperationsRepository } from './operations.repository';
import type {
  OperatorAppointment,
  OperatorAppointmentStep,
  ProviderStep,
  ReassignmentOption,
} from './operations.types';

const MAX_RANGE_MS = 93 * 86_400_000;

@Injectable()
export class OperationsService {
  constructor(
    private readonly repository: OperationsRepository,
    private readonly appointmentManagement: AppointmentManagementRepository,
  ) {}

  listAppointments(
    principal: AuthPrincipal,
    query: AppointmentFilterQueryDto,
  ): Promise<readonly OperatorAppointment[]> {
    const { from, to } = parseRange(query);
    return this.repository.listAppointments(
      scopeFor(principal),
      from,
      to,
      query.locationId,
    );
  }

  listMySteps(
    principal: AuthPrincipal,
    query: OperatorRangeQueryDto,
  ): Promise<readonly ProviderStep[]> {
    const { from, to } = parseRange(query);
    return this.repository.listProviderSteps(
      scopeFor(principal),
      principal.userId,
      from,
      to,
    );
  }

  async listReassignmentOptions(
    principal: AuthPrincipal,
    stepId: string,
  ): Promise<readonly ReassignmentOption[]> {
    const options = await this.repository.listReassignmentOptions(
      scopeFor(principal),
      stepId,
    );
    if (!options) throw notFound('STEP_NOT_FOUND', 'Appointment step was not found');
    return options;
  }

  async reassignStep(
    principal: AuthPrincipal,
    stepId: string,
    providerUserId: string,
  ): Promise<OperatorAppointmentStep> {
    try {
      const step = await this.repository.reassignStep(
        scopeFor(principal),
        principal.userId,
        stepId,
        providerUserId,
      );
      if (!step) throw notFound('STEP_NOT_FOUND', 'Appointment step was not found');
      return step;
    } catch (error) {
      rethrowOperationConflict(error);
    }
  }

  async updateStepStatus(
    principal: AuthPrincipal,
    stepId: string,
    status: 'InProgress' | 'Completed',
  ): Promise<ProviderStep> {
    try {
      const restrictToProvider = principal.role === 'Provider' ? principal.userId : undefined;
      const step = await this.repository.updateStepStatus(
        scopeFor(principal),
        principal.userId,
        stepId,
        status,
        restrictToProvider,
      );
      if (!step) throw notFound('STEP_NOT_FOUND', 'Appointment step was not found');
      return step;
    } catch (error) {
      rethrowOperationConflict(error);
    }
  }

  async cancelAppointment(
    principal: AuthPrincipal,
    appointmentId: string,
  ): Promise<ManagedAppointment> {
    try {
      const appointment = await this.appointmentManagement.cancelById(
        scopeFor(principal),
        appointmentId,
        principal.userId,
      );
      if (!appointment) {
        throw notFound('APPOINTMENT_NOT_FOUND', 'Appointment was not found');
      }
      return appointment;
    } catch (error) {
      rethrowOperationConflict(error);
    }
  }
}

function scopeFor(principal: AuthPrincipal): TenantScope {
  return TenantScope.forBusiness(principal.businessId);
}

function parseRange(query: OperatorRangeQueryDto): { from: Date; to: Date } {
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > MAX_RANGE_MS
  ) {
    throw new BadRequestException({
      code: 'OPERATOR_RANGE_INVALID',
      message: 'Range must be positive and no longer than 93 days',
    });
  }
  return { from, to };
}

function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}

function rethrowOperationConflict(error: unknown): never {
  if (error instanceof OperationConflictError) {
    throw new ConflictException({ code: error.code, message: error.message });
  }
  if (isProviderOverlap(error)) {
    throw new ConflictException({
      code: 'PROVIDER_SCHEDULE_CONFLICT',
      message: 'The provider already has work during this time',
    });
  }
  if (
    error instanceof AppointmentCancellationNotAllowedError ||
    error instanceof AppointmentCancellationTooLateError
  ) {
    throw new ConflictException({
      code: 'CANCELLATION_NOT_ALLOWED',
      message: error.message,
    });
  }
  throw error;
}

function isProviderOverlap(
  error: unknown,
): error is { code: '23P01'; constraint: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23P01' &&
    'constraint' in error &&
    error.constraint === 'appointment_steps_provider_no_overlap'
  );
}
