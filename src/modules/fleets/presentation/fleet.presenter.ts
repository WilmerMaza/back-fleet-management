import { Fleet } from '@prisma/client';

export function presentFleet(
  row: Fleet,
  extras: { customerName?: string; vehicleCount?: number } = {},
) {
  return {
    id: row.id,
    businessId: row.businessId,
    customerId: row.customerId,
    name: row.name,
    description: row.description,
    status: row.status,
    customerName: extras.customerName,
    vehicleCount: extras.vehicleCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy ?? undefined,
    updatedBy: row.updatedBy ?? undefined,
  };
}
