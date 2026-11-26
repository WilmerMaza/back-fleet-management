/**
 * Aceptación atómica: el token debe seguir vigente al confirmar (evita carrera con reenvío).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashRefreshToken } from '../domain/token-hash.js';
import { AcceptInvitationUseCase } from './accept-invitation.use-case.js';

describe('AcceptInvitationUseCase', () => {
  const token = 'invite-token-secreto';
  const tokenHash = hashRefreshToken(token);
  const sessions = { issue: vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }) };
  const audit = { record: vi.fn() };
  let updateManyMock: ReturnType<typeof vi.fn>;
  const prisma = {
    user: { findUnique: vi.fn() },
    invitation: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  let useCase: AcceptInvitationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'invitado@test.local',
      status: 'ACTIVE',
    });
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'inv-1',
      businessId: 'b1',
      email: 'invitado@test.local',
      roleCode: 'ADMIN',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 86400000),
      tokenHash,
      business: { name: 'Taller', status: 'ACTIVE' },
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        invitation: { updateMany: updateManyMock },
        userBusinessMembership: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
          update: vi.fn(),
        },
      };
      await fn(tx);
    });
    useCase = new AcceptInvitationUseCase(prisma as never, audit as never, sessions as never);
  });

  it('reclama la invitación solo si tokenHash y PENDING coinciden', async () => {
    await useCase.execute('u1', token);

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'inv-1',
          tokenHash,
          status: 'PENDING',
        }),
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      }),
    );
  });

  it('falla si el token fue rotado (reenvío concurrente)', async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    await expect(useCase.execute('u1', token)).rejects.toMatchObject({
      code: 'INVITATION_NOT_PENDING',
    });
  });
});
