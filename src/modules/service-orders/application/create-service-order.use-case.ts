import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import type { ServiceOrderStatus } from '../domain/order-status.js';
import { SERVICE_ORDER_REPOSITORY } from '../service-orders.tokens.js';
import type {
  CreateOrderItemInput,
  ServiceOrderRepository,
} from './ports/service-order.repository.js';

@Injectable()
export class CreateServiceOrderUseCase {
  constructor(
    @Inject(SERVICE_ORDER_REPOSITORY) private readonly orders: ServiceOrderRepository,
  ) {}

  async execute(input: {
    businessId: string;
    actorId: string;
    customerId: string;
    vehicleId: string;
    status?: ServiceOrderStatus;
    openedAt: string;
    mileage: number;
    nextMaintenanceMileage?: number;
    nextMaintenanceDate?: string;
    maintenanceRule?: string;
    observations?: string;
    operatorUserId?: string;
    technicianUserId?: string;
    items: CreateOrderItemInput[];
  }) {
    const status = input.status ?? 'OPEN';
    if (status !== 'DRAFT' && status !== 'OPEN') {
      throw Errors.invalidOrderTransition('El alta solo admite DRAFT u OPEN.');
    }
    if (!input.items?.length) {
      throw Errors.invalidMovement('La orden debe incluir al menos un servicio.');
    }
    return this.orders.create({
      businessId: input.businessId,
      actorId: input.actorId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      status,
      openedAt: input.openedAt,
      mileage: input.mileage,
      nextMaintenanceMileage: input.nextMaintenanceMileage,
      nextMaintenanceDate: input.nextMaintenanceDate,
      maintenanceRule: input.maintenanceRule,
      observations: input.observations,
      operatorUserId: input.operatorUserId,
      technicianUserId: input.technicianUserId,
      items: input.items,
    });
  }
}
