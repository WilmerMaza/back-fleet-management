/**
 * Miembros de un negocio (consola plataforma).
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface PlatformBusinessMember {
  userId: string;
  email: string;
  fullName: string;
  status: string;
  roleCodes: string[];
}

@Injectable()
export class ListPlatformBusinessMembersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string): Promise<PlatformBusinessMember[]> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw Errors.businessNotFound();
    }

    const memberships = await this.prisma.userBusinessMembership.findMany({
      where: { businessId },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });

    return memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      fullName: m.user.fullName,
      status: m.status,
      roleCodes: m.roleCodes,
    }));
  }
}
