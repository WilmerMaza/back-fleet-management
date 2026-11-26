import { Inject, Injectable } from '@nestjs/common';
import { PRODUCT_CATEGORY_REPOSITORY } from '../product-catalog.tokens.js';
import type {
  ProductCategoryRecord,
  ProductCategoryRepositoryPort,
} from './ports/product-category.repository.port.js';

@Injectable()
export class ListProductCategoriesUseCase {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY)
    private readonly repo: ProductCategoryRepositoryPort,
  ) {}

  async execute(
    businessId: string,
    query?: { search?: string; activeOnly?: boolean; tree?: boolean },
  ): Promise<ProductCategoryRecord[]> {
    const rows = await this.repo.list(businessId, {
      search: query?.search,
      activeOnly: query?.activeOnly,
    });
    if (!query?.tree) {
      return rows;
    }
    const roots = rows.filter((row) => !row.parentId);
    const children = rows.filter((row) => row.parentId);
    return roots.map((root) => ({
      ...root,
      children: children.filter((child) => child.parentId === root.id),
    }));
  }
}
