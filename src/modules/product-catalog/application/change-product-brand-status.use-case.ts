import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PRODUCT_BRAND_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductBrandRepositoryPort } from './ports/product-brand.repository.port.js';

@Injectable()
export class ChangeProductBrandStatusUseCase {
  constructor(
    @Inject(PRODUCT_BRAND_REPOSITORY)
    private readonly repo: ProductBrandRepositoryPort,
  ) {}

  async execute(businessId: string, id: string, actorId: string, isActive: boolean) {
    const current = await this.repo.findById(businessId, id);
    if (!current) {
      throw Errors.brandNotFound();
    }
    if (!isActive) {
      const products = await this.repo.countProducts(businessId, id);
      if (products > 0) {
        throw Errors.brandInUse();
      }
    }
    return this.repo.setActive(businessId, id, actorId, isActive);
  }
}
