/**
 * Pruebas de seguridad: tokens de invitación no expuestos y rotación en reenvío.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashRefreshToken } from '../../identity/domain/token-hash.js';
import { CreatePlatformInvitationUseCase } from './create-platform-invitation.use-case.js';
import { ResendPlatformInvitationUseCase } from './resend-platform-invitation.use-case.js';

describe('Seguridad invitaciones plataforma', () => {
  describe('CreatePlatformInvitationUseCase', () => {
    let useCase: CreatePlatformInvitationUseCase;
    const sendInvitationEmail = { execute: vi.fn() };
    const audit = { record: vi.fn() };
    const prisma = {
      business: { findUnique: vi.fn() },
      role: { findFirst: vi.fn() },
      userBusinessMembership: { findFirst: vi.fn() },
      invitation: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      useCase = new CreatePlatformInvitationUseCase(
        prisma as never,
        audit as never,
        sendInvitationEmail as never,
      );
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: 'ACTIVE' });
      prisma.role.findFirst.mockResolvedValue({ code: 'ADMIN' });
      prisma.userBusinessMembership.findFirst.mockResolvedValue(null);
      prisma.invitation.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          invitation: {
            updateMany: vi.fn(),
            create: vi.fn(),
          },
        };
        await fn(tx);
      });
      sendInvitationEmail.execute.mockResolvedValue({ emailSent: true, deliveryId: 'del-1' });
    });

    it('no devuelve inviteToken ni inviteUrl en la respuesta', async () => {
      const result = await useCase.execute({
        businessId: 'b1',
        email: 'nuevo@test.local',
        roleCode: 'ADMIN',
        invitedByUserId: 'u1',
      });

      expect(result).toMatchObject({
        email: 'nuevo@test.local',
        roleCode: 'ADMIN',
        emailSent: true,
        emailDeliveryId: 'del-1',
      });
      expect(result).not.toHaveProperty('inviteToken');
      expect(result).not.toHaveProperty('inviteUrl');
      expect(JSON.stringify(result)).not.toMatch(/auth\/invitation\//);
    });

    it('pasa el token solo al caso de uso de correo (no en retorno API)', async () => {
      await useCase.execute({
        businessId: 'b1',
        email: 'nuevo@test.local',
        roleCode: 'ADMIN',
        invitedByUserId: 'u1',
      });

      expect(sendInvitationEmail.execute).toHaveBeenCalledOnce();
      const emailInput = sendInvitationEmail.execute.mock.calls[0]?.[0] as {
        inviteToken: string;
      };
      expect(emailInput.inviteToken).toBeTruthy();
      expect(emailInput.inviteToken.length).toBeGreaterThan(20);
    });
  });

  describe('ResendPlatformInvitationUseCase', () => {
    let useCase: ResendPlatformInvitationUseCase;
    const sendInvitationEmail = { execute: vi.fn() };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      invitation: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      business: { findUnique: vi.fn() },
    };

    const existingHash = hashRefreshToken('token-anterior');

    beforeEach(() => {
      vi.clearAllMocks();
      useCase = new ResendPlatformInvitationUseCase(
        prisma as never,
        audit as never,
        sendInvitationEmail as never,
      );
      prisma.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        businessId: 'b1',
        email: 'inv@test.local',
        roleCode: 'ADMIN',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 86400000),
        tokenHash: existingHash,
      });
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: 'ACTIVE' });
      prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
      sendInvitationEmail.execute.mockResolvedValue({ emailSent: true, deliveryId: 'del-2' });
    });

    it('envía correo antes de rotar tokenHash y no expone enlace en respuesta', async () => {
      const callOrder: string[] = [];
      sendInvitationEmail.execute.mockImplementation(async () => {
        callOrder.push('email');
        return { emailSent: true, deliveryId: 'del-2' };
      });
      prisma.invitation.updateMany.mockImplementation(async () => {
        callOrder.push('rotate');
        return { count: 1 };
      });

      const result = await useCase.execute({
        businessId: 'b1',
        invitationId: 'inv-1',
        actorUserId: 'admin-1',
      });

      expect(callOrder).toEqual(['email', 'rotate']);
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'inv-1',
            businessId: 'b1',
            tokenHash: existingHash,
          }),
          data: expect.objectContaining({
            tokenHash: expect.not.stringMatching(existingHash),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invitation.resent', entityId: 'inv-1' }),
      );
      expect(result).not.toHaveProperty('inviteUrl');
      expect(JSON.stringify(result)).not.toMatch(/auth\/invitation\//);
    });

    it('rechaza reenvío si la invitación ya expiró (PENDING vencido)', async () => {
      prisma.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        businessId: 'b1',
        email: 'inv@test.local',
        roleCode: 'ADMIN',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
        tokenHash: existingHash,
      });

      await expect(
        useCase.execute({ businessId: 'b1', invitationId: 'inv-1', actorUserId: 'a' }),
      ).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'EXPIRED' },
      });
      expect(sendInvitationEmail.execute).not.toHaveBeenCalled();
    });

    it('rechaza reenvío si el negocio de la URL no coincide (aislamiento)', async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);

      await expect(
        useCase.execute({ businessId: 'otro-tenant', invitationId: 'inv-1', actorUserId: 'a' }),
      ).rejects.toMatchObject({ code: 'INVITATION_NOT_FOUND' });
    });

    it('cuando el correo falla, no rota tokenHash (enlace anterior sigue válido)', async () => {
      sendInvitationEmail.execute.mockResolvedValue({ emailSent: false, deliveryId: 'del-fail' });

      const result = await useCase.execute({
        businessId: 'b1',
        invitationId: 'inv-1',
        actorUserId: 'admin-1',
      });

      expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(false);
      expect(result.deliveryId).toBe('del-fail');
    });
  });
});
