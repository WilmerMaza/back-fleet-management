/**
 * Listado de flotas: search/sort/page sobre el conjunto con proyección de servidor.
 */
import { Injectable } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { pageParams } from '../../../shared/common/pagination.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { customerDisplayName } from '../../customers/domain/display-name.js';

export type FleetSortBy = 'name' | 'customerName' | 'vehicleCount' | 'status';

@Injectable()
export class ListFleetsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    businessId: string,
    query: {
      search?: string;
      status?: EntityStatus;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const { page, pageSize, skip } = pageParams(query.page, query.pageSize, 25);
    const fleets = await this.prisma.fleet.findMany({
      where: { businessId, ...(query.status ? { status: query.status } : {}) },
      include: { customer: true },
    });
    const counts = await this.prisma.vehicle.groupBy({
      by: ['fleetId'],
      where: { businessId, fleetId: { not: null } },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.filter((row) => row.fleetId).map((row) => [row.fleetId as string, row._count._all]),
    );

    let items = fleets.map((fleet) => ({
      fleet,
      customerName: customerDisplayName(fleet.customer),
      vehicleCount: countMap.get(fleet.id) ?? 0,
    }));

    const search = query.search?.trim().toLowerCase();
    if (search) {
      items = items.filter(
        (item) =>
          item.fleet.name.toLowerCase().includes(search) ||
          (item.fleet.description ?? '').toLowerCase().includes(search) ||
          item.customerName.toLowerCase().includes(search),
      );
    }

    const sortBy = (['name', 'customerName', 'vehicleCount', 'status'] as const).includes(
      query.sortBy as FleetSortBy,
    )
      ? (query.sortBy as FleetSortBy)
      : 'name';
    const dir = query.sortDir === 'desc' ? -1 : 1;
    items.sort((a, b) => compare(a, b, sortBy) * dir);

    return {
      items: items.slice(skip, skip + pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }
}

function compare(
  a: { fleet: { name: string; status: string }; customerName: string; vehicleCount: number },
  b: { fleet: { name: string; status: string }; customerName: string; vehicleCount: number },
  sortBy: FleetSortBy,
): number {
  if (sortBy === 'vehicleCount') {
    return a.vehicleCount - b.vehicleCount;
  }
  const left =
    sortBy === 'customerName' ? a.customerName : sortBy === 'status' ? a.fleet.status : a.fleet.name;
  const right =
    sortBy === 'customerName' ? b.customerName : sortBy === 'status' ? b.fleet.status : b.fleet.name;
  return left.localeCompare(right, 'es');
}
