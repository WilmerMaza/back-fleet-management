/**
 * Integración H-07 Fase 0: diagnóstico tenant-FK contra PostgreSQL real.
 *
 * Tras Fase 2, las FK compuestas rechazan INSERT cross-tenant normales.
 * Para sembrar inconsistencias de diagnóstico se usa session_replication_role=replica.
 */
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TENANT_FK_CHECKS,
  main as runCli,
  verifyTenantFks,
} from '../scripts/verify-tenant-fks.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let databaseUrl: string;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';

function result(report: Awaited<ReturnType<typeof verifyTenantFks>>, id: string) {
  const row = report.results.find((item) => item.id === id);
  if (!row) {
    throw new Error(`check missing: ${id}`);
  }
  return row;
}

async function ensureBusinesses() {
  await prisma.business.upsert({
    where: { id: DEMO },
    update: {},
    create: { id: DEMO, name: 'Demo' },
  });
  await prisma.business.upsert({
    where: { id: NORTE },
    update: {},
    create: { id: NORTE, name: 'Norte' },
  });
}

async function createCustomer(businessId: string, type: 'PERSON' | 'COMPANY' = 'COMPANY') {
  return prisma.customer.create({
    data: {
      id: randomUUID(),
      businessId,
      type,
      status: 'ACTIVE',
      legalName: type === 'COMPANY' ? 'Co' : null,
      nit: type === 'COMPANY' ? `N${randomUUID().slice(0, 8)}` : null,
      firstName: type === 'PERSON' ? 'A' : null,
      lastName: type === 'PERSON' ? 'B' : null,
      documentType: type === 'PERSON' ? 'CC' : null,
      documentNumber: type === 'PERSON' ? randomUUID().slice(0, 8) : null,
    },
  });
}

/** Solo para sembrar filas cross-tenant que el diagnóstico debe detectar. */
async function withFkChecksDisabled<T>(fn: () => Promise<T>): Promise<T> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

