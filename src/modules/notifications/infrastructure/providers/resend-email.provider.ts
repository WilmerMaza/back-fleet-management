/**
 * Envío real vía API Resend (https://resend.com).
 *
 * Requiere RESEND_API_KEY y EMAIL_FROM en un dominio verificado en Resend
 * (en cuenta nueva pueden enviar a su propio correo sin dominio).
 */
import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { AppLogger } from '../../../../shared/logging/app-logger.js';
import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from '../../domain/email-provider.port.js';

function requireResendApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'RESEND_API_KEY es obligatorio cuando EMAIL_PROVIDER=resend. Obtenga una en https://resend.com/api-keys',
    );
  }
  return key;
}

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  readonly providerId = 'resend';

  private readonly client: Resend;

  constructor(private readonly logger: AppLogger) {
    this.client = new Resend(requireResendApiKey());
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const from = message.from.name
      ? `${message.from.name} <${message.from.email}>`
      : message.from.email;

    const result = await this.client.emails.send({
      from,
      to: message.to.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo?.email,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    const providerMessageId = result.data?.id ?? `resend_${Date.now()}`;
    this.logger.info('Correo enviado (Resend)', {
      provider: this.providerId,
      providerMessageId,
      to: message.to.email,
      subject: message.subject,
    });

    return { providerMessageId };
  }
}
