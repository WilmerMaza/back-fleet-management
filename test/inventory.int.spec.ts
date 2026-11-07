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
import { InventoryStockService } from '../src/modules/inventory/application/inventory-stock.service.js';
import { qty } from '../src/shared/common/decimal.js';

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

describe('Productos e inventario (Postgres)', () => {
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

  it('crea producto con stock inicial y genera ENTRY', async () => {
    const { body } = await login('inventario@fleet.local');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(body.accessToken, DEMO))
      .send({
        sku: ' oil-5w30 ',
        name: 'Aceite 5W30',
        unit: 'L',
        initialStock: '10.000',
        minStock: '2.000',
        salePrice: null,
      })
      .expect(201);

    expect(res.body.sku).toBe('OIL-5W30');
    expect(res.body.stock).toBe('10.000');
    expect(res.body.salePrice).toBeNull();

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId: res.body.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('ENTRY');
  });

  it('crea producto con stock 0 sin movimiento', async () => {
    const { body } = await login('inventario@fleet.local');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(body.accessToken, DEMO))
      .send({ sku: 'FILT-1', name: 'Filtro', unit: 'UND', initialStock: '0' })
      .expect(201);
    const count = await prisma.inventoryMovement.count({ where: { productId: res.body.id } });
    expect(count).toBe(0);
    expect(res.body.stock).toBe('0.000');
  });

  it('rechaza SKU duplicado en el mismo negocio y lo permite en otro', async () => {
    const demo = await login('inventario@fleet.local');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(demo.body.accessToken, DEMO))
      .send({ sku: 'DUP-1', name: 'A', unit: 'UND' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(demo.body.accessToken, DEMO))
      .send({ sku: 'dup-1', name: 'B', unit: 'UND' })
      .expect(409);

    const norte = await login('admin@norte.local');
    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${NORTE}/products`)
      .set(auth(norte.body.accessToken, NORTE))
      .send({ sku: 'DUP-1', name: 'Norte', unit: 'UND' })
      .expect(201);
  });

  it('no deja consultar el otro tenant', async () => {
    const demo = await login('inventario@fleet.local');
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(demo.body.accessToken, DEMO))
      .send({ sku: 'PRIV-1', name: 'Privado', unit: 'UND' });

    const norte = await login('admin@norte.local');
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/products/${created.body.id}`)
      .set(auth(norte.body.accessToken, NORTE))
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(norte.body.accessToken, NORTE))
      .expect(403);
  });

  it('PATCH rechaza stock y no lo cambia', async () => {
    const demo = await login('inventario@fleet.local');
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(demo.body.accessToken, DEMO))
      .send({ sku: 'PATCH-1', name: 'P', unit: 'UND', initialStock: '4' });

    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/products/${created.body.id}`)
      .set(auth(demo.body.accessToken, DEMO))
      .send({ stock: '100.000' })
      .expect(400);

    const fresh = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/products/${created.body.id}`)
      .set(auth(demo.body.accessToken, DEMO));
    expect(fresh.body.stock).toBe('4.000');
  });

  it('entrada, ajuste, salida insuficiente y dos salidas concurrentes', async () => {
    const admin = await login('admin@fleet.local');
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(admin.body.accessToken, DEMO))
      .send({ sku: 'CONC-1', name: 'Concurrente', unit: 'UND', initialStock: '10' });

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/inventory-movements`)
      .set(auth(admin.body.accessToken, DEMO))
      .send({ productId: created.body.id, type: 'ENTRY', quantity: '5.000' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/inventory-adjustments`)
      .set(auth(admin.body.accessToken, DEMO))
      .send({ productId: created.body.id, targetStock: '10.000', reason: 'Conteo' })
      .expect(201);

    const stock = app.get(InventoryStockService);
    const a = stock.apply({
      businessId: DEMO,
      productId: created.body.id,
      type: 'EXIT',
      quantity: qty('7'),
      operationKey: 'order:1:exit:' + created.body.id,
      actorId: admin.body.user.id,
      reason: 'A',
    });
    const b = stock.apply({
      businessId: DEMO,
      productId: created.body.id,
      type: 'EXIT',
      quantity: qty('7'),
      operationKey: 'order:2:exit:' + created.body.id,
      actorId: admin.body.user.id,
      reason: 'B',
    });
    const results = await Promise.allSettled([a, b]);
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    const rejected = results.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(product.stock.toString()).toBe('3');
  });

  it('la misma operationKey no descuenta dos veces', async () => {
    const admin = await login('admin@fleet.local');
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(admin.body.accessToken, DEMO))
      .send({ sku: 'IDEM-1', name: 'Idem', unit: 'UND', initialStock: '8' });

    const stock = app.get(InventoryStockService);
    const input = {
      businessId: DEMO,
      productId: created.body.id,
      type: 'EXIT' as const,
      quantity: qty('2'),
      operationKey: 'sale:abc:exit:line1',
      actorId: admin.body.user.id,
      reason: 'venta',
    };
    await stock.apply(input);
    await stock.apply(input);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(product.stock.toString()).toBe('6');
    expect(
      await prisma.inventoryMovement.count({ where: { productId: created.body.id, type: 'EXIT' } }),
    ).toBe(1);
  });

  it('usuario sin inventory.write no crea productos; OPERATOR no lee inventario', async () => {
    const operator = await login('operador@fleet.local', DEMO);
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(operator.body.accessToken, DEMO))
      .expect(403);
  });

  it('inactivar no impide un EXIT interno (orden abierta)', async () => {
    const admin = await login('admin@fleet.local');
    const created = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(admin.body.accessToken, DEMO))
      .send({ sku: 'INACT-1', name: 'Inactivo', unit: 'UND', initialStock: '3' });

    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${DEMO}/products/${created.body.id}/deactivate`)
      .set(auth(admin.body.accessToken, DEMO))
      .expect(200);

    const stock = app.get(InventoryStockService);
    await stock.apply({
      businessId: DEMO,
      productId: created.body.id,
      type: 'EXIT',
      quantity: qty('1'),
      operationKey: 'order:open:exit:' + created.body.id,
      actorId: admin.body.user.id,
      reason: 'complete orden',
    });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(product.status).toBe('INACTIVE');
    expect(product.stock.toString()).toBe('2');
  });
});
