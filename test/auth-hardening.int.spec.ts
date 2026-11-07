/**
 * Integración SEC-01 / SEC-02 / SEC-03 + regresión H-01/H-04 (reuso refresh).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashRefreshToken } from '../src/modules/identity/domain/token-hash.js';
import { AuthRateLimiter } from '../src/shared/authorization/auth-rate-limiter.js';
import { permissionsForRoles } from '../src/shared/authorization/permissions.js';
import { PrismaService } from '../src/shared/database/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let prisma: PrismaService;
let rateLimiter: AuthRateLimiter;

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';

async function login(email: string, password = 'demo123', businessId?: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password, businessId });
  return res;
}

function auth(token: string, businessId: string) {
  return { Authorization: `Bearer ${token}`, 'X-Business-Id': businessId };
}

describe('Auth hardening SEC-01/02/03 (Postgres)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'vitest-jwt-secret-konti-h04-tests-32b';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.AUTH_RATE_LIMIT_ENABLED = 'true';
    process.env.AUTH_SESSION_CACHE_TTL_MS = '0';
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
    rateLimiter = app.get(AuthRateLimiter);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  beforeEach(() => {
    rateLimiter.reset();
    rateLimiter.configure({
      enabled: true,
      loginIpMax: 1000,
      loginIpWindowMs: 60_000,
      loginAccountMax: 1000,
      loginAccountWindowMs: 900_000,
      refreshIpMax: 1000,
      refreshIpWindowMs: 60_000,
    });
  });

  it('SEC-01: rate limit de login por IP responde 429', async () => {
    rateLimiter.configure({
      enabled: true,
      loginIpMax: 3,
      loginIpWindowMs: 60_000,
      loginAccountMax: 1000,
      loginAccountWindowMs: 900_000,
      refreshIpMax: 1000,
      refreshIpWindowMs: 60_000,
    });

    for (let i = 0; i < 3; i++) {
      const res = await login('admin@fleet.local', 'wrong-password');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    }
    const limited = await login('admin@fleet.local', 'wrong-password');
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
  });

  it('SEC-01: rate limit de refresh por IP responde 429', async () => {
    rateLimiter.configure({
      enabled: true,
      loginIpMax: 1000,
      loginIpWindowMs: 60_000,
      loginAccountMax: 1000,
      loginAccountWindowMs: 900_000,
      refreshIpMax: 2,
      refreshIpWindowMs: 60_000,
    });

    const session = await login('admin@fleet.local');
    expect(session.status).toBe(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-valid-token' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'also-invalid' })
      .expect(401);
    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'third' });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
  });

  it('SEC-02: tras logout el access token deja de autorizar', async () => {
    const session = await login('inventario@fleet.local');
    expect(session.status).toBe(200);
    const { accessToken, refreshToken } = session.body;

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(accessToken, DEMO))
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(accessToken, DEMO))
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('SEC-02: revocar familia invalida el access de esa familia', async () => {
    const session = await login('admin@fleet.local');
    expect(session.status).toBe(200);
    const row = await prisma.authRefreshSession.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(session.body.refreshToken) },
    });

    await prisma.authRefreshSession.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(session.body.accessToken, DEMO))
      .expect(401);
  });

  it('SEC-02/03: membresía INACTIVE corta el acceso antes del expiry', async () => {
    const session = await login('inventario@fleet.local');
    expect(session.status).toBe(200);
    const userId = session.body.user.id;

    await prisma.userBusinessMembership.update({
      where: { userId_businessId: { userId, businessId: DEMO } },
      data: { status: 'INACTIVE' },
    });

    try {
      await request(app.getHttpServer())
        .get(`/api/v1/businesses/${DEMO}/products`)
        .set(auth(session.body.accessToken, DEMO))
        .expect(403);
    } finally {
      await prisma.userBusinessMembership.update({
        where: { userId_businessId: { userId, businessId: DEMO } },
        data: { status: 'ACTIVE' },
      });
    }
  });

  it('SEC-03: cambio de roleCodes reduce permisos en el siguiente request', async () => {
    const session = await login('admin@fleet.local');
    expect(session.status).toBe(200);
    const userId = session.body.user.id;

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/products`)
      .set(auth(session.body.accessToken, DEMO))
      .expect(200);

    const previous = await prisma.userBusinessMembership.findUniqueOrThrow({
      where: { userId_businessId: { userId, businessId: DEMO } },
    });

    await prisma.userBusinessMembership.update({
      where: { userId_businessId: { userId, businessId: DEMO } },
      data: {
        roleCodes: ['OPERATOR'],
        permissions: permissionsForRoles(['OPERATOR']),
      },
    });

    try {
      await request(app.getHttpServer())
        .get(`/api/v1/businesses/${DEMO}/products`)
        .set(auth(session.body.accessToken, DEMO))
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/businesses/${DEMO}/customers`)
        .set(auth(session.body.accessToken, DEMO))
        .expect(200);
    } finally {
      await prisma.userBusinessMembership.update({
        where: { userId_businessId: { userId, businessId: DEMO } },
        data: {
          roleCodes: previous.roleCodes,
          permissions: previous.permissions,
        },
      });
    }
  });

  it('SEC-03: permissions infladas en DB no escalan en el access emitido ni en Guard', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'operador@fleet.local' },
    });
    const membership = await prisma.userBusinessMembership.findUniqueOrThrow({
      where: { userId_businessId: { userId: user.id, businessId: DEMO } },
    });

    await prisma.userBusinessMembership.update({
      where: { userId_businessId: { userId: user.id, businessId: DEMO } },
      data: {
        roleCodes: ['OPERATOR'],
        permissions: [...permissionsForRoles(['OPERATOR']), 'inventory.adjust'],
      },
    });

    try {
      const session = await login('operador@fleet.local', 'demo123', DEMO);
      expect(session.status).toBe(200);

      const { JwtService } = await import('@nestjs/jwt');
      const jwt = app.get(JwtService);
      const payload = jwt.decode(session.body.accessToken) as {
        permissions: string[];
        roles: string[];
      };
      expect(payload.roles).toEqual(['OPERATOR']);
      expect(payload.permissions).not.toContain('inventory.adjust');
      expect(payload.permissions).toEqual(permissionsForRoles(['OPERATOR']));

      await request(app.getHttpServer())
        .post(`/api/v1/businesses/${DEMO}/inventory-adjustments`)
        .set(auth(session.body.accessToken, DEMO))
        .send({
          productId: '99999999-9999-4999-8999-999999999999',
          targetStock: '1.000',
          reason: 'x',
        })
        .expect(403);
    } finally {
      await prisma.userBusinessMembership.update({
        where: { userId_businessId: { userId: user.id, businessId: DEMO } },
        data: {
          roleCodes: membership.roleCodes,
          permissions: membership.permissions,
        },
      });
    }
  });

  it('SEC-03 / H-01: switch-business usa permisos del negocio destino', async () => {
    const session = await login('operador@fleet.local', 'demo123', DEMO);
    expect(session.status).toBe(200);

    const switched = await request(app.getHttpServer())
      .post('/api/v1/auth/switch-business')
      .set(auth(session.body.accessToken, DEMO))
      .send({ businessId: NORTE })
      .expect(200);

    expect(switched.body.user.businessId).toBe(NORTE);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(switched.body.accessToken, NORTE))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(switched.body.accessToken, NORTE))
      .expect(403);
  });

  it('H-04 regresión: reutilizar refresh revoca familia y el access muere', async () => {
    const session = await login('admin@norte.local');
    expect(session.status).toBe(200);
    const original = session.body.refreshToken;
    const access = session.body.accessToken;

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original })
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(access, NORTE))
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(rotated.body.accessToken, NORTE))
      .expect(401);
  });
});
