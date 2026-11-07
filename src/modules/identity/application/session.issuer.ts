/**
 * Emite access + refresh y persiste solo el hash del refresh en una familia de sesión.
 *
 * Access incluye `familyId`/`sid` (SEC-02). Permisos emitidos = permissionsForRoles (SEC-03).
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { permissionsForRoles } from '../../../shared/authorization/permissions.js';
import { Errors } from '../../../shared/common/app-error.js';
import {
  expiresAtFromDuration,
  jwtRefreshExpiresIn,
} from '../../../shared/config/jwt.config.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { hashRefreshToken } from '../domain/token-hash.js';

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    roleCodes: string[];
    businessId: string;
    status: 'ACTIVE';
  };
  business: { id: string; name: string; status: 'ACTIVE' };
  availableBusinesses: { id: string; name: string }[];
}

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Login / switch-business: nueva familia de refresh persistida. */
  async issue(userId: string, requestedBusinessId?: string): Promise<SessionResponse> {
    const projected = await this.loadMembership(userId, requestedBusinessId);
    const familyId = randomUUID();
    const sessionId = randomUUID();
    const refreshExpiresIn = jwtRefreshExpiresIn();
    const expiresAt = expiresAtFromDuration(refreshExpiresIn);

    const refreshToken = await this.jwt.signAsync(
      {
        sub: projected.user.id,
        type: 'refresh',
        activeBusinessId: projected.membership.businessId,
        familyId,
        sid: sessionId,
      },
      { expiresIn: refreshExpiresIn },
    );

    await this.prisma.authRefreshSession.create({
      data: {
        id: sessionId,
        userId: projected.user.id,
        familyId,
        tokenHash: hashRefreshToken(refreshToken),
        activeBusinessId: projected.membership.businessId,
        expiresAt,
      },
    });

    return this.composeResponse(projected, refreshToken, familyId, sessionId);
  }

  /**
   * Tras rotar refresh: emite access con el negocio de la sesión persistida
   * y reutiliza el refresh ya guardado (sin crear otra fila).
   */
  async issueAccessOnly(
    userId: string,
    activeBusinessId: string,
    refreshToken: string,
    familyId: string,
    sessionId: string,
  ): Promise<SessionResponse> {
    const projected = await this.loadMembership(userId, activeBusinessId);
    return this.composeResponse(projected, refreshToken, familyId, sessionId);
  }

  private async loadMembership(userId: string, requestedBusinessId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { business: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }
    const memberships = user.memberships.filter((item) => item.status === 'ACTIVE');
    if (!memberships.length) {
      throw Errors.tenantDenied();
    }
    let membership = memberships[0];
    if (requestedBusinessId) {
      const found = memberships.find((item) => item.businessId === requestedBusinessId);
      if (!found) {
        throw Errors.tenantDenied();
      }
      membership = found;
    }
    return { user, memberships, membership };
  }

  private async composeResponse(
    projected: Awaited<ReturnType<SessionIssuer['loadMembership']>>,
    refreshToken: string,
    familyId: string,
    sessionId: string,
  ): Promise<SessionResponse> {
    const { user, memberships, membership } = projected;
    const permissions = permissionsForRoles(membership.roleCodes);
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      activeBusinessId: membership.businessId,
      businessIds: memberships.map((item) => item.businessId),
      roles: membership.roleCodes,
      permissions,
      familyId,
      sid: sessionId,
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roleCodes: membership.roleCodes,
        businessId: membership.businessId,
        status: 'ACTIVE',
      },
      business: {
        id: membership.business.id,
        name: membership.business.name,
        status: 'ACTIVE',
      },
      availableBusinesses: memberships.map((item) => ({
        id: item.business.id,
        name: item.business.name,
      })),
    };
  }
}
