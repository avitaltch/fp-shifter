export interface BookingCustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phoneE164: string;
}

export interface CreateBookingCommand {
  idempotencyKey: string;
  requestFingerprint: string;
  managementTokenHash: string;
  managementTokenExpiresAt: Date;
  date: string;
  startsAt: Date;
  serviceIds: readonly string[];
  customer: BookingCustomerInput;
  notes?: string;
}

export interface CreatedBookingStep {
  sequenceNumber: number;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CreatedBooking {
  appointmentId: string;
  status: 'Confirmed';
  managementTokenExpiresAt: Date;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
  steps: readonly CreatedBookingStep[];
}
