/**
 * Detalle de un negocio para consola plataforma.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface PlatformBusinessDetail {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  pendingInvitationCount: number;
}

@Injectable()
export class GetPlatformBusinessUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string): Promise<PlatformBusinessDetail> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        _count: {
          select: {
            memberships: true,
            invitations: { where: { status: 'PENDING' } },
          },
        },
      },
    });
    if (!business) {
      throw Errors.businessNotFound();
    }
    return {
      id: business.id,
      name: business.name,
      legalName: business.legalName,
      taxId: business.taxId,
      email: business.email,
      phone: business.phone,
      address: business.address,
      status: business.status,
      createdAt: business.createdAt.toISOString(),
      updatedAt: business.updatedAt.toISOString(),
      memberCount: business._count.memberships,
      pendingInvitationCount: business._count.invitations,
    };
  }
}
