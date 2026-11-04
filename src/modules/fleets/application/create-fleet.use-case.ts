import { Injectable } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { trimOrNull } from '../../customers/domain/customer-rules.js';

@Injectable()
export class CreateFleetUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: {
    businessId: string;
    actorId: string;
    customerId: string;
    name: string;
    description?: string | null;
    status?: EntityStatus;
  }) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
    });
    if (!customer) {
      throw Errors.customerNotFound();
    }
    if (customer.type !== 'COMPANY') {
      throw Errors.fleetRequiresCompany();
    }

    return this.prisma.$transaction(async (tx) => {
      const fleet = await tx.fleet.create({
        data: {
          id: randomUUID(),
          businessId: input.businessId,
          customerId: input.customerId,
          name: input.name.trim(),
          description: trimOrNull(input.description),
          status: input.status ?? 'ACTIVE',
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });
      await this.audit.record(
        {
          businessId: input.businessId,
          actorUserId: input.actorId,
          action: 'FLEET_CREATED',
          entityType: 'FLEET',
          entityId: fleet.id,
        },
        tx,
      );
      return fleet;
    });
  }
}
