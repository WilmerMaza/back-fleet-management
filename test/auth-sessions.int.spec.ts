/**
 * Integración H-04: persistencia, rotación, reutilización, logout y switch-business.
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
import { hashRefreshToken } from '../src/modules/identity/domain/token-hash.js';
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
  return res.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; businessId: string; roleCodes: string[] };
  };
}

function auth(token: string, businessId: string) {
  return { Authorization: `Bearer ${token}`, 'X-Business-Id': businessId };
}

describe('Auth sessions H-04 (Postgres)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'vitest-jwt-secret-konti-h04-tests-32b';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
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

  it('login persiste hash de refresh (nunca el token en claro)', async () => {
    const session = await login('admin@fleet.local');
    const rows = await prisma.authRefreshSession.findMany({
      where: { userId: session.user.id, revokedAt: null },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const match = rows.find((row) => row.tokenHash === hashRefreshToken(session.refreshToken));
    expect(match).toBeTruthy();
    expect(match!.activeBusinessId).toBe(DEMO);
    expect(JSON.stringify(rows)).not.toContain(session.refreshToken);
  });

  it('refresh válido rota el token y deja el anterior revocado', async () => {
    const session = await login('inventario@fleet.local');
    const firstHash = hashRefreshToken(session.refreshToken);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    expect(refreshed.body.refreshToken).not.toBe(session.refreshToken);
    expect(refreshed.body.user.businessId).toBe(DEMO);

    const old = await prisma.authRefreshSession.findUniqueOrThrow({
      where: { tokenHash: firstHash },
    });
    expect(old.revokedAt).not.toBeNull();
    expect(old.replacedById).toBeTruthy();

    const next = await prisma.authRefreshSession.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(refreshed.body.refreshToken) },
    });
    expect(next.revokedAt).toBeNull();
    expect(next.familyId).toBe(old.familyId);
  });

  it('refresh rechaza businessId en el body; el negocio sale de la sesión', async () => {
    const session = await login('operador@fleet.local', DEMO);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken, businessId: NORTE })
      .expect(400);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    expect(refreshed.body.user.businessId).toBe(DEMO);
  });

  it('reutilizar refresh ya rotado revoca la familia', async () => {
    const session = await login('admin@norte.local');
    const original = session.refreshToken;

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original })
      .expect(401);

    const familyId = (
      await prisma.authRefreshSession.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(rotated.body.refreshToken) },
      })
    ).familyId;

    const active = await prisma.authRefreshSession.count({
      where: { familyId, revokedAt: null },
    });
    expect(active).toBe(0);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('refresh expirado se rechaza', async () => {
    const session = await login('admin@fleet.local');
    const hash = hashRefreshToken(session.refreshToken);
    await prisma.authRefreshSession.update({
      where: { tokenHash: hash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('logout revoca la familia; refresh posterior falla', async () => {
    const session = await login('inventario@fleet.local');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: session.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);

    const row = await prisma.authRefreshSession.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(session.refreshToken) },
    });
    expect(row.revokedAt).not.toBeNull();
  });

  it('dos refresh concurrentes: uno gana y la familia queda consistente', async () => {
    const session = await login('admin@fleet.local');
    const results = await Promise.allSettled([
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken }),
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken }),
    ]);

    const statuses = results.map((item) =>
      item.status === 'fulfilled' ? item.value.status : 0,
    );
    const ok = statuses.filter((code) => code === 200);
    const denied = statuses.filter((code) => code === 401);
    expect(ok.length + denied.length).toBe(2);
    expect(ok.length).toBeLessThanOrEqual(1);
    expect(denied.length).toBeGreaterThanOrEqual(1);

    const old = await prisma.authRefreshSession.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(session.refreshToken) },
    });
    expect(old.revokedAt).not.toBeNull();

    if (ok.length === 1) {
      const winner = results.find(
        (item) => item.status === 'fulfilled' && item.value.status === 200,
      ) as PromiseFulfilledResult<{ body: { refreshToken: string } }>;
      // Reuso del original ya ocurrió en el perdedor → familia revocada.
      const familyActive = await prisma.authRefreshSession.count({
        where: { familyId: old.familyId, revokedAt: null },
      });
      expect(familyActive).toBe(0);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: winner.value.body.refreshToken })
        .expect(401);
    }
  });

  it('sesiones de usuarios distintos están aisladas', async () => {
    const admin = await login('admin@fleet.local');
    const inventory = await login('inventario@fleet.local');
    expect(admin.user.id).not.toBe(inventory.user.id);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: admin.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: inventory.refreshToken })
      .expect(200);
  });

  it('switch-business emite nueva sesión con permisos del destino; H-01 intacto', async () => {
    const session = await login('operador@fleet.local', DEMO);
    const switched = await request(app.getHttpServer())
      .post('/api/v1/auth/switch-business')
      .set(auth(session.accessToken, DEMO))
      .send({ businessId: NORTE })
      .expect(200);

    expect(switched.body.user.businessId).toBe(NORTE);
    expect(switched.body.refreshToken).toBeTruthy();

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${NORTE}/customers`)
      .set(auth(switched.body.accessToken, NORTE))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${DEMO}/customers`)
      .set(auth(switched.body.accessToken, NORTE))
      .expect(403);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: switched.body.refreshToken })
      .expect(200);
    expect(refreshed.body.user.businessId).toBe(NORTE);
  });
});
