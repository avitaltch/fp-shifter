export type ManagedAppointmentStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Cancelled'
  | 'Completed'
  | 'RequiresAttention';

export interface ManagedAppointmentStep {
  sequenceNumber: number;
  serviceId: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ManagedAppointment {
  appointmentId: string;
  status: ManagedAppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
  customerFirstName: string;
  steps: readonly ManagedAppointmentStep[];
}
