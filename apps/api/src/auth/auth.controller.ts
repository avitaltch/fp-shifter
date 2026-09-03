import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Body,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthCookieService } from './auth-cookie.service';
import { CurrentPrincipal, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { AuthPrincipal } from './auth.types';
import { AuthSessionResponseDto } from './dto/auth-session-response.dto';
import { LoginDto } from './dto/login.dto';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags('authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate a staff member' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiConflictResponse({ description: 'A business selection is required' })
  @ApiTooManyRequestsResponse({ description: 'Login rate limit exceeded' })
  async login(
    @Body() request: LoginDto,
    @Ip() clientAddress: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<AuthSessionResponseDto> {
    const session = await this.auth.login(request, clientAddress);
    response.setHeader('Set-Cookie', this.cookies.serialize(session.refreshToken));
    return session.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({ summary: 'Rotate the refresh session and issue a new access token' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh session is invalid' })
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<AuthSessionResponseDto> {
    const refreshToken = this.cookies.read(cookieHeader);
    if (!refreshToken) {
      response.setHeader('Set-Cookie', this.cookies.clear());
      throw invalidRefreshSession();
    }
    try {
      const session = await this.auth.refresh(refreshToken);
      response.setHeader('Set-Cookie', this.cookies.serialize(session.refreshToken));
      return session.response;
    } catch (error) {
      response.setHeader('Set-Cookie', this.cookies.clear());
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  @ApiNoContentResponse()
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<void> {
    const refreshToken = this.cookies.read(cookieHeader);
    if (refreshToken) await this.auth.revoke(refreshToken);
    response.setHeader('Set-Cookie', this.cookies.clear());
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Read the authenticated user and active membership' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        user: { $ref: '#/components/schemas/AuthUserDto' },
        business: { $ref: '#/components/schemas/AuthBusinessDto' },
      },
    },
  })
  me(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.auth.me(principal);
  }
}

function invalidRefreshSession(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_REFRESH_SESSION',
    message: 'The session is no longer valid',
  });
}
