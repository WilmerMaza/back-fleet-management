import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class GetVehicleUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, businessId } });
    if (!vehicle) {
      throw Errors.vehicleNotFound();
    }
    return vehicle;
  }
}
