/**
 * Alta de cliente del taller aislado por negocio.
 */
import { Injectable } from '@nestjs/common';
import { CustomerType, EntityStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { assertCompany, assertPerson, trimOrNull } from '../domain/customer-rules.js';

export interface CreateCustomerInput {
  businessId: string;
  actorId: string;
  type: CustomerType;
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
export class CreateCustomerUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: CreateCustomerInput) {
    if (input.type === 'PERSON') {
      assertPerson(input);
    } else {
      assertCompany(input);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            id: randomUUID(),
            businessId: input.businessId,
            type: input.type,
            status: input.status ?? 'ACTIVE',
            documentType: trimOrNull(input.documentType),
            documentNumber: trimOrNull(input.documentNumber),
            firstName: trimOrNull(input.firstName),
            lastName: trimOrNull(input.lastName),
            nit: trimOrNull(input.nit),
            legalName: trimOrNull(input.legalName),
            tradeName: trimOrNull(input.tradeName),
            contactName: trimOrNull(input.contactName),
            phone: trimOrNull(input.phone),
            email: trimOrNull(input.email),
            address: trimOrNull(input.address),
            createdBy: input.actorId,
            updatedBy: input.actorId,
          },
        });
        await this.audit.record(
          {
            businessId: input.businessId,
            actorUserId: input.actorId,
            action: 'CUSTOMER_CREATED',
            entityType: 'CUSTOMER',
            entityId: customer.id,
            metadata: { type: customer.type },
          },
          tx,
        );
        return customer;
      });
    } catch (error) {
      throw mapCustomerConflict(error, input.type);
    }
  }
}

export function mapCustomerConflict(error: unknown, type: CustomerType): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw type === 'COMPANY' ? Errors.customerNitExists() : Errors.customerDocumentExists();
  }
  throw error;
}
