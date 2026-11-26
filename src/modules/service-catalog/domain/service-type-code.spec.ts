import { describe, expect, it } from 'vitest';
import { isValidServiceTypeCode, normalizeServiceTypeCode } from './service-type-code.js';

describe('normalizeServiceTypeCode', () => {
  it('trim y uppercase', () => {
    expect(normalizeServiceTypeCode('  cambio_aceite  ')).toBe('CAMBIO_ACEITE');
  });
});

describe('isValidServiceTypeCode', () => {
  it('rechaza vacío', () => {
    expect(isValidServiceTypeCode('')).toBe(false);
  });

  it('acepta código normalizado', () => {
    expect(isValidServiceTypeCode('CAMBIO_ACEITE')).toBe(true);
  });
});
