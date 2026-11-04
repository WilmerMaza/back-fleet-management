/**
 * Nombre mostrado del cliente del taller (no del tenant).
 */
export function customerDisplayName(customer: {
  type: 'PERSON' | 'COMPANY';
  tradeName?: string | null;
  legalName?: string | null;
  nit?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  documentNumber?: string | null;
}): string {
  if (customer.type === 'COMPANY') {
    return customer.tradeName || customer.legalName || customer.nit || 'Empresa';
  }
  return (
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
    customer.documentNumber ||
    'Cliente'
  );
}
