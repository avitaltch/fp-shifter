import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTH_PASSWORD_CHANGE_ALLOWED_KEY,
  AUTH_PUBLIC_KEY,
} from './auth.constants';
import type { AuthenticatedRequest } from './auth.types';
import { AccessTokenService } from './access-token.service';
import { AuthRepository } from './auth.repository';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly repository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(AUTH_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.get('authorization');
    const match = /^Bearer ([A-Za-z0-9._-]{1,4096})$/.exec(authorization ?? '');
    if (!match?.[1]) throw authenticationRequired();
    const payload = await this.tokens.verify(match[1]);
    const principal = await this.repository.resolvePrincipal({
      sessionId: payload.sid,
      userId: payload.sub,
      businessId: payload.bid,
    });
    if (!principal) throw authenticationRequired();
    request.auth = principal;
    const passwordChangeAllowed = this.reflector.getAllAndOverride<boolean>(
      AUTH_PASSWORD_CHANGE_ALLOWED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (principal.mustChangePassword && !passwordChangeAllowed) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change the temporary password before continuing',
      });
    }
    return true;
  }
}

function authenticationRequired(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication is required',
  });
}
