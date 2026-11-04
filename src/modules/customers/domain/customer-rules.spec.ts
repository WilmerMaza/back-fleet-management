import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/common/app-error.js';
import { assertCompany, assertPerson, trimOrNull } from './customer-rules.js';

describe('customer-rules', () => {
  it('recorta vacíos a null', () => {
    expect(trimOrNull('  ')).toBeNull();
    expect(trimOrNull(' ABC ')).toBe('ABC');
  });

  it('exige documento en persona', () => {
    expect(() => assertPerson({ firstName: 'Juan' })).toThrow(AppError);
  });

  it('exige NIT y razón social en empresa', () => {
    expect(() => assertCompany({ nit: '1' })).toThrow(AppError);
    expect(() => assertCompany({ nit: '1', legalName: 'X' })).not.toThrow();
  });
});
