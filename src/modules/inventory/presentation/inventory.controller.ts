import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { Errors } from '../../../shared/common/app-error.js';
import { qty } from '../../../shared/common/decimal.js';
import { InventoryStockService } from '../application/inventory-stock.service.js';
import { ListMovementsUseCase } from '../application/list-movements.use-case.js';
import { AdjustInventoryDto, ListMovementsQueryDto, RegisterEntryDto } from './dto/inventory.dto.js';
import { presentMovement } from './inventory.presenter.js';

@Controller('businesses/:businessId')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(
    private readonly stock: InventoryStockService,
    private readonly listMovements: ListMovementsUseCase,
  ) {}

  @Get('inventory-movements')
  @RequirePermission(Permission.InventoryRead)
  async list(
    @Param('businessId') businessId: string,
    @Query() query: ListMovementsQueryDto,
  ) {
    const result = await this.listMovements.execute(businessId, query);
    return {
      data: result.items.map(presentMovement),
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize) || 1,
      },
    };
  }

  @Post('inventory-movements')
  @RequirePermission(Permission.InventoryWrite)
  async registerEntry(
    @Param('businessId') businessId: string,
    @Body() body: RegisterEntryDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    if (body.type !== 'ENTRY') {
      throw Errors.invalidMovement('El endpoint público solo admite entradas manuales.');
    }
    const movement = await this.stock.apply({
      businessId,
      productId: body.productId,
      type: 'ENTRY',
      quantity: qty(body.quantity),
      reason: body.reason,
      relatedEntityType: 'MANUAL',
      actorId: ctx.userId,
    });
    return presentMovement(movement);
  }

  @Post('inventory-adjustments')
  @RequirePermission(Permission.InventoryAdjust)
  async adjust(
    @Param('businessId') businessId: string,
    @Body() body: AdjustInventoryDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    const movement = await this.stock.apply({
      businessId,
      productId: body.productId,
      type: 'ADJUSTMENT',
      quantity: qty(body.targetStock),
      reason: body.reason,
      relatedEntityType: 'MANUAL',
      actorId: ctx.userId,
    });
    return presentMovement(movement);
  }
}
