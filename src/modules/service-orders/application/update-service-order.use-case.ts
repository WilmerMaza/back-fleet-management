import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_ORDER_REPOSITORY } from '../service-orders.tokens.js';
import type { ServiceOrderRepository } from './ports/service-order.repository.js';

@Injectable()
export class UpdateServiceOrderUseCase {
  constructor(
    @Inject(SERVICE_ORDER_REPOSITORY) private readonly orders: ServiceOrderRepository,
  ) {}

  execute(
    businessId: string,
    id: string,
    actorId: string,
    patch: {
      observations?: string | null;
      operatorUserId?: string | null;
      technicianUserId?: string | null;
      mileage?: number;
      nextMaintenanceMileage?: number | null;
      nextMaintenanceDate?: string | null;
      maintenanceRule?: string | null;
    },
  ) {
    return this.orders.updateHeader(businessId, id, actorId, patch);
  }
}
