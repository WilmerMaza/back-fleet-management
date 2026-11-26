import { Module } from '@nestjs/common';
import { AdjustInventoryUseCase } from './application/adjust-inventory.use-case.js';
import { CreatePurchaseReceiptUseCase } from './application/create-purchase-receipt.use-case.js';
import { InventoryStockService } from './application/inventory-stock.service.js';
import { ListMovementsUseCase } from './application/list-movements.use-case.js';
import { RegisterManualEntryUseCase } from './application/register-manual-entry.use-case.js';
import { RegisterManualExitUseCase } from './application/register-manual-exit.use-case.js';
import { InventoryController } from './presentation/inventory.controller.js';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryStockService,
    ListMovementsUseCase,
    RegisterManualEntryUseCase,
    RegisterManualExitUseCase,
    AdjustInventoryUseCase,
    CreatePurchaseReceiptUseCase,
  ],
  exports: [InventoryStockService],
})
export class InventoryModule {}
