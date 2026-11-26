import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/database/prisma.service.js';
import { Errors } from '../../../../shared/common/app-error.js';
import type {
  ProductBrandRecord,
  ProductBrandRepositoryPort,
} from '../../application/ports/product-brand.repository.port.js';

@Injectable()
export class PrismaProductBrandRepository implements ProductBrandRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    businessId: string,
    query?: { search?: string; activeOnly?: boolean },
  ): Promise<ProductBrandRecord[]> {
    const where: Prisma.ProductBrandWhereInput = { businessId };
    if (query?.activeOnly) {
      where.isActive = true;
    }
    if (query?.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }
    const rows = await this.prisma.productBrand.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return rows.map((row) => this.map(row, row._count.products));
  }

  async findById(businessId: string, id: string): Promise<ProductBrandRecord | null> {
    const row = await this.prisma.productBrand.findFirst({
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
    description?: string | null;
  }): Promise<ProductBrandRecord> {
    try {
      const row = await this.prisma.productBrand.create({
        data: {
          id: randomUUID(),
          businessId: input.businessId,
          name: input.name,
          normalizedName: input.normalizedName,
          description: input.description || null,
          isActive: true,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });
      return this.map(row, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.brandNameExists();
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
      description?: string | null;
    },
  ): Promise<ProductBrandRecord> {
    try {
      const row = await this.prisma.productBrand.update({
        where: { id },
        data: {
          ...(data.name != null ? { name: data.name } : {}),
          ...(data.normalizedName != null ? { normalizedName: data.normalizedName } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          updatedBy: actorId,
        },
      });
      const count = await this.countProducts(businessId, id);
      return this.map(row, count);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.brandNameExists();
      }
      throw error;
    }
  }

  async setActive(
    businessId: string,
    id: string,
    actorId: string,
    isActive: boolean,
  ): Promise<ProductBrandRecord> {
    const row = await this.prisma.productBrand.update({
      where: { id },
      data: { isActive, updatedBy: actorId },
    });
    const count = await this.countProducts(businessId, id);
    return this.map(row, count);
  }

  countProducts(businessId: string, brandId: string): Promise<number> {
    return this.prisma.product.count({ where: { businessId, brandId } });
  }

  private map(
    row: {
      id: string;
      businessId: string;
      name: string;
      normalizedName: string;
      description: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    productCount = 0,
  ): ProductBrandRecord {
    return {
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      normalizedName: row.normalizedName,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      productCount,
    };
  }
}
