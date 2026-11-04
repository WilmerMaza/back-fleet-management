/**
 * Asigna un vehículo a una flota: cierra la asignación abierta previa.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class AssignVehicleUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(businessId: string, fleetId: string, vehicleId: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const fleet = await tx.fleet.findFirst({ where: { id: fleetId, businessId } });
      if (!fleet) {
        throw Errors.fleetNotFound();
      }
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
      const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId, businessId } });
      if (!vehicle) {
        throw Errors.vehicleNotFound();
      }
      if (vehicle.customerId !== fleet.customerId) {
        throw Errors.fleetVehicleMismatch();
      }
      if (vehicle.fleetId === fleetId) {
        return;
      }
      const now = new Date();
      await tx.fleetVehicle.updateMany({
        where: { vehicleId, unassignedAt: null },
        data: { unassignedAt: now },
      });
      await tx.fleetVehicle.create({
        data: {
          id: randomUUID(),
          businessId,
          fleetId,
          vehicleId,
          assignedAt: now,
        },
      });
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { fleetId, updatedBy: actorId },
      });
      await this.audit.record(
        {
          businessId,
          actorUserId: actorId,
          action: 'FLEET_VEHICLE_ASSIGNED',
          entityType: 'FLEET',
          entityId: fleetId,
          metadata: { vehicleId },
        },
        tx,
      );
    });
  }
}
