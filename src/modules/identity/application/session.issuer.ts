/**
 * Emite tokens y el cuerpo de sesión para un usuario en un negocio.
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { Errors } from '../../../shared/common/app-error.js';

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async issue(userId: string, requestedBusinessId?: string) {
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
    const businesses = memberships.map((item) => ({
      id: item.business.id,
      name: item.business.name,
    }));
    let membership = memberships[0];
    if (requestedBusinessId) {
      const found = memberships.find((item) => item.businessId === requestedBusinessId);
      if (!found) {
        throw Errors.tenantDenied();
      }
      membership = found;
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      activeBusinessId: membership.businessId,
      businessIds: memberships.map((item) => item.businessId),
      roles: membership.roleCodes,
      permissions: membership.permissions,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh', activeBusinessId: membership.businessId },
      { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as '7d' },
    );
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roleCodes: membership.roleCodes,
        businessId: membership.businessId,
        status: 'ACTIVE' as const,
      },
      business: { id: membership.business.id, name: membership.business.name, status: 'ACTIVE' as const },
      availableBusinesses: businesses,
    };
  }
}
