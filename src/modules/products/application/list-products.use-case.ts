import { Injectable } from '@nestjs/common';
import { Prisma, Product, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface ListProductsQuery {
  search?: string;
  status?: ProductStatus;
  lowStock?: boolean | string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListProductsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, query: ListProductsQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 20;
    const lowStock = query.lowStock === true || query.lowStock === 'true';
    const search = query.search?.trim();

    const where: Prisma.ProductWhereInput = { businessId };
    if (query.status) {
      where.status = query.status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search.toUpperCase(), mode: 'insensitive' } },
      ];
    }

    if (!lowStock) {
      const [items, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          orderBy: { name: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.product.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }

    const statusFilter = query.status
      ? Prisma.sql`AND status = ${query.status}::"ProductStatus"`
      : Prisma.empty;
    const searchFilter = search
      ? Prisma.sql`AND (name ILIKE ${'%' + search + '%'} OR sku ILIKE ${'%' + search.toUpperCase() + '%'})`
      : Prisma.empty;

    const items = await this.prisma.$queryRaw<Product[]>`
      SELECT * FROM products
      WHERE business_id = ${businessId}::uuid
        AND stock <= min_stock
        ${statusFilter}
        ${searchFilter}
      ORDER BY name ASC
      OFFSET ${(page - 1) * pageSize}
      LIMIT ${pageSize}
    `;
    const counted = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM products
      WHERE business_id = ${businessId}::uuid
        AND stock <= min_stock
        ${statusFilter}
        ${searchFilter}
    `;
    return { items, total: Number(counted[0]?.count ?? 0), page, pageSize };
  }
}
