import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';

@Injectable()
export class ChangeProductStatusUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(businessId: string, id: string, actorId: string, status: ProductStatus) {
    const current = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!current) {
      throw Errors.productNotFound();
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { status, updatedBy: actorId },
      });
      await this.audit.record(
        {
          businessId,
          actorUserId: actorId,
          action: status === 'ACTIVE' ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
          entityType: 'PRODUCT',
          entityId: id,
          metadata: { from: current.status, to: status },
        },
        tx,
      );
      return updated;
    });
  }
}
