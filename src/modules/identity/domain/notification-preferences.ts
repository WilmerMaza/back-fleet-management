/**
 * Preferencias personales de notificación (no incluye correos de seguridad obligatorios).
 */
export type UserNotificationPreferences = {
  inAppOperational: boolean;
  emailOperational: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  inAppOperational: true,
  emailOperational: true,
};

export function parseNotificationPreferences(
  value: unknown,
): UserNotificationPreferences {
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
