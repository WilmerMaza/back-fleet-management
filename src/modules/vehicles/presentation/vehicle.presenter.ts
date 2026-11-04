import { Vehicle, VehicleMileageLog } from '@prisma/client';

export function presentVehicle(row: Vehicle) {
  return {
    id: row.id,
    businessId: row.businessId,
    customerId: row.customerId,
    fleetId: row.fleetId,
    plate: row.plate,
    vin: row.vin,
    brand: row.brand,
    line: row.line,
    model: row.model,
    year: row.year,
    vehicleType: row.vehicleType,
    color: row.color,
    fuelType: row.fuelType,
    engineCapacity: row.engineCapacity,
    version: row.version,
    currentMileage: row.currentMileage,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy ?? undefined,
    updatedBy: row.updatedBy ?? undefined,
  };
}

export function presentMileageLog(row: VehicleMileageLog) {
  return {
    id: row.id,
    businessId: row.businessId,
    vehicleId: row.vehicleId,
    mileage: row.mileage,
    recordedAt: row.recordedAt.toISOString(),
    source: row.source,
    sourceId: row.sourceId ?? undefined,
    recordedBy: row.recordedBy ?? undefined,
  };
}
