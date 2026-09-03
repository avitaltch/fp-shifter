import type { ManagedAppointmentStatus } from '../scheduling/appointment-management.types';

export type OperatorStepStatus =
  | 'Scheduled'
  | 'InProgress'
  | 'Completed'
  | 'Cancelled';

export interface OperatorAppointmentStep {
  id: string;
  sequenceNumber: number;
  status: OperatorStepStatus;
  serviceId: string;
  serviceName: string;
  providerUserId: string;
  providerFirstName: string;
  providerLastName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface OperatorAppointment {
  id: string;
  status: ManagedAppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
  notes: string | null;
  locationId: string;
  locationName: string;
  timezone: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string | null;
  customerPhoneE164: string;
  steps: readonly OperatorAppointmentStep[];
}

export interface ProviderStep extends OperatorAppointmentStep {
  appointmentId: string;
  appointmentStatus: ManagedAppointmentStatus;
  locationId: string;
  locationName: string;
  timezone: string;
  customerFirstName: string;
  customerLastName: string;
}

export interface ReassignmentOption {
  providerUserId: string;
  firstName: string;
  lastName: string;
  eligible: boolean;
  reasons: readonly ReassignmentReason[];
}

export type ReassignmentReason =
  | 'NOT_QUALIFIED'
  | 'NO_COVERING_AVAILABILITY'
  | 'MARKED_UNAVAILABLE'
  | 'SCHEDULE_CONFLICT';
