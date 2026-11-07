/**
 * Cierra la sesión de refresh: revoca la familia completa del token presentado.
 *
 * Tras el commit invalida el cache de access (SEC-02) para que el Bearer deje de servir.
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessSessionService } from '../../../shared/authorization/access-session.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { hashRefreshToken } from '../domain/token-hash.js';
import { revokeFamily } from './revoke-session-family.js';

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly accessSessions: AccessSessionService,
  ) {}

  async execute(refreshToken: string): Promise<void> {
    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwt.verify<{ sub?: string; type?: string }>(refreshToken);
    } catch {
      throw Errors.unauthorized();
    }
    if (payload.type !== 'refresh' || !payload.sub) {
      throw Errors.unauthorized();
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const familyId = await this.prisma.$transaction(async (tx) => {
      const current = await tx.authRefreshSession.findUnique({ where: { tokenHash } });
      if (!current || current.userId !== payload.sub) {
        throw Errors.unauthorized();
      }
      await revokeFamily(tx, current.familyId);
      return current.familyId;
    });
    this.accessSessions.invalidateFamily(familyId);
  }
}
