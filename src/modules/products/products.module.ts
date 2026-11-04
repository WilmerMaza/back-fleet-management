import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ChangeProductStatusUseCase } from './application/change-product-status.use-case.js';
import { CreateProductUseCase } from './application/create-product.use-case.js';
import { GetProductUseCase } from './application/get-product.use-case.js';
import { ListProductsUseCase } from './application/list-products.use-case.js';
import { UpdateProductUseCase } from './application/update-product.use-case.js';
import { ProductsController } from './presentation/products.controller.js';

@Module({
  imports: [InventoryModule],
  controllers: [ProductsController],
  providers: [
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    UpdateProductUseCase,
    ChangeProductStatusUseCase,
  ],
})
export class ProductsModule {}
