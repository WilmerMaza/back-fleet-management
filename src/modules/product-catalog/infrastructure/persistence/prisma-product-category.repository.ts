import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/database/prisma.service.js';
import { Errors } from '../../../../shared/common/app-error.js';
import type {
  ProductCategoryRecord,
  ProductCategoryRepositoryPort,
} from '../../application/ports/product-category.repository.port.js';

@Injectable()
export class PrismaProductCategoryRepository implements ProductCategoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    businessId: string,
    query?: { search?: string; activeOnly?: boolean; parentId?: string | null },
  ): Promise<ProductCategoryRecord[]> {
    const where: Prisma.ProductCategoryWhereInput = { businessId };
    if (query?.activeOnly) {
      where.isActive = true;
    }
    if (query?.parentId !== undefined) {
      where.parentId = query.parentId;
    }
    if (query?.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.productCategory.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      include: { _count: { select: { products: true, children: true } } },
    });
    return rows.map((row) => this.map(row, row._count.products));
  }

  async findById(businessId: string, id: string): Promise<ProductCategoryRecord | null> {
    const row = await this.prisma.productCategory.findFirst({
      where: { businessId, id },
      include: { _count: { select: { products: true } } },
    });
    return row ? this.map(row, row._count.products) : null;
  }

  async create(input: {
    businessId: string;
    actorId: string;
    name: string;
    normalizedName: string;
    code?: string | null;
    description?: string | null;
    parentId?: string | null;
  }): Promise<ProductCategoryRecord> {
    try {
      const row = await this.prisma.productCategory.create({
        data: {
          id: randomUUID(),
          businessId: input.businessId,
          name: input.name,
          normalizedName: input.normalizedName,
          code: input.code || null,
          description: input.description || null,
          parentId: input.parentId || null,
          isActive: true,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });
      return this.map(row, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.categoryNameExists();
      }
      throw error;
    }
  }

  async update(
    businessId: string,
    id: string,
    actorId: string,
    data: {
      name?: string;
      normalizedName?: string;
      code?: string | null;
      description?: string | null;
    },
  ): Promise<ProductCategoryRecord> {
    try {
      const row = await this.prisma.productCategory.update({
        where: { id },
        data: {
          ...(data.name != null ? { name: data.name } : {}),
          ...(data.normalizedName != null ? { normalizedName: data.normalizedName } : {}),
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          updatedBy: actorId,
        },
      });
      const count = await this.countProducts(businessId, id);
      return this.map(row, count);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.categoryNameExists();
      }
      throw error;
    }
  }

  async setActive(
    businessId: string,
    id: string,
    actorId: string,
    isActive: boolean,
  ): Promise<ProductCategoryRecord> {
    const row = await this.prisma.productCategory.update({
      where: { id },
      data: { isActive, updatedBy: actorId },
    });
    const count = await this.countProducts(businessId, id);
    return this.map(row, count);
  }

  countActiveRoots(businessId: string): Promise<number> {
    return this.prisma.productCategory.count({
      where: { businessId, parentId: null, isActive: true },
    });
  }

  countActiveChildren(businessId: string, parentId: string): Promise<number> {
    return this.prisma.productCategory.count({
      where: { businessId, parentId, isActive: true },
    });
  }

  countProducts(businessId: string, categoryId: string): Promise<number> {
    return this.prisma.product.count({ where: { businessId, categoryId } });
  }

  private map(
    row: {
      id: string;
      businessId: string;
      name: string;
      normalizedName: string;
      code: string | null;
      description: string | null;
      parentId: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    productCount = 0,
  ): ProductCategoryRecord {
    return {
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      normalizedName: row.normalizedName,
      code: row.code,
      description: row.description,
      parentId: row.parentId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      productCount,
    };
  }
}
