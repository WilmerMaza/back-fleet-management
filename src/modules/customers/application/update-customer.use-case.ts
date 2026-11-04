/**
 * PATCH de cliente: clave ausente no cambia; null vacía el opcional.
 */
import { Injectable } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { assertCompany, assertPerson, trimOrNull } from '../domain/customer-rules.js';
import { mapCustomerConflict } from './create-customer.use-case.js';

export interface UpdateCustomerInput {
  status?: EntityStatus;
  documentType?: string | null;
  documentNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  nit?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

@Injectable()
export class UpdateCustomerUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(businessId: string, id: string, actorId: string, input: UpdateCustomerInput) {
    const current = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!current) {
      throw Errors.customerNotFound();
    }

    const next = {
      documentType: pick(input.documentType, current.documentType),
      documentNumber: pick(input.documentNumber, current.documentNumber),
      firstName: pick(input.firstName, current.firstName),
      lastName: pick(input.lastName, current.lastName),
      nit: pick(input.nit, current.nit),
      legalName: pick(input.legalName, current.legalName),
    };
    if (current.type === 'PERSON') {
      assertPerson(next);
    } else {
      assertCompany(next);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id },
          data: {
            status: input.status,
            documentType: maybe(input.documentType),
            documentNumber: maybe(input.documentNumber),
            firstName: maybe(input.firstName),
            lastName: maybe(input.lastName),
            nit: maybe(input.nit),
            legalName: maybe(input.legalName),
            tradeName: maybe(input.tradeName),
            contactName: maybe(input.contactName),
            phone: maybe(input.phone),
            email: maybe(input.email),
            address: maybe(input.address),
            updatedBy: actorId,
          },
        });
        await this.audit.record(
          {
            businessId,
            actorUserId: actorId,
            action: 'CUSTOMER_UPDATED',
            entityType: 'CUSTOMER',
            entityId: id,
            metadata: { fields: Object.keys(input) },
          },
          tx,
        );
        return updated;
      });
    } catch (error) {
      throw mapCustomerConflict(error, current.type);
    }
  }
}

function pick(incoming: string | null | undefined, current: string | null): string | null {
  return incoming === undefined ? current : trimOrNull(incoming);
}

function maybe(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return trimOrNull(value);
}
