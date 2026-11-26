import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Errors } from '../../../../shared/common/app-error.js';
import type { TransactionClient } from '../../application/ports/unit-of-work.js';
import type { VehicleMileagePort } from '../../application/ports/vehicle-mileage.port.js';

type LockedVehicle = { id: string; current_mileage: number };

@Injectable()
export class VehicleMileageAdapter implements VehicleMileagePort {
  async lockAndUpdateForOrder(
    tx: TransactionClient,
    input: {
      businessId: string;
      vehicleId: string;
      mileage: number;
      orderId: string;
      actorId: string;
    },
  ): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    const rows = await client.$queryRaw<LockedVehicle[]>`
      SELECT id, current_mileage
      FROM vehicles
      WHERE id = ${input.vehicleId}::uuid AND business_id = ${input.businessId}::uuid
      FOR UPDATE
    `;
    const vehicle = rows[0];
    if (!vehicle) {
      throw Errors.vehicleNotFound();
    }
    if (input.mileage < vehicle.current_mileage) {
      throw Errors.mileageDecreaseForbidden();
    }
    await client.vehicle.update({
      where: { id: vehicle.id },
      data: {
        currentMileage: input.mileage,
        updatedBy: input.actorId,
      },
    });
    await client.vehicleMileageLog.create({
      data: {
        businessId: input.businessId,
        vehicleId: input.vehicleId,
        mileage: input.mileage,
        source: 'SERVICE_ORDER',
        sourceId: input.orderId,
        recordedBy: input.actorId,
      },
    });
  }
}
