import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class GetCustomerUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) {
      throw Errors.customerNotFound();
    }
    return customer;
  }
}
