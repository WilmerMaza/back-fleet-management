/**
 * Único escritor de products.stock. Orders y Sales deben llamar aquí, no Prisma.
 *
 * - FOR UPDATE por producto (ids ASC en lotes).
 * - operationKey idempotente (también ante carrera P2002).
 * - EXIT nunca deja stock negativo.
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
  /** Si true, rechaza productos INACTIVE (entradas/salidas/ajustes manuales nuevos). */
  requireActive?: boolean;
}

export interface OrderStockLine {
  productId: string;
  quantity: Decimal;
}

type LockedProduct = { id: string; stock: string; status: string };

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

  /**
   * Varias líneas en una TX. Bloquea productos en orden ASC de id (docs/lock-order.md).
   */
  async applyMany(
    inputs: ApplyStockInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryMovement[]> {
    if (inputs.length === 0) {
      return [];
    }
    const run = async (client: Prisma.TransactionClient) => {
      const sorted = [...inputs].sort((a, b) => a.productId.localeCompare(b.productId));
      const movements: InventoryMovement[] = [];
      for (const input of sorted) {
        movements.push(await this.applyInTx(client, input));
      }
      return movements;
    };
    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((inner) => run(inner));
  }

  /**
   * Consumo atómico por orden de trabajo. Idempotente por
   * `order:{orderId}:exit:{productId}`. Valida existencias de todas las líneas
   * bajo lock antes de escribir; sin descuentos parciales.
   */
  async consumeForServiceOrder(
    input: {
      businessId: string;
      orderId: string;
      lines: OrderStockLine[];
      actorId: string;
      reason?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryMovement[]> {
    const aggregated = new Map<string, Decimal>();
    for (const line of input.lines) {
      const amount = qty(line.quantity);
      if (amount.lte(0)) {
        continue;
      }
      const prev = aggregated.get(line.productId) ?? qty(0);
      aggregated.set(line.productId, prev.plus(amount));
    }
    if (aggregated.size === 0) {
      return [];
    }

    const run = (client: Prisma.TransactionClient) =>
      this.consumeForServiceOrderInTx(client, input, aggregated);

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((inner) => run(inner));
  }

  private async consumeForServiceOrderInTx(
    tx: Prisma.TransactionClient,
    input: {
      businessId: string;
      orderId: string;
      lines: OrderStockLine[];
      actorId: string;
      reason?: string;
    },
    aggregated: Map<string, Decimal>,
  ): Promise<InventoryMovement[]> {
    const productIds = [...aggregated.keys()].sort();
    const keys = productIds.map(
      (productId) => `order:${input.orderId}:exit:${productId}`,
    );

    // Idempotencia antes de validar stock: un reintento no exige existencias otra vez.
    const existing = await tx.inventoryMovement.findMany({
      where: {
        businessId: input.businessId,
        operationKey: { in: keys },
      },
    });
    if (existing.length === productIds.length) {
      const byKey = new Map(existing.map((m) => [m.operationKey!, m]));
      return productIds.map((productId) => {
        const movement = byKey.get(`order:${input.orderId}:exit:${productId}`)!;
        const expected = aggregated.get(productId)!;
        if (
          !sameMovement(
            {
              productId: movement.productId,
              type: movement.type,
              quantity: qty(movement.quantity),
            },
            { productId, type: 'EXIT', quantity: expected },
          )
        ) {
          throw Errors.operationConflict();
        }
        return movement;
      });
    }
    if (existing.length > 0) {
      throw Errors.operationConflict();
    }

    const locked = await this.lockProducts(tx, input.businessId, productIds);
    for (const productId of productIds) {
      const row = locked.get(productId);
      if (!row) {
        throw Errors.productNotFound();
      }
      const need = aggregated.get(productId)!;
      const available = qty(row.stock);
      if (available.lt(need)) {
        throw Errors.insufficientStock(productId, formatQty(available), formatQty(need));
      }
    }

    const movements: InventoryMovement[] = [];
    for (const productId of productIds) {
      const quantity = aggregated.get(productId)!;
      movements.push(
        await this.applyInTx(tx, {
          businessId: input.businessId,
          productId,
          type: 'EXIT',
          quantity,
          reason: input.reason ?? `Orden ${input.orderId}`,
          relatedEntityType: 'SERVICE_ORDER',
          relatedEntityId: input.orderId,
          operationKey: `order:${input.orderId}:exit:${productId}`,
          actorId: input.actorId,
          requireActive: false,
        }),
      );
    }
    return movements;
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

    const lockedMap = await this.lockProducts(tx, input.businessId, [input.productId]);
    const locked = lockedMap.get(input.productId);
    if (!locked) {
      throw Errors.productNotFound();
    }
    if (input.requireActive && locked.status !== 'ACTIVE') {
      throw Errors.productInactive();
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

    try {
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
    } catch (error) {
      const isUniqueViolation =
        !!input.operationKey &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002';
      if (isUniqueViolation) {
        const operationKey = input.operationKey!;
        const raced = await tx.inventoryMovement.findUnique({
          where: {
            businessId_operationKey: {
              businessId: input.businessId,
              operationKey,
            },
          },
        });
        if (
          raced &&
          sameMovement(
            { productId: raced.productId, type: raced.type, quantity: qty(raced.quantity) },
            { productId: input.productId, type: input.type, quantity: input.quantity },
          )
        ) {
          // El UPDATE de stock ya corrió; revertir para no descontar dos veces.
          await tx.product.update({
            where: { id: locked.id },
            data: {
              stock: new Prisma.Decimal(before.toFixed(3)),
              updatedBy: input.actorId,
            },
          });
          return raced;
        }
        throw Errors.operationConflict();
      }
      throw error;
    }
  }

  private async lockProducts(
    tx: Prisma.TransactionClient,
    businessId: string,
    productIds: string[],
  ): Promise<Map<string, LockedProduct>> {
    const ids = [...new Set(productIds)].sort();
    const locked = new Map<string, LockedProduct>();
    for (const id of ids) {
      const rows = await tx.$queryRaw<LockedProduct[]>`
        SELECT id, stock::text AS stock, status::text AS status
        FROM products
        WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid
        FOR UPDATE
      `;
      if (rows[0]) {
        locked.set(rows[0].id, rows[0]);
      }
    }
    return locked;
  }
}
