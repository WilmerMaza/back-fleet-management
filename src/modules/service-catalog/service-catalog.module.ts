import { Module } from '@nestjs/common';
import { CreateServiceTypeUseCase } from './application/create-service-type.use-case.js';
import { ListServiceTypesUseCase } from './application/list-service-types.use-case.js';
import { UpdateServiceTypeUseCase } from './application/update-service-type.use-case.js';
import { PrismaServiceTypeRepository } from './infrastructure/persistence/prisma-service-type.repository.js';
import { ServiceCatalogController } from './presentation/service-catalog.controller.js';
import { SERVICE_TYPE_REPOSITORY } from './service-catalog.tokens.js';

@Module({
  controllers: [ServiceCatalogController],
  providers: [
    { provide: SERVICE_TYPE_REPOSITORY, useClass: PrismaServiceTypeRepository },
    ListServiceTypesUseCase,
    CreateServiceTypeUseCase,
    UpdateServiceTypeUseCase,
  ],
  exports: [SERVICE_TYPE_REPOSITORY, ListServiceTypesUseCase],
})
export class ServiceCatalogModule {}
