import { describe, expect, it } from 'vitest';
import { isValidCatalogName, normalizeCatalogName } from './normalize-catalog-name.js';

describe('normalizeCatalogName', () => {
  it('recorta espacios y unifica mayúsculas', () => {
    expect(normalizeCatalogName('  Mobil   1  ')).toBe('mobil 1');
    expect(isValidCatalogName('')).toBe(false);
    expect(isValidCatalogName('Filtros')).toBe(true);
  });
});
