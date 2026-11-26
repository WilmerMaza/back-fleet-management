import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AcceptInvitationUseCase } from './application/accept-invitation.use-case.js';
import { GetMeUseCase } from './application/get-me.use-case.js';
import { GoogleLoginUseCase } from './application/google-login.use-case.js';
import { GoogleTokenVerifier } from './application/google-token.verifier.js';
import { LinkGoogleUseCase } from './application/link-google.use-case.js';
import { GetOnboardingStatusUseCase } from './application/get-onboarding-status.use-case.js';
import { LoginUseCase } from './application/login.use-case.js';
import { RegisterBusinessUseCase } from './application/register-business.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { SessionIssuer } from './application/session.issuer.js';
import { SetPasswordUseCase } from './application/set-password.use-case.js';
import { SwitchBusinessUseCase } from './application/switch-business.use-case.js';
import { ValidateInvitationUseCase } from './application/validate-invitation.use-case.js';
import { InviteBusinessMemberUseCase } from './application/invite-business-member.use-case.js';
import { ListBusinessUsersUseCase } from './application/list-business-users.use-case.js';
import { GetBusinessUserUseCase } from './application/get-business-user.use-case.js';
import { UpdateBusinessUserUseCase } from './application/update-business-user.use-case.js';
import { UnlinkGoogleUseCase } from './application/unlink-google.use-case.js';
import { UpdateMeUseCase } from './application/update-me.use-case.js';
import { UpdateNotificationPreferencesUseCase } from './application/update-notification-preferences.use-case.js';
import { AuthController } from './presentation/auth.controller.js';
import { BusinessUsersController } from './presentation/business-users.controller.js';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [AuthController, BusinessUsersController],
  providers: [
    LoginUseCase,
    RegisterBusinessUseCase,
    GetOnboardingStatusUseCase,
    GoogleLoginUseCase,
    GoogleTokenVerifier,
    SessionIssuer,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetMeUseCase,
    LinkGoogleUseCase,
    SetPasswordUseCase,
    ValidateInvitationUseCase,
    AcceptInvitationUseCase,
    SwitchBusinessUseCase,
    UpdateMeUseCase,
    UnlinkGoogleUseCase,
    UpdateNotificationPreferencesUseCase,
    ListBusinessUsersUseCase,
    GetBusinessUserUseCase,
    UpdateBusinessUserUseCase,
    InviteBusinessMemberUseCase,
  ],
})
export class IdentityModule {}
