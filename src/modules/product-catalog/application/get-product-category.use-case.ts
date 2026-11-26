import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PRODUCT_CATEGORY_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductCategoryRepositoryPort } from './ports/product-category.repository.port.js';

@Injectable()
export class GetProductCategoryUseCase {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY)
    private readonly repo: ProductCategoryRepositoryPort,
  ) {}

  async execute(businessId: string, id: string) {
    const row = await this.repo.findById(businessId, id);
    if (!row) {
      throw Errors.categoryNotFound();
    }
    return row;
  }
}
