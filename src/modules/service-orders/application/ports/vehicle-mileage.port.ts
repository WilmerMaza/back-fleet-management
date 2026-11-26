import type { TransactionClient } from './unit-of-work.js';

export interface VehicleMileagePort {
  lockAndUpdateForOrder(
    tx: TransactionClient,
    input: {
      businessId: string;
      vehicleId: string;
      mileage: number;
      orderId: string;
      actorId: string;
    },
  ): Promise<void>;
}
