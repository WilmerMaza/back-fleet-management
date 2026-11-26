/**
 * Emite access + refresh y persiste solo el hash del refresh en una familia de sesión.
 *
 * Access incluye `familyId`/`sid` (SEC-02). Permisos = BD con fallback código (SEC-03).
 * SUPER_ADMIN puede emitir sesión sin negocio activo (plataforma).
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PermissionResolverService } from '../../../shared/authorization/permission-resolver.service.js';
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
    businessId: string | null;
    status: 'ACTIVE';
    platformRole: 'SUPER_ADMIN' | null;
    hasPassword: boolean;
  };
  business: { id: string; name: string; status: string } | null;
  availableBusinesses: { id: string; name: string }[];
  onboarding?: {
    businessId: string;
    businessName: string;
    businessStatus: string;
    registrationStatus: string;
  } | null;
}

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionResolverService,
  ) {}

  /** Login / switch-business: nueva familia de refresh persistida. */
  async issue(userId: string, requestedBusinessId?: string | null): Promise<SessionResponse> {
    const projected = await this.loadProjection(userId, requestedBusinessId);
    const familyId = randomUUID();
    const sessionId = randomUUID();
    const refreshExpiresIn = jwtRefreshExpiresIn();
    const expiresAt = expiresAtFromDuration(refreshExpiresIn);
    const activeBusinessId = projected.membership?.businessId ?? null;

    const refreshToken = await this.jwt.signAsync(
      {
        sub: projected.user.id,
        type: 'refresh',
        activeBusinessId,
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
        activeBusinessId,
        expiresAt,
      },
    });

    return this.composeResponse(projected, refreshToken, familyId, sessionId);
  }

  /** Sesión sin permisos operativos: empresa en revisión (PENDING). */
  async issueOnboarding(userId: string, businessId: string): Promise<SessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { where: { businessId }, include: { business: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }
    const membership = user.memberships[0];
    if (!membership || membership.business.status !== 'PENDING') {
      throw Errors.tenantDenied();
    }
    const request = await this.prisma.businessRegistrationRequest.findUnique({
      where: { businessId },
    });
    if (!request || request.status !== 'PENDING') {
      throw Errors.tenantDenied();
    }

    const familyId = randomUUID();
    const sessionId = randomUUID();
    const refreshExpiresIn = jwtRefreshExpiresIn();
    const expiresAt = expiresAtFromDuration(refreshExpiresIn);

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        type: 'refresh',
        activeBusinessId: null,
        familyId,
        sid: sessionId,
      },
      { expiresIn: refreshExpiresIn },
    );

    await this.prisma.authRefreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        familyId,
        tokenHash: hashRefreshToken(refreshToken),
        activeBusinessId: null,
        expiresAt,
      },
    });

    return this.composeOnboardingResponse(user, membership, request.status, refreshToken, familyId, sessionId);
  }

  async composeOnboardingResponse(
    user: { id: string; email: string; fullName: string; passwordHash: string | null; platformRole: string | null },
    membership: {
      roleCodes: string[];
      business: { id: string; name: string; status: string };
    },
    registrationStatus: string,
    refreshToken: string,
    familyId: string,
    sessionId: string,
  ): Promise<SessionResponse> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      activeBusinessId: null,
      businessIds: [],
      roles: [],
      permissions: [],
      platformRole: user.platformRole ?? null,
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
        businessId: null,
        status: 'ACTIVE',
        platformRole: user.platformRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : null,
        hasPassword: Boolean(user.passwordHash),
      },
      business: null,
      availableBusinesses: [],
      onboarding: {
        businessId: membership.business.id,
        businessName: membership.business.name,
        businessStatus: membership.business.status,
        registrationStatus,
      },
    };
  }

  /**
   * Tras rotar refresh: emite access con el negocio de la sesión persistida
   * y reutiliza el refresh ya guardado (sin crear otra fila).
   */
  async issueAccessOnly(
    userId: string,
    activeBusinessId: string | null,
    refreshToken: string,
    familyId: string,
    sessionId: string,
  ): Promise<SessionResponse> {
    const projected = await this.loadProjection(userId, activeBusinessId);
    return this.composeResponse(projected, refreshToken, familyId, sessionId);
  }

  private async loadProjection(userId: string, requestedBusinessId?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { business: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const memberships = user.memberships.filter(
      (item) => item.status === 'ACTIVE' && item.business.status === 'ACTIVE',
    );
    const isSuperAdmin = user.platformRole === 'SUPER_ADMIN';

    // Sin membresías: sesión “huérfana” (invitado Google nuevo / SUPER_ADMIN).
    // El acceso a datos de taller sigue bloqueado por permisos de negocio.
    if (memberships.length > 1 && requestedBusinessId === undefined) {
      throw Errors.selectBusiness(
        memberships.map((item) => ({ id: item.business.id, name: item.business.name })),
      );
    }

    type MembershipRow = (typeof memberships)[number];
    let membership: MembershipRow | null = memberships[0] ?? null;
    if (requestedBusinessId) {
      const found = memberships.find((item) => item.businessId === requestedBusinessId);
      if (!found) {
        throw Errors.tenantDenied();
      }
      membership = found;
    } else if (requestedBusinessId === null || !membership) {
      membership = null;
    }

    return { user, memberships, membership, isSuperAdmin };
  }

  private async composeResponse(
    projected: Awaited<ReturnType<SessionIssuer['loadProjection']>>,
    refreshToken: string,
    familyId: string,
    sessionId: string,
  ): Promise<SessionResponse> {
    const { user, memberships, membership, isSuperAdmin } = projected;
    const roleCodes = membership?.roleCodes ?? (isSuperAdmin ? ['SUPER_ADMIN'] : []);
    const businessPermissions = membership
      ? await this.permissions.forBusinessRoles(membership.businessId, membership.roleCodes)
      : [];
    const platformPermissions = isSuperAdmin
      ? await this.permissions.forPlatformSuperAdmin()
      : [];
    const permissions = [...new Set([...businessPermissions, ...platformPermissions])];

    const activeBusinessId = membership?.businessId ?? null;
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      activeBusinessId,
      businessIds: memberships.map((item) => item.businessId),
      roles: roleCodes,
      permissions,
      platformRole: user.platformRole ?? null,
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
        roleCodes,
        businessId: activeBusinessId,
        status: 'ACTIVE',
        platformRole: user.platformRole ?? null,
        hasPassword: Boolean(user.passwordHash),
      },
      business: membership
        ? {
            id: membership.business.id,
            name: membership.business.name,
            status: membership.business.status,
          }
        : null,
      availableBusinesses: memberships.map((item) => ({
        id: item.business.id,
        name: item.business.name,
      })),
    };
  }
}
