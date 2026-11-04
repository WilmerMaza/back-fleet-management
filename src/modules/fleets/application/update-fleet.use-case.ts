import { Injectable } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { trimOrNull } from '../../customers/domain/customer-rules.js';

@Injectable()
export class UpdateFleetUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    businessId: string,
    id: string,
    actorId: string,
    input: {
      customerId?: string;
      name?: string;
      description?: string | null;
      status?: EntityStatus;
    },
  ) {
    const current = await this.prisma.fleet.findFirst({ where: { id, businessId } });
    if (!current) {
      throw Errors.fleetNotFound();
    }
    if (input.customerId && input.customerId !== current.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: input.customerId, businessId },
      });
      if (!customer) {
        throw Errors.customerNotFound();
      }
      if (customer.type !== 'COMPANY') {
        throw Errors.fleetRequiresCompany();
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.fleet.update({
        where: { id },
        data: {
          customerId: input.customerId,
          name: input.name?.trim(),
          description: input.description === undefined ? undefined : trimOrNull(input.description),
          status: input.status,
          updatedBy: actorId,
        },
      });
      await this.audit.record(
        {
          businessId,
          actorUserId: actorId,
          action: 'FLEET_UPDATED',
          entityType: 'FLEET',
          entityId: id,
          metadata: { fields: Object.keys(input) },
        },
        tx,
      );
      return updated;
    });
  }
}
