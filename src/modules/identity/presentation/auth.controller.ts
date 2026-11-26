/**
 * Endpoints de identidad: password, Google, refresh, logout, switch, me, link, set-password.
 *
 * SEC-01: rate limiting por IP (y fallos login por IP+email) antes de Argon2/JWT.
 * D4: refresh en cookie HttpOnly; access sigue en JSON + Bearer; CSRF en refresh/logout con cookie.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import {
  AuthRateLimiter,
  clientIpFromRequest,
} from '../../../shared/authorization/auth-rate-limiter.js';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { JwtUserGuard } from '../../../shared/authorization/jwt-user.guard.js';
import { AppError, Errors } from '../../../shared/common/app-error.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { AcceptInvitationUseCase } from '../application/accept-invitation.use-case.js';
import { GetMeUseCase } from '../application/get-me.use-case.js';
import { GoogleLoginUseCase } from '../application/google-login.use-case.js';
import { LinkGoogleUseCase } from '../application/link-google.use-case.js';
import { GetOnboardingStatusUseCase } from '../application/get-onboarding-status.use-case.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { RegisterBusinessUseCase } from '../application/register-business.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import { SessionIssuer } from '../application/session.issuer.js';
import { SwitchBusinessUseCase } from '../application/switch-business.use-case.js';
import { SetPasswordUseCase } from '../application/set-password.use-case.js';
import { UnlinkGoogleUseCase } from '../application/unlink-google.use-case.js';
import { UpdateMeUseCase } from '../application/update-me.use-case.js';
import {
  UpdateNotificationPreferencesUseCase,
} from '../application/update-notification-preferences.use-case.js';
import { ValidateInvitationUseCase } from '../application/validate-invitation.use-case.js';
import {
  assertCsrfForCookieAuth,
  attachSessionCookies,
  clearSessionCookies,
  refreshTokenFromRequest,
} from './auth-cookies.js';

class RegisterBusinessDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(2)
  businessName!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

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

class GoogleLoginDto {
  @IsString()
  @MinLength(1)
  idToken!: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  invitationToken?: string;
}

/** Body opcional: SPA usa cookie; tests/curl pueden mandar el token. */
class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}

class SwitchBusinessDto {
  @IsUUID()
  businessId!: string;
}

class LinkGoogleDto {
  @IsString()
  @MinLength(1)
  idToken!: string;
}

class SetPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  currentPassword?: string;
}

class UpdateMeDto {
  @IsString()
  @MinLength(2)
  fullName!: string;
}

class UnlinkGoogleDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;
}

class NotificationPreferencesDto {
  @IsBoolean()
  inAppOperational!: boolean;

