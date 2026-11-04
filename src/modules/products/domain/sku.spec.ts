import { describe, expect, it } from 'vitest';
import { normalizeSku } from './sku.js';

describe('normalizeSku', () => {
  it('unifica espacios y mayúsculas', () => {
    expect(normalizeSku(' oil-5w30 ')).toBe('OIL-5W30');
    expect(normalizeSku('OIL-5W30')).toBe('OIL-5W30');
  });
});
