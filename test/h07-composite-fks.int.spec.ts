/**
 * Integración H-07 Fase 2: FK compuestas NOT VALID rechazan cross-tenant en INSERT.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';

function isFkViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

async function createCompany(businessId: string) {
  return prisma.customer.create({
    data: {
      id: randomUUID(),
      businessId,
      type: 'COMPANY',
      status: 'ACTIVE',
      legalName: 'Co',
      nit: `N${randomUUID().slice(0, 8)}`,
    },
  });
}

describe('H-07 Fase 2 FK compuestas (Postgres)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'vitest-jwt-secret-konti-h04-tests-32b';
    const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    execSync('npx prisma migrate deploy', {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
    });
    prisma = new PrismaClient();
    await prisma.business.create({ data: { id: DEMO, name: 'Demo' } });
    await prisma.business.create({ data: { id: NORTE, name: 'Norte' } });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('vehiculo + cliente mismo negocio: permitido; distinto negocio: rechazado', async () => {
    const demoCustomer = await createCompany(DEMO);
    const norteCustomer = await createCompany(NORTE);

    const ok = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        plate: `OK${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 0,
      },
    });
    expect(ok.customerId).toBe(demoCustomer.id);

    await expect(
      prisma.vehicle.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          customerId: norteCustomer.id,
          plate: `BAD${randomUUID().slice(0, 4)}`.toUpperCase(),
          brand: 'T',
          line: 'L',
          currentMileage: 0,
        },
      }),
    ).rejects.toSatisfy(isFkViolation);
  });

  it('flota + cliente mismo negocio: permitido; distinto negocio: rechazado', async () => {
    const demoCustomer = await createCompany(DEMO);
    const norteCustomer = await createCompany(NORTE);

    const ok = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        name: 'OK Fleet',
      },
    });
    expect(ok.customerId).toBe(demoCustomer.id);

    await expect(
      prisma.fleet.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          customerId: norteCustomer.id,
          name: 'Bad Fleet',
        },
      }),
    ).rejects.toSatisfy(isFkViolation);
  });

  it('asignación vehículo↔flota mismo negocio: permitida; cross-tenant: rechazada', async () => {
    const demoCustomer = await createCompany(DEMO);
    const norteCustomer = await createCompany(NORTE);
    const fleetDemo = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        name: 'Assign OK',
      },
    });
    const fleetNorte = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        customerId: norteCustomer.id,
        name: 'Assign Norte',
      },
    });
    const vehicleDemo = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        plate: `AS${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 0,
      },
    });
    // Vehículo distinto para el caso cross-tenant: evita chocar con el UNIQUE parcial
    // fleet_vehicles_open_assignment_unique (H-03) antes que la FK tenant.
    const vehicleCross = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        plate: `AX${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 0,
      },
    });

    const ok = await prisma.fleetVehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        fleetId: fleetDemo.id,
        vehicleId: vehicleDemo.id,
      },
    });
    expect(ok.fleetId).toBe(fleetDemo.id);

    await expect(
      prisma.fleetVehicle.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          fleetId: fleetNorte.id,
          vehicleId: vehicleCross.id,
        },
      }),
    ).rejects.toSatisfy(isFkViolation);
  });

  it('movimiento + producto mismo negocio: permitido; distinto: rechazado', async () => {
    const productDemo = await prisma.product.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        sku: `D-${randomUUID().slice(0, 6)}`,
        name: 'Demo Oil',
        unit: 'L',
        stock: 10,
        minStock: 0,
      },
    });
    const productNorte = await prisma.product.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        sku: `N-${randomUUID().slice(0, 6)}`,
        name: 'Norte Oil',
        unit: 'L',
        stock: 10,
        minStock: 0,
      },
    });

    const ok = await prisma.inventoryMovement.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        productId: productDemo.id,
        type: 'ENTRY',
        quantity: 1,
        stockBefore: 10,
        stockAfter: 11,
        createdBy: randomUUID(),
      },
    });
    expect(ok.productId).toBe(productDemo.id);

    await expect(
      prisma.inventoryMovement.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          productId: productNorte.id,
          type: 'ENTRY',
          quantity: 1,
          stockBefore: 0,
          stockAfter: 1,
          createdBy: randomUUID(),
        },
      }),
    ).rejects.toSatisfy(isFkViolation);
  });

  it('kilometraje mismo negocio: permitido; distinto: rechazado', async () => {
    const demoCustomer = await createCompany(DEMO);
    const norteCustomer = await createCompany(NORTE);
    const vehicleDemo = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        plate: `KM${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 100,
      },
    });
    const vehicleNorte = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        customerId: norteCustomer.id,
        plate: `KN${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 50,
      },
    });

    const ok = await prisma.vehicleMileageLog.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        vehicleId: vehicleDemo.id,
        mileage: 100,
        source: 'MANUAL',
      },
    });
    expect(ok.vehicleId).toBe(vehicleDemo.id);

    await expect(
      prisma.vehicleMileageLog.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          vehicleId: vehicleNorte.id,
          mileage: 50,
          source: 'MANUAL',
        },
      }),
    ).rejects.toSatisfy(isFkViolation);
  });

  it('catálogo PG: 6 FK tenant validadas y FK simples siguen presentes', async () => {
    const tenantFks = await prisma.$queryRaw<
      { conname: string; convalidated: boolean; def: string }[]
    >`
      SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'f'
        AND c.conname IN (
          'vehicles_customer_tenant_fkey',
          'fleets_customer_tenant_fkey',
          'fleet_vehicles_fleet_tenant_fkey',
          'fleet_vehicles_vehicle_tenant_fkey',
          'inventory_movements_product_tenant_fkey',
          'vehicle_mileage_logs_vehicle_tenant_fkey'
        )
      ORDER BY c.conname
    `;
    expect(tenantFks).toHaveLength(6);
    for (const fk of tenantFks) {
      expect(fk.convalidated).toBe(true);
      expect(fk.def).not.toMatch(/NOT VALID/i);
      expect(fk.def).toMatch(/ON DELETE RESTRICT/i);
      expect(fk.def).toMatch(/ON UPDATE CASCADE/i);
    }

    const simple = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace
        AND conname IN (
          'vehicles_customer_id_fkey',
          'fleets_customer_id_fkey',
          'fleet_vehicles_fleet_id_fkey',
          'fleet_vehicles_vehicle_id_fkey',
          'inventory_movements_product_id_fkey',
          'vehicle_mileage_logs_vehicle_id_fkey'
        )
    `;
    expect(simple[0].n).toBe(6);

    const phase1 = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE contype = 'u' AND connamespace = 'public'::regnamespace
        AND conname LIKE '%_business_id_id_key'
    `;
    expect(phase1[0].n).toBe(5);
  });
});
