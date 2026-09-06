import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessTokenService } from './access-token.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthRepository } from './auth.repository';
import type { AuthSessionResponseDto } from './dto/auth-session-response.dto';
import type { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import type { AuthPrincipal } from './auth.types';

export interface AuthSessionResult {
  response: AuthSessionResponseDto;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly rateLimiter: AuthRateLimiterService,
  ) {}

  async login(
    request: LoginDto,
    clientAddress: string,
  ): Promise<AuthSessionResult> {
    await this.rateLimiter.assertLoginAllowed(clientAddress, request.email);
    const candidates = await this.repository.findLoginCandidates(
      request.email,
      request.businessSlug,
    );
    const candidate = candidates[0];
    const passwordMatches = await this.passwords.verify(
      request.password,
      candidate?.passwordHash,
    );
    if (!candidate || !passwordMatches) {
      await this.repository.recordFailedLogin(request.email);
      this.logger.warn({ event: 'auth_login_failed', reason: 'invalid_credentials' });
      throw invalidCredentials();
    }
    if (!request.businessSlug && candidates.length > 1) {
      throw new ConflictException({
        code: 'BUSINESS_SELECTION_REQUIRED',
        message: 'Select a business to continue',
        details: {
          businesses: candidates.map(({ businessSlug }) => businessSlug),
        },
      });
    }

    const session = await this.repository.createSession(candidate);
    this.logger.log({
      event: 'auth_login_succeeded',
      userId: candidate.userId,
      businessId: candidate.businessId,
    });
    return this.toSessionResult(session.principal, session.refreshToken);
  }

  async refresh(refreshToken: string): Promise<AuthSessionResult> {
    const result = await this.repository.rotate(refreshToken);
    if (result.status !== 'rotated') {
      if (result.status === 'reused') {
        this.logger.warn({ event: 'auth_refresh_reuse_detected' });
      }
      throw invalidSession();
    }
    return this.toSessionResult(
      result.session.principal,
      result.session.refreshToken,
    );
  }

  revoke(refreshToken: string): Promise<void> {
    return this.repository.revoke(refreshToken);
  }

  async changePassword(
    principal: AuthPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const currentHash = await this.repository.readPasswordHash(principal.userId);
    if (!currentHash || !(await this.passwords.verify(currentPassword, currentHash))) {
      throw invalidCurrentPassword();
    }
    const newHash = await this.passwords.hash(newPassword);
    if (!(await this.repository.replacePassword(principal, currentHash, newHash))) {
      throw invalidCurrentPassword();
    }
  }

  me(principal: AuthPrincipal): Omit<AuthSessionResponseDto, 'accessToken' | 'expiresInSeconds'> {
    return this.principalResponse(principal);
  }

  private async toSessionResult(
    principal: AuthPrincipal,
    refreshToken: string,
  ): Promise<AuthSessionResult> {
    return {
      response: {
        ...(await this.accessTokens.issue(principal)),
        ...this.principalResponse(principal),
      },
      refreshToken,
    };
  }

  private principalResponse(principal: AuthPrincipal) {
    return {
      user: {
        id: principal.userId,
        email: principal.email,
        firstName: principal.firstName,
        lastName: principal.lastName,
        phoneE164: principal.phoneE164,
        mustChangePassword: principal.mustChangePassword,
      },
      business: {
        id: principal.businessId,
        slug: principal.businessSlug,
        role: principal.role,
      },
    };
  }
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Email or password is incorrect',
  });
}

function invalidSession(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_REFRESH_SESSION',
    message: 'The session is no longer valid',
  });
}

function invalidCurrentPassword(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'CURRENT_PASSWORD_INVALID',
    message: 'The current password is incorrect',
  });
}
