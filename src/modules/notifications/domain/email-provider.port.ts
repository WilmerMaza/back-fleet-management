/**
 * Puerto de envío de correo. Los adaptadores viven en infrastructure.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  from: EmailAddress;
  to: EmailAddress;
  subject: string;
  html: string;
  text: string;
  replyTo?: EmailAddress;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailProvider {
  readonly providerId: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
