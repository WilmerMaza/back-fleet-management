/**
 * Consola de plataforma: empresas, miembros e invitaciones (SUPER_ADMIN).
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { CreatePlatformBusinessUseCase } from '../application/create-platform-business.use-case.js';
import { CreatePlatformInvitationUseCase } from '../application/create-platform-invitation.use-case.js';
import { ResendPlatformInvitationUseCase } from '../application/resend-platform-invitation.use-case.js';
import { GetPlatformBusinessUseCase } from '../application/get-platform-business.use-case.js';
import { ListPlatformBusinessesUseCase } from '../application/list-businesses.use-case.js';
import { ListPlatformBusinessMembersUseCase } from '../application/list-platform-business-members.use-case.js';
import { ListPlatformInvitationsUseCase } from '../application/list-platform-invitations.use-case.js';
import { UpdatePlatformBusinessUseCase } from '../application/update-platform-business.use-case.js';

class CreateBusinessDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsEmail()
  adminEmail!: string;
}

class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  legalName?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  roleCode!: string;
}

@Controller('admin/businesses')
@UseGuards(AuthGuard)
export class AdminBusinessesController {
  constructor(
    private readonly listBusinesses: ListPlatformBusinessesUseCase,
    private readonly getBusiness: GetPlatformBusinessUseCase,
    private readonly listMembers: ListPlatformBusinessMembersUseCase,
    private readonly listInvitations: ListPlatformInvitationsUseCase,
    private readonly createBusiness: CreatePlatformBusinessUseCase,
    private readonly updateBusiness: UpdatePlatformBusinessUseCase,
    private readonly createInvitation: CreatePlatformInvitationUseCase,
    private readonly resendInvitation: ResendPlatformInvitationUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.PlatformBusinessesRead)
  list() {
    return this.listBusinesses.execute().then((data) => ({ data }));
  }

  @Post()
  @RequirePermission(Permission.PlatformBusinessesWrite)
  create(@Body() body: CreateBusinessDto, @CurrentContext() ctx: RequestContext) {
    return this.createBusiness.execute({
      ...body,
      actorUserId: ctx.userId,
    });
  }

  @Get(':id')
  @RequirePermission(Permission.PlatformBusinessesRead)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.getBusiness.execute(id);
  }

  @Patch(':id')
  @RequirePermission(Permission.PlatformBusinessesWrite)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBusinessDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.updateBusiness.execute({
      businessId: id,
      actorUserId: ctx.userId,
      ...body,
    });
  }

  @Get(':id/members')
  @RequirePermission(Permission.PlatformBusinessesRead)
  members(@Param('id', ParseUUIDPipe) id: string) {
    return this.listMembers.execute(id).then((data) => ({ data }));
  }

  @Get(':id/invitations')
  @RequirePermission(Permission.PlatformBusinessesRead)
  invitations(@Param('id', ParseUUIDPipe) id: string) {
    return this.listInvitations.execute(id).then((data) => ({ data }));
  }

  @Post(':id/invitations/:invitationId/resend')
  @RequirePermission(Permission.PlatformBusinessesWrite)
  resendInvite(
    @Param('id', ParseUUIDPipe) businessId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.resendInvitation.execute({
      businessId,
      invitationId,
      actorUserId: ctx.userId,
    });
  }

  @Post(':id/invitations')
  @RequirePermission(Permission.PlatformBusinessesWrite)
  invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateInvitationDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.createInvitation.execute({
      businessId: id,
      email: body.email,
      roleCode: body.roleCode,
      invitedByUserId: ctx.userId,
    });
  }
}
