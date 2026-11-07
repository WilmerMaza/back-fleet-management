/**
 * Revalidación de access JWT (SEC-02 + SEC-03).
 *
 * Comprueba familia de refresh activa, usuario/membresía ACTIVE y recalcula
 * permisos desde roleCodes (permissionsForRoles). No confía en claims stale.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { RequestContext } from '../tenant/request-context.js';
import { AccessSessionCache } from './access-session.cache.js';
import type { AccessTokenPayload } from './access-token.js';
import { permissionsForRoles } from './permissions.js';

@Injectable()
export class AccessSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AccessSessionCache,
  ) {}

  async resolveContext(payload: AccessTokenPayload): Promise<RequestContext> {
    const familyId = payload.familyId;
    if (!familyId || typeof familyId !== 'string') {
      throw Errors.unauthorized();
    }
    const activeBusinessId = payload.activeBusinessId;
    if (!activeBusinessId) {
      throw Errors.tenantDenied();
    }

    const cached = this.cache.get(familyId, activeBusinessId);
    if (cached) {
      if (cached.userId !== payload.sub) {
        throw Errors.unauthorized();
      }
      return cached;
    }

    const activeSession = await this.prisma.authRefreshSession.findFirst({
      where: {
        familyId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    });
    if (!activeSession || activeSession.userId !== payload.sub) {
      throw Errors.unauthorized();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const activeMemberships = user.memberships.filter((item) => item.status === 'ACTIVE');
    const membership = activeMemberships.find((item) => item.businessId === activeBusinessId);
    if (!membership) {
      throw Errors.tenantDenied();
    }

    const businessIds = activeMemberships.map((item) => item.businessId);
    if (!businessIds.includes(activeBusinessId)) {
      throw Errors.tenantDenied();
    }

    const ctx: RequestContext = {
      userId: user.id,
      email: user.email,
      businessId: activeBusinessId,
      businessIds,
      roles: [...membership.roleCodes],
      permissions: permissionsForRoles(membership.roleCodes),
    };
    this.cache.set(familyId, activeBusinessId, ctx);
    return ctx;
  }

  invalidateFamily(familyId: string): void {
    this.cache.invalidateFamily(familyId);
  }
}
