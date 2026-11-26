/**
 * Persiste preferencias personales de notificación del usuario.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type UserNotificationPreferences,
} from '../domain/notification-preferences.js';

export interface UpdateNotificationPreferencesInput {
  userId: string;
  preferences: UserNotificationPreferences;
}

@Injectable()
export class UpdateNotificationPreferencesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: UpdateNotificationPreferencesInput): Promise<UserNotificationPreferences> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const preferences: UserNotificationPreferences = {
      inAppOperational: Boolean(input.preferences.inAppOperational),
      emailOperational: Boolean(input.preferences.emailOperational),
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { notificationPreferences: preferences },
    });

    return preferences;
  }
}

export function notificationPreferencesOrDefault(value: unknown): UserNotificationPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const row = value as Record<string, unknown>;
  return {
    inAppOperational:
      typeof row.inAppOperational === 'boolean'
        ? row.inAppOperational
        : DEFAULT_NOTIFICATION_PREFERENCES.inAppOperational,
    emailOperational:
      typeof row.emailOperational === 'boolean'
        ? row.emailOperational
        : DEFAULT_NOTIFICATION_PREFERENCES.emailOperational,
  };
}
