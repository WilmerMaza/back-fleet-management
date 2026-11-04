import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { presentPage } from '../../../shared/common/pagination.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { CreateVehicleUseCase } from '../application/create-vehicle.use-case.js';
import { GetLifeHistoryUseCase } from '../application/get-life-history.use-case.js';
import { GetVehicleUseCase } from '../application/get-vehicle.use-case.js';
import { ListMileageLogsUseCase } from '../application/list-mileage-logs.use-case.js';
import { ListVehiclesUseCase } from '../application/list-vehicles.use-case.js';
import { UpdateVehicleUseCase } from '../application/update-vehicle.use-case.js';
import { CreateVehicleDto, ListVehiclesQueryDto, UpdateVehicleDto } from './dto/vehicle.dto.js';
import { presentMileageLog, presentVehicle } from './vehicle.presenter.js';

@Controller('businesses/:businessId/vehicles')
@UseGuards(AuthGuard)
export class VehiclesController {
  constructor(
    private readonly createVehicle: CreateVehicleUseCase,
    private readonly listVehicles: ListVehiclesUseCase,
    private readonly getVehicle: GetVehicleUseCase,
    private readonly updateVehicle: UpdateVehicleUseCase,
    private readonly listMileage: ListMileageLogsUseCase,
    private readonly lifeHistory: GetLifeHistoryUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.VehiclesRead)
  async list(@Param('businessId') businessId: string, @Query() query: ListVehiclesQueryDto) {
    const result = await this.listVehicles.execute(businessId, query);
    return presentPage(result.items.map(presentVehicle), result.total, result.page, result.pageSize);
  }

  @Get(':id/mileage-logs')
  @RequirePermission(Permission.VehiclesRead)
  async mileage(@Param('businessId') businessId: string, @Param('id') id: string) {
    return (await this.listMileage.execute(businessId, id)).map(presentMileageLog);
  }

  @Get(':id/life-history')
  @RequirePermission(Permission.VehiclesRead)
  async history(@Param('businessId') businessId: string, @Param('id') id: string) {
    const result = await this.lifeHistory.execute(businessId, id);
    return { vehicle: presentVehicle(result.vehicle), items: result.items };
  }

  @Get(':id')
  @RequirePermission(Permission.VehiclesRead)
  async get(@Param('businessId') businessId: string, @Param('id') id: string) {
    return presentVehicle(await this.getVehicle.execute(businessId, id));
  }

  @Post()
  @RequirePermission(Permission.VehiclesWrite)
  async create(
    @Param('businessId') businessId: string,
    @Body() body: CreateVehicleDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentVehicle(
      await this.createVehicle.execute({ businessId, actorId: ctx.userId, ...body }),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.VehiclesWrite)
  async update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateVehicleDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentVehicle(
      await this.updateVehicle.execute(businessId, id, ctx.userId, ctx.roles, body),
    );
  }
}
