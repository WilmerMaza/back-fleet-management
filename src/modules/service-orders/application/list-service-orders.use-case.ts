import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_ORDER_REPOSITORY } from '../service-orders.tokens.js';
import type {
  ListOrdersQuery,
  ServiceOrderRepository,
} from './ports/service-order.repository.js';

@Injectable()
export class ListServiceOrdersUseCase {
  constructor(
    @Inject(SERVICE_ORDER_REPOSITORY) private readonly orders: ServiceOrderRepository,
  ) {}

  execute(businessId: string, query: ListOrdersQuery) {
    return this.orders.list(businessId, query);
  }
}
