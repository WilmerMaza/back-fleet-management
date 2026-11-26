/**
 * Perfil de la sesión actual (usuario + negocio activo + disponibles).
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { notificationPreferencesOrDefault } from './update-notification-preferences.use-case.js';

@Injectable()
export class GetMeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      include: {
        memberships: { include: { business: true } },
        identities: true,
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const memberships = user.memberships.filter(
      (item) => item.status === 'ACTIVE' && item.business.status === 'ACTIVE',
    );
    const active = memberships.find((item) => item.businessId === ctx.businessId) ?? null;

    const googleIdentity = user.identities.find((item) => item.provider === 'GOOGLE');

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roleCodes: ctx.roles,
        businessId: ctx.businessId,
        status: 'ACTIVE' as const,
        platformRole: user.platformRole,
        hasPassword: Boolean(user.passwordHash),
        googleLinked: Boolean(googleIdentity),
        googleLinkedAt: googleIdentity?.createdAt.toISOString() ?? null,
        notificationPreferences: notificationPreferencesOrDefault(user.notificationPreferences),
      },
      business: active
        ? {
            id: active.business.id,
            name: active.business.name,
            status: active.business.status,
          }
        : null,
      availableBusinesses: memberships.map((item) => ({
        id: item.business.id,
        name: item.business.name,
      })),
      permissions: ctx.permissions,
    };
  }
}