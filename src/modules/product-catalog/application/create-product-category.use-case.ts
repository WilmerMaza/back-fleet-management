import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import {
  isValidCatalogName,
  normalizeCatalogName,
} from '../domain/normalize-catalog-name.js';
import { PRODUCT_CATEGORY_REPOSITORY } from '../product-catalog.tokens.js';
import type { ProductCategoryRepositoryPort } from './ports/product-category.repository.port.js';

@Injectable()
export class CreateProductCategoryUseCase {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY)
    private readonly repo: ProductCategoryRepositoryPort,
  ) {}

  async execute(input: {
    businessId: string;
    actorId: string;
    name: string;
    code?: string;
    description?: string;
    parentId?: string | null;
  }) {
    const name = input.name.trim();
    if (!isValidCatalogName(name)) {
      throw Errors.categoryInvalid('El nombre de la categoría es obligatorio.');
    }
    const normalizedName = normalizeCatalogName(name);
    let parentId: string | null = input.parentId?.trim() || null;

    if (parentId) {
      const parent = await this.repo.findById(input.businessId, parentId);
      if (!parent) {
        throw Errors.categoryNotFound();
      }
      if (parent.parentId) {
        throw Errors.categoryHierarchyInvalid(
          'No se pueden crear subcategorías de una subcategoría. Máximo dos niveles.',
        );
      }
      if (!parent.isActive) {
        throw Errors.categoryInvalid('La categoría padre está inactiva.');
      }
    }

    return this.repo.create({
      businessId: input.businessId,
      actorId: input.actorId,
      name,
      normalizedName,
      code: input.code?.trim() || null,
      description: input.description?.trim() || null,
      parentId,
    });
  }
}
