/**
 * Recepción de compra multi-línea. Atómica: todas las ENTRY o ninguna.
 * Idempotente por operationKey de la recepción.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { qty } from '../../../shared/common/decimal.js';
import { InventoryStockService } from './inventory-stock.service.js';

export interface PurchaseReceiptLineInput {
  productId: string;
  quantity: string;
  unit: string;
}

export interface CreatePurchaseReceiptInput {
  businessId: string;
  actorId: string;
  supplierName: string;
  documentRef?: string;
  receivedAt: string;
  notes?: string;
  operationKey?: string;
  lines: PurchaseReceiptLineInput[];
}

@Injectable()
export class CreatePurchaseReceiptUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
  ) {}

  async execute(input: CreatePurchaseReceiptInput) {
    const supplierName = input.supplierName?.trim();
    if (!supplierName) {
      throw Errors.invalidMovement('El proveedor es obligatorio.');
    }
    if (!input.lines?.length) {
      throw Errors.invalidMovement('La recepción debe incluir al menos un producto.');
    }
    const receivedAt = new Date(input.receivedAt);
    if (Number.isNaN(receivedAt.getTime())) {
      throw Errors.invalidMovement('La fecha de recepción no es válida.');
    }

    const normalizedLines = input.lines.map((line) => {
      const quantity = qty(line.quantity);
      if (quantity.lte(0)) {
        throw Errors.invalidQuantity();
      }
      const unit = line.unit?.trim();
      if (!unit) {
        throw Errors.invalidMovement('Cada línea requiere unidad.');
      }
      return { productId: line.productId, quantity, unit };
    });

    if (input.operationKey) {
      const existing = await this.prisma.purchaseReceipt.findUnique({
        where: {
          businessId_operationKey: {
            businessId: input.businessId,
            operationKey: input.operationKey,
          },
        },
        include: { lines: true },
      });
      if (existing) {
        return existing;
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const receiptId = randomUUID();
        const receipt = await tx.purchaseReceipt.create({
          data: {
            id: receiptId,
            businessId: input.businessId,
            supplierName,
            documentRef: input.documentRef?.trim() || null,
            receivedAt,
            notes: input.notes?.trim() || null,
            operationKey: input.operationKey,
            createdBy: input.actorId,
          },
        });

        const lineRows: Prisma.PurchaseReceiptLineCreateManyInput[] = [];
        for (const line of normalizedLines) {
          const movement = await this.stock.apply(
            {
              businessId: input.businessId,
              productId: line.productId,
              type: 'ENTRY',
              quantity: line.quantity,
              reason: `Compra ${supplierName}${input.documentRef ? ` / ${input.documentRef}` : ''}`,
              relatedEntityType: 'PURCHASE_RECEIPT',
              relatedEntityId: receiptId,
              operationKey: `purchase:${receiptId}:line:${line.productId}`,
              actorId: input.actorId,
              requireActive: true,
            },
            tx,
          );
          lineRows.push({
            id: randomUUID(),
            businessId: input.businessId,
            receiptId,
            productId: line.productId,
            quantity: new Prisma.Decimal(line.quantity.toFixed(3)),
            unit: line.unit,
            movementId: movement.id,
          });
        }

        await tx.purchaseReceiptLine.createMany({ data: lineRows });
        return tx.purchaseReceipt.findUniqueOrThrow({
          where: { id: receiptId },
          include: { lines: true },
        });
      });
    } catch (error) {
      if (
        input.operationKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.purchaseReceipt.findUnique({
          where: {
            businessId_operationKey: {
              businessId: input.businessId,
              operationKey: input.operationKey,
            },
          },
          include: { lines: true },
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }
}
