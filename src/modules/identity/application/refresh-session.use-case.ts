/**
 * Rotación de refresh: valida sesión persistida, revoca el token usado y emite uno nuevo.
 *
 * Reutilizar un refresh ya rotado/revocado invalida toda la familia de sesión.
 * El negocio activo sale de la sesión almacenada; no se acepta businessId del cliente.
 *
 * Importante: no lanzar AppError dentro de la transacción tras mutaciones, o Prisma
 * hace rollback y la revocación de familia no persiste.
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Errors } from '../../../shared/common/app-error.js';
import {
  expiresAtFromDuration,
  jwtRefreshExpiresIn,
} from '../../../shared/config/jwt.config.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { hashRefreshToken } from '../domain/token-hash.js';
import { AccessSessionService } from '../../../shared/authorization/access-session.service.js';
import { revokeFamily } from './revoke-session-family.js';
import { SessionIssuer, type SessionResponse } from './session.issuer.js';

interface RefreshJwtPayload {
  sub: string;
  type?: string;
  activeBusinessId?: string;
  familyId?: string;
  sid?: string;
}

type RotateResult =
  | {
      ok: true;
      userId: string;
      activeBusinessId: string;
      refreshToken: string;
      familyId: string;
      sessionId: string;
    }
  | { ok: false; familyId?: string };

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionIssuer,
    private readonly accessSessions: AccessSessionService,
  ) {}

  async execute(refreshToken: string): Promise<SessionResponse> {
    let payload: RefreshJwtPayload;
    try {
      payload = this.jwt.verify<RefreshJwtPayload>(refreshToken);
    } catch {
      throw Errors.unauthorized();
    }
    if (payload.type !== 'refresh' || !payload.sub) {
      throw Errors.unauthorized();
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const refreshExpiresIn = jwtRefreshExpiresIn();
    const expiresAt = expiresAtFromDuration(refreshExpiresIn);
    const newSessionId = randomUUID();

    const rotated = await this.prisma.$transaction(async (tx): Promise<RotateResult> => {
      const current = await tx.authRefreshSession.findUnique({ where: { tokenHash } });
      if (!current) {
        return { ok: false };
      }

      if (current.revokedAt) {
        await revokeFamily(tx, current.familyId);
        return { ok: false, familyId: current.familyId };
      }

      if (current.expiresAt.getTime() <= Date.now()) {
        await tx.authRefreshSession.update({
          where: { id: current.id },
          data: { revokedAt: new Date() },
        });
        return { ok: false, familyId: current.familyId };
      }

      if (current.userId !== payload.sub) {
        return { ok: false };
      }

      const claimed = await tx.authRefreshSession.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: newSessionId },
      });
      if (claimed.count !== 1) {
        await revokeFamily(tx, current.familyId);
        return { ok: false, familyId: current.familyId };
      }

      const nextRefresh = await this.jwt.signAsync(
        {
          sub: current.userId,
          type: 'refresh',
          activeBusinessId: current.activeBusinessId,
          familyId: current.familyId,
          sid: newSessionId,
        },
        { expiresIn: refreshExpiresIn },
      );

      await tx.authRefreshSession.create({
        data: {
          id: newSessionId,
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: hashRefreshToken(nextRefresh),
          activeBusinessId: current.activeBusinessId,
          expiresAt,
        },
      });

      return {
        ok: true,
        userId: current.userId,
        activeBusinessId: current.activeBusinessId,
        refreshToken: nextRefresh,
        familyId: current.familyId,
        sessionId: newSessionId,
      };
    });

    if (rotated.familyId) {
      this.accessSessions.invalidateFamily(rotated.familyId);
    }

    if (!rotated.ok) {
      throw Errors.unauthorized();
    }

    return this.sessions.issueAccessOnly(
      rotated.userId,
      rotated.activeBusinessId,
      rotated.refreshToken,
      rotated.familyId,
      rotated.sessionId,
    );
  }
}
