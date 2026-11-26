import { Inject, Injectable } from '@nestjs/common';
import { PRODUCT_BRAND_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductBrandRepositoryPort } from './ports/product-brand.repository.port.js';

@Injectable()
export class ListProductBrandsUseCase {
  constructor(
    @Inject(PRODUCT_BRAND_REPOSITORY)
    private readonly repo: ProductBrandRepositoryPort,
  ) {}

  execute(businessId: string, query?: { search?: string; activeOnly?: boolean }) {
    return this.repo.list(businessId, query);
  }
}
