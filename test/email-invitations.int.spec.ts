/**
 * Integración HTTP: invitaciones, correo, reenvío, aceptación y aislamiento multi-tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { EmailMessage, EmailProvider } from '../src/modules/notifications/domain/email-provider.port.js';
import { EMAIL_PROVIDER } from '../src/modules/notifications/notifications.tokens.js';
import { hashRefreshToken } from '../src/modules/identity/domain/token-hash.js';
import { permissionsForRoles } from '../src/shared/authorization/permissions.js';
import { PrismaService } from '../src/shared/database/prisma.service.js';

const DEMO = '11111111-1111-4111-8111-111111111111';
const NORTE = '22222222-2222-4222-8222-222222222222';
const SUPER_ADMIN_EMAIL = 'wilmermaza10@gmail.com';

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let prisma: PrismaService;

const capturedEmails: EmailMessage[] = [];

const capturingEmailProvider: EmailProvider = {
  providerId: 'test-capture',
  async send(message) {
    if (process.env.TEST_EMAIL_FAIL === '1') {
      throw new Error('SMTP down (test)');
    }
    capturedEmails.push(message);
    return { providerMessageId: `test_${capturedEmails.length}` };
  },
};

function extractInviteToken(message: EmailMessage): string {
  const haystack = `${message.text}\n${message.html}`;
  const match = haystack.match(/\/auth\/invitation\/([^"'\s<>]+)/);
  if (!match?.[1]) {
    throw new Error('No se encontró token de invitación en el correo de prueba');
  }
  return match[1];
}

function assertNoSensitiveInviteFields(body: unknown): void {
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/inviteToken/i);
  expect(json).not.toMatch(/inviteUrl/i);
  expect(json).not.toContain('/auth/invitation/');
}

async function login(email: string, businessId?: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'demo123', businessId });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res;
}

async function ensureInviteeUser(email: string): Promise<void> {
  const normalized = email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: normalized,
        fullName: 'Usuario invitado test',
        status: 'ACTIVE',
        passwordHash: await argon2.hash('demo123'),
      },
    });
  }
  const hasMembership = await prisma.userBusinessMembership.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
  });
  if (!hasMembership) {
    await prisma.userBusinessMembership.create({
      data: {
        userId: user.id,
        businessId: NORTE,
        roleCodes: ['CUSTOMER'],
        permissions: permissionsForRoles(['CUSTOMER']),
        status: 'ACTIVE',
      },
    });
  }
}

describe('Email e invitaciones (integración HTTP)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'vitest-jwt-secret-konti-h04-tests-32b';
    delete process.env.TEST_EMAIL_FAIL;

    const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    execSync('npx prisma migrate deploy && npx tsx prisma/seed.ts', {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(capturingEmailProvider)
      .compile();

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

  it('creación: persiste invitación, email_delivery y respuesta sin token ni inviteUrl', async () => {
    capturedEmails.length = 0;
    const invitee = `invite-create-${randomUUID().slice(0, 8)}@test.local`;
    await ensureInviteeUser(invitee);

    const platformSession = await login(SUPER_ADMIN_EMAIL, DEMO);
    const token = platformSession.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${DEMO}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: invitee, roleCode: 'OPERATOR' });

    expect(res.status).toBe(201);
    assertNoSensitiveInviteFields(res.body);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.emailDeliveryId).toBeTruthy();

    const invitation = await prisma.invitation.findUnique({ where: { id: res.body.invitationId } });
    expect(invitation?.email).toBe(invitee);
    expect(invitation?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const delivery = await prisma.emailDelivery.findUnique({
      where: { id: res.body.emailDeliveryId },
    });
    expect(delivery?.status).toBe('SENT');
    expect(delivery?.relatedEntityType).toBe('invitation');
    expect(capturedEmails.length).toBeGreaterThan(0);
  });

  it('reenvío: rota hash tras envío exito, auditoría y respuesta segura', async () => {
    capturedEmails.length = 0;
    const invitee = `invite-resend-${randomUUID().slice(0, 8)}@test.local`;
    await ensureInviteeUser(invitee);

    const platformSession = await login(SUPER_ADMIN_EMAIL, DEMO);
    const adminToken = platformSession.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${DEMO}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: invitee, roleCode: 'TECHNICIAN' });
    expect(created.status).toBe(201);

    const before = await prisma.invitation.findUniqueOrThrow({
      where: { id: created.body.invitationId },
    });
    const tokenBefore = extractInviteToken(capturedEmails[capturedEmails.length - 1]!);

    const resent = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${DEMO}/invitations/${created.body.invitationId}/resend`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resent.status).toBe(201);
    assertNoSensitiveInviteFields(resent.body);
    expect(resent.body.emailSent).toBe(true);

    const after = await prisma.invitation.findUniqueOrThrow({
      where: { id: created.body.invitationId },
    });
    expect(after.tokenHash).not.toBe(before.tokenHash);

    const tokenAfter = extractInviteToken(capturedEmails[capturedEmails.length - 1]!);
    expect(tokenAfter).not.toBe(tokenBefore);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'invitation.resent', entityId: created.body.invitationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();

    const oldValidate = await request(app.getHttpServer()).get(
      `/api/v1/auth/invitations/${tokenBefore}`,
    );
    expect(oldValidate.status).toBeGreaterThanOrEqual(400);

    const newValidate = await request(app.getHttpServer()).get(
      `/api/v1/auth/invitations/${tokenAfter}`,
    );
    expect(newValidate.status).toBe(200);
    expect(newValidate.body.email).toBe(invitee);
  });

  it('aceptación: token válido crea membresía; vencida y revocada rechazadas', async () => {
    capturedEmails.length = 0;
    const invitee = `invite-accept-${randomUUID().slice(0, 8)}@test.local`;
    await ensureInviteeUser(invitee);

    const platformSession = await login(SUPER_ADMIN_EMAIL, DEMO);
    const adminToken = platformSession.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${DEMO}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: invitee, roleCode: 'OPERATOR' });
    const inviteToken = extractInviteToken(capturedEmails[capturedEmails.length - 1]!);

    const inviteeSession = await login(invitee, NORTE);
    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/auth/invitations/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${inviteeSession.body.accessToken}`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.businessId).toBe(DEMO);

    const membership = await prisma.userBusinessMembership.findFirst({
      where: { businessId: DEMO, user: { email: invitee } },
    });
    expect(membership?.status).toBe('ACTIVE');

    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: created.body.invitationId } });
    expect(row.status).toBe('ACCEPTED');

    const expiredId = randomUUID();
    const expiredTok = `exp-${randomUUID()}`;
    await prisma.invitation.create({
      data: {
        id: expiredId,
        businessId: DEMO,
        email: `expired-${randomUUID().slice(0, 6)}@test.local`,
        roleCode: 'OPERATOR',
        tokenHash: hashRefreshToken(expiredTok),
        expiresAt: new Date(Date.now() - 60_000),
        invitedById: platformSession.body.user.id,
      },
    });
    const expiredRes = await request(app.getHttpServer()).get(
      `/api/v1/auth/invitations/${expiredTok}`,
    );
    expect(expiredRes.status).toBe(410);

    const revokedTok = `rev-${randomUUID()}`;
    await prisma.invitation.create({
      data: {
        id: randomUUID(),
        businessId: DEMO,
        email: `revoked-${randomUUID().slice(0, 6)}@test.local`,
        roleCode: 'OPERATOR',
        tokenHash: hashRefreshToken(revokedTok),
        expiresAt: new Date(Date.now() + 86400000),
        status: 'REVOKED',
        invitedById: platformSession.body.user.id,
      },
    });
    const revokedRes = await request(app.getHttpServer()).get(
      `/api/v1/auth/invitations/${revokedTok}`,
    );
    expect(revokedRes.status).toBe(409);
  });

  it('seguridad multi-tenant: reenvío con businessId incorrecto y permisos', async () => {
    capturedEmails.length = 0;
    const invitee = `invite-tenant-${randomUUID().slice(0, 8)}@test.local`;
    await ensureInviteeUser(invitee);

    const platformSession = await login(SUPER_ADMIN_EMAIL, DEMO);
    const adminToken = platformSession.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${DEMO}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: invitee, roleCode: 'OPERATOR' });

    const crossTenant = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${NORTE}/invitations/${created.body.invitationId}/resend`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(crossTenant.status).toBe(404);

    const operatorSession = await login('operador@fleet.local', DEMO);
    const forbidden = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${DEMO}/invitations`)
      .set('Authorization', `Bearer ${operatorSession.body.accessToken}`)
      .send({ email: 'noop@test.local', roleCode: 'OPERATOR' });
    expect(forbidden.status).toBe(403);
  });

  it('fallo de proveedor: no duplica invitación, delivery FAILED y hash intacto en reenvío', async () => {
    const invitee = `invite-fail-${randomUUID().slice(0, 8)}@test.local`;
    await ensureInviteeUser(invitee);

    const platformSession = await login(SUPER_ADMIN_EMAIL, DEMO);
    const adminToken = platformSession.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/businesses/${DEMO}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: invitee, roleCode: 'OPERATOR' });
    expect(created.body.emailSent).toBe(true);

    const hashBefore = (
      await prisma.invitation.findUniqueOrThrow({ where: { id: created.body.invitationId } })
    ).tokenHash;

    process.env.TEST_EMAIL_FAIL = '1';
    try {
      const resent = await request(app.getHttpServer())
        .post(`/api/v1/admin/businesses/${DEMO}/invitations/${created.body.invitationId}/resend`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resent.status).toBe(201);
      expect(resent.body.emailSent).toBe(false);
      assertNoSensitiveInviteFields(resent.body);

      const hashAfter = (
        await prisma.invitation.findUniqueOrThrow({ where: { id: created.body.invitationId } })
      ).tokenHash;
      expect(hashAfter).toBe(hashBefore);

      const deliveries = await prisma.emailDelivery.findMany({
        where: { relatedEntityId: created.body.invitationId },
        orderBy: { createdAt: 'asc' },
      });
      expect(deliveries.length).toBeGreaterThanOrEqual(2);
      expect(deliveries.at(-1)?.status).toBe('FAILED');
      expect(deliveries.at(-1)?.lastError).toContain('SMTP');
    } finally {
      delete process.env.TEST_EMAIL_FAIL;
    }

    const count = await prisma.invitation.count({
      where: { businessId: DEMO, email: invitee },
    });
    expect(count).toBe(1);
  });
});
