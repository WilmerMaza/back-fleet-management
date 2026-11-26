import type { ServiceTypeRecord } from '../application/ports/service-type.repository.port.js';

export function presentServiceType(row: ServiceTypeRecord) {
  return {
    id: row.id,
    businessId: row.businessId,
    code: row.code,
    name: row.name,
    category: row.category ?? undefined,
    description: row.description ?? undefined,
    status: row.status,
    parameters: row.parameters ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
