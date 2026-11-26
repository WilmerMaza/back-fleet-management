/**
 * Lista miembros del negocio activo con datos de contacto y membresía.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface BusinessUserRow {
  id: string;
  email: string;
  fullName: string;
  roleCodes: string[];
  status: string;
  joinedAt: string;
}

@Injectable()
export class ListBusinessUsersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string): Promise<BusinessUserRow[]> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw Errors.businessNotFound();
    }

    const memberships = await this.prisma.userBusinessMembership.findMany({
      where: { businessId },
      include: {
        user: { select: { id: true, email: true, fullName: true, createdAt: true, status: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      fullName: m.user.fullName,
      roleCodes: m.roleCodes,
      status: m.status === 'INACTIVE' ? 'SUSPENDED' : m.status,
      joinedAt: m.user.createdAt.toISOString(),
    }));
  }
}
