/**
 * Cookies de sesión auth (D4): refresh HttpOnly + CSRF double-submit.
 *
 * El SPA (otro origen/puerto) no puede leer cookies del API; por eso el CSRF
 * también viaja en el JSON de sesión y el front lo reenvía en `X-XSRF-TOKEN`.
 * El navegador sí envía ambas cookies en requests con credentials.
 */
import { randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import {
  expiresAtFromDuration,
  jwtRefreshExpiresIn,
} from '../../../shared/config/jwt.config.js';
import type { SessionResponse } from '../application/session.issuer.js';
import { Errors } from '../../../shared/common/app-error.js';

export const REFRESH_COOKIE = 'konti_refresh';
export const CSRF_COOKIE = 'XSRF-TOKEN';
export const CSRF_HEADER = 'x-xsrf-token';

/** Path acotado: la cookie solo viaja a endpoints `/auth/*`. */
const AUTH_COOKIE_PATH = '/api/v1/auth';

export type PublicSessionResponse = Omit<SessionResponse, 'refreshToken'> & {
  csrfToken: string;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * SPA en otro sitio (p. ej. localhost:4200 → API en Vercel): `SameSite=Lax`
 * no envía la cookie en XHR cross-site → F5 pierde la sesión.
 * En Vercel usamos `None` + `Secure` para credentials cross-origin.
 */
function isCrossSiteSpa(): boolean {
  return Boolean(process.env.VERCEL);
}

function refreshMaxAgeSec(): number {
  const expiresAt = expiresAtFromDuration(jwtRefreshExpiresIn());
  return Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

function baseCookieOptions(httpOnly: boolean): CookieOptions {
  const crossSite = isCrossSiteSpa();
  return {
    httpOnly,
    secure: isProduction() || crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    path: AUTH_COOKIE_PATH,
    maxAge: refreshMaxAgeSec() * 1000,
  };
}

export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Escribe refresh HttpOnly + CSRF legible; no expone el refresh en el JSON. */
export function attachSessionCookies(
  res: Response,
  session: SessionResponse,
): PublicSessionResponse {
  const csrfToken = newCsrfToken();
  res.cookie(REFRESH_COOKIE, session.refreshToken, baseCookieOptions(true));
  res.cookie(CSRF_COOKIE, csrfToken, baseCookieOptions(false));
  const { refreshToken: _omit, ...publicSession } = session;
  return { ...publicSession, csrfToken };
}

export function clearSessionCookies(res: Response): void {
  const crossSite = isCrossSiteSpa();
  const clearOpts: CookieOptions = {
    httpOnly: true,
    secure: isProduction() || crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    path: AUTH_COOKIE_PATH,
  };
  res.clearCookie(REFRESH_COOKIE, clearOpts);
  res.clearCookie(CSRF_COOKIE, { ...clearOpts, httpOnly: false });
}

export function refreshTokenFromRequest(
  req: Request,
  bodyToken?: string,
): { token: string; fromCookie: boolean } {
  const cookieToken =
    typeof req.cookies?.[REFRESH_COOKIE] === 'string'
      ? (req.cookies[REFRESH_COOKIE] as string)
      : '';
  if (cookieToken) {
    return { token: cookieToken, fromCookie: true };
  }
  const body = bodyToken?.trim() ?? '';
  if (body) {
    return { token: body, fromCookie: false };
  }
  throw Errors.unauthorized();
}

/**
 * Si el refresh viene de cookie, exige `X-XSRF-TOKEN` === cookie CSRF.
 * Body-only (tests/curl) no exige CSRF.
 */
export function assertCsrfForCookieAuth(req: Request, fromCookie: boolean): void {
  if (!fromCookie) {
    return;
  }
  const cookieCsrf =
    typeof req.cookies?.[CSRF_COOKIE] === 'string'
      ? (req.cookies[CSRF_COOKIE] as string)
      : '';
  const headerRaw = req.headers[CSRF_HEADER];
  const headerCsrf = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
    throw Errors.forbidden();
  }
}
