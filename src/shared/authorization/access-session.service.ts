/**
 * Revalidación de access JWT (SEC-02 + SEC-03).
 *
 * Comprueba familia de refresh activa, usuario/membresía ACTIVE y recalcula
 * permisos desde roles (BD + fallback). No confía en claims stale.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { RequestContext } from '../tenant/request-context.js';
import { AccessSessionCache } from './access-session.cache.js';
import type { AccessTokenPayload } from './access-token.js';
import { PermissionResolverService } from './permission-resolver.service.js';

@Injectable()
export class AccessSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AccessSessionCache,
    private readonly permissions: PermissionResolverService,
  ) {}

  async resolveContext(payload: AccessTokenPayload): Promise<RequestContext> {
    const familyId = payload.familyId;
    if (!familyId || typeof familyId !== 'string') {
      throw Errors.unauthorized();
    }
    const activeBusinessId = payload.activeBusinessId ?? null;
    const cacheKey = activeBusinessId ?? '__platform__';

    const cached = this.cache.get(familyId, cacheKey);
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
      select: { id: true, userId: true, activeBusinessId: true },
    });
    if (!activeSession || activeSession.userId !== payload.sub) {
      throw Errors.unauthorized();
    }
    if ((activeSession.activeBusinessId ?? null) !== activeBusinessId) {
      throw Errors.unauthorized();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: { include: { business: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const isSuperAdmin = user.platformRole === 'SUPER_ADMIN';
    const activeMemberships = user.memberships.filter(
      (item) => item.status === 'ACTIVE' && item.business.status === 'ACTIVE',
    );
    const businessIds = activeMemberships.map((item) => item.businessId);

    if (!activeBusinessId) {
      if (!isSuperAdmin) {
        throw Errors.tenantDenied();
      }
      const ctx: RequestContext = {
        userId: user.id,
        email: user.email,
        businessId: null,
        businessIds,
        roles: ['SUPER_ADMIN'],
        permissions: await this.permissions.forPlatformSuperAdmin(),
        platformRole: 'SUPER_ADMIN',
      };
      this.cache.set(familyId, cacheKey, ctx);
      return ctx;
    }

    const membership = activeMemberships.find((item) => item.businessId === activeBusinessId);
    if (!membership) {
      throw Errors.tenantDenied();
    }

    const businessPermissions = await this.permissions.forBusinessRoles(
      activeBusinessId,
      membership.roleCodes,
    );
    const platformPermissions = isSuperAdmin
      ? await this.permissions.forPlatformSuperAdmin()
      : [];

    const ctx: RequestContext = {
      userId: user.id,
      email: user.email,
      businessId: activeBusinessId,
      businessIds,
      roles: [...membership.roleCodes],
      permissions: [...new Set([...businessPermissions, ...platformPermissions])],
      platformRole: user.platformRole ?? null,
    };
    this.cache.set(familyId, cacheKey, ctx);
    return ctx;
  }

  invalidateFamily(familyId: string): void {
    this.cache.invalidateFamily(familyId);
  }
}
