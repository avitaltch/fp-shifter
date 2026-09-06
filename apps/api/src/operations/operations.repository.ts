import { Injectable } from '@nestjs/common';
import { OperatorAuditRepository } from '../audit/operator-audit.repository';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../database/tenant-database.service';
import type { TenantScope } from '../tenancy/tenant-scope';
import { OperationConflictError } from './operations.errors';
import type {
  OperatorAppointment,
  OperatorAppointmentStep,
  OperatorStepStatus,
  ProviderStep,
  ReassignmentOption,
  ReassignmentReason,
} from './operations.types';

interface AppointmentRow extends Omit<OperatorAppointment, 'steps'> {}

interface ReassignmentCandidateRow {
  providerUserId: string;
  firstName: string;
  lastName: string;
  qualified: boolean;
  available: boolean;
  unavailable: boolean;
  conflict: boolean;
}

interface ReassignmentStepRow {
  id: string;
  appointmentId: string;
  serviceId: string;
  providerUserId: string;
  locationId: string;
  status: OperatorStepStatus;
  appointmentStatus: string;
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class OperationsRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: OperatorAuditRepository,
  ) {}

  async listAppointments(
    scope: TenantScope,
    from: Date,
    to: Date,
    locationId?: string,
  ): Promise<readonly OperatorAppointment[]> {
    return this.database.transaction(scope, async (transaction) => {
      const appointments = await transaction.query<AppointmentRow>(
        `select a.id,
                a.status,
                a.starts_at as "startsAt",
                a.ends_at as "endsAt",
                a.total_price_minor as "totalPriceMinor",
                a.currency,
                a.notes,
                l.id as "locationId",
                l.name as "locationName",
                l.timezone,
                c.first_name as "customerFirstName",
                c.last_name as "customerLastName",
                c.email::text as "customerEmail",
                c.phone_e164 as "customerPhoneE164"
         from appointments a
         join locations l on l.business_id = a.business_id and l.id = a.location_id
         join customers c on c.business_id = a.business_id and c.id = a.customer_id
         where a.business_id = $1
           and a.starts_at < $3
           and a.ends_at > $2
           and ($4::uuid is null or a.location_id = $4)
         order by a.starts_at, a.id`,
        [from, to, locationId ?? null],
      );
      if (appointments.length === 0) return [];
      const steps = await this.listSteps(
        transaction,
        appointments.map(({ id }) => id),
      );
      const byAppointment = new Map<string, OperatorAppointmentStep[]>();
      for (const step of steps) {
        const appointmentSteps = byAppointment.get(step.appointmentId) ?? [];
        appointmentSteps.push(step);
        byAppointment.set(step.appointmentId, appointmentSteps);
      }
      return appointments.map((appointment) => ({
        ...appointment,
        steps: byAppointment.get(appointment.id) ?? [],
      }));
    });
  }

  listProviderSteps(
    scope: TenantScope,
    providerUserId: string,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderStep[]> {
    return this.database.query<ProviderStep>(
      scope,
      `select s.id,
              s.appointment_id as "appointmentId",
              s.sequence_number as "sequenceNumber",
              s.status,
              s.service_id as "serviceId",
              s.service_name_snapshot as "serviceName",
              s.provider_user_id as "providerUserId",
              u.first_name as "providerFirstName",
              u.last_name as "providerLastName",
              s.starts_at as "startsAt",
              s.ends_at as "endsAt",
              a.status as "appointmentStatus",
              l.id as "locationId",
              l.name as "locationName",
              l.timezone,
              c.first_name as "customerFirstName",
              c.last_name as "customerLastName"
       from appointment_steps s
       join appointments a on a.business_id = s.business_id and a.id = s.appointment_id
       join locations l on l.business_id = s.business_id and l.id = s.location_id
       join customers c on c.business_id = s.business_id and c.id = a.customer_id
       join users u on u.id = s.provider_user_id
       where s.business_id = $1
         and s.provider_user_id = $2
         and s.starts_at < $4
         and s.ends_at > $3
       order by s.starts_at, s.id`,
      [providerUserId, from, to],
    );
  }

  async listReassignmentOptions(
    scope: TenantScope,
    stepId: string,
  ): Promise<readonly ReassignmentOption[] | null> {
    return this.database.transaction(scope, async (transaction) => {
      const step = await this.findReassignmentStep(transaction, stepId);
      if (!step) return null;
      const candidates = await this.findCandidates(transaction, step);
      return candidates.map(toReassignmentOption);
    });
  }

  async reassignStep(
    scope: TenantScope,
    actorUserId: string,
    stepId: string,
    providerUserId: string,
  ): Promise<OperatorAppointmentStep | null> {
    return this.database.transaction(scope, async (transaction) => {
      const step = await this.findReassignmentStep(transaction, stepId, true);
      if (!step) return null;
      assertStepCanBeReassigned(step);
      await transaction.query(
        `select user_id
         from business_memberships
         where business_id = $1 and user_id = $2
         for update`,
        [providerUserId],
      );
      const candidate = (await this.findCandidates(transaction, step)).find(
        (entry) => entry.providerUserId === providerUserId,
      );
      if (!candidate) {
        throw new OperationConflictError(
          'PROVIDER_NOT_AVAILABLE',
          'The selected provider is not active in this business',
        );
      }
      const option = toReassignmentOption(candidate);
      if (!option.eligible) {
        throw new OperationConflictError(
          'PROVIDER_NOT_AVAILABLE',
          `The selected provider is not eligible: ${option.reasons.join(', ')}`,
        );
      }
      const [updated] = await transaction.query<OperatorAppointmentStep>(
        `update appointment_steps s
         set provider_user_id = $3
         from users u
         where s.business_id = $1
           and s.id = $2
           and u.id = $3
         returning s.id,
                   s.sequence_number as "sequenceNumber",
                   s.status,
                   s.service_id as "serviceId",
                   s.service_name_snapshot as "serviceName",
                   s.provider_user_id as "providerUserId",
                   u.first_name as "providerFirstName",
                   u.last_name as "providerLastName",
                   s.starts_at as "startsAt",
                   s.ends_at as "endsAt"`,
        [stepId, providerUserId],
      );
      if (!updated) return null;
      await this.audit.record(
        transaction,
        actorUserId,
        'appointment.step_reassigned',
        'appointment_step',
        stepId,
        { appointmentId: step.appointmentId, fromProviderUserId: step.providerUserId, toProviderUserId: providerUserId },
      );
      return updated;
    });
  }

  async updateStepStatus(
    scope: TenantScope,
    actorUserId: string,
    stepId: string,
    status: 'InProgress' | 'Completed',
    restrictToProviderUserId?: string,
  ): Promise<ProviderStep | null> {
    return this.database.transaction(scope, async (transaction) => {
      const [current] = await transaction.query<ProviderStep>(
        `select s.id,
                s.appointment_id as "appointmentId",
                s.status,
                s.provider_user_id as "providerUserId",
                a.status as "appointmentStatus"
         from appointment_steps s
         join appointments a on a.business_id = s.business_id and a.id = s.appointment_id
         where s.business_id = $1
           and s.id = $2
           and ($3::uuid is null or s.provider_user_id = $3)
         for update of s, a`,
        [stepId, restrictToProviderUserId ?? null],
      );
      if (!current) return null;
      assertStepStatusTransition(current.status, status, current.appointmentStatus);
      await transaction.query(
        `update appointment_steps
         set status = $3::appointment_step_status
         where business_id = $1 and id = $2`,
        [stepId, status],
      );
      const [summary] = await transaction.query<{ allCompleted: boolean }>(
        `select bool_and(status = 'Completed') as "allCompleted"
         from appointment_steps
         where business_id = $1 and appointment_id = $2`,
        [current.appointmentId],
      );
      if (summary?.allCompleted) {
        await transaction.query(
          `update appointments
           set status = 'Completed'
           where business_id = $1 and id = $2`,
          [current.appointmentId],
        );
      }
      await this.audit.record(
        transaction,
        actorUserId,
        'appointment.step_status_changed',
        'appointment_step',
        stepId,
        { appointmentId: current.appointmentId, from: current.status, to: status },
      );
      const [updated] = await this.listProviderStepsByIds(transaction, [stepId]);
      return updated ?? null;
    });
  }

  private listSteps(
    transaction: TenantTransaction,
    appointmentIds: readonly string[],
  ): Promise<readonly (OperatorAppointmentStep & { appointmentId: string })[]> {
    return transaction.query(
      `select s.id,
              s.appointment_id as "appointmentId",
              s.sequence_number as "sequenceNumber",
              s.status,
              s.service_id as "serviceId",
              s.service_name_snapshot as "serviceName",
              s.provider_user_id as "providerUserId",
              u.first_name as "providerFirstName",
              u.last_name as "providerLastName",
              s.starts_at as "startsAt",
              s.ends_at as "endsAt"
       from appointment_steps s
       join users u on u.id = s.provider_user_id
       where s.business_id = $1
         and s.appointment_id = any($2::uuid[])
       order by s.appointment_id, s.sequence_number`,
      [appointmentIds],
    );
  }

  private listProviderStepsByIds(
    transaction: TenantTransaction,
    stepIds: readonly string[],
  ): Promise<readonly ProviderStep[]> {
    return transaction.query(
      `select s.id,
              s.appointment_id as "appointmentId",
              s.sequence_number as "sequenceNumber",
              s.status,
              s.service_id as "serviceId",
              s.service_name_snapshot as "serviceName",
              s.provider_user_id as "providerUserId",
              u.first_name as "providerFirstName",
              u.last_name as "providerLastName",
              s.starts_at as "startsAt",
              s.ends_at as "endsAt",
              a.status as "appointmentStatus",
              l.id as "locationId",
              l.name as "locationName",
              l.timezone,
              c.first_name as "customerFirstName",
              c.last_name as "customerLastName"
       from appointment_steps s
       join appointments a on a.business_id = s.business_id and a.id = s.appointment_id
       join locations l on l.business_id = s.business_id and l.id = s.location_id
       join customers c on c.business_id = s.business_id and c.id = a.customer_id
       join users u on u.id = s.provider_user_id
       where s.business_id = $1 and s.id = any($2::uuid[])`,
      [stepIds],
    );
  }

  private async findReassignmentStep(
    transaction: TenantTransaction,
    stepId: string,
    lock = false,
  ): Promise<ReassignmentStepRow | null> {
    const [step] = await transaction.query<ReassignmentStepRow>(
      `select s.id,
              s.appointment_id as "appointmentId",
              s.service_id as "serviceId",
              s.provider_user_id as "providerUserId",
              s.location_id as "locationId",
              s.status,
              a.status as "appointmentStatus",
              s.starts_at as "startsAt",
              s.ends_at as "endsAt"
       from appointment_steps s
       join appointments a on a.business_id = s.business_id and a.id = s.appointment_id
       where s.business_id = $1 and s.id = $2
       ${lock ? 'for update of s, a' : ''}`,
      [stepId],
    );
    return step ?? null;
  }

  private findCandidates(
    transaction: TenantTransaction,
    step: ReassignmentStepRow,
  ): Promise<readonly ReassignmentCandidateRow[]> {
    return transaction.query(
      `select bm.user_id as "providerUserId",
              u.first_name as "firstName",
              u.last_name as "lastName",
              exists (
                select 1 from provider_skills ps
                where ps.business_id = bm.business_id
                  and ps.provider_user_id = bm.user_id
                  and ps.service_id = $2
              ) as qualified,
              exists (
                select 1 from provider_availability pa
                where pa.business_id = bm.business_id
                  and pa.provider_user_id = bm.user_id
                  and pa.location_id = $3
                  and pa.kind = 'Available'
                  and tstzrange(pa.starts_at, pa.ends_at, '[)')
                      @> tstzrange($4::timestamptz, $5::timestamptz, '[)')
              ) as available,
              exists (
                select 1 from provider_availability pa
                where pa.business_id = bm.business_id
                  and pa.provider_user_id = bm.user_id
                  and pa.location_id = $3
                  and pa.kind = 'Unavailable'
                  and tstzrange(pa.starts_at, pa.ends_at, '[)')
                      && tstzrange($4::timestamptz, $5::timestamptz, '[)')
              ) as unavailable,
              exists (
                select 1 from appointment_steps occupied
                where occupied.business_id = bm.business_id
                  and occupied.provider_user_id = bm.user_id
                  and occupied.id <> $6
                  and occupied.status in ('Scheduled', 'InProgress')
                  and tstzrange(occupied.starts_at, occupied.ends_at, '[)')
                      && tstzrange($4::timestamptz, $5::timestamptz, '[)')
              ) as conflict
       from business_memberships bm
       join users u on u.id = bm.user_id
       where bm.business_id = $1
         and bm.disabled_at is null
         and u.disabled_at is null
       order by u.first_name, u.last_name, bm.user_id`,
      [step.serviceId, step.locationId, step.startsAt, step.endsAt, step.id],
    );
  }
}

