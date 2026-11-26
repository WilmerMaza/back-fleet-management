/**
 * Directorio de miembros del negocio e invitaciones por correo.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { GetBusinessUserUseCase } from '../application/get-business-user.use-case.js';
import { InviteBusinessMemberUseCase } from '../application/invite-business-member.use-case.js';
import { ListBusinessUsersUseCase } from '../application/list-business-users.use-case.js';
import { UpdateBusinessUserUseCase } from '../application/update-business-user.use-case.js';

class InviteBusinessMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  roleCode!: string;
}

class UpdateBusinessUserDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

@Controller('businesses/:businessId/users')
@UseGuards(AuthGuard)
export class BusinessUsersController {
  constructor(
    private readonly listUsers: ListBusinessUsersUseCase,
    private readonly getUser: GetBusinessUserUseCase,
    private readonly updateUser: UpdateBusinessUserUseCase,
    private readonly inviteMember: InviteBusinessMemberUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.UsersRead)
  list(@Param('businessId') businessId: string) {
    return this.listUsers.execute(businessId);
  }

  @Get(':userId')
  @RequirePermission(Permission.UsersAdmin)
  get(@Param('businessId') businessId: string, @Param('userId') userId: string) {
    return this.getUser.execute(businessId, userId);
  }

  @Patch(':userId')
  @RequirePermission(Permission.UsersAdmin)
  update(
    @Param('businessId') businessId: string,
    @Param('userId') userId: string,
    @Body() body: UpdateBusinessUserDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    const status = body.status === 'SUSPENDED' ? 'INACTIVE' : body.status;
    return this.updateUser.execute({
      businessId,
      userId,
      actorUserId: ctx.userId,
      roleCodes: body.roleCodes,
      status,
    });
  }

  @Post('invitations')
  @RequirePermission(Permission.UsersAdmin)
  @HttpCode(200)
  invite(
    @Param('businessId') businessId: string,
    @Body() body: InviteBusinessMemberDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.inviteMember.execute({
      businessId,
      email: body.email,
      roleCode: body.roleCode,
      invitedByUserId: ctx.userId,
    });
  }
}
