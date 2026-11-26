/**
 * Reenvía correo de una invitación pendiente (misma fila, nuevo token de enlace).
 *
 * El hash solo rota tras un envío exitoso: si el proveedor falla, el enlace anterior sigue válido.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { SendInvitationEmailUseCase } from '../../notifications/application/send-invitation-email.use-case.js';
import { createInvitationToken, invitationExpiresAt } from './create-invitation-token.js';

export interface ResendPlatformInvitationInput {
  businessId: string;
  invitationId: string;
  actorUserId: string;
}

export interface ResendPlatformInvitationResult {
  invitationId: string;
  email: string;
  expiresAt: string;
  emailSent: boolean;
  deliveryId: string | null;
}

@Injectable()
export class ResendPlatformInvitationUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sendInvitationEmail: SendInvitationEmailUseCase,
  ) {}

  async execute(input: ResendPlatformInvitationInput): Promise<ResendPlatformInvitationResult> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: input.invitationId, businessId: input.businessId },
    });
    if (!invitation) {
      throw Errors.invitationNotFound();
    }
    if (invitation.status !== 'PENDING') {
      throw Errors.invitationNotPending();
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw Errors.invitationExpired();
    }

    const business = await this.prisma.business.findUnique({ where: { id: input.businessId } });
    if (!business) {
      throw Errors.businessNotFound();
    }
    if (business.status !== 'ACTIVE') {
      throw Errors.businessNotActive();
    }

    const previousTokenHash = invitation.tokenHash;
    const { token, tokenHash } = createInvitationToken();
    const expiresAt = invitationExpiresAt();

    const emailResult = await this.sendInvitationEmail.execute({
      invitationId: invitation.id,
      businessId: input.businessId,
      inviteeEmail: invitation.email,
      roleCode: invitation.roleCode,
      expiresAt,
      inviteToken: token,
    });

    if (!emailResult.emailSent) {
      return {
        invitationId: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
        emailSent: false,
        deliveryId: emailResult.deliveryId,
      };
    }

    const rotated = await this.prisma.invitation.updateMany({
      where: {
        id: invitation.id,
        businessId: input.businessId,
        status: 'PENDING',
        tokenHash: previousTokenHash,
        expiresAt: { gt: new Date() },
      },
      data: { tokenHash, expiresAt },
    });
    if (rotated.count === 0) {
      throw Errors.invitationNotPending();
    }

    await this.audit.record({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: 'invitation.resent',
      entityType: 'invitation',
      entityId: invitation.id,
      metadata: {
        email: invitation.email,
        roleCode: invitation.roleCode,
        emailDeliveryId: emailResult.deliveryId,
      },
    });

    return {
      invitationId: invitation.id,
      email: invitation.email,
      expiresAt: expiresAt.toISOString(),
      emailSent: true,
      deliveryId: emailResult.deliveryId,
    };
  }
}
