import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { SERVICE_ORDER_REPOSITORY } from '../service-orders.tokens.js';
import type { ServiceOrderRepository } from './ports/service-order.repository.js';

@Injectable()
export class GetServiceOrderUseCase {
  constructor(
    @Inject(SERVICE_ORDER_REPOSITORY) private readonly orders: ServiceOrderRepository,
  ) {}

  async execute(businessId: string, id: string) {
    const order = await this.orders.findById(businessId, id);
    if (!order) {
      throw Errors.serviceOrderNotFound();
    }
    return order;
  }
}
