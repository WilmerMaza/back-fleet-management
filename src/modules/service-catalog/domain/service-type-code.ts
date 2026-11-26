/**
 * Código de tipo de servicio: trim + uppercase (contrato 05).
 */
export function normalizeServiceTypeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidServiceTypeCode(code: string): boolean {
  return code.length > 0 && code.length <= 60;
}
