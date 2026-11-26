/**
 * Entrada manual de inventario (origen MANUAL).
 */
import { Injectable } from '@nestjs/common';
import { InventoryStockService } from './inventory-stock.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { qty } from '../../../shared/common/decimal.js';

export interface RegisterManualEntryInput {
  businessId: string;
  actorId: string;
  productId: string;
  quantity: string;
  reason?: string;
  operationKey?: string;
  /** Fecha informativa en motivo si se envía; el createdAt del movimiento es now(). */
  operatedAt?: string;
}

@Injectable()
export class RegisterManualEntryUseCase {
  constructor(private readonly stock: InventoryStockService) {}

  async execute(input: RegisterManualEntryInput) {
    const quantity = qty(input.quantity);
    if (quantity.lte(0)) {
      throw Errors.invalidQuantity();
    }
    const reason = buildReason(input.reason, input.operatedAt, 'Entrada manual');
    return this.stock.apply({
      businessId: input.businessId,
      productId: input.productId,
      type: 'ENTRY',
      quantity,
      reason,
      relatedEntityType: 'MANUAL',
      operationKey: input.operationKey,
      actorId: input.actorId,
      requireActive: true,
    });
  }
}

export function buildReason(
  reason: string | undefined,
  operatedAt: string | undefined,
  fallback: string,
): string {
  const base = reason?.trim() || fallback;
  if (!operatedAt) {
    return base;
  }
  return `${base} (operación: ${operatedAt})`;
}
