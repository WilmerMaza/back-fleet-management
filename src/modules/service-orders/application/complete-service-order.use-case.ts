/**
 * Complete atómico: orden + km + inventario en una sola TX (contrato 06).
 * Desviación D3: sin upsert de maintenance_schedules (tablas no existen).
 */
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { formatQty, qty } from '../../../shared/common/decimal.js';
import { canComplete } from '../domain/order-status.js';
import {
  INVENTORY_STOCK_PORT,
  SERVICE_ORDER_REPOSITORY,
  UNIT_OF_WORK,
  VEHICLE_MILEAGE_PORT,
} from '../service-orders.tokens.js';
import type { InventoryStockPort } from './ports/inventory-stock.port.js';
import type { ServiceOrderRepository } from './ports/service-order.repository.js';
import type { UnitOfWork } from './ports/unit-of-work.js';
import type { VehicleMileagePort } from './ports/vehicle-mileage.port.js';

@Injectable()
export class CompleteServiceOrderUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(SERVICE_ORDER_REPOSITORY) private readonly orders: ServiceOrderRepository,
    @Inject(INVENTORY_STOCK_PORT) private readonly inventory: InventoryStockPort,
    @Inject(VEHICLE_MILEAGE_PORT) private readonly mileage: VehicleMileagePort,
    private readonly audit: AuditService,
  ) {}

  async execute(input: { businessId: string; orderId: string; actorId: string }) {
    return this.uow.run(async (tx) => {
      const order = await this.orders.lockForUpdate(tx, input.businessId, input.orderId);
      if (!order) {
        throw Errors.serviceOrderNotFound();
      }
      if (order.status === 'COMPLETED') {
        return order;
      }
      if (!canComplete(order.status)) {
        throw Errors.invalidOrderTransition(
          `No se puede completar una orden en estado ${order.status}.`,
        );
      }

      await this.mileage.lockAndUpdateForOrder(tx, {
        businessId: input.businessId,
        vehicleId: order.vehicleId,
        mileage: order.mileage,
        orderId: order.id,
        actorId: input.actorId,
      });

      const lines: { productId: string; quantity: string }[] = [];
      for (const item of order.items) {
        if (item.executionStatus === 'NOT_PERFORMED') {
          continue;
        }
        for (const usage of item.productUsages) {
          const amount =
            usage.quantityConsumed != null
              ? qty(usage.quantityConsumed)
              : qty(usage.quantity);
          if (amount.lte(0)) {
            continue;
          }
          lines.push({
            productId: usage.productId,
            quantity: formatQty(amount),
          });
        }
      }

      await this.inventory.consumeForServiceOrder(
        {
          businessId: input.businessId,
          orderId: order.id,
          actorId: input.actorId,
          reason: `Orden ${order.orderNumber}`,
          lines,
        },
        tx,
      );

      const closedAt = new Date();
      const completed = await this.orders.markCompleted(tx, {
        businessId: input.businessId,
        id: order.id,
        actorId: input.actorId,
        closedAt,
      });

      await this.audit.record(
        {
          businessId: input.businessId,
          actorUserId: input.actorId,
          action: 'SERVICE_ORDER_COMPLETED',
          entityType: 'SERVICE_ORDER',
          entityId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            fromStatus: order.status,
            mileage: order.mileage,
            vehicleId: order.vehicleId,
            closedAt: closedAt.toISOString(),
            operatorUserId: order.operatorUserId,
            technicianUserId: order.technicianUserId,
            closedByUserId: input.actorId,
          },
        },
        // AuditService accepts Prisma client; adapter TX is Prisma under the hood.
        tx as never,
      );

      return completed;
    });
  }
}
