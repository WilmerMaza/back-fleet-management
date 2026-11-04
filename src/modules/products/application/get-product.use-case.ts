import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { Errors } from '../../../shared/common/app-error.js';

@Injectable()
export class GetProductUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(businessId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
    });
    if (!product) {
      throw Errors.productNotFound();
    }
    return product;
  }
}
