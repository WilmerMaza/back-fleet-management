import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { assertMoney, assertQuantity, qty } from '../../../shared/common/decimal.js';
import { ResolveProductClassification } from '../../product-catalog/application/resolve-product-classification.js';
import { normalizeSku } from '../domain/sku.js';

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  categoryId?: string | null;
  brandId?: string | null;
  minStock?: string;
  salePrice?: string | null;
}

@Injectable()
export class UpdateProductUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly classification: ResolveProductClassification,
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

    const data: Prisma.ProductUncheckedUpdateInput = { updatedBy: actorId };
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
    if (input.minStock != null) {
      data.minStock = new Prisma.Decimal(assertQuantity(qty(input.minStock), true).toFixed(3));
    }
    if (input.salePrice !== undefined) {
      data.salePrice =
        input.salePrice == null || input.salePrice === ''
          ? null
          : new Prisma.Decimal(assertMoney(qty(input.salePrice)).toFixed(2));
    }

    if (input.categoryId !== undefined) {
      const hasCats = await this.classification.businessHasActiveCategories(businessId);
      if (hasCats && !input.categoryId) {
        throw Errors.categoryRequired();
      }
      if (input.categoryId) {
        const { categoryId } = await this.classification.assertAssignable(businessId, {
          categoryId: input.categoryId,
          requireCategory: false,
        });
        data.categoryId = categoryId;
      } else {
        data.categoryId = null;
      }
    }

    if (input.brandId !== undefined) {
      if (input.brandId) {
        const { brandId } = await this.classification.assertAssignable(businessId, {
          brandId: input.brandId,
          requireCategory: false,
        });
        data.brandId = brandId;
      } else {
        data.brandId = null;
      }
    }

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id },
          data,
          include: { category: { include: { parent: true } }, brand: true },
        });
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
