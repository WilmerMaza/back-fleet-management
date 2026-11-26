/**
 * Ajuste absoluto de existencias. La diferencia la calcula el dominio
 * (target vs stock bloqueado), no el frontend.
 */
import { Injectable } from '@nestjs/common';
import { InventoryStockService } from './inventory-stock.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { qty } from '../../../shared/common/decimal.js';

export interface AdjustInventoryInput {
  businessId: string;
  actorId: string;
  productId: string;
  targetStock: string;
  reason: string;
  operationKey?: string;
}

@Injectable()
export class AdjustInventoryUseCase {
  constructor(private readonly stock: InventoryStockService) {}

  async execute(input: AdjustInventoryInput) {
    const reason = input.reason?.trim();
    if (!reason) {
      throw Errors.invalidMovement('El motivo del ajuste es obligatorio.');
    }
    const target = qty(input.targetStock);
    if (target.lt(0)) {
      throw Errors.invalidQuantity();
    }
    return this.stock.apply({
      businessId: input.businessId,
      productId: input.productId,
      type: 'ADJUSTMENT',
      quantity: target,
      reason,
      relatedEntityType: 'MANUAL',
      operationKey: input.operationKey,
      actorId: input.actorId,
      requireActive: true,
    });
  }
}
