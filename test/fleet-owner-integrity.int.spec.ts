/**
 * Integración H-12: cambio de propietario de flota vs asignaciones abiertas y concurrencia.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AssignVehicleUseCase } from '../src/modules/fleets/application/assign-vehicle.use-case.js';
import { UpdateFleetUseCase } from '../src/modules/fleets/application/update-fleet.use-case.js';
import { PrismaService } from '../src/shared/database/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let prisma: PrismaService;
let token: string;
let actorId: string;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';
const JUAN = '33333333-3333-4333-8333-000000000001';
const ABC = '33333333-3333-4333-8333-000000000002';
const MAGDALENA = '33333333-3333-4333-8333-000000000003';
const GUAJIRA = '33333333-3333-4333-8333-000000000101';

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

async function createVehicle(customerId: string, plate: string) {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/businesses/${DEMO}/vehicles`)
    .set(authHeaders(DEMO))
    .send({
      customerId,
      plate,
      brand: 'Test',
      line: 'H12',
      currentMileage: 1,
    })
    .expect(201);
  return res.body as { id: string; customerId: string; fleetId: string | null };
}

describe('Integridad propietario de flota (H-12)', () => {
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

  it('cambia cliente sin vehículos asignados', async () => {
    const fleet = await createFleet(ABC, 'H12 Empty');
    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: MAGDALENA })
      .expect(200);
    expect(patched.body.customerId).toBe(MAGDALENA);
  });

  it('cambia cliente con vehículos compatibles (mismo cliente)', async () => {
    const fleet = await createFleet(ABC, 'H12 Compat');
    const vehicle = await createVehicle(ABC, 'H12CMP1');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}/vehicles/${vehicle.id}/assign`)
      .set(authHeaders(DEMO))
      .expect(204);

    // Mismo propietario: no-op de owner, solo nombre.
    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: ABC, name: 'H12 Compat Renamed' })
      .expect(200);
    expect(patched.body.customerId).toBe(ABC);
    expect(patched.body.name).toBe('H12 Compat Renamed');
  });

  it('rechaza cambio de cliente con vehículos incompatibles y no deja parciales', async () => {
    const fleet = await createFleet(ABC, 'H12 Bad Owner');
    const vehicle = await createVehicle(ABC, 'H12BAD1');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}/vehicles/${vehicle.id}/assign`)
      .set(authHeaders(DEMO))
      .expect(204);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: MAGDALENA, name: 'Hacked Name' })
      .expect(409);
    expect(res.body.code).toBe('FLEET_VEHICLE_MISMATCH');

    const fresh = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}`)
      .set(authHeaders(DEMO))
      .expect(200);
    expect(fresh.body.customerId).toBe(ABC);
    expect(fresh.body.name).toBe('H12 Bad Owner');

    const open = await prisma.fleetVehicle.findFirst({
      where: { fleetId: fleet.id, unassignedAt: null },
    });
    expect(open?.vehicleId).toBe(vehicle.id);
  });

  it('historial cerrado no bloquea el cambio de propietario', async () => {
    const fleet = await createFleet(ABC, 'H12 History');
    const vehicle = await createVehicle(ABC, 'H12HIST');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}/vehicles/${vehicle.id}/assign`)
      .set(authHeaders(DEMO))
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}/vehicles/${vehicle.id}/unassign`)
      .set(authHeaders(DEMO))
      .expect(204);

    const closed = await prisma.fleetVehicle.count({
      where: { fleetId: fleet.id, unassignedAt: { not: null } },
    });
    expect(closed).toBeGreaterThanOrEqual(1);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: MAGDALENA })
      .expect(200);
    expect(patched.body.customerId).toBe(MAGDALENA);
  });

  it('rechaza cliente de otro negocio y flota inexistente', async () => {
    const fleet = await createFleet(ABC, 'H12 Cross');
    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: GUAJIRA })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/fleets/99999999-9999-4999-8999-999999999999`)
      .set(authHeaders(DEMO))
      .send({ name: 'Nope' })
      .expect(404);
  });

  it('rechaza PERSON como propietario de flota', async () => {
    const fleet = await createFleet(ABC, 'H12 Person');
    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/fleets/${fleet.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: JUAN })
      .expect(400);
  });

  it('concurrencia: update de propietario y assign no dejan estado inconsistente', async () => {
    const fleet = await createFleet(ABC, 'H12 Race');
    const vehicle = await createVehicle(ABC, 'H12RACE');
    const updateFleet = app.get(UpdateFleetUseCase);
    const assignVehicle = app.get(AssignVehicleUseCase);

    const results = await Promise.allSettled([
      updateFleet.execute(DEMO, fleet.id, actorId, { customerId: MAGDALENA }),
      assignVehicle.execute(DEMO, fleet.id, vehicle.id, actorId),
    ]);

    const fleetRow = await prisma.fleet.findUniqueOrThrow({ where: { id: fleet.id } });
    const vehicleRow = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    const open = await prisma.fleetVehicle.findFirst({
      where: { fleetId: fleet.id, vehicleId: vehicle.id, unassignedAt: null },
    });

    if (open) {
      expect(vehicleRow.fleetId).toBe(fleet.id);
      expect(vehicleRow.customerId).toBe(fleetRow.customerId);
    } else {
      expect(vehicleRow.fleetId).not.toBe(fleet.id);
    }

    const settledOk = results.filter((item) => item.status === 'fulfilled').length;
    const settledErr = results.filter((item) => item.status === 'rejected').length;
    expect(settledOk + settledErr).toBe(2);
    // Al menos una operación debe poder completarse; el estado final siempre es coherente.
    expect(settledOk).toBeGreaterThanOrEqual(1);
  });

  it('H-01: token Demo no actualiza flotas de Norte', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${NORTE}/fleets/99999999-9999-4999-8999-999999999999`)
      .set(authHeaders(DEMO))
      .send({ name: 'x' })
      .expect(403);
  });
});
