import { Customer } from '@prisma/client';

export function presentCustomer(row: Customer) {
  return {
    id: row.id,
    businessId: row.businessId,
    type: row.type,
    status: row.status,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    nit: row.nit,
    legalName: row.legalName,
    tradeName: row.tradeName,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy ?? undefined,
    updatedBy: row.updatedBy ?? undefined,
  };
}
