export type MembershipRole = 'Owner' | 'Manager' | 'Provider';

export interface AuthPrincipal {
  sessionId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  businessId: string;
  businessSlug: string;
  membershipId: string;
  role: MembershipRole;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest {
  auth?: AuthPrincipal;
  get(name: string): string | undefined;
}

export interface LoginCandidate extends Omit<AuthPrincipal, 'sessionId'> {
  passwordHash: string;
}
