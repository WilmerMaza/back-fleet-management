/**
 * Siembra roles de sistema de un negocio nuevo (ADMIN, OPERATOR, …).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { permissionsForRoles } from '../../../shared/authorization/permissions.js';

const SYSTEM_ROLE_DEFS = [
  { code: 'ADMIN', name: 'Administrador', description: 'Administración del negocio' },
  { code: 'INVENTORY', name: 'Inventario', description: 'Gestión de inventario' },
  { code: 'OPERATOR', name: 'Operador', description: 'Operación diaria' },
  { code: 'TECHNICIAN', name: 'Técnico', description: 'Órdenes de servicio' },
  { code: 'FLEET_MANAGER', name: 'Gestor de flota', description: 'Clientes, vehículos y flotas' },
  { code: 'CUSTOMER', name: 'Cliente portal', description: 'Sin permisos de cabina' },
] as const;

export async function seedBusinessSystemRoles(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<void> {
  const permissions = await tx.permission.findMany({
    where: { module: { not: 'platform' } },
  });
  const byCode = new Map(permissions.map((p) => [p.code, p.id]));

  for (const def of SYSTEM_ROLE_DEFS) {
    const role = await tx.role.create({
      data: {
        id: randomUUID(),
        businessId,
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
    });
    const codes = permissionsForRoles([def.code]);
    const permissionIds = codes
      .map((code) => byCode.get(code))
      .filter((id): id is string => Boolean(id));
    if (permissionIds.length) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }
  }
}
