import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { InventoryStockService } from '../../../inventory/application/inventory-stock.service.js';
import { qty } from '../../../../shared/common/decimal.js';
import type {
  InventoryStockPort,
  OrderStockLineInput,
} from '../../application/ports/inventory-stock.port.js';
import type { TransactionClient } from '../../application/ports/unit-of-work.js';

@Injectable()
export class InventoryStockAdapter implements InventoryStockPort {
  constructor(private readonly stock: InventoryStockService) {}

  async consumeForServiceOrder(
    input: {
      businessId: string;
      orderId: string;
      lines: OrderStockLineInput[];
      actorId: string;
      reason?: string;
    },
    tx: TransactionClient,
  ): Promise<void> {
    await this.stock.consumeForServiceOrder(
      {
        businessId: input.businessId,
        orderId: input.orderId,
        actorId: input.actorId,
        reason: input.reason,
        lines: input.lines.map((line) => ({
          productId: line.productId,
          quantity: qty(line.quantity),
        })),
      },
      tx as Prisma.TransactionClient,
    );
  }
}
