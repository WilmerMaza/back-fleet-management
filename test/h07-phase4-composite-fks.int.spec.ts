/**
 * Integración H-07 Fase 4: FK tenant de proyección flota y self-FK de reversión (NOT VALID).
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

async function createProduct(businessId: string) {
  return prisma.product.create({
    data: {
      id: randomUUID(),
      businessId,
      sku: `SKU-${randomUUID().slice(0, 6)}`,
      name: 'Oil',
      unit: 'L',
      stock: 100,
      minStock: 0,
    },
  });
}

describe('H-07 Fase 4 FK restantes (Postgres)', () => {
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

  it('vehicles.fleet_id: mismo negocio OK; cross-tenant rechazado; NULL permitido', async () => {
    const demoCustomer = await createCompany(DEMO);
    const norteCustomer = await createCompany(NORTE);
    const fleetDemo = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        name: 'Fleet Demo',
      },
    });
    const fleetNorte = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        customerId: norteCustomer.id,
        name: 'Fleet Norte',
      },
    });

    const withFleet = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        fleetId: fleetDemo.id,
        plate: `F4${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 0,
      },
    });
    expect(withFleet.fleetId).toBe(fleetDemo.id);

    const withoutFleet = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: demoCustomer.id,
        fleetId: null,
        plate: `N4${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 0,
      },
    });
    expect(withoutFleet.fleetId).toBeNull();

    await expect(
      prisma.vehicle.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          customerId: demoCustomer.id,
          fleetId: fleetNorte.id,
          plate: `X4${randomUUID().slice(0, 5)}`.toUpperCase(),
          brand: 'T',
          line: 'L',
          currentMileage: 0,
        },
      }),
    ).rejects.toSatisfy(isFkViolation);

    await expect(
      prisma.vehicle.update({
        where: { id: withoutFleet.id },
        data: { fleetId: fleetNorte.id },
      }),
    ).rejects.toSatisfy(isFkViolation);
  });

  it('asignación/desasignación: proyección fleet_id sigue funcionando', async () => {
    const customer = await createCompany(DEMO);
    const fleet = await prisma.fleet.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: customer.id,
        name: 'Assign Flow',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        customerId: customer.id,
        fleetId: null,
        plate: `AF${randomUUID().slice(0, 5)}`.toUpperCase(),
        brand: 'T',
        line: 'L',
        currentMileage: 0,
      },
    });

    const assigned = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { fleetId: fleet.id },
    });
    expect(assigned.fleetId).toBe(fleet.id);

    await prisma.fleetVehicle.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        fleetId: fleet.id,
        vehicleId: vehicle.id,
      },
    });

    const unassigned = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { fleetId: null },
    });
    expect(unassigned.fleetId).toBeNull();
  });

  it('reverses_movement_id: null OK; mismo negocio OK; cross-tenant e inexistente rechazados', async () => {
    const productDemo = await createProduct(DEMO);
    const productNorte = await createProduct(NORTE);
    const actor = randomUUID();

    const plain = await prisma.inventoryMovement.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        productId: productDemo.id,
        type: 'ENTRY',
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        createdBy: actor,
      },
    });
    expect(plain.reversesMovementId).toBeNull();

    const exit = await prisma.inventoryMovement.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        productId: productDemo.id,
        type: 'EXIT',
        quantity: 2,
        stockBefore: 10,
        stockAfter: 8,
        createdBy: actor,
      },
    });

    const reversalOk = await prisma.inventoryMovement.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        productId: productDemo.id,
        type: 'RETURN',
        quantity: 1,
        stockBefore: 8,
        stockAfter: 9,
        reversesMovementId: exit.id,
        createdBy: actor,
      },
    });
    expect(reversalOk.reversesMovementId).toBe(exit.id);

    const exitNorte = await prisma.inventoryMovement.create({
      data: {
        id: randomUUID(),
        businessId: NORTE,
        productId: productNorte.id,
        type: 'EXIT',
        quantity: 1,
        stockBefore: 5,
        stockAfter: 4,
        createdBy: actor,
      },
    });

    await expect(
      prisma.inventoryMovement.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          productId: productDemo.id,
          type: 'RETURN',
          quantity: 1,
          stockBefore: 9,
          stockAfter: 10,
          reversesMovementId: exitNorte.id,
          createdBy: actor,
        },
      }),
    ).rejects.toSatisfy(isFkViolation);

    await expect(
      prisma.inventoryMovement.create({
        data: {
          id: randomUUID(),
          businessId: DEMO,
          productId: productDemo.id,
          type: 'RETURN',
          quantity: 1,
          stockBefore: 9,
          stockAfter: 10,
          reversesMovementId: randomUUID(),
          createdBy: actor,
        },
      }),
    ).rejects.toSatisfy(isFkViolation);
  });

  it('catálogo PG: 8 FK tenant validadas; simples presentes', async () => {
    const phase4 = await prisma.$queryRaw<
      { conname: string; convalidated: boolean; def: string }[]
    >`
      SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'f'
        AND c.conname IN (
          'vehicles_fleet_tenant_fkey',
          'inventory_movements_reversal_tenant_fkey'
        )
      ORDER BY c.conname
    `;
    expect(phase4).toHaveLength(2);
    for (const fk of phase4) {
      expect(fk.convalidated).toBe(true);
      expect(fk.def).not.toMatch(/NOT VALID/i);
      expect(fk.def).toMatch(/ON DELETE RESTRICT/i);
      expect(fk.def).toMatch(/ON UPDATE CASCADE/i);
    }

    const phase23 = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace
        AND convalidated = true
        AND conname IN (
          'vehicles_customer_tenant_fkey',
          'fleets_customer_tenant_fkey',
          'fleet_vehicles_fleet_tenant_fkey',
          'fleet_vehicles_vehicle_tenant_fkey',
          'inventory_movements_product_tenant_fkey',
          'vehicle_mileage_logs_vehicle_tenant_fkey'
        )
    `;
    expect(phase23[0]?.n).toBe(6);

    const simples = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace
        AND conname IN (
          'vehicles_fleet_id_fkey',
          'inventory_movements_reverses_movement_id_fkey',
          'vehicles_customer_id_fkey',
          'fleets_customer_id_fkey',
          'fleet_vehicles_fleet_id_fkey',
          'fleet_vehicles_vehicle_id_fkey',
          'inventory_movements_product_id_fkey',
          'vehicle_mileage_logs_vehicle_id_fkey'
        )
    `;
    expect(simples[0]?.n).toBe(8);

    const uniques = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE contype = 'u' AND connamespace = 'public'::regnamespace
        AND convalidated = true
        AND conname IN (
          'customers_business_id_id_key',
          'products_business_id_id_key',
          'fleets_business_id_id_key',
          'vehicles_business_id_id_key',
          'inventory_movements_business_id_id_key'
        )
    `;
    expect(uniques[0]?.n).toBe(5);
  });
});
