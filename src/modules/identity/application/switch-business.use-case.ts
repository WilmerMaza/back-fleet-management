/**
 * Cambia el tenant activo revocando la familia de refresh anterior (SEC-04).
 */
import { Injectable } from '@nestjs/common';
import { AccessSessionService } from '../../../shared/authorization/access-session.service.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { revokeFamily } from './revoke-session-family.js';
import { SessionIssuer, type SessionResponse } from './session.issuer.js';

@Injectable()
export class SwitchBusinessUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionIssuer,
    private readonly accessSessions: AccessSessionService,
  ) {}

  async execute(
    userId: string,
    businessId: string,
    previousFamilyId: string,
  ): Promise<SessionResponse> {
    await this.prisma.$transaction(async (tx) => {
      await revokeFamily(tx, previousFamilyId);
    });
    this.accessSessions.invalidateFamily(previousFamilyId);
    return this.sessions.issue(userId, businessId);
  }
}
