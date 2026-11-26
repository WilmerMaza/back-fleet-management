import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CreatePlatformBusinessUseCase } from './application/create-platform-business.use-case.js';
import { CreatePlatformInvitationUseCase } from './application/create-platform-invitation.use-case.js';
import { ResendPlatformInvitationUseCase } from './application/resend-platform-invitation.use-case.js';
import { GetPlatformBusinessUseCase } from './application/get-platform-business.use-case.js';
import { ListPlatformBusinessesUseCase } from './application/list-businesses.use-case.js';
import { ListPlatformBusinessMembersUseCase } from './application/list-platform-business-members.use-case.js';
import { ListPlatformInvitationsUseCase } from './application/list-platform-invitations.use-case.js';
import { UpdatePlatformBusinessUseCase } from './application/update-platform-business.use-case.js';
import { ApproveRegistrationRequestUseCase } from './application/approve-registration-request.use-case.js';
import { ListRegistrationRequestsUseCase } from './application/list-registration-requests.use-case.js';
import { RejectRegistrationRequestUseCase } from './application/reject-registration-request.use-case.js';
import { AdminBusinessesController } from './presentation/admin-businesses.controller.js';
import { AdminRegistrationController } from './presentation/admin-registration.controller.js';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [AdminBusinessesController, AdminRegistrationController],
  providers: [
    ListPlatformBusinessesUseCase,
    GetPlatformBusinessUseCase,
    ListPlatformBusinessMembersUseCase,
    ListPlatformInvitationsUseCase,
    CreatePlatformBusinessUseCase,
    UpdatePlatformBusinessUseCase,
    CreatePlatformInvitationUseCase,
    ResendPlatformInvitationUseCase,
    ListRegistrationRequestsUseCase,
    ApproveRegistrationRequestUseCase,
    RejectRegistrationRequestUseCase,
  ],
})
export class PlatformModule {}
