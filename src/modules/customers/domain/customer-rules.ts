/**
 * Normalización y validación de PERSON / COMPANY.
 */
import { Errors } from '../../../shared/common/app-error.js';

export function trimOrNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function assertPerson(fields: {
  firstName?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
}) {
  if (!trimOrNull(fields.firstName) || !trimOrNull(fields.documentType) || !trimOrNull(fields.documentNumber)) {
    throw Errors.customerTypeInvalid('Persona requiere nombres y documento.');
  }
}

export function assertCompany(fields: { nit?: string | null; legalName?: string | null }) {
  if (!trimOrNull(fields.nit) || !trimOrNull(fields.legalName)) {
    throw Errors.customerTypeInvalid('Empresa requiere NIT y razón social.');
  }
}