  @IsBoolean()
  emailOperational!: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly registerBusiness: RegisterBusinessUseCase,
    private readonly getOnboardingStatus: GetOnboardingStatusUseCase,
    private readonly googleLogin: GoogleLoginUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutSession: LogoutUseCase,
    private readonly sessions: SessionIssuer,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly getMe: GetMeUseCase,
    private readonly linkGoogle: LinkGoogleUseCase,
    private readonly setPassword: SetPasswordUseCase,
    private readonly updateMe: UpdateMeUseCase,
    private readonly unlinkGoogleAccount: UnlinkGoogleUseCase,
    private readonly updateNotificationPrefs: UpdateNotificationPreferencesUseCase,
    private readonly validateInvitation: ValidateInvitationUseCase,
    private readonly acceptInvitation: AcceptInvitationUseCase,
    private readonly switchBusinessSession: SwitchBusinessUseCase,
  ) {}

  @Post('register')
  @HttpCode(200)
  async register(
    @Body() body: RegisterBusinessDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = clientIpFromRequest(req);
    this.rateLimiter.enforceLoginIp(ip);
    const session = await this.registerBusiness.execute(body);
    return attachSessionCookies(res, session);
  }

  @Get('onboarding/status')
  @UseGuards(JwtUserGuard)
  onboardingStatus(@CurrentContext() ctx: RequestContext) {
    return this.getOnboardingStatus.execute(ctx.userId);
  }

  @Post('login')
  @HttpCode(200)
  async loginUser(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = clientIpFromRequest(req);
    this.rateLimiter.enforceLoginIp(ip);
    this.rateLimiter.enforceLoginAccount(ip, body.email);
    try {
      const session = await this.login.execute(body);
      this.rateLimiter.clearLoginAccount(ip, body.email);
      return attachSessionCookies(res, session);
    } catch (error) {
      if (error instanceof AppError && error.code === 'UNAUTHORIZED') {
        this.rateLimiter.recordLoginFailure(ip, body.email);
      }
      throw error;
    }
  }

  @Post('google')
  @HttpCode(200)
  async loginGoogle(
    @Body() body: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = clientIpFromRequest(req);
    this.rateLimiter.enforceLoginIp(ip);
    const session = await this.googleLogin.execute(body);
    return attachSessionCookies(res, session);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: RefreshDto = {},
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.rateLimiter.enforceRefreshIp(clientIpFromRequest(req));
    const { token, fromCookie } = refreshTokenFromRequest(req, body?.refreshToken);
    assertCsrfForCookieAuth(req, fromCookie);
    const session = await this.refreshSession.execute(token);
    return attachSessionCookies(res, session);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: RefreshDto = {},
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, fromCookie } = refreshTokenFromRequest(req, body?.refreshToken);
    assertCsrfForCookieAuth(req, fromCookie);
    try {
      await this.logoutSession.execute(token);
    } finally {
      clearSessionCookies(res);
    }
  }

  @Post('switch-business')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async switchBusiness(
    @Body() body: SwitchBusinessDto,
    @CurrentContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!ctx.sessionFamilyId) {
      throw Errors.unauthorized();
    }
    const session = await this.switchBusinessSession.execute(
      ctx.userId,
      body.businessId,
      ctx.sessionFamilyId,
    );
    return attachSessionCookies(res, session);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentContext() ctx: RequestContext) {
    return this.getMe.execute(ctx);
  }

  @Post('link/google')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  linkGoogleAccount(@Body() body: LinkGoogleDto, @CurrentContext() ctx: RequestContext) {
    return this.linkGoogle.execute(ctx.userId, body.idToken);
  }

  @Post('set-password')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  setUserPassword(@Body() body: SetPasswordDto, @CurrentContext() ctx: RequestContext) {
    return this.setPassword.execute({
      userId: ctx.userId,
      password: body.password,
      currentPassword: body.currentPassword,
    });
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  patchMe(@Body() body: UpdateMeDto, @CurrentContext() ctx: RequestContext) {
    return this.updateMe.execute({ userId: ctx.userId, fullName: body.fullName });
  }

  @Patch('me/notifications')
  @UseGuards(AuthGuard)
  patchNotificationPreferences(
    @Body() body: NotificationPreferencesDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.updateNotificationPrefs.execute({
      userId: ctx.userId,
      preferences: body,
    });
  }

  @Post('unlink/google')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  unlinkGoogle(@Body() body: UnlinkGoogleDto, @CurrentContext() ctx: RequestContext) {
    return this.unlinkGoogleAccount.execute({
      userId: ctx.userId,
      currentPassword: body.currentPassword,
    });
  }

  @Get('invitations/:token')
  validateInvite(@Param('token') token: string) {
    return this.validateInvitation.execute(token);
  }

  @Post('invitations/:token/accept')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async acceptInvite(
    @Param('token') token: string,
    @CurrentContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.acceptInvitation.execute(ctx.userId, token);
    const publicSession = attachSessionCookies(res, result.session);
    return {
      businessId: result.businessId,
      businessName: result.businessName,
      roleCode: result.roleCode,
      session: publicSession,
    };
  }
}
