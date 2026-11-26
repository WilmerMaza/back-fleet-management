/**
 * HTTP de roles por negocio (contrato 18 — listado y alta custom).
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { CreateRoleUseCase } from '../application/create-role.use-case.js';
import { ListRolesUseCase } from '../application/list-roles.use-case.js';

class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}

@Controller('businesses/:businessId/roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly createRole: CreateRoleUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.RolesRead)
  list(@Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.listRoles.execute(businessId).then((data) => ({ data }));
  }

  @Post()
  @RequirePermission(Permission.RolesWrite)
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() body: CreateRoleDto,
  ) {
    return this.createRole
      .execute({
        businessId,
        code: body.code,
        name: body.name,
        description: body.description,
        permissionCodes: body.permissionCodes,
      })
      .then((data) => ({ data }));
  }
}
