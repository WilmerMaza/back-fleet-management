/**
 * Aritmética decimal exacta para cantidades y dinero.
 * No usar number para stock ni precios.
 */
import { Decimal } from 'decimal.js';
import { Errors } from './app-error.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function qty(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function assertQuantity(value: Decimal, allowZero = false): Decimal {
  if (!value.isFinite() || value.decimalPlaces() > 3) {
    throw Errors.invalidQuantity();
  }
  if (allowZero ? value.lt(0) : value.lte(0)) {
    throw Errors.invalidQuantity();
  }
  return value;
}

export function assertMoney(value: Decimal): Decimal {
  if (!value.isFinite() || value.lt(0) || value.decimalPlaces() > 2) {
    throw Errors.invalidPrice();
  }
  return value;
}

export function formatQty(value: Decimal): string {
  return value.toFixed(3);
}

export function formatMoney(value: Decimal | null): string | null {
  return value == null ? null : value.toFixed(2);
}
