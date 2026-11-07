import { Module } from '@nestjs/common';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { SessionIssuer } from './application/session.issuer.js';
import { AuthController } from './presentation/auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [LoginUseCase, SessionIssuer, RefreshSessionUseCase, LogoutUseCase],
})
export class IdentityModule {}
