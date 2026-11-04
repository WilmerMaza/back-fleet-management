import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

let container: StartedPostgreSqlContainer;
let app: INestApplication;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';
const ABC = '33333333-3333-4333-8333-000000000002';
const JUAN = '33333333-3333-4333-8333-000000000001';
const CARTAGENA = '55555555-5555-4555-8555-000000000001';
const RST = '44444444-4444-4444-8444-000000000005';

async function login(email: string, businessId?: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'demo123', businessId });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res;
}

function auth(token: string, businessId: string) {
  return { Authorization: `Bearer ${token}`, 'X-Business-Id': businessId };
}

describe('Clientes, vehículos y flotas (Postgres)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'test-secret';
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('lista clientes del tenant y search=Transportes encuentra ABC', async () => {
    const { body } = await login('admin@fleet.local');
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers?search=Transportes`)
      .set(auth(body.accessToken, DEMO))
      .expect(200);
    expect(listed.body.meta.total).toBe(1);
    expect(listed.body.data[0].legalName).toContain('Transportes ABC');
  });

  it('no mezcla clientes de otro negocio', async () => {
    const norte = await login('admin@norte.local');
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(norte.body.accessToken, NORTE))
      .expect(200);
    expect(listed.body.data.every((row: { businessId: string }) => row.businessId === NORTE)).toBe(
      true,
    );
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers/${JUAN}`)
      .set(auth(norte.body.accessToken, NORTE))
      .expect(403);
  });

  it('rechaza documento duplicado y permite el mismo en otro tenant', async () => {
    const demo = await login('admin@fleet.local');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(demo.body.accessToken, DEMO))
      .send({
        type: 'PERSON',
        firstName: 'Otro',
        documentType: 'CC',
        documentNumber: '1234567890',
      })
      .expect(409);

    const norte = await login('admin@norte.local');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(norte.body.accessToken, NORTE))
      .send({
        type: 'PERSON',
        firstName: 'Clone',
        documentType: 'CC',
        documentNumber: '1234567890',
      })
      .expect(201);
  });

  it('PATCH con null vacía el correo', async () => {
    const { body } = await login('admin@fleet.local');
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(body.accessToken, DEMO))
      .send({
        type: 'PERSON',
        firstName: 'Luisa',
        documentType: 'CC',
        documentNumber: '1099887766',
        email: 'luisa@example.com',
      })
      .expect(201);
    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/customers/${created.body.id}`)
      .set(auth(body.accessToken, DEMO))
      .send({ email: null })
      .expect(200);
    expect(patched.body.email).toBeNull();
  });

  it('operador lee clientes y no escribe', async () => {
    const { body } = await login('operador@fleet.local', DEMO);
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(body.accessToken, DEMO))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(body.accessToken, DEMO))
      .send({ type: 'PERSON', firstName: 'X', documentType: 'CC', documentNumber: '1' })
      .expect(403);
  });

  it('crea vehículo con log de km y rechaza placa duplicada', async () => {
    const { body } = await login('admin@fleet.local');
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(auth(body.accessToken, DEMO))
      .send({
        customerId: JUAN,
        plate: ' new99 ',
        brand: 'Kia',
        line: 'Rio',
        currentMileage: 1200,
      })
      .expect(201);
    expect(created.body.plate).toBe('NEW99');
    const logs = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/vehicles/${created.body.id}/mileage-logs`)
      .set(auth(body.accessToken, DEMO))
      .expect(200);
    expect(logs.body).toHaveLength(1);
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/vehicles`)
      .set(auth(body.accessToken, DEMO))
      .send({ customerId: JUAN, plate: 'NEW99', brand: 'Kia', line: 'Rio', currentMileage: 1 })
      .expect(409);
  });

  it('admin puede ajustar el km a la baja de forma auditada', async () => {
    const { body } = await login('admin@fleet.local');
    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/vehicles/${RST}`)
      .set(auth(body.accessToken, DEMO))
      .send({ currentMileage: 1 })
      .expect(200);
  });

  it('flota exige COMPANY y asignar cierra la previa', async () => {
    const { body } = await login('admin@fleet.local');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets`)
      .set(auth(body.accessToken, DEMO))
      .send({ customerId: JUAN, name: 'No debe' })
      .expect(400);

    const fleet = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets`)
      .set(auth(body.accessToken, DEMO))
      .send({ customerId: ABC, name: 'Flota Norte' })
      .expect(201);
    expect(fleet.body.customerName).toContain('ABC');

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${fleet.body.id}/vehicles/${RST}/assign`)
      .set(auth(body.accessToken, DEMO))
      .expect(204);

    const vehicle = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/vehicles/${RST}`)
      .set(auth(body.accessToken, DEMO))
      .expect(200);
    expect(vehicle.body.fleetId).toBe(fleet.body.id);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/fleets/${CARTAGENA}/vehicles/${RST}/assign`)
      .set(auth(body.accessToken, DEMO))
      .expect(204);

    const moved = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/vehicles/${RST}`)
      .set(auth(body.accessToken, DEMO))
      .expect(200);
    expect(moved.body.fleetId).toBe(CARTAGENA);

    const summary = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/fleets/${CARTAGENA}/summary`)
      .set(auth(body.accessToken, DEMO))
      .expect(200);
    expect(summary.body.vehicleCount).toBe(summary.body.onTrack + summary.body.upcoming + summary.body.overdue);
    expect(summary.body.vehicles.some((row: { id: string }) => row.id === RST)).toBe(true);
  });
});
