import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { Errors } from '../../../shared/common/app-error.js';
import { AdjustInventoryUseCase } from '../application/adjust-inventory.use-case.js';
import { CreatePurchaseReceiptUseCase } from '../application/create-purchase-receipt.use-case.js';
import { ListMovementsUseCase } from '../application/list-movements.use-case.js';
import { RegisterManualEntryUseCase } from '../application/register-manual-entry.use-case.js';
import { RegisterManualExitUseCase } from '../application/register-manual-exit.use-case.js';
import {
  AdjustInventoryDto,
  CreatePurchaseReceiptDto,
  ListMovementsQueryDto,
  RegisterEntryDto,
  RegisterExitDto,
} from './dto/inventory.dto.js';
import { presentMovement, presentPurchaseReceipt } from './inventory.presenter.js';

@Controller('businesses/:businessId')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(
    private readonly listMovements: ListMovementsUseCase,
    private readonly registerEntry: RegisterManualEntryUseCase,
    private readonly registerExit: RegisterManualExitUseCase,
    private readonly adjustInventory: AdjustInventoryUseCase,
    private readonly createPurchaseReceipt: CreatePurchaseReceiptUseCase,
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
  async registerMovement(
    @Param('businessId') businessId: string,
    @Body() body: RegisterEntryDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    if (body.type === 'ENTRY') {
      const movement = await this.registerEntry.execute({
        businessId,
        actorId: ctx.userId,
        productId: body.productId,
        quantity: body.quantity,
        reason: body.reason,
        operationKey: body.operationKey,
        operatedAt: body.operatedAt,
      });
      return presentMovement(movement);
    }
    if (body.type === 'EXIT') {
      if (!body.reason?.trim()) {
        throw Errors.invalidMovement('El motivo de la salida es obligatorio.');
      }
      const movement = await this.registerExit.execute({
        businessId,
        actorId: ctx.userId,
        productId: body.productId,
        quantity: body.quantity,
        reason: body.reason,
        operationKey: body.operationKey,
        operatedAt: body.operatedAt,
      });
      return presentMovement(movement);
    }
    throw Errors.invalidMovement(
      'Use /inventory-adjustments para ajustes o /purchase-receipts para compras.',
    );
  }

  @Post('inventory-exits')
  @RequirePermission(Permission.InventoryWrite)
  async exit(
    @Param('businessId') businessId: string,
    @Body() body: RegisterExitDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    const movement = await this.registerExit.execute({
      businessId,
      actorId: ctx.userId,
      productId: body.productId,
      quantity: body.quantity,
      reason: body.reason,
      operationKey: body.operationKey,
      operatedAt: body.operatedAt,
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
    const movement = await this.adjustInventory.execute({
      businessId,
      actorId: ctx.userId,
      productId: body.productId,
      targetStock: body.targetStock,
      reason: body.reason,
      operationKey: body.operationKey,
    });
    return presentMovement(movement);
  }

  @Post('purchase-receipts')
  @RequirePermission(Permission.InventoryWrite)
  async purchaseReceipt(
    @Param('businessId') businessId: string,
    @Body() body: CreatePurchaseReceiptDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    const receipt = await this.createPurchaseReceipt.execute({
      businessId,
      actorId: ctx.userId,
      supplierName: body.supplierName,
      documentRef: body.documentRef,
      receivedAt: body.receivedAt,
      notes: body.notes,
      operationKey: body.operationKey,
      lines: body.lines,
    });
    return presentPurchaseReceipt(receipt);
  }
}
