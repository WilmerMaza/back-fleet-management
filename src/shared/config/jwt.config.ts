/**
 * Validación de secretos y duraciones JWT al arranque.
 *
 * Sin valor por defecto inseguro: la API no arranca si JWT_SECRET falta o es débil.
 */

const INSECURE_SECRETS = new Set([
  'dev-secret-change-me',
  'change-me-in-dev',
  'secret',
  'jwt-secret',
  'test',
  'test-secret',
  'dev-secret-change-me-padded-to-32chars!!',
]);

const MIN_SECRET_LENGTH = 32;

export type JwtDuration = `${number}${'s' | 'm' | 'h' | 'd'}`;

export function assertJwtSecret(raw: string | undefined): string {
  const secret = raw?.trim() ?? '';
  if (!secret) {
    throw new Error('JWT_SECRET es obligatorio. Define un secreto de al menos 32 caracteres.');
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  if (INSECURE_SECRETS.has(secret.toLowerCase())) {
    throw new Error('JWT_SECRET inseguro: elige un valor aleatorio distinto de los placeholders.');
  }
  return secret;
}

export function jwtAccessExpiresIn(): JwtDuration {
  // SEC-02: TTL corto como defensa en profundidad; la revocación real es por familyId.
  return (process.env.JWT_EXPIRES_IN?.trim() || '15m') as JwtDuration;
}

export function jwtRefreshExpiresIn(): JwtDuration {
  return (process.env.JWT_REFRESH_EXPIRES_IN?.trim() || '7d') as JwtDuration;
}

/** Convierte duraciones tipo `7d` / `8h` en Date absoluta. */
export function expiresAtFromDuration(duration: string, from = new Date()): Date {
  const match = /^(\d+)([smhd])$/i.exec(duration.trim());
  if (!match) {
    throw new Error(`Duración JWT inválida: ${duration}`);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms =
    unit === 's'
      ? amount * 1000
      : unit === 'm'
        ? amount * 60_000
        : unit === 'h'
          ? amount * 3_600_000
          : amount * 86_400_000;
  return new Date(from.getTime() + ms);
}

export function loadJwtModuleOptions() {
  return {
    secret: assertJwtSecret(process.env.JWT_SECRET),
    signOptions: { expiresIn: jwtAccessExpiresIn() },
  };
}
