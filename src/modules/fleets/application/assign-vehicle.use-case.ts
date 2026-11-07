/**
 * Asigna un vehículo a una flota: cierra la asignación abierta previa y alinea proyección.
 *
 * Orden de bloqueo (global flotas/vehículos): fleets(id) → vehicles(id).
 * Fuente de verdad del ledger = fila abierta en `fleet_vehicles`; `vehicles.fleet_id`
 * es proyección. Si la proyección coincide pero falta la abierta, se repara (OC-02).
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { assertSameCustomerAsFleet } from '../../vehicles/domain/ownership.js';

@Injectable()
export class AssignVehicleUseCase {
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
      assertSameCustomerAsFleet(vehicle.customerId, fleet.customerId);

      const open = await tx.fleetVehicle.findFirst({
        where: { vehicleId, businessId, unassignedAt: null },
      });

      // Coherente: abierta en esta flota y proyección alineada → no-op.
      if (open?.fleetId === fleetId && vehicle.fleetId === fleetId) {
        return;
      }

      const now = new Date();
      let mutated = false;

      if (open?.fleetId === fleetId) {
        // Drift: abierta OK, proyección incorrecta → solo realinear proyección.
        if (vehicle.fleetId !== fleetId) {
          await tx.vehicle.update({
            where: { id: vehicleId },
            data: { fleetId, updatedBy: actorId },
          });
          mutated = true;
        }
      } else {
        // Sin abierta en esta flota (otra flota o drift sin ledger).
        if (open) {
          await tx.fleetVehicle.update({
            where: { id: open.id },
            data: { unassignedAt: now },
          });
        }
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
        mutated = true;
      }

      if (!mutated) {
        return;
      }

      await this.audit.record(
        {
          businessId,
          actorUserId: actorId,
          action: 'FLEET_VEHICLE_ASSIGNED',
          entityType: 'FLEET',
          entityId: fleetId,
          metadata: { vehicleId, repaired: open == null && vehicle.fleetId === fleetId },
        },
        tx,
      );
    });
  }
}
