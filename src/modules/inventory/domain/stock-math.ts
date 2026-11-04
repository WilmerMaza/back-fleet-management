import { Errors } from '../../../shared/common/app-error.js';
import { Decimal, assertQuantity, formatQty } from '../../../shared/common/decimal.js';
import { InventoryMovementType } from '@prisma/client';

export function nextStock(
  current: Decimal,
  type: InventoryMovementType,
  quantity: Decimal,
  productId: string,
): Decimal {
  if (type === 'ADJUSTMENT') {
    const target = assertQuantity(quantity, true);
    if (target.lt(0)) {
      throw Errors.invalidQuantity();
    }
    return target;
  }

  const amount = assertQuantity(quantity, false);
  if (type === 'ENTRY' || type === 'RETURN') {
    return current.plus(amount);
  }
  if (type === 'EXIT') {
    const result = current.minus(amount);
    if (result.lt(0)) {
      throw Errors.insufficientStock(productId, formatQty(current), formatQty(amount));
    }
    return result;
  }
  throw Errors.invalidMovement();
}

export function sameMovement(
  existing: { productId: string; type: string; quantity: Decimal },
  next: { productId: string; type: string; quantity: Decimal },
): boolean {
  return (
    existing.productId === next.productId &&
    existing.type === next.type &&
    existing.quantity.eq(next.quantity)
  );
}
