/**
 * Invariante de propiedad: un vehículo solo puede estar en una flota del mismo cliente.
 */
import { Errors } from '../../../shared/common/app-error.js';

export function assertSameCustomerAsFleet(
  vehicleCustomerId: string,
  fleetCustomerId: string,
): void {
  if (vehicleCustomerId !== fleetCustomerId) {
    throw Errors.fleetVehicleMismatch();
  }
}
