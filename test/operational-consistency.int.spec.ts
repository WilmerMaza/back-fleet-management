/**
 * Integración OC-01…OC-04: concurrencia flota↔vehículo y kilometraje con PostgreSQL real.
 *
 * Las carreras usan Promise.allSettled sobre use cases inyectados (no mocks).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AssignVehicleUseCase } from '../src/modules/fleets/application/assign-vehicle.use-case.js';
import { UnassignVehicleUseCase } from '../src/modules/fleets/application/unassign-vehicle.use-case.js';
import { UpdateFleetUseCase } from '../src/modules/fleets/application/update-fleet.use-case.js';
import { CreateVehicleUseCase } from '../src/modules/vehicles/application/create-vehicle.use-case.js';
import { UpdateVehicleUseCase } from '../src/modules/vehicles/application/update-vehicle.use-case.js';
import { AppError } from '../src/shared/common/app-error.js';
import { PrismaService } from '../src/shared/database/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let prisma: PrismaService;
let token: string;
let actorId: string;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';
const ABC = '33333333-3333-4333-8333-000000000002';
const MAGDALENA = '33333333-3333-4333-8333-000000000003';
async function login(email: string, businessId?: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'demo123', businessId });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { accessToken: string; user: { id: string } };
}

function authHeaders(businessId: string) {
  return { Authorization: `Bearer ${token}`, 'X-Business-Id': businessId };
}

async function createFleet(customerId: string, name: string) {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/businesses/${DEMO}/fleets`)
    .set(authHeaders(DEMO))
    .send({ customerId, name })
    .expect(201);
  return res.body as { id: string; customerId: string };
}

async function createVehicle(customerId: string, plate: string, mileage = 100) {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/businesses/${DEMO}/vehicles`)
    .set(authHeaders(DEMO))
    .send({
      customerId,
      plate,
      brand: 'OC',
      line: 'Test',
      currentMileage: mileage,
    })
    .expect(201);
  return res.body as { id: string; customerId: string; fleetId: string | null; currentMileage: number };
}

async function openAssignment(vehicleId: string) {
  return prisma.fleetVehicle.findFirst({
    where: { vehicleId, businessId: DEMO, unassignedAt: null },
  });
}

describe('Consistencia operativa OC-01…OC-04 (Postgres)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'vitest-jwt-secret-konti-h04-tests-32b';
    const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    execSync('npx prisma migrate deploy && npx tsx prisma/seed.ts', {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    const { HttpExceptionFilter } = await import('../src/shared/errors/http-exception.filter.js');
    const { AppLogger } = await import('../src/shared/logging/app-logger.js');
    app.useGlobalFilters(new HttpExceptionFilter(app.get(AppLogger)));
    await app.init();
    prisma = app.get(PrismaService);
    const session = await login('admin@fleet.local');
    token = session.accessToken;
    actorId = session.user.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('T-01 OC-01: Unassign ∥ Assign no deja abierta ≠ proyección', async () => {
    const f1 = await createFleet(ABC, 'OC01 F1');
    const f2 = await createFleet(ABC, 'OC01 F2');
    const vehicle = await createVehicle(ABC, 'OC01UV1');
    const assign = app.get(AssignVehicleUseCase);
    const unassign = app.get(UnassignVehicleUseCase);

    await assign.execute(DEMO, f1.id, vehicle.id, actorId);

    const results = await Promise.allSettled([
      unassign.execute(DEMO, f1.id, vehicle.id, actorId),
      assign.execute(DEMO, f2.id, vehicle.id, actorId),
    ]);

    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    const open = await openAssignment(vehicle.id);

    if (open) {
      expect(vehicleRow.fleetId).toBe(open.fleetId);
      expect([f1.id, f2.id]).toContain(open.fleetId);
    } else {
      expect(vehicleRow.fleetId).toBeNull();
    }

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBeGreaterThanOrEqual(1);
  });

  it('dos Assign concurrentes del mismo vehículo dejan una sola abierta alineada', async () => {
    const f1 = await createFleet(ABC, 'OC Conc A');
    const f2 = await createFleet(ABC, 'OC Conc B');
    const vehicle = await createVehicle(ABC, 'OCCONC1');
    const assign = app.get(AssignVehicleUseCase);

    const results = await Promise.allSettled([
      assign.execute(DEMO, f1.id, vehicle.id, actorId),
      assign.execute(DEMO, f2.id, vehicle.id, actorId),
    ]);

    const opens = await prisma.fleetVehicle.findMany({
      where: { vehicleId: vehicle.id, businessId: DEMO, unassignedAt: null },
    });
    expect(opens).toHaveLength(1);

    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(vehicleRow.fleetId).toBe(opens[0].fleetId);
    expect([f1.id, f2.id]).toContain(opens[0].fleetId);

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(2);
  });

  it('T-02 OC-02: Assign repara drift proyección sin abierta', async () => {
    const fleet = await createFleet(ABC, 'OC02 Drift');
    const vehicle = await createVehicle(ABC, 'OC02DFT');
    // Drift artificial: proyección = flota, sin fila abierta.
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { fleetId: fleet.id },
    });
    const beforeOpen = await openAssignment(vehicle.id);
    expect(beforeOpen).toBeNull();

    await app.get(AssignVehicleUseCase).execute(DEMO, fleet.id, vehicle.id, actorId);

    const open = await openAssignment(vehicle.id);
    expect(open?.fleetId).toBe(fleet.id);
    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(vehicleRow.fleetId).toBe(fleet.id);

    const opens = await prisma.fleetVehicle.count({
      where: { vehicleId: vehicle.id, businessId: DEMO, unassignedAt: null },
    });
    expect(opens).toBe(1);
  });

  it('OC-02: Assign repara drift abierta sin proyección', async () => {
    const fleet = await createFleet(ABC, 'OC02 Proj');
    const vehicle = await createVehicle(ABC, 'OC02PRJ');
    await app.get(AssignVehicleUseCase).execute(DEMO, fleet.id, vehicle.id, actorId);
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { fleetId: null },
    });

    await app.get(AssignVehicleUseCase).execute(DEMO, fleet.id, vehicle.id, actorId);

    const open = await openAssignment(vehicle.id);
    expect(open?.fleetId).toBe(fleet.id);
    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(vehicleRow.fleetId).toBe(fleet.id);
  });

  it('T-03 OC-03: CreateVehicle+fleet ∥ UpdateFleet owner no viola ownership', async () => {
    const fleet = await createFleet(ABC, 'OC03 Race');
    const createVehicle = app.get(CreateVehicleUseCase);
    const updateFleet = app.get(UpdateFleetUseCase);
    const plate = `OC03${Date.now().toString(36).slice(-4)}`.toUpperCase();

    const results = await Promise.allSettled([
      createVehicle.execute({
        businessId: DEMO,
        actorId,
        customerId: ABC,
        fleetId: fleet.id,
        plate,
        brand: 'OC',
        line: 'Race',
        currentMileage: 10,
      }),
      updateFleet.execute(DEMO, fleet.id, actorId, { customerId: MAGDALENA }),
    ]);

    const fleetRow = await prisma.fleet.findUniqueOrThrow({ where: { id: fleet.id } });
    const vehicleRow = await prisma.vehicle.findFirst({
      where: { businessId: DEMO, plate },
    });

    if (vehicleRow?.fleetId === fleet.id) {
      expect(vehicleRow.customerId).toBe(fleetRow.customerId);
      const open = await openAssignment(vehicleRow.id);
      expect(open?.fleetId).toBe(fleet.id);
    }

    const rejected = results.filter((r) => r.status === 'rejected');
    for (const item of rejected) {
      expect(item.status).toBe('rejected');
      if (item.status === 'rejected') {
        expect(item.reason).toBeInstanceOf(AppError);
        expect((item.reason as AppError).code).toBe('FLEET_VEHICLE_MISMATCH');
      }
    }

    // Estado final siempre coherente; al menos una operación completa.
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('T-04 OC-04: dos PATCH km concurrentes serializan y dejan logs coherentes', async () => {
    const vehicle = await createVehicle(ABC, 'OC04KM1', 100);
    const update = app.get(UpdateVehicleUseCase);

    // OPERATOR: el km no puede bajar; serialización FOR UPDATE deja final coherente y logs monótonos.
    const results = await Promise.allSettled([
      update.execute(DEMO, vehicle.id, actorId, ['OPERATOR'], { currentMileage: 150 }),
      update.execute(DEMO, vehicle.id, actorId, ['OPERATOR'], { currentMileage: 160 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect([150, 160]).toContain(vehicleRow.currentMileage);

    const logs = await prisma.vehicleMileageLog.findMany({
      where: { vehicleId: vehicle.id, businessId: DEMO },
      orderBy: { recordedAt: 'asc' },
    });
    // Log inicial (100) + los commits exitosos de kilometraje.
    const mileages = logs.map((l) => l.mileage);
    expect(mileages[0]).toBe(100);
    expect(mileages.at(-1)).toBe(vehicleRow.currentMileage);

    // Monotonía: cada log >= anterior (sin ajuste admin a la baja en este caso).
    for (let i = 1; i < mileages.length; i++) {
      expect(mileages[i]).toBeGreaterThanOrEqual(mileages[i - 1]);
    }
  });

  it('OC-04: rechaza kilometraje inferior al actual (no admin)', async () => {
    const vehicle = await createVehicle(ABC, 'OC04LOW', 200);
    await expect(
      app.get(UpdateVehicleUseCase).execute(DEMO, vehicle.id, actorId, ['OPERATOR'], {
        currentMileage: 150,
      }),
    ).rejects.toMatchObject({ code: 'MILEAGE_DECREASE_FORBIDDEN' });

    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(vehicleRow.currentMileage).toBe(200);
  });

  it('tenancy: Assign/Unassign/Update km no operan filas de otro businessId', async () => {
    const fleet = await createFleet(ABC, 'OC Tenancy');
    const vehicle = await createVehicle(ABC, 'OCTEN1');
    const assign = app.get(AssignVehicleUseCase);
    const unassign = app.get(UnassignVehicleUseCase);
    const update = app.get(UpdateVehicleUseCase);

    await expect(assign.execute(NORTE, fleet.id, vehicle.id, actorId)).rejects.toMatchObject({
      code: 'FLEET_NOT_FOUND',
    });
    await expect(unassign.execute(NORTE, fleet.id, vehicle.id, actorId)).rejects.toMatchObject({
      code: 'FLEET_NOT_FOUND',
    });
    await expect(
      update.execute(NORTE, vehicle.id, actorId, ['ADMIN'], { currentMileage: 999 }),
    ).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });

    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(vehicleRow.fleetId).toBeNull();
    expect(vehicleRow.currentMileage).toBe(100);
  });

  it('CreateVehicle rechaza flota inexistente/otro tenant y no deja parciales', async () => {
    const plate = 'OCXBIZ1';
    await expect(
      app.get(CreateVehicleUseCase).execute({
        businessId: DEMO,
        actorId,
        customerId: ABC,
        fleetId: randomUUID(),
        plate,
        brand: 'X',
        line: 'Y',
        currentMileage: 1,
      }),
    ).rejects.toMatchObject({ code: 'FLEET_NOT_FOUND' });

    const orphan = await prisma.vehicle.findFirst({ where: { businessId: DEMO, plate } });
    expect(orphan).toBeNull();
  });

  it('rollback: fallo de auditoría en Assign no deja ledger/proyección a medias', async () => {
    const fleet = await createFleet(ABC, 'OC Rollback');
    const vehicle = await createVehicle(ABC, 'OCROLL1');
    const assign = app.get(AssignVehicleUseCase);
    const { AuditService } = await import('../src/modules/audit/audit.service.js');
    const audit = app.get(AuditService);
    const original = audit.record.bind(audit);
    let failNext = true;
    audit.record = async (entry, tx) => {
      if (failNext) {
        failNext = false;
        throw new Error('forced audit failure');
      }
      return original(entry, tx);
    };

    try {
      await expect(assign.execute(DEMO, fleet.id, vehicle.id, actorId)).rejects.toThrow(
        /forced audit failure/,
      );
      const open = await openAssignment(vehicle.id);
      expect(open).toBeNull();
      const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
      expect(vehicleRow.fleetId).toBeNull();
    } finally {
      audit.record = original;
    }

    await assign.execute(DEMO, fleet.id, vehicle.id, actorId);
    const open = await openAssignment(vehicle.id);
    expect(open?.fleetId).toBe(fleet.id);
  });

  it('HTTP: token Demo no opera flotas/vehículos de Norte', async () => {
    await request(app.getHttpServer())
      .post(
        `/api/v1/businesses/${NORTE}/fleets/${randomUUID()}/vehicles/${randomUUID()}/assign`,
      )
      .set(authHeaders(DEMO))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${NORTE}/vehicles/${randomUUID()}`)
      .set(authHeaders(DEMO))
      .send({ currentMileage: 1 })
      .expect(403);
  });
});
