import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PRODUCT_CATEGORY_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductCategoryRepositoryPort } from './ports/product-category.repository.port.js';

@Injectable()
export class ChangeProductCategoryStatusUseCase {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY)
    private readonly repo: ProductCategoryRepositoryPort,
  ) {}

  async execute(
    businessId: string,
    id: string,
    actorId: string,
    isActive: boolean,
  ) {
    const current = await this.repo.findById(businessId, id);
    if (!current) {
      throw Errors.categoryNotFound();
    }
    if (!isActive) {
      const [products, activeChildren] = await Promise.all([
        this.repo.countProducts(businessId, id),
        this.repo.countActiveChildren(businessId, id),
      ]);
      if (products > 0 || activeChildren > 0) {
        throw Errors.categoryInUse();
      }
    }
    return this.repo.setActive(businessId, id, actorId, isActive);
  }
}
