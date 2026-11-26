import { Module } from '@nestjs/common';
import { ChangeProductBrandStatusUseCase } from './application/change-product-brand-status.use-case.js';
import { ChangeProductCategoryStatusUseCase } from './application/change-product-category-status.use-case.js';
import { CreateProductBrandUseCase } from './application/create-product-brand.use-case.js';
import { CreateProductCategoryUseCase } from './application/create-product-category.use-case.js';
import { GetProductBrandUseCase } from './application/get-product-brand.use-case.js';
import { GetProductCategoryUseCase } from './application/get-product-category.use-case.js';
import { ListProductBrandsUseCase } from './application/list-product-brands.use-case.js';
import { ListProductCategoriesUseCase } from './application/list-product-categories.use-case.js';
import { ResolveProductClassification } from './application/resolve-product-classification.js';
import { UpdateProductBrandUseCase } from './application/update-product-brand.use-case.js';
import { UpdateProductCategoryUseCase } from './application/update-product-category.use-case.js';
import { PrismaProductBrandRepository } from './infrastructure/persistence/prisma-product-brand.repository.js';
import { PrismaProductCategoryRepository } from './infrastructure/persistence/prisma-product-category.repository.js';
import { ProductCatalogController } from './presentation/product-catalog.controller.js';
import {
  PRODUCT_BRAND_REPOSITORY,
  PRODUCT_CATEGORY_REPOSITORY,
} from './product-catalog.tokens.js';

@Module({
  controllers: [ProductCatalogController],
  providers: [
    { provide: PRODUCT_CATEGORY_REPOSITORY, useClass: PrismaProductCategoryRepository },
    { provide: PRODUCT_BRAND_REPOSITORY, useClass: PrismaProductBrandRepository },
    ListProductCategoriesUseCase,
    GetProductCategoryUseCase,
    CreateProductCategoryUseCase,
    UpdateProductCategoryUseCase,
    ChangeProductCategoryStatusUseCase,
    ListProductBrandsUseCase,
    GetProductBrandUseCase,
    CreateProductBrandUseCase,
    UpdateProductBrandUseCase,
    ChangeProductBrandStatusUseCase,
    ResolveProductClassification,
  ],
  exports: [ResolveProductClassification, PRODUCT_CATEGORY_REPOSITORY, PRODUCT_BRAND_REPOSITORY],
})
export class ProductCatalogModule {}
