/**
 * Crea un rol personalizado del negocio (no sistema).
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError, Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface CreateRoleInput {
  businessId: string;
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
}

@Injectable()
export class CreateRoleUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: CreateRoleInput) {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,58}$/.test(code)) {
      throw new AppError('INVALID_ROLE_CODE', 'Código de rol inválido.', 400);
    }
    if (code === 'SUPER_ADMIN') {
      throw Errors.forbidden();
    }

    const existing = await this.prisma.role.findFirst({
      where: { businessId: input.businessId, code },
    });
    if (existing) {
      throw new AppError('ROLE_CODE_EXISTS', 'Ya existe un rol con ese código.', 409, { code });
    }

    const permissions = await this.prisma.permission.findMany({
      where: {
        code: { in: input.permissionCodes },
        module: { not: 'platform' },
      },
    });
    if (permissions.length !== input.permissionCodes.length) {
      throw new AppError('INVALID_PERMISSIONS', 'Hay permisos inválidos o de plataforma.', 400);
    }

    const role = await this.prisma.role.create({
      data: {
        id: randomUUID(),
        businessId: input.businessId,
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isSystem: false,
        permissions: {
          create: permissions.map((permission) => ({ permissionId: permission.id })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });

    return {
      id: role.id,
      businessId: role.businessId,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissionCodes: role.permissions.map((rp) => rp.permission.code),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }
}
