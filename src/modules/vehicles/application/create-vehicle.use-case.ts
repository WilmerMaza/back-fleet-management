/**
 * Alta de vehículo: placa única por negocio y log inicial de km.
 *
 * Si se indica `fleetId`, la compatibilidad de propietario se revalida bajo
 * `FOR UPDATE` de la flota dentro de la TX (OC-03), mismo prefijo de locks
 * que Assign/UpdateFleet: fleets(id) → insert vehículo/asignación.
 * No crea asignaciones si no se solicitó `fleetId`.
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

export interface CreateVehicleInput {
  businessId: string;
  actorId: string;
  customerId: string;
  fleetId?: string | null;
  plate: string;
  vin?: string | null;
  brand: string;
  line: string;
  model?: string | null;
  year?: number | null;
  vehicleType?: string | null;
  color?: string | null;
  fuelType?: string | null;
  engineCapacity?: string | null;
  version?: string | null;
  currentMileage: number;
  status?: EntityStatus;
}

@Injectable()
export class CreateVehicleUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: CreateVehicleInput) {
    const plate = normalizePlate(input.plate);
    assertMileageChange(0, input.currentMileage, true);
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
    });
    if (!customer) {
      throw Errors.customerNotFound();
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        let fleetId: string | null = null;
        if (input.fleetId) {
          await tx.$queryRaw`
            SELECT id FROM fleets
            WHERE id = ${input.fleetId}::uuid AND business_id = ${input.businessId}::uuid
            FOR UPDATE
          `;
          const fleet = await tx.fleet.findFirst({
            where: { id: input.fleetId, businessId: input.businessId },
          });
          if (!fleet) {
            throw Errors.fleetNotFound();
          }
          assertSameCustomerAsFleet(input.customerId, fleet.customerId);
          fleetId = fleet.id;
        }

        const vehicle = await tx.vehicle.create({
          data: {
            id: randomUUID(),
            businessId: input.businessId,
            customerId: input.customerId,
            fleetId,
            plate,
            vin: trimOrNull(input.vin),
            brand: input.brand.trim(),
            line: input.line.trim(),
            model: trimOrNull(input.model),
            year: input.year ?? null,
            vehicleType: trimOrNull(input.vehicleType),
            color: trimOrNull(input.color),
            fuelType: trimOrNull(input.fuelType),
            engineCapacity: trimOrNull(input.engineCapacity),
            version: trimOrNull(input.version),
            currentMileage: input.currentMileage,
            status: input.status ?? 'ACTIVE',
            createdBy: input.actorId,
            updatedBy: input.actorId,
          },
        });
        await tx.vehicleMileageLog.create({
          data: {
            id: randomUUID(),
            businessId: input.businessId,
            vehicleId: vehicle.id,
            mileage: input.currentMileage,
            source: 'MANUAL',
            recordedBy: input.actorId,
          },
        });
        if (fleetId) {
          await tx.fleetVehicle.create({
            data: {
              id: randomUUID(),
              businessId: input.businessId,
              fleetId,
              vehicleId: vehicle.id,
            },
          });
        }
        await this.audit.record(
          {
            businessId: input.businessId,
            actorUserId: input.actorId,
            action: 'VEHICLE_CREATED',
            entityType: 'VEHICLE',
            entityId: vehicle.id,
            metadata: { plate, mileage: input.currentMileage },
          },
          tx,
        );
        return vehicle;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.plateExists(plate);
      }
      throw error;
    }
  }
}
