/**
 * Detalle de un miembro del negocio (sin credenciales).
 */
import { Injectable } from '@nestjs/common';
import { AppError } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import type { BusinessUserRow } from './list-business-users.use-case.js';

@Injectable()
export class GetBusinessUserUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, userId: string): Promise<BusinessUserRow> {
    const membership = await this.prisma.userBusinessMembership.findUnique({
      where: { userId_businessId: { userId, businessId } },
      include: {
        user: { select: { id: true, email: true, fullName: true, createdAt: true } },
      },
    });
    if (!membership) {
      throw new AppError('NOT_FOUND', 'Usuario no encontrado en este negocio.', 404);
    }

    return {
      id: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName,
      roleCodes: membership.roleCodes,
      status: membership.status === 'INACTIVE' ? 'SUSPENDED' : membership.status,
      joinedAt: membership.user.createdAt.toISOString(),
    };
  }
}
