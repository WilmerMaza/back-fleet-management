/**
 * Invitaciones de un negocio (consola plataforma).
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface PlatformInvitationItem {
  id: string;
  email: string;
  roleCode: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  invitedByEmail: string;
}

@Injectable()
export class ListPlatformInvitationsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string): Promise<PlatformInvitationItem[]> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw Errors.businessNotFound();
    }

    const rows = await this.prisma.invitation.findMany({
      where: { businessId },
      include: { invitedBy: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      roleCode: row.roleCode,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      invitedByEmail: row.invitedBy.email,
    }));
  }
}
