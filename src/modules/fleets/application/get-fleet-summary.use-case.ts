/**
 * Resumen de flota. Sin maintenance_schedules aún: todos los asignados cuentan como al día.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { customerDisplayName } from '../../customers/domain/display-name.js';

@Injectable()
export class GetFleetSummaryUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, fleetId: string) {
    const fleet = await this.prisma.fleet.findFirst({
      where: { id: fleetId, businessId },
      include: { customer: true },
    });
    if (!fleet) {
      throw Errors.fleetNotFound();
    }
    const vehicles = await this.prisma.vehicle.findMany({
      where: { businessId, fleetId },
      orderBy: { plate: 'asc' },
    });
    return {
      fleet,
      customerName: customerDisplayName(fleet.customer),
      vehicleCount: vehicles.length,
      onTrack: vehicles.length,
      upcoming: 0,
      overdue: 0,
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        line: vehicle.line,
        status: vehicle.status,
      })),
    };
  }
}
