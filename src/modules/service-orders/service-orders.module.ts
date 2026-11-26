import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ChangeServiceOrderStatusUseCase } from './application/change-service-order-status.use-case.js';
import { CompleteServiceOrderUseCase } from './application/complete-service-order.use-case.js';
import { CreateServiceOrderUseCase } from './application/create-service-order.use-case.js';
import { GetServiceOrderUseCase } from './application/get-service-order.use-case.js';
import { ListServiceOrdersUseCase } from './application/list-service-orders.use-case.js';
import { UpdateServiceOrderUseCase } from './application/update-service-order.use-case.js';
import { InventoryStockAdapter } from './infrastructure/adapters/inventory-stock.adapter.js';
import { VehicleMileageAdapter } from './infrastructure/adapters/vehicle-mileage.adapter.js';
import { PrismaServiceOrderRepository } from './infrastructure/persistence/prisma-service-order.repository.js';
import { PrismaUnitOfWork } from './infrastructure/persistence/prisma-unit-of-work.js';
import { ServiceOrdersController } from './presentation/service-orders.controller.js';
import {
  INVENTORY_STOCK_PORT,
  SERVICE_ORDER_REPOSITORY,
  UNIT_OF_WORK,
  VEHICLE_MILEAGE_PORT,
} from './service-orders.tokens.js';

@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [ServiceOrdersController],
  providers: [
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: SERVICE_ORDER_REPOSITORY, useClass: PrismaServiceOrderRepository },
    { provide: INVENTORY_STOCK_PORT, useClass: InventoryStockAdapter },
    { provide: VEHICLE_MILEAGE_PORT, useClass: VehicleMileageAdapter },
    ListServiceOrdersUseCase,
    GetServiceOrderUseCase,
    CreateServiceOrderUseCase,
    UpdateServiceOrderUseCase,
    ChangeServiceOrderStatusUseCase,
    CompleteServiceOrderUseCase,
  ],
  exports: [CompleteServiceOrderUseCase],
})
export class ServiceOrdersModule {}
