import { InventoryMovement, PurchaseReceipt, PurchaseReceiptLine } from '@prisma/client';
import { formatQty, qty } from '../../../shared/common/decimal.js';

export function presentMovement(row: InventoryMovement) {
  return {
    id: row.id,
    businessId: row.businessId,
    productId: row.productId,
    type: row.type,
    quantity: formatQty(qty(row.quantity)),
    stockBefore: formatQty(qty(row.stockBefore)),
    stockAfter: formatQty(qty(row.stockAfter)),
    balanceAfter: formatQty(qty(row.stockAfter)),
    reason: row.reason,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    operationKey: row.operationKey,
    reversesMovementId: row.reversesMovementId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function presentPurchaseReceipt(
  row: PurchaseReceipt & { lines: PurchaseReceiptLine[] },
) {
  return {
    id: row.id,
    businessId: row.businessId,
    supplierName: row.supplierName,
    documentRef: row.documentRef,
    receivedAt: row.receivedAt.toISOString(),
    notes: row.notes,
    operationKey: row.operationKey,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      quantity: formatQty(qty(line.quantity)),
      unit: line.unit,
      movementId: line.movementId,
    })),
  };
}
