/**
 * Único escritor de products.stock. Orders y Sales deben llamar aquí, no Prisma.
 */
import { Injectable } from '@nestjs/common';
import { InventoryMovement, InventoryMovementType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { Decimal, formatQty, qty } from '../../../shared/common/decimal.js';
import { nextStock, sameMovement } from '../domain/stock-math.js';

export interface ApplyStockInput {
  businessId: string;
  productId: string;
  type: InventoryMovementType;
  quantity: Decimal;
  reason?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  operationKey?: string;
  reversesMovementId?: string;
  actorId: string;
}

type LockedProduct = { id: string; stock: string };

@Injectable()
export class InventoryStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async apply(input: ApplyStockInput, tx?: Prisma.TransactionClient): Promise<InventoryMovement> {
    if (tx) {
      return this.applyInTx(tx, input);
    }
    return this.prisma.$transaction((inner) => this.applyInTx(inner, input));
  }

  private async applyInTx(
    tx: Prisma.TransactionClient,
    input: ApplyStockInput,
  ): Promise<InventoryMovement> {
    if (input.operationKey) {
      const existing = await tx.inventoryMovement.findUnique({
        where: {
          businessId_operationKey: {
            businessId: input.businessId,
            operationKey: input.operationKey,
          },
        },
      });
      if (existing) {
        if (
          sameMovement(
            { productId: existing.productId, type: existing.type, quantity: qty(existing.quantity) },
            { productId: input.productId, type: input.type, quantity: input.quantity },
          )
        ) {
          return existing;
        }
        throw Errors.operationConflict();
      }
    }

    const rows = await tx.$queryRaw<LockedProduct[]>`
      SELECT id, stock::text AS stock
      FROM products
      WHERE id = ${input.productId}::uuid AND business_id = ${input.businessId}::uuid
      FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) {
      throw Errors.productNotFound();
    }

    if (input.reversesMovementId) {
      const original = await tx.inventoryMovement.findFirst({
        where: { id: input.reversesMovementId, businessId: input.businessId },
      });
      if (!original || original.productId !== input.productId) {
        throw Errors.invalidMovement('El movimiento original no existe.');
      }
      if (original.type !== 'EXIT') {
        throw Errors.invalidMovement('Solo se puede devolver una salida.');
      }
      const already = await tx.inventoryMovement.aggregate({
        where: { reversesMovementId: original.id, businessId: input.businessId, type: 'RETURN' },
        _sum: { quantity: true },
      });
      const returned = qty(already._sum.quantity ?? 0).plus(input.quantity);
      if (returned.gt(qty(original.quantity))) {
        throw Errors.invalidMovement('La devolución supera la salida original.');
      }
    }

    const before = qty(locked.stock);
    const after = nextStock(before, input.type, input.quantity, input.productId);
    const movementId = randomUUID();

    await tx.product.update({
      where: { id: locked.id },
      data: {
        stock: new Prisma.Decimal(after.toFixed(3)),
        version: { increment: 1 },
        updatedBy: input.actorId,
      },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        id: movementId,
        businessId: input.businessId,
        productId: input.productId,
        type: input.type,
        quantity: new Prisma.Decimal(
          input.type === 'ADJUSTMENT' ? after.toFixed(3) : input.quantity.toFixed(3),
        ),
        stockBefore: new Prisma.Decimal(before.toFixed(3)),
        stockAfter: new Prisma.Decimal(after.toFixed(3)),
        reason: input.reason,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        operationKey: input.operationKey,
        reversesMovementId: input.reversesMovementId,
        createdBy: input.actorId,
      },
    });

    await this.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorId,
        action: 'INVENTORY_MOVEMENT_CREATED',
        entityType: 'INVENTORY_MOVEMENT',
        entityId: movement.id,
        metadata: {
          productId: input.productId,
          type: input.type,
          quantity: formatQty(input.quantity),
          stockBefore: formatQty(before),
          stockAfter: formatQty(after),
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        },
      },
      tx,
    );

    return movement;
  }
}
