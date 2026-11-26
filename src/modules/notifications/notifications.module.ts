/**
 * Correo transaccional: proveedor intercambiable + trazabilidad.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import { loadEmailConfig } from '../../shared/config/email.config.js';
import { LoggingModule } from '../../shared/logging/logging.module.js';
import { PrismaModule } from '../../shared/database/prisma.module.js';
import { EmailNotificationService } from './application/email-notification.service.js';
import { SendInvitationEmailUseCase } from './application/send-invitation-email.use-case.js';
import { DevEmailProvider } from './infrastructure/providers/dev-email.provider.js';
import { ResendEmailProvider } from './infrastructure/providers/resend-email.provider.js';
import { EMAIL_PROVIDER } from './notifications.tokens.js';

const emailConfigProvider = {
  provide: 'EMAIL_CONFIG',
  useFactory: () => loadEmailConfig(),
};

@Module({
  imports: [PrismaModule, LoggingModule],
  providers: [
    emailConfigProvider,
    DevEmailProvider,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        config: ReturnType<typeof loadEmailConfig>,
        dev: DevEmailProvider,
        resend: ResendEmailProvider,
      ) => {
        switch (config.provider) {
          case 'dev':
            return dev;
          case 'resend':
            return resend;
          default:
            throw new Error(
              `Proveedor de correo no registrado: ${config.provider}. Implemente el adapter en NotificationsModule.`,
            );
        }
      },
      inject: ['EMAIL_CONFIG', DevEmailProvider, ResendEmailProvider],
    },
    EmailNotificationService,
    SendInvitationEmailUseCase,
  ],
  exports: [EmailNotificationService, SendInvitationEmailUseCase],
})
export class NotificationsModule implements OnModuleInit {
  onModuleInit(): void {
    loadEmailConfig();
  }
}
