import { Inject, Injectable } from '@nestjs/common';
import type { ServiceOrderStatus } from '../domain/order-status.js';
import { SERVICE_ORDER_REPOSITORY } from '../service-orders.tokens.js';
import type { ServiceOrderRepository } from './ports/service-order.repository.js';

@Injectable()
export class ChangeServiceOrderStatusUseCase {
  constructor(
    @Inject(SERVICE_ORDER_REPOSITORY) private readonly orders: ServiceOrderRepository,
  ) {}

  execute(businessId: string, id: string, actorId: string, status: ServiceOrderStatus) {
    return this.orders.changeStatus(businessId, id, actorId, status);
  }
}
