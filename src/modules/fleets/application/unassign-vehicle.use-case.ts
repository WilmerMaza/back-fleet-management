/**
 * Desasigna un vehículo de una flota: cierra la asignación abierta y limpia la proyección.
 *
 * Orden de bloqueo (global flotas/vehículos): fleets(id) → vehicles(id).
 * Misma secuencia que AssignVehicleUseCase para evitar deadlocks y carreras OC-01:
 * no se anula `vehicles.fleet_id` si, bajo el lock, ya apunta a otra flota.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class UnassignVehicleUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(businessId: string, fleetId: string, vehicleId: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM fleets
        WHERE id = ${fleetId}::uuid AND business_id = ${businessId}::uuid
        FOR UPDATE
      `;
      const fleet = await tx.fleet.findFirst({ where: { id: fleetId, businessId } });
      if (!fleet) {
        throw Errors.fleetNotFound();
      }

      await tx.$queryRaw`
        SELECT id FROM vehicles
        WHERE id = ${vehicleId}::uuid AND business_id = ${businessId}::uuid
        FOR UPDATE
      `;
      const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId, businessId } });
      if (!vehicle) {
        throw Errors.vehicleNotFound();
      }

      const now = new Date();
      await tx.fleetVehicle.updateMany({
        where: { fleetId, vehicleId, businessId, unassignedAt: null },
        data: { unassignedAt: now },
      });

      // Re-evaluación bajo el mismo FOR UPDATE: no tocar proyección de otra flota.
      if (vehicle.fleetId === fleetId) {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { fleetId: null, updatedBy: actorId },
        });
      }

      await this.audit.record(
        {
          businessId,
          actorUserId: actorId,
          action: 'FLEET_VEHICLE_UNASSIGNED',
          entityType: 'FLEET',
          entityId: fleetId,
          metadata: { vehicleId },
        },
        tx,
      );
    });
  }
}
