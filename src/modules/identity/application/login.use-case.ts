import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { SessionIssuer } from './session.issuer.js';

export interface LoginInput {
  email: string;
  password: string;
  businessId?: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      include: { memberships: { include: { business: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.invalidCredentials();
    }
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw Errors.invalidCredentials();
    }
    const memberships = user.memberships.filter((item) => item.status === 'ACTIVE');
    if (!memberships.length) {
      throw Errors.tenantDenied();
    }
    if (memberships.length > 1 && !input.businessId) {
      throw Errors.selectBusiness(
        memberships.map((item) => ({ id: item.business.id, name: item.business.name })),
      );
    }
    return this.sessions.issue(user.id, input.businessId);
  }
}
