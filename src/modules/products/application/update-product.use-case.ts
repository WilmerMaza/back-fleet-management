import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { assertMoney, assertQuantity, qty } from '../../../shared/common/decimal.js';
import { normalizeSku } from '../domain/sku.js';

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  categoryId?: string | null;
  minStock?: string;
  salePrice?: string | null;
}

@Injectable()
export class UpdateProductUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    businessId: string,
    id: string,
    actorId: string,
    input: UpdateProductInput,
    forbiddenKeys: string[],
  ) {
    if (forbiddenKeys.some((key) => ['stock', 'businessId', 'id'].includes(key))) {
      throw Errors.invalidMovement('El stock no se modifica con PATCH.');
    }

    const current = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!current) {
      throw Errors.productNotFound();
    }

    const data: Prisma.ProductUpdateInput = { updatedBy: actorId };
    if (input.sku != null) {
      data.sku = normalizeSku(input.sku);
    }
    if (input.name != null) {
      data.name = input.name.trim();
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.unit != null) {
      data.unit = input.unit.trim();
    }
    if (input.categoryId !== undefined) {
      data.categoryId = input.categoryId;
    }
    if (input.minStock != null) {
      data.minStock = new Prisma.Decimal(assertQuantity(qty(input.minStock), true).toFixed(3));
    }
    if (input.salePrice !== undefined) {
      data.salePrice =
        input.salePrice == null || input.salePrice === ''
          ? null
          : new Prisma.Decimal(assertMoney(qty(input.salePrice)).toFixed(2));
    }

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({ where: { id }, data });
        await this.audit.record(
          {
            businessId,
            actorUserId: actorId,
            action: 'PRODUCT_UPDATED',
            entityType: 'PRODUCT',
            entityId: id,
            metadata: { fields: Object.keys(input) },
          },
          tx,
        );
        return updated;
      });
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.skuExists(String(data.sku ?? current.sku));
      }
      throw error;
    }
  }
}
