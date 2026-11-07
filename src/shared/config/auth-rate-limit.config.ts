/**
 * Configuración explícita del rate limiting de autenticación (SEC-01).
 *
 * Sin Redis: contadores in-memory por proceso. Ver docs/audits/auth-hardening-fixes.md.
 */

export interface AuthRateLimitConfig {
  enabled: boolean;
  loginIpMax: number;
  loginIpWindowMs: number;
  loginAccountMax: number;
  loginAccountWindowMs: number;
  refreshIpMax: number;
  refreshIpWindowMs: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} debe ser un entero >= 0`);
  }
  return Math.floor(value);
}

export function loadAuthRateLimitConfig(): AuthRateLimitConfig {
  const enabledRaw = process.env.AUTH_RATE_LIMIT_ENABLED?.trim().toLowerCase();
  return {
    enabled: enabledRaw == null || enabledRaw === '' || enabledRaw === 'true' || enabledRaw === '1',
    loginIpMax: intEnv('AUTH_LOGIN_IP_MAX', 30),
    loginIpWindowMs: intEnv('AUTH_LOGIN_IP_WINDOW_MS', 60_000),
    loginAccountMax: intEnv('AUTH_LOGIN_ACCOUNT_MAX', 10),
    loginAccountWindowMs: intEnv('AUTH_LOGIN_ACCOUNT_WINDOW_MS', 900_000),
    refreshIpMax: intEnv('AUTH_REFRESH_IP_MAX', 60),
    refreshIpWindowMs: intEnv('AUTH_REFRESH_IP_WINDOW_MS', 60_000),
  };
}

/** TTL del cache de presencia de familia de sesión (0 = desactivado). */
export function authSessionCacheTtlMs(): number {
  return intEnv('AUTH_SESSION_CACHE_TTL_MS', 0);
}
