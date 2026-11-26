import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import {
  isValidCatalogName,
  normalizeCatalogName,
} from '../domain/normalize-catalog-name.js';
import { PRODUCT_CATEGORY_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductCategoryRepositoryPort } from './ports/product-category.repository.port.js';

@Injectable()
export class UpdateProductCategoryUseCase {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY)
    private readonly repo: ProductCategoryRepositoryPort,
  ) {}

  async execute(
    businessId: string,
    id: string,
    actorId: string,
    input: { name?: string; code?: string | null; description?: string | null },
  ) {
    const current = await this.repo.findById(businessId, id);
    if (!current) {
      throw Errors.categoryNotFound();
    }
    const data: {
      name?: string;
      normalizedName?: string;
      code?: string | null;
      description?: string | null;
    } = {};
    if (input.name != null) {
      const name = input.name.trim();
      if (!isValidCatalogName(name)) {
        throw Errors.categoryInvalid('El nombre de la categoría es obligatorio.');
      }
      data.name = name;
      data.normalizedName = normalizeCatalogName(name);
    }
    if (input.code !== undefined) {
      data.code = input.code?.trim() || null;
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    return this.repo.update(businessId, id, actorId, data);
  }
}