function toReassignmentOption(candidate: ReassignmentCandidateRow): ReassignmentOption {
  const reasons: ReassignmentReason[] = [];
  if (!candidate.qualified) reasons.push('NOT_QUALIFIED');
  if (!candidate.available) reasons.push('NO_COVERING_AVAILABILITY');
  if (candidate.unavailable) reasons.push('MARKED_UNAVAILABLE');
  if (candidate.conflict) reasons.push('SCHEDULE_CONFLICT');
  return {
    providerUserId: candidate.providerUserId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    eligible: reasons.length === 0,
    reasons,
  };
}

function assertStepCanBeReassigned(step: ReassignmentStepRow): void {
  if (
    step.status !== 'Scheduled' ||
    ['Cancelled', 'Completed'].includes(step.appointmentStatus) ||
    step.startsAt <= new Date()
  ) {
    throw new OperationConflictError(
      'REASSIGNMENT_NOT_ALLOWED',
      'Only future scheduled steps on active appointments can be reassigned',
    );
  }
}

function assertStepStatusTransition(
  current: OperatorStepStatus,
  requested: 'InProgress' | 'Completed',
  appointmentStatus: string,
): void {
  const valid =
    !['Cancelled', 'Completed'].includes(appointmentStatus) &&
    ((current === 'Scheduled' && requested === 'InProgress') ||
      ((current === 'Scheduled' || current === 'InProgress') && requested === 'Completed'));
  if (!valid) {
    throw new OperationConflictError(
      'STEP_STATUS_TRANSITION_INVALID',
      `Step cannot move from ${current} to ${requested}`,
    );
  }
}
