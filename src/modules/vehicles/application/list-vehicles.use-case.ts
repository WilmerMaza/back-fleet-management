import { Injectable } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { pageParams } from '../../../shared/common/pagination.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface ListVehiclesQuery {
  search?: string;
  plate?: string;
  customerId?: string;
  fleetId?: string;
  status?: EntityStatus;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListVehiclesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, query: ListVehiclesQuery) {
    const { page, pageSize, skip } = pageParams(query.page, query.pageSize);
    const search = query.search?.trim();
    const plate = query.plate?.trim();
    const where: Prisma.VehicleWhereInput = { businessId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.fleetId) {
      where.fleetId = query.fleetId;
    }
    if (plate) {
      where.plate = { contains: plate, mode: 'insensitive' };
    }
    if (search) {
      where.OR = [
        { plate: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { line: { contains: search, mode: 'insensitive' } },
        { vin: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { plate: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
