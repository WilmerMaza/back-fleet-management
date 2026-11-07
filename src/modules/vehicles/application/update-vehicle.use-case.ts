/**
 * PATCH de vehículo. El km no baja salvo ajuste ADMIN auditado.
 *
 * Concurrencia (OC-04): siempre `FOR UPDATE` del vehículo dentro de la TX;
 * el kilometraje se revalida contra el valor bloqueado (no contra lectura stale).
 * Orden de bloqueo vehículos: vehicles(id). Si hay flota en cambio de dueño,
 * se lee la flota sin invertir el orden (no se toma lock de flota aquí).
 *
 * Cambio de propietario: el cliente debe ser del mismo negocio. Si el vehículo
 * tiene flota asignada, el nuevo cliente debe ser el de esa flota; no se
 * desasigna en silencio.
 */
import { Injectable } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { trimOrNull } from '../../customers/domain/customer-rules.js';
import { assertMileageChange } from '../domain/mileage.js';
import { assertSameCustomerAsFleet } from '../domain/ownership.js';
import { normalizePlate } from '../domain/plate.js';

export interface UpdateVehicleInput {
  customerId?: string;
  plate?: string;
  vin?: string | null;
  brand?: string;
  line?: string;
  model?: string | null;
  year?: number | null;
  vehicleType?: string | null;
  color?: string | null;
  fuelType?: string | null;
  engineCapacity?: string | null;
  version?: string | null;
  currentMileage?: number;
  status?: EntityStatus;
}

@Injectable()
export class UpdateVehicleUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    businessId: string,
    id: string,
    actorId: string,
    roles: string[],
    input: UpdateVehicleInput,
  ) {
    const isAdmin = roles.includes('ADMIN');
    let plateForConflict = input.plate ? normalizePlate(input.plate) : undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM vehicles
          WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid
          FOR UPDATE
        `;
        const current = await tx.vehicle.findFirst({ where: { id, businessId } });
        if (!current) {
          throw Errors.vehicleNotFound();
        }
        plateForConflict ??= current.plate;

        const customerChanging =
          input.customerId != null && input.customerId !== current.customerId;
        if (customerChanging) {
          const customer = await tx.customer.findFirst({
            where: { id: input.customerId, businessId },
          });
          if (!customer) {
            throw Errors.customerNotFound();
          }
          await this.assertOwnerCompatibleWithFleet(businessId, current, input.customerId!, tx);
        }

        const nextMileage = input.currentMileage;
        const mileageChanged = nextMileage != null && nextMileage !== current.currentMileage;
        if (mileageChanged) {
          assertMileageChange(current.currentMileage, nextMileage, isAdmin);
        }

        const updated = await tx.vehicle.update({
          where: { id },
          data: {
            customerId: input.customerId,
            plate: input.plate == null ? undefined : normalizePlate(input.plate),
            vin: maybe(input.vin),
            brand: input.brand?.trim(),
            line: input.line?.trim(),
            model: maybe(input.model),
            year: input.year === undefined ? undefined : input.year,
            vehicleType: maybe(input.vehicleType),
            color: maybe(input.color),
            fuelType: maybe(input.fuelType),
            engineCapacity: maybe(input.engineCapacity),
            version: maybe(input.version),
            currentMileage: nextMileage,
            status: input.status,
            updatedBy: actorId,
          },
        });
        if (mileageChanged) {
          await tx.vehicleMileageLog.create({
            data: {
              id: randomUUID(),
              businessId,
              vehicleId: id,
              mileage: nextMileage,
              source: 'MANUAL',
              recordedBy: actorId,
            },
          });
        }
        await this.audit.record(
          {
            businessId,
            actorUserId: actorId,
            action: mileageChanged
              ? 'MILEAGE_UPDATED'
              : customerChanging
                ? 'VEHICLE_OWNER_UPDATED'
                : 'VEHICLE_UPDATED',
            entityType: 'VEHICLE',
            entityId: id,
            metadata: mileageChanged
              ? {
                  previous: current.currentMileage,
                  next: nextMileage,
                  adjustment: nextMileage < current.currentMileage,
                }
              : customerChanging
                ? { previousCustomerId: current.customerId, nextCustomerId: input.customerId }
                : { fields: Object.keys(input) },
          },
          tx,
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.plateExists(plateForConflict ?? 'UNKNOWN');
      }
      throw error;
    }
  }

  private async assertOwnerCompatibleWithFleet(
    businessId: string,
    vehicle: { id: string; fleetId: string | null },
    nextCustomerId: string,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (vehicle.fleetId) {
      const fleet = await db.fleet.findFirst({
        where: { id: vehicle.fleetId, businessId },
      });
      if (!fleet) {
        throw Errors.fleetNotFound();
      }
      assertSameCustomerAsFleet(nextCustomerId, fleet.customerId);
      return;
    }

    const open = await db.fleetVehicle.findFirst({
      where: { vehicleId: vehicle.id, businessId, unassignedAt: null },
      include: { fleet: true },
    });
    if (open) {
      assertSameCustomerAsFleet(nextCustomerId, open.fleet.customerId);
    }
  }
}

function maybe(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return trimOrNull(value);
}
