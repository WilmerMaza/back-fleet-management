import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface ListProductsQuery {
  search?: string;
  status?: ProductStatus;
  lowStock?: boolean | string;
  categoryId?: string;
  brandId?: string;
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

    const and: Prisma.ProductWhereInput[] = [{ businessId }];
    if (query.status) {
      and.push({ status: query.status });
    }
    if (query.brandId) {
      and.push({ brandId: query.brandId });
    }
    if (query.categoryId) {
      and.push({
        OR: [{ categoryId: query.categoryId }, { category: { parentId: query.categoryId } }],
      });
    }
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search.toUpperCase(), mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = { AND: and };
    const include = {
      category: { include: { parent: true } },
      brand: true,
    } as const;

    if (!lowStock) {
      const [items, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include,
          orderBy: { name: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.product.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }

    const all = await this.prisma.product.findMany({
      where,
      include,
      orderBy: { name: 'asc' },
    });
    const filtered = all.filter((p) => p.stock.lte(p.minStock));
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }
}
