import type { TransactionClient } from './unit-of-work.js';

export interface OrderStockLineInput {
  productId: string;
  quantity: string;
}

export interface InventoryStockPort {
  consumeForServiceOrder(
    input: {
      businessId: string;
      orderId: string;
      lines: OrderStockLineInput[];
      actorId: string;
      reason?: string;
    },
    tx: TransactionClient,
  ): Promise<void>;
}
