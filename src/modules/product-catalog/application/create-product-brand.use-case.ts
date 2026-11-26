import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import {
  isValidCatalogName,
  normalizeCatalogName,
} from '../domain/normalize-catalog-name.js';
import { PRODUCT_BRAND_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductBrandRepositoryPort } from './ports/product-brand.repository.port.js';

@Injectable()
export class CreateProductBrandUseCase {
  constructor(
    @Inject(PRODUCT_BRAND_REPOSITORY)
    private readonly repo: ProductBrandRepositoryPort,
  ) {}

  async execute(input: {
    businessId: string;
    actorId: string;
    name: string;
    description?: string;
  }) {
    const name = input.name.trim();
    if (!isValidCatalogName(name)) {
      throw Errors.brandInvalid('El nombre de la marca es obligatorio.');
    }
    return this.repo.create({
      businessId: input.businessId,
      actorId: input.actorId,
      name,
      normalizedName: normalizeCatalogName(name),
      description: input.description?.trim() || null,
    });
  }
}
