import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import {
  isValidCatalogName,
  normalizeCatalogName,
} from '../domain/normalize-catalog-name.js';
import { PRODUCT_BRAND_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductBrandRepositoryPort } from './ports/product-brand.repository.port.js';

@Injectable()
export class UpdateProductBrandUseCase {
  constructor(
    @Inject(PRODUCT_BRAND_REPOSITORY)
    private readonly repo: ProductBrandRepositoryPort,
  ) {}

  async execute(
    businessId: string,
    id: string,
    actorId: string,
    input: { name?: string; description?: string | null },
  ) {
    const current = await this.repo.findById(businessId, id);
    if (!current) {
      throw Errors.brandNotFound();
    }
    const data: {
      name?: string;
      normalizedName?: string;
      description?: string | null;
    } = {};
    if (input.name != null) {
      const name = input.name.trim();
      if (!isValidCatalogName(name)) {
        throw Errors.brandInvalid('El nombre de la marca es obligatorio.');
      }
      data.name = name;
      data.normalizedName = normalizeCatalogName(name);
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    return this.repo.update(businessId, id, actorId, data);
  }
}
