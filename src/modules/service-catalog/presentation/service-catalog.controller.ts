import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { CreateServiceTypeUseCase } from '../application/create-service-type.use-case.js';
import { ListServiceTypesUseCase } from '../application/list-service-types.use-case.js';
import { UpdateServiceTypeUseCase } from '../application/update-service-type.use-case.js';
import {
  CreateServiceTypeDto,
  ListServiceTypesQueryDto,
  UpdateServiceTypeDto,
} from './dto/service-type.dto.js';
import { presentServiceType } from './service-type.presenter.js';

@Controller('businesses/:businessId/service-types')
@UseGuards(AuthGuard)
export class ServiceCatalogController {
  constructor(
    private readonly listServiceTypes: ListServiceTypesUseCase,
    private readonly createServiceType: CreateServiceTypeUseCase,
    private readonly updateServiceType: UpdateServiceTypeUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.ServiceCatalogRead)
  async list(
    @Param('businessId') businessId: string,
    @Query() query: ListServiceTypesQueryDto,
  ) {
    const items = await this.listServiceTypes.execute(businessId, {
      search: query.search,
      status: query.status,
    });
    return items.map(presentServiceType);
  }

  @Post()
  @RequirePermission(Permission.ServiceCatalogWrite)
  async create(
    @Param('businessId') businessId: string,
    @Body() body: CreateServiceTypeDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    const created = await this.createServiceType.execute({
      businessId,
      actorId: ctx.userId,
      ...body,
    });
    return presentServiceType(created);
  }

  @Patch(':id')
  @RequirePermission(Permission.ServiceCatalogWrite)
  async update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateServiceTypeDto,
    @CurrentContext() ctx: RequestContext,
    @Req() req: { body: Record<string, unknown> },
  ) {
    const updated = await this.updateServiceType.execute({
      businessId,
      id,
      actorId: ctx.userId,
      ...body,
      presentKeys: Object.keys(req.body ?? {}),
    });
    return presentServiceType(updated);
  }
}
