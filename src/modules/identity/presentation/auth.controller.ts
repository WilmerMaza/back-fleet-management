import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { Errors } from '../../../shared/common/app-error.js';
import { LoginUseCase } from '../application/login.use-case.js';
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
  refreshToken!: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;
}

class SwitchBusinessDto {
  @IsUUID()
  businessId!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly sessions: SessionIssuer,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  loginUser(@Body() body: LoginDto) {
    return this.login.execute(body);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshDto) {
    try {
      const payload = this.jwt.verify<{ sub: string; type?: string; activeBusinessId?: string }>(
        body.refreshToken,
      );
      if (payload.type !== 'refresh') {
        throw Errors.unauthorized();
      }
      return this.sessions.issue(payload.sub, body.businessId ?? payload.activeBusinessId);
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw Errors.unauthorized();
    }
  }

  @Post('switch-business')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  switchBusiness(@Body() body: SwitchBusinessDto, @CurrentContext() ctx: RequestContext) {
    return this.sessions.issue(ctx.userId, body.businessId);
  }
}
