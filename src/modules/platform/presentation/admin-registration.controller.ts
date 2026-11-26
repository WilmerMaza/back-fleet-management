/**
 * Aprobación de solicitudes de registro empresarial (SUPER_ADMIN).
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { ApproveRegistrationRequestUseCase } from '../application/approve-registration-request.use-case.js';
import { ListRegistrationRequestsUseCase } from '../application/list-registration-requests.use-case.js';
import { RejectRegistrationRequestUseCase } from '../application/reject-registration-request.use-case.js';

class RejectRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller('admin/registration-requests')
@UseGuards(AuthGuard)
export class AdminRegistrationController {
  constructor(
    private readonly listRequests: ListRegistrationRequestsUseCase,
    private readonly approveRequest: ApproveRegistrationRequestUseCase,
    private readonly rejectRequest: RejectRegistrationRequestUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.PlatformBusinessesRead)
  list(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    if (status && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return this.listRequests.execute();
    }
    return this.listRequests.execute(status).then((data) => ({ data }));
  }

  @Post(':businessId/approve')
  @RequirePermission(Permission.PlatformBusinessesWrite)
  approve(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.approveRequest.execute({ businessId, reviewerUserId: ctx.userId });
  }

  @Post(':businessId/reject')
  @RequirePermission(Permission.PlatformBusinessesWrite)
  reject(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() body: RejectRegistrationDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.rejectRequest.execute({
      businessId,
      reviewerUserId: ctx.userId,
      reason: body.reason,
    });
  }
}
