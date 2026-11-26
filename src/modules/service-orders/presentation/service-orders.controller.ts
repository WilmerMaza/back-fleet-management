import {
  Body,
  Controller,
  Get,
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
import { ChangeServiceOrderStatusUseCase } from '../application/change-service-order-status.use-case.js';
import { CompleteServiceOrderUseCase } from '../application/complete-service-order.use-case.js';
import { CreateServiceOrderUseCase } from '../application/create-service-order.use-case.js';
import { GetServiceOrderUseCase } from '../application/get-service-order.use-case.js';
import { ListServiceOrdersUseCase } from '../application/list-service-orders.use-case.js';
import { UpdateServiceOrderUseCase } from '../application/update-service-order.use-case.js';
import {
  ChangeStatusDto,
  CreateServiceOrderDto,
  ListServiceOrdersQueryDto,
  UpdateServiceOrderDto,
} from './dto/service-order.dto.js';
import { presentServiceOrder } from './service-order.presenter.js';

@Controller('businesses/:businessId/service-orders')
@UseGuards(AuthGuard)
export class ServiceOrdersController {
  constructor(
    private readonly listOrders: ListServiceOrdersUseCase,
    private readonly getOrder: GetServiceOrderUseCase,
    private readonly createOrder: CreateServiceOrderUseCase,
    private readonly updateOrder: UpdateServiceOrderUseCase,
    private readonly changeStatus: ChangeServiceOrderStatusUseCase,
    private readonly completeOrder: CompleteServiceOrderUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.OrdersRead)
  async list(
    @Param('businessId') businessId: string,
    @Query() query: ListServiceOrdersQueryDto,
  ) {
    const result = await this.listOrders.execute(businessId, query);
    return presentPage(
      result.items.map(presentServiceOrder),
      result.total,
      result.page,
      result.pageSize,
    );
  }

  @Get(':id')
  @RequirePermission(Permission.OrdersRead)
  async get(@Param('businessId') businessId: string, @Param('id') id: string) {
    return presentServiceOrder(await this.getOrder.execute(businessId, id));
  }

  @Post()
  @RequirePermission(Permission.OrdersWrite)
  async create(
    @Param('businessId') businessId: string,
    @Body() body: CreateServiceOrderDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentServiceOrder(
      await this.createOrder.execute({
        businessId,
        actorId: ctx.userId,
        ...body,
      }),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.OrdersWrite)
  async update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateServiceOrderDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentServiceOrder(
      await this.updateOrder.execute(businessId, id, ctx.userId, body),
    );
  }

  @Post(':id/status')
  @RequirePermission(Permission.OrdersWrite)
  async status(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: ChangeStatusDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentServiceOrder(
      await this.changeStatus.execute(businessId, id, ctx.userId, body.status),
    );
  }

  @Post(':id/complete')
  @RequirePermission(Permission.OrdersComplete)
  async complete(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentServiceOrder(
      await this.completeOrder.execute({
        businessId,
        orderId: id,
        actorId: ctx.userId,
      }),
    );
  }
}
