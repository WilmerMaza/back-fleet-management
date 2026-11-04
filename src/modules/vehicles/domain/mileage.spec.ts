import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/common/app-error.js';
import { assertMileageChange } from './mileage.js';

describe('assertMileageChange', () => {
  it('permite subir el km', () => {
    expect(() => assertMileageChange(10, 11, false)).not.toThrow();
  });

  it('bloquea bajar el km si no es admin', () => {
    expect(() => assertMileageChange(10, 9, false)).toThrow(AppError);
  });

  it('permite el ajuste admin auditado', () => {
    expect(() => assertMileageChange(10, 9, true)).not.toThrow();
  });
});
