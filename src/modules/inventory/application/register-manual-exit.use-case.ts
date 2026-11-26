/**
 * Salida manual de inventario (origen MANUAL). Stock revalidado bajo FOR UPDATE.
 */
import { Injectable } from '@nestjs/common';
import { InventoryStockService } from './inventory-stock.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { qty } from '../../../shared/common/decimal.js';
import { buildReason } from './register-manual-entry.use-case.js';

export interface RegisterManualExitInput {
  businessId: string;
  actorId: string;
  productId: string;
  quantity: string;
  reason: string;
  operationKey?: string;
  operatedAt?: string;
}

@Injectable()
export class RegisterManualExitUseCase {
  constructor(private readonly stock: InventoryStockService) {}

  async execute(input: RegisterManualExitInput) {
    const quantity = qty(input.quantity);
    if (quantity.lte(0)) {
      throw Errors.invalidQuantity();
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw Errors.invalidMovement('El motivo de la salida es obligatorio.');
    }
    return this.stock.apply({
      businessId: input.businessId,
      productId: input.productId,
      type: 'EXIT',
      quantity,
      reason: buildReason(reason, input.operatedAt, reason),
      relatedEntityType: 'MANUAL',
      operationKey: input.operationKey,
      actorId: input.actorId,
      requireActive: true,
    });
  }
}
