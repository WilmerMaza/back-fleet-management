import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { customerDisplayName } from '../../customers/domain/display-name.js';

@Injectable()
export class GetFleetUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, id: string) {
    const fleet = await this.prisma.fleet.findFirst({
      where: { id, businessId },
      include: { customer: true },
    });
    if (!fleet) {
      throw Errors.fleetNotFound();
    }
    const vehicleCount = await this.prisma.vehicle.count({
      where: { businessId, fleetId: id },
    });
    return {
      fleet,
      customerName: customerDisplayName(fleet.customer),
      vehicleCount,
    };
  }
}
