/**
 * PATCH de vehículo. El km no baja salvo ajuste ADMIN auditado.
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
    const current = await this.prisma.vehicle.findFirst({ where: { id, businessId } });
    if (!current) {
      throw Errors.vehicleNotFound();
    }
    if (input.customerId && input.customerId !== current.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: input.customerId, businessId },
      });
      if (!customer) {
        throw Errors.customerNotFound();
      }
    }

    const nextMileage = input.currentMileage;
    const mileageChanged = nextMileage != null && nextMileage !== current.currentMileage;
    if (mileageChanged) {
      assertMileageChange(current.currentMileage, nextMileage, roles.includes('ADMIN'));
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
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
            action: mileageChanged ? 'MILEAGE_UPDATED' : 'VEHICLE_UPDATED',
            entityType: 'VEHICLE',
            entityId: id,
            metadata: mileageChanged
              ? {
                  previous: current.currentMileage,
                  next: nextMileage,
                  adjustment: nextMileage < current.currentMileage,
                }
              : { fields: Object.keys(input) },
          },
          tx,
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.plateExists(input.plate ? normalizePlate(input.plate) : current.plate);
      }
      throw error;
    }
  }
}

function maybe(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return trimOrNull(value);
}
