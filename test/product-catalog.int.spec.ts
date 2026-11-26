/**
 * Integración: categorías, marcas y clasificación de productos (Postgres).
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

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';

async function login(email: string, businessId = DEMO) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'demo123', businessId });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

function auth(token: string, businessId: string) {
  return { Authorization: `Bearer ${token}`, 'X-Business-Id': businessId };
}

describe('Product catalog (Postgres)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'vitest-jwt-secret-konti-catalog-32b!!';
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
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('crea categoría y subcategoría; rechaza 3er nivel y duplicados', async () => {
    const token = await login('admin@fleet.local');
    const root = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/product-categories`)
      .set(auth(token, DEMO))
      .send({ name: 'Lubricantes', code: 'LUB' })
      .expect(201);
    expect(root.body.parentId).toBeNull();

    const child = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/product-categories`)
      .set(auth(token, DEMO))
      .send({ name: 'Aceites de motor', parentId: root.body.id })
      .expect(201);
    expect(child.body.parentId).toBe(root.body.id);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/product-categories`)
      .set(auth(token, DEMO))
      .send({ name: 'Nivel 3', parentId: child.body.id })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/product-categories`)
      .set(auth(token, DEMO))
      .send({ name: ' lubricantes ' })
      .expect(409);

    const tree = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/product-categories?tree=true`)
      .set(auth(token, DEMO))
      .expect(200);
    const lub = tree.body.data.find((c: { name: string }) => c.name === 'Lubricantes');
    expect(lub?.children?.some((c: { name: string }) => c.name === 'Aceites de motor')).toBe(true);
  });

  it('marca: crear, duplicado y aislamiento multi-tenant', async () => {
    const token = await login('admin@fleet.local');
    const brand = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/product-brands`)
      .set(auth(token, DEMO))
      .send({ name: 'Mobil' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/product-brands`)
      .set(auth(token, DEMO))
      .send({ name: 'MOBIL' })
      .expect(409);

    const norteToken = await login('admin@norte.local', NORTE);
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/product-brands`)
      .set(auth(norteToken, NORTE))
      .expect(200)
      .expect((res) => {
        expect(res.body.data.every((b: { id: string }) => b.id !== brand.body.id)).toBe(true);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/product-brands/${brand.body.id}`)
      .set(auth(norteToken, NORTE))
      .expect(403);
  });

  it('producto clasificado; sin marca; rechaza categoría de otro negocio', async () => {
    const token = await login('admin@fleet.local');
    const cats = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/product-categories?tree=true`)
      .set(auth(token, DEMO));
    const root = cats.body.data[0];
    const sub = root.children?.[0];
    const brands = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/product-brands`)
      .set(auth(token, DEMO));
    const brandId = brands.body.data[0]?.id;

    const classified = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(token, DEMO))
      .send({
        sku: 'CAT-OIL-1',
        name: 'Aceite clasificado',
        unit: 'L',
        categoryId: sub?.id ?? root.id,
        brandId,
        initialStock: '1',
        minStock: '0',
      })
      .expect(201);
    expect(classified.body.categoryId).toBe(sub?.id ?? root.id);
    expect(classified.body.brandId).toBe(brandId);
    expect(classified.body.subcategoryId).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(token, DEMO))
      .send({
        sku: 'CAT-OIL-2',
        name: 'Sin marca',
        unit: 'L',
        categoryId: root.id,
        initialStock: '0',
        minStock: '0',
      })
      .expect(201);

    const norteToken = await login('admin@norte.local', NORTE);
    const norteCat = await request(app.getHttpServer())
      .post(`/api/v1/businesses/${NORTE}/product-categories`)
      .set(auth(norteToken, NORTE))
      .send({ name: 'Filtros Norte' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(token, DEMO))
      .send({
        sku: 'CROSS-1',
        name: 'Cruzado',
        unit: 'UND',
        categoryId: norteCat.body.id,
      })
      .expect(404);

    const db = await prisma.product.findFirst({ where: { sku: 'CAT-OIL-1', businessId: DEMO } });
    expect(db?.categoryId).toBe(sub?.id ?? root.id);
  });

  it('no desactiva categoría con productos; exige categoría si el catálogo existe', async () => {
    const token = await login('admin@fleet.local');
    const cats = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/product-categories?tree=true`)
      .set(auth(token, DEMO));
    const root = cats.body.data[0];

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/product-categories/${root.id}/status`)
      .set(auth(token, DEMO))
      .send({ isActive: false })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(token, DEMO))
      .send({ sku: 'NO-CAT', name: 'Sin cat', unit: 'UND' })
      .expect(400);
  });
});
