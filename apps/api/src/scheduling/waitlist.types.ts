import type { BookingCustomerInput } from './booking.types';

export interface CreateWaitlistEntryCommand {
  windowStartsAt: Date;
  windowEndsAt: Date;
  serviceIds: readonly string[];
  customer: BookingCustomerInput;
  demandFingerprint: string;
}

export interface CreatedWaitlistEntry {
  waitlistEntryId: string;
  status: 'Active';
  windowStartsAt: Date;
  windowEndsAt: Date;
  serviceIds: readonly string[];
}

export interface AcceptedWaitlistOffer {
  appointmentId: string;
  status: 'Confirmed';
  managementToken: string;
  managementTokenExpiresAt: Date;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
  steps: readonly {
    sequenceNumber: number;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
  }[];
}
