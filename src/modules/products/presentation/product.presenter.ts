import { Product } from '@prisma/client';
import { formatMoney, formatQty, qty } from '../../../shared/common/decimal.js';

export function presentProduct(row: Product) {
  return {
    id: row.id,
    businessId: row.businessId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    categoryId: row.categoryId,
    stock: formatQty(qty(row.stock)),
    minStock: formatQty(qty(row.minStock)),
    salePrice: formatMoney(row.salePrice == null ? null : qty(row.salePrice)),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
