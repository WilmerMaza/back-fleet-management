/**
 * Orquesta renderizado, persistencia de entregas y llamada al proveedor intercambiable.
 */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { loadEmailConfig } from '../../../shared/config/email.config.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { AppLogger } from '../../../shared/logging/app-logger.js';
import type { EmailMessage, EmailProvider } from '../domain/email-provider.port.js';
import { EMAIL_PROVIDER } from '../notifications.tokens.js';

export interface SendEmailInput {
  notificationType: 'BUSINESS_INVITATION';
  recipient: string;
  subject: string;
  html: string;
  text: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface SendEmailResult {
  deliveryId: string;
  sent: boolean;
  providerMessageId: string | null;
}

function sanitizeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error desconocido';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 500);
}

@Injectable()
export class EmailNotificationService {
  private readonly config = loadEmailConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const recipient = input.recipient.trim().toLowerCase();
    const deliveryId = randomUUID();

    await this.prisma.emailDelivery.create({
      data: {
        id: deliveryId,
        notificationType: input.notificationType,
        recipient,
        subject: input.subject.slice(0, 255),
        status: 'PENDING',
        provider: this.provider.providerId,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
      },
    });

    const message: EmailMessage = {
      from: { email: this.config.from, name: this.config.fromName },
      to: { email: recipient },
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: this.config.replyTo ? { email: this.config.replyTo } : undefined,
    };

    try {
      const result = await this.provider.send(message);
      await this.prisma.emailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attemptCount: { increment: 1 },
          providerMessageId: result.providerMessageId,
          lastError: null,
        },
      });
      return { deliveryId, sent: true, providerMessageId: result.providerMessageId };
    } catch (error) {
      const lastError = sanitizeErrorMessage(error);
      await this.prisma.emailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          attemptCount: { increment: 1 },
          lastError,
        },
      });
      this.logger.error(
        `Fallo al enviar correo (delivery=${deliveryId}, type=${input.notificationType})`,
        error,
      );
      return { deliveryId, sent: false, providerMessageId: null };
    }
  }
}
