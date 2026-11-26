/**
 * Normalización de nombres de categoría/marca para unicidad por negocio.
 */
export function normalizeCatalogName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CO');
}

export function isValidCatalogName(value: string): boolean {
  const normalized = normalizeCatalogName(value);
  return normalized.length >= 1 && normalized.length <= 120;
}
