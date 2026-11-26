/**
 * Lista empresas registradas en la plataforma (consola SUPER_ADMIN).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class ListPlatformBusinessesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const rows = await this.prisma.business.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            memberships: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      legalName: row.legalName,
      taxId: row.taxId,
      email: row.email,
      phone: row.phone,
      address: row.address,
      status: row.status,
      activeMembers: row._count.memberships,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
