/**
 * Endpoints de identidad: login, refresh rotativo, logout y switch-business.
 *
 * SEC-01: rate limiting por IP (y fallos login por IP+email) antes de Argon2/JWT.
 */
import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import type { Request } from 'express';
import {
  AuthRateLimiter,
  clientIpFromRequest,
} from '../../../shared/authorization/auth-rate-limiter.js';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { AppError } from '../../../shared/common/app-error.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import { SessionIssuer } from '../application/session.issuer.js';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;
}

class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

class SwitchBusinessDto {
  @IsUUID()
  businessId!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutSession: LogoutUseCase,
    private readonly sessions: SessionIssuer,
    private readonly rateLimiter: AuthRateLimiter,
  ) {}

  @Post('login')
  @HttpCode(200)
  async loginUser(@Body() body: LoginDto, @Req() req: Request) {
    const ip = clientIpFromRequest(req);
    this.rateLimiter.enforceLoginIp(ip);
    this.rateLimiter.enforceLoginAccount(ip, body.email);
    try {
      const session = await this.login.execute(body);
      this.rateLimiter.clearLoginAccount(ip, body.email);
      return session;
    } catch (error) {
      if (error instanceof AppError && error.code === 'UNAUTHORIZED') {
        this.rateLimiter.recordLoginFailure(ip, body.email);
      }
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshDto, @Req() req: Request) {
    this.rateLimiter.enforceRefreshIp(clientIpFromRequest(req));
    return this.refreshSession.execute(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: RefreshDto) {
    await this.logoutSession.execute(body.refreshToken);
  }

  @Post('switch-business')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  switchBusiness(@Body() body: SwitchBusinessDto, @CurrentContext() ctx: RequestContext) {
    return this.sessions.issue(ctx.userId, body.businessId);
  }
}
