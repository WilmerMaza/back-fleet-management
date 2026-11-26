/**
 * Actualiza roles o estado de membresía de un usuario en el negocio.
 */
import { Injectable } from '@nestjs/common';
import { AppError, Errors } from '../../../shared/common/app-error.js';
import { permissionsForRoles } from '../../../shared/authorization/permissions.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import type { BusinessUserRow } from './list-business-users.use-case.js';

export interface UpdateBusinessUserInput {
  businessId: string;
  userId: string;
  actorUserId: string;
  roleCodes?: string[];
  status?: 'ACTIVE' | 'INACTIVE';
}

@Injectable()
export class UpdateBusinessUserUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: UpdateBusinessUserInput): Promise<BusinessUserRow> {
    const membership = await this.prisma.userBusinessMembership.findUnique({
      where: { userId_businessId: { userId: input.userId, businessId: input.businessId } },
      include: { user: true },
    });
    if (!membership) {
      throw new AppError('NOT_FOUND', 'Usuario no encontrado en este negocio.', 404);
    }

    const nextRoles = input.roleCodes?.map((code) => code.trim().toUpperCase()) ?? membership.roleCodes;
    const nextStatus = input.status ?? membership.status;

    if (!nextRoles.length) {
      throw new AppError('VALIDATION_ERROR', 'Debe conservar al menos un rol.', 400);
    }

    if (nextStatus === 'INACTIVE' || (input.roleCodes && !nextRoles.includes('ADMIN'))) {
      await this.assertAdminRemains(input.businessId, input.userId, nextRoles, nextStatus);
    }

    for (const code of nextRoles) {
      const role = await this.prisma.role.findFirst({
        where: { businessId: input.businessId, code },
      });
      if (!role) {
        throw new AppError('ROLE_NOT_FOUND', `Rol ${code} no existe en la empresa`, 400);
      }
    }

    await this.prisma.userBusinessMembership.update({
      where: { userId_businessId: { userId: input.userId, businessId: input.businessId } },
      data: {
        roleCodes: nextRoles,
        permissions: permissionsForRoles(nextRoles),
        status: nextStatus,
      },
    });

    const updated = await this.prisma.userBusinessMembership.findUniqueOrThrow({
      where: { userId_businessId: { userId: input.userId, businessId: input.businessId } },
      include: { user: true },
    });

    return {
      id: updated.user.id,
      email: updated.user.email,
      fullName: updated.user.fullName,
      roleCodes: updated.roleCodes,
      status: updated.status === 'INACTIVE' ? 'SUSPENDED' : updated.status,
      joinedAt: updated.user.createdAt.toISOString(),
    };
  }

  private async assertAdminRemains(
    businessId: string,
    targetUserId: string,
    nextRoles: string[],
    nextStatus: string,
  ): Promise<void> {
    if (nextRoles.includes('ADMIN') && nextStatus === 'ACTIVE') {
      return;
    }
    const admins = await this.prisma.userBusinessMembership.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        roleCodes: { has: 'ADMIN' },
      },
    });
    const others = admins.filter((row) => row.userId !== targetUserId);
    if (!others.length) {
      throw new AppError('LAST_ADMIN', 'Debe permanecer al menos un administrador activo.', 409);
    }
  }
}
