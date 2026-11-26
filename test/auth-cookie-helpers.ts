/**
 * Helpers de sesión para tests: el refresh ya no viaja en el JSON (D4).
 */
import { REFRESH_COOKIE } from '../src/modules/identity/presentation/auth-cookies.js';

type HeaderBag = { headers: Record<string, unknown> };

/** Extrae `konti_refresh` del header Set-Cookie de una respuesta. */
export function refreshTokenFromSetCookie(res: HeaderBag): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  for (const line of list) {
    const match = new RegExp(`^${REFRESH_COOKIE}=([^;]+)`).exec(line);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  throw new Error(`Cookie ${REFRESH_COOKIE} ausente en Set-Cookie`);
}
