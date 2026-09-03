import type { MembershipRole } from '../auth/auth.types';
import type { AvailabilityKind } from '../scheduling/scheduling.types';

export interface LocationConfiguration {
  id: string;
  name: string;
  timezone: string;
  address: string | null;
  isPrimary: boolean;
}

export interface ServiceConfiguration {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}

export interface ProviderConfiguration {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: MembershipRole;
  disabledAt: Date | null;
  serviceIds: string[];
}

export type ActiveProviderConfiguration = Omit<ProviderConfiguration, 'disabledAt'>;

export interface BusinessHoursConfiguration {
  id: string;
  isoWeekday: number;
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityConfiguration {
  id: string;
  locationId: string;
  providerUserId: string;
  kind: AvailabilityKind;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
}

export interface AvailabilityInput {
  locationId: string;
  kind: AvailabilityKind;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
}

export type ConfigurationAuditAction =
  | 'location.created'
  | 'location.updated'
  | 'location.deleted'
  | 'service.created'
  | 'service.updated'
  | 'service.deactivated'
  | 'provider.skills_replaced'
  | 'location.hours_replaced'
  | 'provider.availability_created'
  | 'provider.availability_deleted';
