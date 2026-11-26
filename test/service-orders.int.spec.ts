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

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';

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

async function seedOrderDeps(token: string, businessId: string) {
  const customer = await request(app.getHttpServer())
    .post(`/api/v1/businesses/${businessId}/customers`)
    .set(auth(token, businessId))
    .send({
      type: 'PERSON',
      firstName: 'Orden',
      lastName: 'Test',
      documentType: 'CC',
      documentNumber: `DOC-${Date.now()}`,
    });
  const vehicle = await request(app.getHttpServer())
    .post(`/api/v1/businesses/${businessId}/vehicles`)
    .set(auth(token, businessId))
    .send({
      customerId: customer.body.id,
      plate: `T${String(Date.now()).slice(-6)}`,
      brand: 'Toyota',
      line: 'Hilux',
      currentMileage: 1000,
    });
  const serviceType = await prisma.serviceType.findFirst({
    where: { businessId, status: 'ACTIVE' },
  });
  if (!serviceType) {
    throw new Error('No hay service types en seed');
  }
  const product = await request(app.getHttpServer())
    .post(`/api/v1/businesses/${businessId}/products`)
    .set(auth(token, businessId))
    .send({
      sku: `SO-${Date.now()}`,
      name: 'Producto orden',
      unit: 'UND',
      initialStock: '10',
    });
  return {
    customerId: customer.body.id as string,
    vehicleId: vehicle.body.id as string,
    serviceTypeId: serviceType.id,
    productId: product.body.id as string,
  };
}

function orderBody(deps: Awaited<ReturnType<typeof seedOrderDeps>>, qty = '2.000') {
  return {
    customerId: deps.customerId,
    vehicleId: deps.vehicleId,
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    mileage: 1100,
    items: [
      {
        serviceTypeId: deps.serviceTypeId,
        productUsages: [{ productId: deps.productId, quantity: qty }],
      },
    ],
  };
}

describe('Service orders (Postgres)', () => {
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('crea y consulta orden; create no mueve stock', async () => {
    const { body } = await login('admin@fleet.local');
    const deps = await seedOrderDeps(body.accessToken, DEMO);
    const before = await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } });

    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders`)
      .set(auth(body.accessToken, DEMO))
      .send(orderBody(deps))
      .expect(201);

    expect(created.body.status).toBe('OPEN');
    expect(created.body.orderNumber).toMatch(/^OT-/);
    expect(created.body.items).toHaveLength(1);

    const got = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/service-orders/${created.body.id}`)
      .set(auth(body.accessToken, DEMO))
      .expect(200);
    expect(got.body.id).toBe(created.body.id);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } });
    expect(after.stock.toString()).toBe(before.stock.toString());
  });

  it('no consulta órdenes de otro tenant', async () => {
    const demo = await login('admin@fleet.local');
    const deps = await seedOrderDeps(demo.body.accessToken, DEMO);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders`)
      .set(auth(demo.body.accessToken, DEMO))
      .send(orderBody(deps))
      .expect(201);

    const norte = await login('admin@norte.local');
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/service-orders/${created.body.id}`)
      .set(auth(norte.body.accessToken, NORTE))
      .expect(404);
  });

  it('completa con stock, descuenta e idempotente', async () => {
    const { body } = await login('admin@fleet.local');
    const deps = await seedOrderDeps(body.accessToken, DEMO);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders`)
      .set(auth(body.accessToken, DEMO))
      .send(orderBody(deps, '3.000'))
      .expect(201);

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders/${created.body.id}/complete`)
      .set(auth(body.accessToken, DEMO))
      .expect(201);
    expect(completed.body.status).toBe('COMPLETED');

    const product = await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } });
    expect(product.stock.toString()).toBe('7');
    expect(
      await prisma.inventoryMovement.count({
        where: {
          relatedEntityId: created.body.id,
          type: 'EXIT',
          relatedEntityType: 'SERVICE_ORDER',
        },
      }),
    ).toBe(1);

    const again = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders/${created.body.id}/complete`)
      .set(auth(body.accessToken, DEMO))
      .expect(201);
    expect(again.body.status).toBe('COMPLETED');
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } }),
    ).toMatchObject({ stock: expect.anything() });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } })).stock.toString(),
    ).toBe('7');
  });

  it('rechaza complete sin stock y no completa la orden', async () => {
    const { body } = await login('admin@fleet.local');
    const deps = await seedOrderDeps(body.accessToken, DEMO);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders`)
      .set(auth(body.accessToken, DEMO))
      .send(orderBody(deps, '50.000'))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders/${created.body.id}/complete`)
      .set(auth(body.accessToken, DEMO))
      .expect(409);

    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(order.status).toBe('OPEN');
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } })).stock.toString(),
    ).toBe('10');
  });

  it('dos complete concurrentes de la misma orden: un ganador, un consumo', async () => {
    const { body } = await login('admin@fleet.local');
    const deps = await seedOrderDeps(body.accessToken, DEMO);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders`)
      .set(auth(body.accessToken, DEMO))
      .send(orderBody(deps, '2.000'))
      .expect(201);

    const path = `/api/v1/businesses/${DEMO}/service-orders/${created.body.id}/complete`;
    const results = await Promise.allSettled([
      request(app.getHttpServer()).post(path).set(auth(body.accessToken, DEMO)),
      request(app.getHttpServer()).post(path).set(auth(body.accessToken, DEMO)),
    ]);
    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : 0,
    );
    expect(statuses.every((s) => s === 201)).toBe(true);
    expect(
      await prisma.inventoryMovement.count({
        where: { relatedEntityId: created.body.id, type: 'EXIT' },
      }),
    ).toBe(1);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } })).stock.toString(),
    ).toBe('8');
  });

  it('dos órdenes concurrentes compiten por el mismo stock', async () => {
    const { body } = await login('admin@fleet.local');
    const deps = await seedOrderDeps(body.accessToken, DEMO);
    await prisma.product.update({
      where: { id: deps.productId },
      data: { stock: '5' },
    });

    const a = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders`)
      .set(auth(body.accessToken, DEMO))
      .send(orderBody(deps, '4.000'))
      .expect(201);
    const b = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/service-orders`)
      .set(auth(body.accessToken, DEMO))
      .send(orderBody(deps, '4.000'))
      .expect(201);

    const results = await Promise.allSettled([
      request(app.getHttpServer())
        .post(`/api/v1/businesses/${DEMO}/service-orders/${a.body.id}/complete`)
        .set(auth(body.accessToken, DEMO)),
      request(app.getHttpServer())
        .post(`/api/v1/businesses/${DEMO}/service-orders/${b.body.id}/complete`)
        .set(auth(body.accessToken, DEMO)),
    ]);
    const codes = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(1);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: deps.productId } });
    expect(product.stock.toString()).toBe('1');
    const completed = await prisma.serviceOrder.count({
      where: {
        id: { in: [a.body.id, b.body.id] },
        status: 'COMPLETED',
      },
    });
    expect(completed).toBe(1);
  });
});
