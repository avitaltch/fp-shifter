import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ROLES_KEY } from './auth.constants';
import type { AuthenticatedRequest, MembershipRole } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[]>(
      AUTH_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (principal && required.includes(principal.role)) return true;
    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: 'This action is not allowed for the current role',
    });
  }
}
