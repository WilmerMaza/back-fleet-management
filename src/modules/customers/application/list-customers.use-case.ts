/**
 * Listado de clientes con search alineado al mock y sort antes de paginar.
 */
import { Injectable } from '@nestjs/common';
import { CustomerType, EntityStatus, Prisma } from '@prisma/client';
import { customerDisplayName } from '../domain/display-name.js';
import { pageParams } from '../../../shared/common/pagination.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface ListCustomersQuery {
  search?: string;
  type?: CustomerType;
  status?: EntityStatus;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListCustomersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, query: ListCustomersQuery) {
    const { page, pageSize, skip } = pageParams(query.page, query.pageSize);
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = { businessId };
    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (search) {
      where.OR = [
        { legalName: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { nit: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sortBy = query.sortBy;
    if (sortBy === 'name' || sortBy === 'document') {
      const rows = await this.prisma.customer.findMany({ where, orderBy: { createdAt: 'asc' } });
      const dir = query.sortDir === 'desc' ? -1 : 1;
      rows.sort((a, b) => sortValue(a, sortBy).localeCompare(sortValue(b, sortBy), 'es') * dir);
      return {
        items: rows.slice(skip, skip + pageSize),
        total: rows.length,
        page,
        pageSize,
      };
    }

    const orderBy: Prisma.CustomerOrderByWithRelationInput =
      sortBy === 'type'
        ? { type: query.sortDir === 'desc' ? 'desc' : 'asc' }
        : sortBy === 'status'
          ? { status: query.sortDir === 'desc' ? 'desc' : 'asc' }
          : { createdAt: 'asc' };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy, skip, take: pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}

function sortValue(
  customer: {
    type: CustomerType;
    tradeName: string | null;
    legalName: string | null;
    nit: string | null;
    firstName: string | null;
    lastName: string | null;
    documentNumber: string | null;
    status: EntityStatus;
  },
  sortBy: string,
): string {
  if (sortBy === 'name') {
    return customerDisplayName(customer);
  }
  if (sortBy === 'document') {
    return customer.documentNumber || customer.nit || '';
  }
  return customer.status;
}
