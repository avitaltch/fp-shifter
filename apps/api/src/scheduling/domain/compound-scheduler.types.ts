import type {
  ActiveAppointmentStepRecord,
  BusinessHoursRecord,
  ProviderAvailabilityRecord,
  ProviderSkillRecord,
} from '../scheduling.types';

export interface RequestedServiceStep {
  serviceId: string;
  durationMinutes: number;
  preferredProviderUserId?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
}

export interface CompoundSchedulingInput {
  timezone: string;
  rangeStart: Date;
  rangeEnd: Date;
  services: readonly RequestedServiceStep[];
  businessHours: readonly BusinessHoursRecord[];
  providerSkills: readonly ProviderSkillRecord[];
  providerAvailability: readonly ProviderAvailabilityRecord[];
  reservations: readonly ActiveAppointmentStepRecord[];
  slotIntervalMinutes?: number;
  maxPlans?: number;
  maxSearchNodes?: number;
}

export interface AppointmentPlanStep {
  sequenceNumber: number;
  serviceId: string;
  providerUserId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface AppointmentPlan {
  startsAt: Date;
  endsAt: Date;
  handoffCount: number;
  steps: readonly AppointmentPlanStep[];
}

export type SchedulingDiagnosticCode =
  | 'INVALID_TIMEZONE'
  | 'NO_BUSINESS_HOURS'
  | 'NO_QUALIFIED_PROVIDER'
  | 'PROVIDERS_UNAVAILABLE'
  | 'SEARCH_LIMIT_REACHED'
  | 'NO_VALID_PLAN';

export interface SchedulingDiagnostic {
  code: SchedulingDiagnosticCode;
  serviceSequence?: number;
}

export interface CompoundSchedulingResult {
  plans: readonly AppointmentPlan[];
  diagnostics: readonly SchedulingDiagnostic[];
  searchNodes: number;
  truncated: boolean;
}
