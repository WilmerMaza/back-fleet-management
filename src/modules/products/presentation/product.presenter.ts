import { Product, ProductBrand, ProductCategory } from '@prisma/client';
import { formatMoney, formatQty, qty } from '../../../shared/common/decimal.js';

type CategoryWithParent = ProductCategory & {
  parent?: ProductCategory | null;
};

type ProductWithClass = Product & {
  category?: CategoryWithParent | null;
  brand?: ProductBrand | null;
};

export function presentProduct(row: ProductWithClass) {
  const category = row.category ?? null;
  const brand = row.brand ?? null;
  const parentId = category?.parentId ?? null;
  const parent = category?.parent ?? null;
  return {
    id: row.id,
    businessId: row.businessId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    categoryId: row.categoryId,
    brandId: row.brandId,
    /** Si categoryId es subcategoría, rootCategoryId es el padre. */
    rootCategoryId: parentId ?? row.categoryId,
    subcategoryId: parentId ? row.categoryId : null,
    rootCategoryName: parent?.name ?? (parentId ? null : category?.name ?? null),
    category: category
      ? {
          id: category.id,
          name: category.name,
          parentId: category.parentId,
          isActive: category.isActive,
        }
      : null,
    brand: brand
      ? {
          id: brand.id,
          name: brand.name,
          isActive: brand.isActive,
        }
      : null,
    stock: formatQty(qty(row.stock)),
    minStock: formatQty(qty(row.minStock)),
    salePrice: formatMoney(row.salePrice == null ? null : qty(row.salePrice)),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
