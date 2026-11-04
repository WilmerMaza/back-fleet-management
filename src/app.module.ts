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
import { VehiclesModule } from './modules/vehicles/vehicles.module.js';
import { PrismaModule } from './shared/database/prisma.module.js';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter.js';
import { AuthModule } from './shared/authorization/auth.module.js';
import { LoggingModule } from './shared/logging/logging.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      ignoreEnvFile: Boolean(process.env.VITEST),
    }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as `${number}${'s' | 'm' | 'h' | 'd'}` },
      }),
    }),
    LoggingModule,
    AuthModule,
    PrismaModule,
    AuditModule,
    IdentityModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    VehiclesModule,
    FleetsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
