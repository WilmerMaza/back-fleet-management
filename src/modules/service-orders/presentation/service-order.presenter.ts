import type { ServiceOrderRecord } from '../application/ports/service-order.repository.js';

export function presentServiceOrder(order: ServiceOrderRecord) {
  return {
    id: order.id,
    businessId: order.businessId,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    vehicleId: order.vehicleId,
    status: order.status,
    openedAt: order.openedAt,
    closedAt: order.closedAt,
    closedByUserId: order.closedByUserId,
    mileage: order.mileage,
    nextMaintenanceMileage: order.nextMaintenanceMileage,
    nextMaintenanceDate: order.nextMaintenanceDate,
    maintenanceRule: order.maintenanceRule,
    observations: order.observations,
    createdBy: order.createdBy,
    operatorUserId: order.operatorUserId,
    technicianUserId: order.technicianUserId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    updatedBy: order.updatedBy,
    items: order.items.map((item) => ({
      id: item.id,
      serviceTypeId: item.serviceTypeId,
      serviceTypeCode: item.serviceTypeCode,
      serviceTypeName: item.serviceTypeName,
      notes: item.notes,
      origin: item.origin,
      executionStatus: item.executionStatus,
      productUsages: item.productUsages.map((u) => ({
        productId: u.productId,
        productName: u.productName,
        sku: u.sku,
        quantity: Number(u.quantity),
        unit: u.unit,
        plannedQuantity: Number(u.quantity),
        consumedQuantity:
          u.quantityConsumed == null ? undefined : Number(u.quantityConsumed),
        unitPrice: u.unitPrice == null ? undefined : Number(u.unitPrice),
      })),
    })),
  };
}
