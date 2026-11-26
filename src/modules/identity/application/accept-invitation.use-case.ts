/**
 * Acepta una invitación: crea membresía con el rol indicado.
 *
 * Requiere sesión autenticada cuyo email coincida con el de la invitación.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { permissionsForRoles } from '../../../shared/authorization/permissions.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { hashRefreshToken } from '../domain/token-hash.js';
import { SessionIssuer, type SessionResponse } from './session.issuer.js';

export interface AcceptInvitationResult {
  businessId: string;
  businessName: string;
  roleCode: string;
  session: SessionResponse;
}

@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(userId: string, token: string): Promise<AcceptInvitationResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
      include: { business: true },
    });
    if (!invitation) {
      throw Errors.invitationNotFound();
    }

    if (invitation.status === 'PENDING' && invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw Errors.invitationExpired();
    }
    if (invitation.status !== 'PENDING') {
      throw Errors.invitationNotPending();
    }
    if (invitation.business.status !== 'ACTIVE') {
      if (invitation.business.status === 'SUSPENDED') {
        throw Errors.businessSuspended();
      }
      throw Errors.businessNotActive();
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw Errors.invitationEmailMismatch();
    }

    const roleCodes = [invitation.roleCode];
    const permissions = permissionsForRoles(roleCodes);

    const tokenHash = hashRefreshToken(token);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash,
          status: 'PENDING',
          expiresAt: { gt: now },
        },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (claimed.count === 0) {
        throw Errors.invitationNotPending();
      }

      const existing = await tx.userBusinessMembership.findUnique({
        where: {
          userId_businessId: { userId: user.id, businessId: invitation.businessId },
        },
      });
      if (existing) {
        const mergedRoles = [...new Set([...existing.roleCodes, ...roleCodes])];
        await tx.userBusinessMembership.update({
          where: {
            userId_businessId: { userId: user.id, businessId: invitation.businessId },
          },
          data: {
            status: 'ACTIVE',
            roleCodes: mergedRoles,
            permissions: permissionsForRoles(mergedRoles),
          },
        });
      } else {
        await tx.userBusinessMembership.create({
          data: {
            userId: user.id,
            businessId: invitation.businessId,
            roleCodes,
            permissions,
            status: 'ACTIVE',
          },
        });
      }

      await this.audit.record(
        {
          businessId: invitation.businessId,
          actorUserId: user.id,
          action: 'invitation.accepted',
          entityType: 'invitation',
          entityId: invitation.id,
          metadata: { roleCode: invitation.roleCode },
        },
        tx,
      );
    });

    const session = await this.sessions.issue(user.id, invitation.businessId);
    return {
      businessId: invitation.businessId,
      businessName: invitation.business.name,
      roleCode: invitation.roleCode,
      session,
    };
  }
}
