/**
 * Integración H-02: integridad customer ↔ vehicle ↔ fleet al crear/actualizar/asignar.
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
import { PrismaService } from '../src/shared/database/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let prisma: PrismaService;
let token: string;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';
const JUAN = '33333333-3333-4333-8333-000000000001';
const ABC = '33333333-3333-4333-8333-000000000002';
const GUAJIRA = '33333333-3333-4333-8333-000000000101';
const CARTAGENA = '55555555-5555-4555-8555-000000000001';

async function login(email: string, businessId?: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'demo123', businessId });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { accessToken: string };
}

function authHeaders(businessId: string) {
  return { Authorization: `Bearer ${token}`, 'X-Business-Id': businessId };
}

describe('Integridad vehículo–cliente–flota (H-02)', () => {
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
    token = (await login('admin@fleet.local')).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('crea vehículo con cliente válido del negocio', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: JUAN,
        plate: 'H02OK1',
        brand: 'Toyota',
        line: 'Yaris',
        currentMileage: 100,
      })
      .expect(201);
    expect(created.body.customerId).toBe(JUAN);
    expect(created.body.fleetId).toBeNull();
  });

  it('rechaza cliente de otro negocio al crear', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: GUAJIRA,
        plate: 'H02XBUS',
        brand: 'Ford',
        line: 'Ranger',
        currentMileage: 10,
      })
      .expect(404);
  });

  it('asigna vehículo a flota válida del mismo cliente', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: ABC,
        plate: 'H02ASN',
        brand: 'Chevy',
        line: 'N300',
        currentMileage: 50,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${CARTAGENA}/vehicles/${created.body.id}/assign`)
      .set(authHeaders(DEMO))
      .expect(204);

    const vehicle = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/vehicles/${created.body.id}`)
      .set(authHeaders(DEMO))
      .expect(200);
    expect(vehicle.body.fleetId).toBe(CARTAGENA);
  });

  it('rechaza asignar vehículo de Juan a flota de ABC', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: JUAN,
        plate: 'H02MIS',
        brand: 'Kia',
        line: 'Rio',
        currentMileage: 20,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${CARTAGENA}/vehicles/${created.body.id}/assign`)
      .set(authHeaders(DEMO))
      .expect(409);
    expect(res.body.code).toBe('FLEET_VEHICLE_MISMATCH');
  });

  it('cambia cliente de vehículo sin flota', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: JUAN,
        plate: 'H02OWN',
        brand: 'Nissan',
        line: 'Versa',
        currentMileage: 30,
      })
      .expect(201);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/vehicles/${created.body.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: ABC })
      .expect(200);
    expect(patched.body.customerId).toBe(ABC);
    expect(patched.body.fleetId).toBeNull();
  });

  it('permite cambio de cliente compatible con la flota actual', async () => {
    // Vehículo ya de ABC en flota Cartagena: "cambiar" a ABC es no-op de propietario.
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: ABC,
        fleetId: CARTAGENA,
        plate: 'H02CMP',
        brand: 'Foton',
        line: 'Aumark',
        currentMileage: 40,
      })
      .expect(201);
    expect(created.body.fleetId).toBe(CARTAGENA);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/vehicles/${created.body.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: ABC, brand: 'Foton' })
      .expect(200);
    expect(patched.body.customerId).toBe(ABC);
    expect(patched.body.fleetId).toBe(CARTAGENA);
  });

  it('rechaza cambio de cliente incompatible con la flota y no deja cambios parciales', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: ABC,
        fleetId: CARTAGENA,
        plate: 'H02BAD',
        brand: 'Original',
        line: 'Line',
        currentMileage: 60,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/vehicles/${created.body.id}`)
      .set(authHeaders(DEMO))
      .send({ customerId: JUAN, brand: 'Hacked' })
      .expect(409);
    expect(res.body.code).toBe('FLEET_VEHICLE_MISMATCH');

    const fresh = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/vehicles/${created.body.id}`)
      .set(authHeaders(DEMO))
      .expect(200);
    expect(fresh.body.customerId).toBe(ABC);
    expect(fresh.body.brand).toBe('Original');
    expect(fresh.body.fleetId).toBe(CARTAGENA);

    const open = await prisma.fleetVehicle.findFirst({
      where: { vehicleId: created.body.id, unassignedAt: null },
    });
    expect(open?.fleetId).toBe(CARTAGENA);
  });

  it('rechaza asociar flota de otro negocio al crear', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(authHeaders(DEMO))
      .send({
        customerId: ABC,
        fleetId: '99999999-9999-4999-8999-999999999999',
        plate: 'H02FLT',
        brand: 'X',
        line: 'Y',
        currentMileage: 1,
      })
      .expect(404);
  });

  it('token Demo no opera vehículos de Norte (aislamiento tenant)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/vehicles`)
      .set(authHeaders(DEMO))
      .expect(403);
  });
});
