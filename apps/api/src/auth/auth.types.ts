export type MembershipRole = 'Owner' | 'Manager' | 'Provider';

export interface AuthPrincipal {
  sessionId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  businessId: string;
  businessSlug: string;
  membershipId: string;
  role: MembershipRole;
}

export interface AuthenticatedRequest {
  auth?: AuthPrincipal;
  get(name: string): string | undefined;
}

export interface LoginCandidate extends Omit<AuthPrincipal, 'sessionId'> {
  passwordHash: string;
}
