import { Errors } from '../../../shared/common/app-error.js';

export function assertMileageChange(current: number, next: number, isAdmin: boolean): void {
  if (!Number.isInteger(next) || next < 0) {
    throw Errors.invalidMileage();
  }
  if (next < current && !isAdmin) {
    throw Errors.mileageDecreaseForbidden();
  }
}
