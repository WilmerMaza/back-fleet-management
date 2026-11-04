/**
 * Alta de vehículo: placa única por negocio y log inicial de km.
 */
import { Injectable } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { trimOrNull } from '../../customers/domain/customer-rules.js';
import { assertMileageChange } from '../domain/mileage.js';
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
    if (input.fleetId) {
      const fleet = await this.prisma.fleet.findFirst({
        where: { id: input.fleetId, businessId: input.businessId },
      });
      if (!fleet) {
        throw Errors.fleetNotFound();
      }
      if (fleet.customerId !== input.customerId) {
        throw Errors.fleetVehicleMismatch();
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            id: randomUUID(),
            businessId: input.businessId,
            customerId: input.customerId,
            fleetId: input.fleetId || null,
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
        if (input.fleetId) {
          await tx.fleetVehicle.create({
            data: {
              id: randomUUID(),
              businessId: input.businessId,
              fleetId: input.fleetId,
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
