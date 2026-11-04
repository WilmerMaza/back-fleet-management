import { Injectable } from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface ListMovementsQuery {
  productId?: string;
  type?: InventoryMovementType;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

@Injectable()
export class ListMovementsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, query: ListMovementsQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 20;
    const where = {
      businessId,
      productId: query.productId,
      type: query.type,
      createdAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}
