/**
 * Envía el correo de invitación a un negocio tras persistir la invitación.
 *
 * Un fallo de envío no revierte la invitación; queda trazado en email_deliveries.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { frontendInvitationUrl } from '../../../shared/config/frontend-url.js';
import { renderInvitationEmail } from '../infrastructure/templates/invitation-email.template.js';
import { EmailNotificationService } from './email-notification.service.js';

export interface SendInvitationEmailInput {
  invitationId: string;
  businessId: string;
  inviteeEmail: string;
  roleCode: string;
  expiresAt: Date;
  inviteToken: string;
}

export interface SendInvitationEmailResult {
  emailSent: boolean;
  deliveryId: string | null;
}

@Injectable()
export class SendInvitationEmailUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailNotifications: EmailNotificationService,
  ) {}

  async execute(input: SendInvitationEmailInput): Promise<SendInvitationEmailResult> {
    const business = await this.prisma.business.findUnique({
      where: { id: input.businessId },
      select: { name: true },
    });
    if (!business) {
      return { emailSent: false, deliveryId: null };
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { id: input.invitationId },
      select: {
        invitedBy: { select: { fullName: true } },
      },
    });

    const inviteUrl = frontendInvitationUrl(input.inviteToken);
    const rendered = renderInvitationEmail({
      businessName: business.name,
      roleCode: input.roleCode,
      inviteUrl,
      expiresAt: input.expiresAt,
      inviterName: invitation?.invitedBy.fullName,
    });

    const result = await this.emailNotifications.send({
      notificationType: 'BUSINESS_INVITATION',
      recipient: input.inviteeEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      relatedEntityType: 'invitation',
      relatedEntityId: input.invitationId,
    });

    return { emailSent: result.sent, deliveryId: result.deliveryId };
  }
}
