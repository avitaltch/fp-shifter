import type { MembershipRole } from '../auth/auth.types';

export interface StaffMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  role: MembershipRole;
  disabledAt: Date | null;
  mustChangePassword: boolean;
  serviceIds: readonly string[];
}

export interface CreateStaffInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  role: Exclude<MembershipRole, 'Owner'>;
}

export type DeactivateStaffOutcome =
  | { status: 'updated'; staff: StaffMember }
  | { status: 'not_found' }
  | { status: 'future_assignments' };
