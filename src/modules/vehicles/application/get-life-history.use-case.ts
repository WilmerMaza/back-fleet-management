/**
 * Hoja de vida. MVP: km. Órdenes/mantenimiento/evidencias se agregan cuando existan esas tablas.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class GetLifeHistoryUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, businessId } });
    if (!vehicle) {
      throw Errors.vehicleNotFound();
    }
    const logs = await this.prisma.vehicleMileageLog.findMany({
      where: { businessId, vehicleId: id },
      orderBy: { recordedAt: 'desc' },
    });
    const actorIds = [...new Set(logs.map((log) => log.recordedBy).filter(Boolean))] as string[];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((user) => [user.id, user.fullName]));
    return {
      vehicle,
      items: logs.map((log) => ({
        id: log.id,
        type: 'MILEAGE' as const,
        title: `Kilometraje ${log.mileage.toLocaleString('es-CO')} km`,
        occurredAt: log.recordedAt.toISOString(),
        mileage: log.mileage,
        actorUserId: log.recordedBy ?? undefined,
        actorName: log.recordedBy ? names.get(log.recordedBy) : undefined,
      })),
    };
  }
}
