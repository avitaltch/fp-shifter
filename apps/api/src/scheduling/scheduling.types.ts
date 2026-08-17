export interface ServiceRecord {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
}

export interface ProviderSkillRecord {
  providerUserId: string;
  serviceId: string;
}

export interface BusinessHoursRecord {
  isoWeekday: number;
  startsAt: string;
  endsAt: string;
}

export type AvailabilityKind = 'Available' | 'Unavailable';

export interface ProviderAvailabilityRecord {
  providerUserId: string;
  kind: AvailabilityKind;
  startsAt: Date;
  endsAt: Date;
}

export interface ActiveAppointmentStepRecord {
  appointmentId: string;
  providerUserId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface PublicBusinessSchedulingContext {
  businessId: string;
  businessSlug: string;
  locationId: string;
  timezone: string;
}
