/**
 * Cookies D4: set/clear, resolución cookie|body y CSRF solo con cookie.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  REFRESH_COOKIE,
  assertCsrfForCookieAuth,
  attachSessionCookies,
  clearSessionCookies,
  refreshTokenFromRequest,
} from './auth-cookies.js';
import type { SessionResponse } from '../application/session.issuer.js';

function fakeSession(refreshToken = 'rt-secret'): SessionResponse {
  return {
    accessToken: 'at',
    refreshToken,
    user: {
      id: 'u1',
      email: 'a@b.c',
      fullName: 'A',
      roleCodes: ['ADMIN'],
      businessId: 'b1',
      status: 'ACTIVE',
      platformRole: null,
      hasPassword: true,
    },
    business: { id: 'b1', name: 'Taller', status: 'ACTIVE' },
    availableBusinesses: [{ id: 'b1', name: 'Taller' }],
  };
}

function fakeRes() {
  const cookies: { name: string; value: string; opts?: object }[] = [];
  const cleared: string[] = [];
  const res = {
    cookie: vi.fn((name: string, value: string, opts?: object) => {
      cookies.push({ name, value, opts });
      return res;
    }),
    clearCookie: vi.fn((name: string) => {
      cleared.push(name);
      return res;
    }),
    _cookies: cookies,
    _cleared: cleared,
  };
  return res as unknown as Response & {
    _cookies: typeof cookies;
    _cleared: string[];
  };
}

describe('auth-cookies', () => {
  it('attachSessionCookies omite refreshToken y fija cookies HttpOnly + CSRF', () => {
    const res = fakeRes();
    const pub = attachSessionCookies(res, fakeSession('rt-plain'));
    expect(pub).not.toHaveProperty('refreshToken');
    expect(pub.accessToken).toBe('at');
    expect(pub.csrfToken).toBeTruthy();
    expect(res._cookies.map((c) => c.name).sort()).toEqual(
      [CSRF_COOKIE, REFRESH_COOKIE].sort(),
    );
    const refresh = res._cookies.find((c) => c.name === REFRESH_COOKIE)!;
    expect(refresh.value).toBe('rt-plain');
    expect(refresh.opts).toMatchObject({ httpOnly: true, path: '/api/v1/auth', sameSite: 'lax' });
    const csrf = res._cookies.find((c) => c.name === CSRF_COOKIE)!;
    expect(csrf.value).toBe(pub.csrfToken);
    expect(csrf.opts).toMatchObject({ httpOnly: false });
  });

  it('clearSessionCookies limpia refresh y CSRF', () => {
    const res = fakeRes();
    clearSessionCookies(res);
    expect(res._cleared).toEqual([REFRESH_COOKIE, CSRF_COOKIE]);
  });

  it('refreshTokenFromRequest prioriza cookie sobre body', () => {
    const req = {
      cookies: { [REFRESH_COOKIE]: 'from-cookie' },
    } as unknown as Request;
    expect(refreshTokenFromRequest(req, 'from-body')).toEqual({
      token: 'from-cookie',
      fromCookie: true,
    });
  });

  it('refreshTokenFromRequest usa body si no hay cookie', () => {
    const req = { cookies: {} } as unknown as Request;
    expect(refreshTokenFromRequest(req, 'from-body')).toEqual({
      token: 'from-body',
      fromCookie: false,
    });
  });

  it('assertCsrfForCookieAuth exige header coincidente solo con cookie', () => {
    const ok = {
      cookies: { [CSRF_COOKIE]: 'abc' },
      headers: { [CSRF_HEADER]: 'abc' },
    } as unknown as Request;
    expect(() => assertCsrfForCookieAuth(ok, true)).not.toThrow();
    expect(() => assertCsrfForCookieAuth(ok, false)).not.toThrow();

    const bad = {
      cookies: { [CSRF_COOKIE]: 'abc' },
      headers: { [CSRF_HEADER]: 'xyz' },
    } as unknown as Request;
    expect(() => assertCsrfForCookieAuth(bad, true)).toThrow();
  });
});
