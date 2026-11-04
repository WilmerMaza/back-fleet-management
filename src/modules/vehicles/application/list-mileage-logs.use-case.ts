import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class ListMileageLogsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, businessId } });
    if (!vehicle) {
      throw Errors.vehicleNotFound();
    }
    return this.prisma.vehicleMileageLog.findMany({
      where: { businessId, vehicleId },
      orderBy: { recordedAt: 'desc' },
    });
  }
}
