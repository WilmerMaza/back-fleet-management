/**
 * PATCH de flota. Cambio de propietario: todas las asignaciones abiertas deben
 * ser de vehículos del nuevo cliente (misma invariante que H-02). Sin auto-unassign.
 *
 * Concurrencia: FOR UPDATE sobre la flota antes de leer asignaciones, alineado
 * con AssignVehicleUseCase, para que no entre una asignación incompatible
 * entre la validación y el commit.
 */
import { Injectable } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { trimOrNull } from '../../customers/domain/customer-rules.js';
import { assertSameCustomerAsFleet } from '../../vehicles/domain/ownership.js';

@Injectable()
export class UpdateFleetUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    businessId: string,
    id: string,
    actorId: string,
    input: {
      customerId?: string;
      name?: string;
      description?: string | null;
      status?: EntityStatus;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM fleets
        WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid
        FOR UPDATE
      `;
      const current = await tx.fleet.findFirst({ where: { id, businessId } });
      if (!current) {
        throw Errors.fleetNotFound();
      }

      const nextCustomerId = input.customerId;
      const ownerChanging =
        nextCustomerId != null && nextCustomerId !== current.customerId;

      if (ownerChanging) {
        const customer = await tx.customer.findFirst({
          where: { id: nextCustomerId, businessId },
        });
        if (!customer) {
          throw Errors.customerNotFound();
        }
        if (customer.type !== 'COMPANY') {
          throw Errors.fleetRequiresCompany();
        }

        const openAssignments = await tx.fleetVehicle.findMany({
          where: { fleetId: id, businessId, unassignedAt: null },
          include: { vehicle: true },
        });
        for (const row of openAssignments) {
          assertSameCustomerAsFleet(row.vehicle.customerId, nextCustomerId);
        }
      }

      const updated = await tx.fleet.update({
        where: { id },
        data: {
          customerId: ownerChanging ? nextCustomerId : undefined,
          name: input.name?.trim(),
          description: input.description === undefined ? undefined : trimOrNull(input.description),
          status: input.status,
          updatedBy: actorId,
        },
      });
      await this.audit.record(
        {
          businessId,
          actorUserId: actorId,
          action: ownerChanging ? 'FLEET_OWNER_UPDATED' : 'FLEET_UPDATED',
          entityType: 'FLEET',
          entityId: id,
          metadata: ownerChanging
            ? { previousCustomerId: current.customerId, nextCustomerId }
            : { fields: Object.keys(input) },
        },
        tx,
      );
      return updated;
    });
  }
}
