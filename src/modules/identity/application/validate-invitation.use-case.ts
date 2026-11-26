/**
 * Valida un token de invitación (público, sin autenticación).
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { hashRefreshToken } from '../domain/token-hash.js';

export interface ValidateInvitationResult {
  email: string;
  roleCode: string;
  businessId: string;
  businessName: string;
  expiresAt: string;
  status: string;
}

@Injectable()
export class ValidateInvitationUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(token: string): Promise<ValidateInvitationResult> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
      include: { business: { select: { id: true, name: true, status: true } } },
    });
    if (!invitation) {
      throw Errors.invitationNotFound();
    }

    let status = invitation.status;
    if (status === 'PENDING' && invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      status = 'EXPIRED';
    }

    if (status !== 'PENDING') {
      if (status === 'EXPIRED') throw Errors.invitationExpired();
      throw Errors.invitationNotPending();
    }
    if (invitation.business.status !== 'ACTIVE') {
      if (invitation.business.status === 'SUSPENDED') {
        throw Errors.businessSuspended();
      }
      throw Errors.businessNotActive();
    }

    return {
      email: invitation.email,
      roleCode: invitation.roleCode,
      businessId: invitation.business.id,
      businessName: invitation.business.name,
      expiresAt: invitation.expiresAt.toISOString(),
      status,
    };
  }
}
