import { describe, expect, it, vi } from 'vitest';
import type { EmailProvider } from '../domain/email-provider.port.js';
import { EmailNotificationService } from './email-notification.service.js';

describe('EmailNotificationService', () => {
  it('registra SENT cuando el proveedor responde', async () => {
    const provider: EmailProvider = {
      providerId: 'mock',
      send: vi.fn().mockResolvedValue({ providerMessageId: 'mock-1' }),
    };

    const prisma = {
      emailDelivery: {
        create: vi.fn().mockResolvedValue({ id: 'd1' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const logger = { error: vi.fn() };
    const service = new EmailNotificationService(
      prisma as never,
      logger as never,
      provider,
    );

    const result = await service.send({
      notificationType: 'BUSINESS_INVITATION',
      recipient: 'user@test.local',
      subject: 'Invitación',
      html: '<p>x</p>',
      text: 'x',
      relatedEntityType: 'invitation',
      relatedEntityId: 'inv-1',
    });

    expect(result.sent).toBe(true);
    expect(result.providerMessageId).toBe('mock-1');
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('registra FAILED si el proveedor falla', async () => {
    const provider: EmailProvider = {
      providerId: 'mock',
      send: vi.fn().mockRejectedValue(new Error('SMTP down')),
    };

    const prisma = {
      emailDelivery: {
        create: vi.fn().mockResolvedValue({ id: 'd2' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const logger = { error: vi.fn() };
    const service = new EmailNotificationService(
      prisma as never,
      logger as never,
      provider,
    );

    const result = await service.send({
      notificationType: 'BUSINESS_INVITATION',
      recipient: 'user@test.local',
      subject: 'Invitación',
      html: '<p>x</p>',
      text: 'x',
    });

    expect(result.sent).toBe(false);
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', lastError: 'SMTP down' }),
      }),
    );
  });
});
