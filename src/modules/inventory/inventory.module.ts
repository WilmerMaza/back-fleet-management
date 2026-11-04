import { Module } from '@nestjs/common';
import { InventoryStockService } from './application/inventory-stock.service.js';
import { ListMovementsUseCase } from './application/list-movements.use-case.js';
import { InventoryController } from './presentation/inventory.controller.js';

@Module({
  controllers: [InventoryController],
  providers: [InventoryStockService, ListMovementsUseCase],
  exports: [InventoryStockService],
})
export class InventoryModule {}
