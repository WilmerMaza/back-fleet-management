import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { presentPage } from '../../../shared/common/pagination.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { AssignVehicleUseCase } from '../application/assign-vehicle.use-case.js';
import { CreateFleetUseCase } from '../application/create-fleet.use-case.js';
import { GetFleetSummaryUseCase } from '../application/get-fleet-summary.use-case.js';
import { GetFleetUseCase } from '../application/get-fleet.use-case.js';
import { ListFleetsUseCase } from '../application/list-fleets.use-case.js';
import { UnassignVehicleUseCase } from '../application/unassign-vehicle.use-case.js';
import { UpdateFleetUseCase } from '../application/update-fleet.use-case.js';
import { CreateFleetDto, ListFleetsQueryDto, UpdateFleetDto } from './dto/fleet.dto.js';
import { presentFleet } from './fleet.presenter.js';

@Controller('businesses/:businessId/fleets')
@UseGuards(AuthGuard)
export class FleetsController {
  constructor(
    private readonly createFleet: CreateFleetUseCase,
    private readonly listFleets: ListFleetsUseCase,
    private readonly getFleet: GetFleetUseCase,
    private readonly updateFleet: UpdateFleetUseCase,
    private readonly assignVehicle: AssignVehicleUseCase,
    private readonly unassignVehicle: UnassignVehicleUseCase,
    private readonly summary: GetFleetSummaryUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.FleetsRead)
  async list(@Param('businessId') businessId: string, @Query() query: ListFleetsQueryDto) {
    const result = await this.listFleets.execute(businessId, query);
    return presentPage(
      result.items.map((item) =>
        presentFleet(item.fleet, {
          customerName: item.customerName,
          vehicleCount: item.vehicleCount,
        }),
      ),
      result.total,
      result.page,
      result.pageSize,
    );
  }

  @Get(':id/summary')
  @RequirePermission(Permission.FleetsRead)
  async getSummary(@Param('businessId') businessId: string, @Param('id') id: string) {
    const result = await this.summary.execute(businessId, id);
    return {
      fleet: presentFleet(result.fleet, {
        customerName: result.customerName,
        vehicleCount: result.vehicleCount,
      }),
      vehicleCount: result.vehicleCount,
      onTrack: result.onTrack,
      upcoming: result.upcoming,
      overdue: result.overdue,
      vehicles: result.vehicles,
    };
  }

  @Get(':id')
  @RequirePermission(Permission.FleetsRead)
  async get(@Param('businessId') businessId: string, @Param('id') id: string) {
    const result = await this.getFleet.execute(businessId, id);
    return presentFleet(result.fleet, {
      customerName: result.customerName,
      vehicleCount: result.vehicleCount,
    });
  }

  @Post()
  @RequirePermission(Permission.FleetsWrite)
  async create(
    @Param('businessId') businessId: string,
    @Body() body: CreateFleetDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    const fleet = await this.createFleet.execute({ businessId, actorId: ctx.userId, ...body });
    const projected = await this.getFleet.execute(businessId, fleet.id);
    return presentFleet(projected.fleet, {
      customerName: projected.customerName,
      vehicleCount: projected.vehicleCount,
    });
  }

  @Patch(':id')
  @RequirePermission(Permission.FleetsWrite)
  async update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateFleetDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.updateFleet.execute(businessId, id, ctx.userId, body);
    const projected = await this.getFleet.execute(businessId, id);
    return presentFleet(projected.fleet, {
      customerName: projected.customerName,
      vehicleCount: projected.vehicleCount,
    });
  }

  @Post(':id/vehicles/:vehicleId/assign')
  @HttpCode(204)
  @RequirePermission(Permission.FleetsWrite)
  async assign(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.assignVehicle.execute(businessId, id, vehicleId, ctx.userId);
  }

  @Post(':id/vehicles/:vehicleId/unassign')
  @HttpCode(204)
  @RequirePermission(Permission.FleetsWrite)
  async unassign(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.unassignVehicle.execute(businessId, id, vehicleId, ctx.userId);
  }
}
