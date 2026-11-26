/**
 * Proveedor de desarrollo: no envía correos reales; registra metadatos seguros en logs.
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/logging/app-logger.js';
import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from '../../domain/email-provider.port.js';

@Injectable()
export class DevEmailProvider implements EmailProvider {
  readonly providerId = 'dev';

  constructor(private readonly logger: AppLogger) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const providerMessageId = `dev_${randomUUID()}`;
    this.logger.info('Correo simulado (proveedor dev)', {
      provider: this.providerId,
      providerMessageId,
      to: message.to.email,
      subject: message.subject,
      replyTo: message.replyTo?.email,
    });
    return { providerMessageId };
  }
}
