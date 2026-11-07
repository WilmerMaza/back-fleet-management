/**
 * Integración H-01: un token no opera otro negocio; switch-business emite nueva sesión.
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
import { permissionsForRoles } from '../src/shared/authorization/permissions.js';
import { PrismaService } from '../src/shared/database/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: INestApplication;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';
const OPERATOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

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

describe('Auth multi-tenant (H-01)', () => {
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

    const prisma = app.get(PrismaService);
    // Mismo usuario: ADMIN en Demo, OPERATOR en Norte (roles distintos).
    await prisma.userBusinessMembership.update({
      where: { userId_businessId: { userId: OPERATOR_ID, businessId: DEMO } },
      data: { roleCodes: ['ADMIN'], permissions: permissionsForRoles(['ADMIN']) },
    });
    await prisma.userBusinessMembership.update({
      where: { userId_businessId: { userId: OPERATOR_ID, businessId: NORTE } },
      data: { roleCodes: ['OPERATOR'], permissions: permissionsForRoles(['OPERATOR']) },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('token Demo no opera Norte; switch-business emite permisos de Norte', async () => {
    const demoSession = await login('operador@fleet.local', DEMO);
    expect(demoSession.body.user.roleCodes).toEqual(['ADMIN']);
    expect(demoSession.body.user.businessId).toBe(DEMO);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(demoSession.body.accessToken, DEMO))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(demoSession.body.accessToken, DEMO))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(demoSession.body.accessToken, NORTE))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set({
        Authorization: `Bearer ${demoSession.body.accessToken}`,
        'X-Business-Id': DEMO,
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers`)
      .set({
        Authorization: `Bearer ${demoSession.body.accessToken}`,
        'X-Business-Id': NORTE,
      })
      .expect(403);

    const switched = await request(app.getHttpServer())
      .post('/api/v1/auth/switch-business')
      .set(auth(demoSession.body.accessToken, DEMO))
      .send({ businessId: NORTE })
      .expect(200);

    expect(switched.body.user.businessId).toBe(NORTE);
    expect(switched.body.user.roleCodes).toEqual(['OPERATOR']);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(switched.body.accessToken, NORTE))
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(switched.body.accessToken, NORTE))
      .send({
        type: 'PERSON',
        firstName: 'X',
        documentType: 'CC',
        documentNumber: '999000111',
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(switched.body.accessToken, NORTE))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/products`)
      .set(auth(demoSession.body.accessToken, NORTE))
      .expect(403);
  });
});
