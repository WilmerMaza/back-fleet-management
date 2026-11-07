/**
 * Revoca todos los refresh tokens activos de una familia de sesión.
 */
import type { Prisma } from '@prisma/client';

export async function revokeFamily(
  tx: Prisma.TransactionClient,
  familyId: string,
): Promise<void> {
  await tx.authRefreshSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
