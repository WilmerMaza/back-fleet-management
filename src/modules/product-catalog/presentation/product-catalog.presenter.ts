import type { ProductBrandRecord } from '../application/ports/product-brand.repository.port.js';
import type { ProductCategoryRecord } from '../application/ports/product-category.repository.port.js';

export interface PresentedCategory {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
  children?: PresentedCategory[];
}

export function presentCategory(row: ProductCategoryRecord): PresentedCategory {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    code: row.code,
    description: row.description,
    parentId: row.parentId,
    isActive: row.isActive,
    productCount: row.productCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    children: row.children?.map((child) => presentCategory(child)),
  };
}

export function presentBrand(row: ProductBrandRecord) {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    productCount: row.productCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