describe('verify-tenant-fks (Postgres)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'vitest-jwt-secret-konti-h04-tests-32b';
    const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    execSync('npx prisma migrate deploy', {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
    });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await ensureBusinesses();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('expone las 12 verificaciones', () => {
    expect(TENANT_FK_CHECKS).toHaveLength(12);
  });

  it('base limpia (solo negocios): todas PASS', async () => {
    const report = await verifyTenantFks(prisma);
    expect(report.ok).toBe(true);
    expect(report.failedCount).toBe(0);
    expect(report.errorCount).toBe(0);
    expect(report.results.every((r) => r.status === 'PASS')).toBe(true);
  });

  it('detecta vehículo con cliente de otro negocio', async () => {
    const demoCustomer = await createCustomer(DEMO);
    const norteCustomer = await createCustomer(NORTE);
    const vehicle = await withFkChecksDisabled(() =>
      prisma.vehicle.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          customerId: norteCustomer.id,
          plate: `XC${randomUUID().slice(0, 5)}`.toUpperCase(),
          brand: 'X',
          line: 'Y',
          currentMileage: 0,
        },
      }),
    );

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'vehicles_customer_cross_tenant').status).toBe('FAIL');
    expect(result(report, 'vehicles_customer_cross_tenant').count).toBeGreaterThanOrEqual(1);

    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.customer.delete({ where: { id: demoCustomer.id } });
    await prisma.customer.delete({ where: { id: norteCustomer.id } });
  });

  it('detecta flota con cliente de otro negocio', async () => {
    const norteCustomer = await createCustomer(NORTE);
    const fleet = await withFkChecksDisabled(() =>
      prisma.fleet.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          customerId: norteCustomer.id,
          name: 'Cross Fleet',
        },
      }),
    );

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'fleets_customer_cross_tenant').status).toBe('FAIL');

    await prisma.fleet.delete({ where: { id: fleet.id } });
    await prisma.customer.delete({ where: { id: norteCustomer.id } });
  });

  it('detecta asignación fleet_vehicles con flota o vehículo de otro negocio', async () => {
    const demoCustomer = await createCustomer(DEMO);
    const norteCustomer = await createCustomer(NORTE);
    const fleetNorte = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        customerId: norteCustomer.id,
        name: 'Norte Fleet',
      },
    });
    const vehicleDemo = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        plate: `XA${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'X',
        line: 'Y',
        currentMileage: 0,
      },
    });
    const vehicleNorte = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        customerId: norteCustomer.id,
        plate: `XB${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'X',
        line: 'Y',
        currentMileage: 0,
      },
    });
    const { assignFleetCross, assignVehicleCross } = await withFkChecksDisabled(async () => {
      const assignFleetCross = await prisma.fleetVehicle.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          fleetId: fleetNorte.id,
          vehicleId: vehicleDemo.id,
        },
      });
      const assignVehicleCross = await prisma.fleetVehicle.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          fleetId: fleetNorte.id,
          vehicleId: vehicleNorte.id,
          unassignedAt: new Date(),
        },
      });
      return { assignFleetCross, assignVehicleCross };
    });

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'fleet_vehicles_fleet_cross_tenant').status).toBe('FAIL');
    expect(result(report, 'fleet_vehicles_vehicle_cross_tenant').status).toBe('FAIL');

    await prisma.fleetVehicle.delete({ where: { id: assignFleetCross.id } });
    await prisma.fleetVehicle.delete({ where: { id: assignVehicleCross.id } });
    await prisma.vehicle.delete({ where: { id: vehicleDemo.id } });
    await prisma.vehicle.delete({ where: { id: vehicleNorte.id } });
    await prisma.fleet.delete({ where: { id: fleetNorte.id } });
    await prisma.customer.delete({ where: { id: demoCustomer.id } });
    await prisma.customer.delete({ where: { id: norteCustomer.id } });
  });

  it('detecta mismatch de propietario vehículo vs flota', async () => {
    const ownerA = await createCustomer(DEMO);
    const ownerB = await createCustomer(DEMO);
    const fleet = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: ownerA.id,
        name: 'Owner Fleet',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: ownerB.id,
        fleetId: fleet.id,
        plate: `OW${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'X',
        line: 'Y',
        currentMileage: 0,
      },
    });

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'vehicle_fleet_owner_mismatch').status).toBe('FAIL');
    // También drift: proyección sin abierta.
    expect(result(report, 'fleet_projection_drift').status).toBe('FAIL');

    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.fleet.delete({ where: { id: fleet.id } });
    await prisma.customer.delete({ where: { id: ownerA.id } });
    await prisma.customer.delete({ where: { id: ownerB.id } });
  });

  it('detecta movimiento con producto de otro negocio', async () => {
    const product = await prisma.product.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        sku: `SKU-${randomUUID().slice(0, 6)}`,
        name: 'Oil',
        unit: 'L',
        stock: 10,
        minStock: 0,
      },
    });
    const movement = await withFkChecksDisabled(() =>
      prisma.inventoryMovement.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          productId: product.id,
          type: 'ENTRY',
          quantity: 1,
          stockBefore: 0,
          stockAfter: 1,
          createdBy: randomUUID(),
        },
      }),
    );

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'movements_product_cross_tenant').status).toBe('FAIL');

    await prisma.inventoryMovement.delete({ where: { id: movement.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  it('detecta kilometraje de otro negocio', async () => {
    const customer = await createCustomer(NORTE);
    const vehicle = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        customerId: customer.id,
        plate: `KM${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'X',
        line: 'Y',
        currentMileage: 10,
      },
    });
    const log = await withFkChecksDisabled(() =>
      prisma.vehicleMileageLog.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          vehicleId: vehicle.id,
          mileage: 10,
          source: 'MANUAL',
        },
      }),
    );

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'mileage_vehicle_cross_tenant').status).toBe('FAIL');

    await prisma.vehicleMileageLog.delete({ where: { id: log.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('detecta reversión de movimiento entre negocios', async () => {
    const productDemo = await prisma.product.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        sku: `D-${randomUUID().slice(0, 6)}`,
        name: 'D',
        unit: 'L',
        stock: 5,
        minStock: 0,
      },
    });
    const productNorte = await prisma.product.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        sku: `N-${randomUUID().slice(0, 6)}`,
        name: 'N',
        unit: 'L',
        stock: 5,
        minStock: 0,
      },
    });
    const original = await prisma.inventoryMovement.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        productId: productNorte.id,
        type: 'ENTRY',
        quantity: 1,
        stockBefore: 0,
        stockAfter: 1,
        createdBy: randomUUID(),
      },
    });
    const reversal = await withFkChecksDisabled(() =>
      prisma.inventoryMovement.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          productId: productDemo.id,
          type: 'EXIT',
          quantity: 1,
          stockBefore: 5,
          stockAfter: 4,
          reversesMovementId: original.id,
          createdBy: randomUUID(),
        },
      }),
    );

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'movements_reversal_cross_tenant').status).toBe('FAIL');

    await prisma.inventoryMovement.delete({ where: { id: reversal.id } });
    await prisma.inventoryMovement.delete({ where: { id: original.id } });
    await prisma.product.delete({ where: { id: productDemo.id } });
    await prisma.product.delete({ where: { id: productNorte.id } });
  });

  it('detecta drift entre vehicles.fleet_id y asignación abierta', async () => {
    const customer = await createCustomer(DEMO);
    const fleet = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: customer.id,
        name: 'Drift Fleet',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: customer.id,
        fleetId: fleet.id,
        plate: `DR${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'X',
        line: 'Y',
        currentMileage: 0,
      },
    });
    // Proyección apunta a flota pero no hay abierta → drift.

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'fleet_projection_drift').status).toBe('FAIL');

    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.fleet.delete({ where: { id: fleet.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('detecta sesión con negocio inexistente', async () => {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `orphan-${randomUUID().slice(0, 8)}@test.local`,
        fullName: 'Orphan',
        passwordHash: 'x',
      },
    });
    const session = await prisma.authRefreshSession.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: randomUUID().replace(/-/g, ''),
        activeBusinessId: '99999999-9999-4999-8999-999999999999',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'auth_session_orphan_business').status).toBe('FAIL');
    expect(result(report, 'auth_session_missing_membership').status).toBe('FAIL');

    await prisma.authRefreshSession.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('detecta sesión sin membresía en el negocio activo', async () => {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `nomem-${randomUUID().slice(0, 8)}@test.local`,
        fullName: 'No Mem',
        passwordHash: 'x',
      },
    });
    const session = await prisma.authRefreshSession.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: randomUUID().replace(/-/g, ''),
        activeBusinessId: DEMO,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const report = await verifyTenantFks(prisma);
    expect(result(report, 'auth_session_orphan_business').status).toBe('PASS');
    expect(result(report, 'auth_session_missing_membership').status).toBe('FAIL');

    await prisma.authRefreshSession.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('CLI main retorna 1 ante DATABASE_URL inválida (error de conexión)', async () => {
    const code = await runCli({
      ...process.env,
      DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/no_db',
    });
    expect(code).toBe(1);
  }, 30_000);

  it('CLI main retorna 0 sobre base limpia', async () => {
    // Limpiar residuos de tests previos que hayan fallado a medias.
    await prisma.authRefreshSession.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.vehicleMileageLog.deleteMany();
    await prisma.fleetVehicle.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.fleet.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.userBusinessMembership.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@test.local' } },
    });

    const code = await runCli({ ...process.env, DATABASE_URL: databaseUrl });
    expect(code).toBe(0);
  });
});
