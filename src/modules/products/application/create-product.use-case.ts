import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { assertMoney, assertQuantity, qty } from '../../../shared/common/decimal.js';
import { InventoryStockService } from '../../inventory/application/inventory-stock.service.js';
import { normalizeSku } from '../domain/sku.js';

export interface CreateProductInput {
  businessId: string;
  actorId: string;
  sku: string;
  name: string;
  description?: string;
  unit: string;
  categoryId?: string | null;
  initialStock?: string;
  minStock?: string;
  salePrice?: string | null;
}

@Injectable()
export class CreateProductUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: CreateProductInput) {
    const sku = normalizeSku(input.sku);
    if (!sku || !input.name.trim() || !input.unit.trim()) {
      throw Errors.invalidQuantity();
    }
    const minStock = assertQuantity(qty(input.minStock ?? '0'), true);
    const initial = assertQuantity(qty(input.initialStock ?? '0'), true);
    const salePrice =
      input.salePrice == null || input.salePrice === ''
        ? null
        : assertMoney(qty(input.salePrice));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            id: randomUUID(),
            businessId: input.businessId,
            sku,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            unit: input.unit.trim(),
            categoryId: input.categoryId || null,
            stock: new Prisma.Decimal('0'),
            minStock: new Prisma.Decimal(minStock.toFixed(3)),
            salePrice: salePrice ? new Prisma.Decimal(salePrice.toFixed(2)) : null,
            status: 'ACTIVE',
            createdBy: input.actorId,
            updatedBy: input.actorId,
          },
        });

        await this.audit.record(
          {
            businessId: input.businessId,
            actorUserId: input.actorId,
            action: 'PRODUCT_CREATED',
            entityType: 'PRODUCT',
            entityId: product.id,
            metadata: { sku, initialStock: initial.toFixed(3) },
          },
          tx,
        );

        if (initial.gt(0)) {
          await this.stock.apply(
            {
              businessId: input.businessId,
              productId: product.id,
              type: 'ENTRY',
              quantity: initial,
              reason: 'Stock inicial',
              relatedEntityType: 'PRODUCT',
              relatedEntityId: product.id,
              operationKey: `product:${product.id}:initial-entry`,
              actorId: input.actorId,
            },
            tx,
          );
        }

        return tx.product.findUniqueOrThrow({ where: { id: product.id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.skuExists(sku);
      }
      throw error;
    }
  }
}
