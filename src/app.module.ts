import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { FleetsModule } from './modules/fleets/fleets.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ProductCatalogModule } from './modules/product-catalog/product-catalog.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module.js';
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module.js';
import { VehiclesModule } from './modules/vehicles/vehicles.module.js';
import { PrismaModule } from './shared/database/prisma.module.js';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter.js';
import { AuthModule } from './shared/authorization/auth.module.js';
import { LoggingModule } from './shared/logging/logging.module.js';
import { loadJwtModuleOptions } from './shared/config/jwt.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      ignoreEnvFile: Boolean(process.env.VITEST),
    }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => loadJwtModuleOptions(),
    }),
    LoggingModule,
    AuthModule,
    PrismaModule,
    AuditModule,
    IdentityModule,
    RolesModule,
    NotificationsModule,
    PlatformModule,
    ProductCatalogModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    VehiclesModule,
    FleetsModule,
    ServiceCatalogModule,
    ServiceOrdersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
