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
      const fleet = await tx.fleet.findFirst({ where: { id: fleetId, businessId } });
      if (!fleet) {
        throw Errors.fleetNotFound();
      }
      const now = new Date();
      await tx.fleetVehicle.updateMany({
        where: { fleetId, vehicleId, unassignedAt: null },
        data: { unassignedAt: now },
      });
      const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId, businessId } });
      if (vehicle?.fleetId === fleetId) {
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
