/**
 * Configuración de correo transaccional (proveedor intercambiable vía EMAIL_PROVIDER).
 */

/** Proveedor local / desarrollo. */
const DEV_PROVIDER = 'dev';

/** Adapters implementados además de `dev`. */
const IMPLEMENTED_PROVIDERS = ['resend'] as const;

/** Reservados; validan en config pero fallan en NotificationsModule hasta implementar. */
const PLANNED_PROVIDERS = ['ses', 'sendgrid'] as const;

const SUPPORTED_PROVIDERS = new Set<string>([
  DEV_PROVIDER,
  ...IMPLEMENTED_PROVIDERS,
  ...PLANNED_PROVIDERS,
]);

function isVitestRuntime(): boolean {
  return Boolean(process.env.VITEST);
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export interface EmailConfig {
  provider: string;
  from: string;
  fromName: string;
  replyTo: string | null;
}

export function loadEmailConfig(): EmailConfig {
  if (isVitestRuntime()) {
    return {
      provider: DEV_PROVIDER,
      from: 'noreply@konti.local',
      fromName: 'KONTI',
      replyTo: null,
    };
  }

  const provider = (process.env.EMAIL_PROVIDER?.trim() || DEV_PROVIDER).toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(
      `EMAIL_PROVIDER no soportado: "${provider}". Valores admitidos en configuración: ${[...SUPPORTED_PROVIDERS].join(', ')}.`,
    );
  }

  if (isProductionRuntime() && provider === DEV_PROVIDER) {
    throw new Error(
      'EMAIL_PROVIDER=dev no está permitido en NODE_ENV=production. Las invitaciones no se enviarían. ' +
        `Configure un proveedor transaccional (p. ej. EMAIL_PROVIDER=resend) y registre su adapter en NotificationsModule. ` +
        'Ver docs/architecture/EMAIL_NOTIFICATIONS.md.',
    );
  }

  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error('EMAIL_FROM es obligatorio (dirección remitente).');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    throw new Error('EMAIL_FROM debe ser un correo válido.');
  }

  const fromName = process.env.EMAIL_FROM_NAME?.trim() || 'KONTI';
  const replyToRaw = process.env.EMAIL_REPLY_TO?.trim();
  const replyTo =
    replyToRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToRaw) ? replyToRaw : null;

  if (provider === 'resend' && !process.env.RESEND_API_KEY?.trim()) {
    throw new Error(
      'RESEND_API_KEY es obligatorio con EMAIL_PROVIDER=resend. Cree una en https://resend.com/api-keys',
    );
  }

  return { provider, from, fromName, replyTo };
}
