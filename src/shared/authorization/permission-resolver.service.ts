/**
 * Resuelve permisos desde BD (roles → permissions) con fallback al mapa código.
 *
 * Dual-read: si hay roles sembrados para el negocio (o plataforma), usa BD;
 * si no, `permissionsForRoles` (compatibilidad hasta migrar seeds viejos).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { permissionsForRoles } from './permissions.js';

const PLATFORM_PERMISSIONS = [
  'platform.businesses.read',
  'platform.businesses.write',
  'platform.users.read',
  'platform.roles.read',
] as const;

@Injectable()
export class PermissionResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async forBusinessRoles(businessId: string, roleCodes: string[]): Promise<string[]> {
    if (!roleCodes.length) {
      return [];
    }
    const roles = await this.prisma.role.findMany({
      where: { businessId, code: { in: roleCodes } },
      include: { permissions: { include: { permission: true } } },
    });
    if (!roles.length) {
      return permissionsForRoles(roleCodes);
    }
    return [
      ...new Set(roles.flatMap((role) => role.permissions.map((rp) => rp.permission.code))),
    ];
  }

  async forPlatformSuperAdmin(): Promise<string[]> {
    const role = await this.prisma.role.findFirst({
      where: { businessId: null, code: 'SUPER_ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) {
      return [...PLATFORM_PERMISSIONS];
    }
    return [...new Set(role.permissions.map((rp) => rp.permission.code))];
  }
}
