import { Injectable } from '@nestjs/common';
import {
  MaintenanceRuleType,
  Prisma,
  ServiceOrderStatus as PrismaStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/database/prisma.service.js';
import { AuditService } from '../../../audit/audit.service.js';
import { Errors } from '../../../../shared/common/app-error.js';
import { formatQty, qty } from '../../../../shared/common/decimal.js';
import type { ServiceOrderStatus } from '../../domain/order-status.js';
import { assertEditable, assertTransition } from '../../domain/order-status.js';
import type {
  CreateServiceOrderData,
  ListOrdersQuery,
  ServiceOrderRecord,
  ServiceOrderRepository,
} from '../../application/ports/service-order.repository.js';
import type { TransactionClient } from '../../application/ports/unit-of-work.js';

const includeTree = {
  items: {
    orderBy: { position: 'asc' as const },
    include: { productUsages: true },
  },
} satisfies Prisma.ServiceOrderInclude;

type OrderRow = Prisma.ServiceOrderGetPayload<{ include: typeof includeTree }>;

@Injectable()
export class PrismaServiceOrderRepository implements ServiceOrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(data: CreateServiceOrderData): Promise<ServiceOrderRecord> {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: data.customerId, businessId: data.businessId },
      });
      if (!customer) {
        throw Errors.customerNotFound();
      }
      const vehicle = await tx.vehicle.findFirst({
        where: { id: data.vehicleId, businessId: data.businessId },
      });
      if (!vehicle) {
        throw Errors.vehicleNotFound();
      }
      if (vehicle.customerId !== data.customerId) {
        throw Errors.vehicleCustomerMismatch();
      }
      if (data.mileage < 0) {
        throw Errors.invalidQuantity();
      }

      const orderNumber = await this.nextOrderNumber(tx, data.businessId);
      const orderId = randomUUID();
      const openedAt = new Date(data.openedAt);
      if (Number.isNaN(openedAt.getTime())) {
        throw Errors.invalidMovement('openedAt inválido.');
      }

      await tx.serviceOrder.create({
        data: {
          id: orderId,
          businessId: data.businessId,
          orderNumber,
          customerId: data.customerId,
          vehicleId: data.vehicleId,
          status: data.status as PrismaStatus,
          openedAt,
          mileage: data.mileage,
          nextMaintenanceMileage: data.nextMaintenanceMileage ?? null,
          nextMaintenanceDate: data.nextMaintenanceDate
            ? new Date(data.nextMaintenanceDate)
            : null,
          maintenanceRule: parseRule(data.maintenanceRule),
          observations: data.observations?.trim() || null,
          createdBy: data.actorId,
          operatorUserId: data.operatorUserId ?? null,
          technicianUserId: data.technicianUserId ?? null,
          updatedBy: data.actorId,
        },
      });

      let position = 0;
      for (const item of data.items) {
        const serviceType = await tx.serviceType.findFirst({
          where: {
            id: item.serviceTypeId,
            businessId: data.businessId,
            status: 'ACTIVE',
          },
        });
        if (!serviceType) {
          throw Errors.serviceTypeNotFound();
        }
        const itemId = randomUUID();
        await tx.serviceOrderItem.create({
          data: {
            id: itemId,
            businessId: data.businessId,
            serviceOrderId: orderId,
            serviceTypeId: serviceType.id,
            serviceTypeCode: serviceType.code,
            serviceTypeName: serviceType.name,
            notes: item.notes?.trim() || null,
            position: position++,
            origin: item.origin ?? 'INITIAL',
            executionStatus: item.executionStatus ?? 'PLANNED',
          },
        });
        for (const usage of item.productUsages) {
          const amount = qty(usage.quantity);
          if (amount.lte(0)) {
            throw Errors.invalidQuantity();
          }
          const product = await tx.product.findFirst({
            where: {
              id: usage.productId,
              businessId: data.businessId,
              status: 'ACTIVE',
            },
          });
          if (!product) {
            throw Errors.productNotFound();
          }
          await tx.serviceOrderProductUsage.create({
            data: {
              id: randomUUID(),
              businessId: data.businessId,
              serviceOrderItemId: itemId,
              productId: product.id,
              productName: product.name,
              sku: product.sku,
              quantity: new Prisma.Decimal(amount.toFixed(3)),
              unit: usage.unit?.trim() || product.unit,
              quantityConsumed: usage.quantityConsumed
                ? new Prisma.Decimal(qty(usage.quantityConsumed).toFixed(3))
                : null,
              unitPrice: usage.unitPrice
                ? new Prisma.Decimal(Number(usage.unitPrice).toFixed(2))
                : product.salePrice,
            },
          });
        }
      }

      const created = await tx.serviceOrder.findFirstOrThrow({
        where: { id: orderId, businessId: data.businessId },
        include: includeTree,
      });

      await this.audit.record(
        {
          businessId: data.businessId,
          actorUserId: data.actorId,
          action: 'SERVICE_ORDER_CREATED',
          entityType: 'SERVICE_ORDER',
          entityId: created.id,
          metadata: {
            orderNumber: created.orderNumber,
            status: created.status,
            vehicleId: created.vehicleId,
            customerId: created.customerId,
          },
        },
        tx,
      );

      return mapOrder(created);
    });
  }

  async findById(businessId: string, id: string): Promise<ServiceOrderRecord | null> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, businessId },
      include: includeTree,
    });
    return row ? mapOrder(row) : null;
  }

  async list(businessId: string, query: ListOrdersQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const where: Prisma.ServiceOrderWhereInput = { businessId };
    if (query.status) {
      where.status = query.status as PrismaStatus;
    }
    if (query.vehicleId) {
      where.vehicleId = query.vehicleId;
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { vehicle: { plate: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const sortBy = query.sortBy ?? 'openedAt';
    const sortDir = query.sortDir ?? 'desc';
    const orderBy: Prisma.ServiceOrderOrderByWithRelationInput = {
      [sortBy]: sortDir,
    };

    const [total, rows] = await Promise.all([
      this.prisma.serviceOrder.count({ where }),
      this.prisma.serviceOrder.findMany({
        where,
        include: includeTree,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(mapOrder), total, page, pageSize };
  }

  async updateHeader(
    businessId: string,
    id: string,
    actorId: string,
    patch: {
      observations?: string | null;
      operatorUserId?: string | null;
      technicianUserId?: string | null;
      mileage?: number;
      nextMaintenanceMileage?: number | null;
      nextMaintenanceDate?: string | null;
      maintenanceRule?: string | null;
    },
  ): Promise<ServiceOrderRecord> {
    const current = await this.prisma.serviceOrder.findFirst({ where: { id, businessId } });
    if (!current) {
      throw Errors.serviceOrderNotFound();
    }
    try {
      assertEditable(current.status as ServiceOrderStatus);
    } catch {
      throw Errors.orderNotEditable();
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        observations:
          patch.observations === undefined
            ? undefined
            : patch.observations?.trim() || null,
        operatorUserId:
          patch.operatorUserId === undefined ? undefined : patch.operatorUserId,
        technicianUserId:
          patch.technicianUserId === undefined ? undefined : patch.technicianUserId,
        mileage: patch.mileage,
        nextMaintenanceMileage: patch.nextMaintenanceMileage,
        nextMaintenanceDate:
          patch.nextMaintenanceDate === undefined
            ? undefined
            : patch.nextMaintenanceDate
              ? new Date(patch.nextMaintenanceDate)
              : null,
        maintenanceRule:
          patch.maintenanceRule === undefined
            ? undefined
            : parseRule(patch.maintenanceRule ?? undefined),
        updatedBy: actorId,
      },
      include: includeTree,
    });
    return mapOrder(updated);
  }

  async changeStatus(
    businessId: string,
    id: string,
    actorId: string,
    status: ServiceOrderStatus,
  ): Promise<ServiceOrderRecord> {
    if (status === 'COMPLETED') {
      throw Errors.invalidOrderTransition('Use /complete para cerrar la orden.');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceOrder.findFirst({
        where: { id, businessId },
        include: includeTree,
      });
      if (!current) {
        throw Errors.serviceOrderNotFound();
      }
      try {
        assertTransition(current.status as ServiceOrderStatus, status);
      } catch {
        throw Errors.invalidOrderTransition();
      }
      const updated = await tx.serviceOrder.update({
        where: { id },
        data: { status: status as PrismaStatus, updatedBy: actorId },
        include: includeTree,
      });
      await this.audit.record(
        {
          businessId,
          actorUserId: actorId,
          action: 'SERVICE_ORDER_STATUS_CHANGED',
          entityType: 'SERVICE_ORDER',
          entityId: id,
          metadata: {
            orderNumber: current.orderNumber,
            fromStatus: current.status,
            toStatus: status,
          },
        },
        tx,
      );
      return mapOrder(updated);
    });
  }

  async lockForUpdate(
    tx: TransactionClient,
    businessId: string,
    id: string,
  ): Promise<ServiceOrderRecord | null> {
    const client = tx as Prisma.TransactionClient;
    const rows = await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM service_orders
      WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid
      FOR UPDATE
    `;
    if (!rows[0]) {
      return null;
    }
    const order = await client.serviceOrder.findFirst({
      where: { id, businessId },
      include: includeTree,
    });
    return order ? mapOrder(order) : null;
  }

  async markCompleted(
    tx: TransactionClient,
    input: {
      businessId: string;
      id: string;
      actorId: string;
      closedAt: Date;
    },
  ): Promise<ServiceOrderRecord> {
    const client = tx as Prisma.TransactionClient;
    const updated = await client.serviceOrder.update({
      where: { id: input.id },
      data: {
        status: 'COMPLETED',
        closedAt: input.closedAt,
        closedByUserId: input.actorId,
        updatedBy: input.actorId,
      },
      include: includeTree,
    });
    return mapOrder(updated);
  }

  private async nextOrderNumber(
    tx: Prisma.TransactionClient,
    businessId: string,
  ): Promise<string> {
    const count = await tx.serviceOrder.count({ where: { businessId } });
    return `OT-${String(count + 1).padStart(6, '0')}`;
  }
}

function parseRule(value?: string | null): MaintenanceRuleType | null {
  if (!value) {
    return null;
  }
  if (
    value === 'MILEAGE' ||
    value === 'TIME' ||
    value === 'WHICHEVER_FIRST' ||
    value === 'CUSTOM'
  ) {
    return value;
  }
  return null;
}

function mapOrder(row: OrderRow): ServiceOrderRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    status: row.status as ServiceOrderStatus,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedByUserId: row.closedByUserId,
    mileage: row.mileage,
    nextMaintenanceMileage: row.nextMaintenanceMileage,
    nextMaintenanceDate: row.nextMaintenanceDate
      ? row.nextMaintenanceDate.toISOString().slice(0, 10)
      : null,
    maintenanceRule: row.maintenanceRule,
    observations: row.observations,
    createdBy: row.createdBy,
    operatorUserId: row.operatorUserId,
    technicianUserId: row.technicianUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    items: row.items.map((item) => ({
      id: item.id,
      serviceTypeId: item.serviceTypeId,
      serviceTypeCode: item.serviceTypeCode,
      serviceTypeName: item.serviceTypeName,
      notes: item.notes,
      position: item.position,
      origin: item.origin,
      executionStatus: item.executionStatus,
      productUsages: item.productUsages.map((u) => ({
        id: u.id,
        productId: u.productId,
        productName: u.productName,
        sku: u.sku,
        quantity: formatQty(qty(u.quantity)),
        unit: u.unit,
        quantityConsumed: u.quantityConsumed
          ? formatQty(qty(u.quantityConsumed))
          : null,
        unitPrice: u.unitPrice == null ? null : Number(u.unitPrice).toFixed(2),
      })),
    })),
  };
}
