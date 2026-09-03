import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import {
  AUTH_PUBLIC_KEY,
  AUTH_ROLES_KEY,
} from './auth.constants';
import type { AuthenticatedRequest, AuthPrincipal, MembershipRole } from './auth.types';

export const Public = () => SetMetadata(AUTH_PUBLIC_KEY, true);
export const Roles = (...roles: MembershipRole[]) =>
  SetMetadata(AUTH_ROLES_KEY, roles);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw new Error('Authenticated principal is missing');
    return request.auth;
  },
);
