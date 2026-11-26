/**
 * Política mínima de contraseñas para cuentas locales KONTI.
 */
import { AppError } from '../../../shared/common/app-error.js';

const MIN_LENGTH = 8;

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw new AppError(
      'WEAK_PASSWORD',
      `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`,
      400,
    );
  }
}
