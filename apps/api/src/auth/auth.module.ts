import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { SecurityModule } from '../security/security.module';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthCookieService } from './auth-cookie.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [DatabaseModule, JwtModule.register({}), SecurityModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    PasswordService,
    AccessTokenService,
    AuthCookieService,
    AuthRateLimiterService,
    AuthService,
    AccessTokenGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
  exports: [AuthRepository, PasswordService, AccessTokenService],
})
export class AuthModule {}
