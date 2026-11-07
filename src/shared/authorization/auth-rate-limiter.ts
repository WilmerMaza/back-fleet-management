/**
 * Rate limiting in-memory para login/refresh (SEC-01).
 *
 * Login: techo por IP + techo por (IP+email) solo tras fallos (mitiga DoS de cuenta).
 * Refresh: techo por IP. No registra secretos.
 */
import { Injectable } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import {
  loadAuthRateLimitConfig,
  type AuthRateLimitConfig,
} from '../config/auth-rate-limit.config.js';

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private config: AuthRateLimitConfig;

  constructor() {
    this.config = loadAuthRateLimitConfig();
  }

  /** Permite reconfigurar en tests sin reiniciar el proceso. */
  configure(partial: Partial<AuthRateLimitConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  reset(): void {
    this.buckets.clear();
  }

  enforceLoginIp(ip: string): void {
    if (!this.config.enabled) {
      return;
    }
    this.consume(`login:ip:${normalizeIp(ip)}`, this.config.loginIpMax, this.config.loginIpWindowMs);
  }

  /** Comprueba el bucket de fallos por cuenta sin incrementar. */
  enforceLoginAccount(ip: string, email: string): void {
    if (!this.config.enabled) {
      return;
    }
    const key = this.accountKey(ip, email);
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return;
    }
    if (Date.now() >= bucket.resetAt) {
      this.buckets.delete(key);
      return;
    }
    if (bucket.count >= this.config.loginAccountMax) {
      throw Errors.rateLimited(Math.ceil((bucket.resetAt - Date.now()) / 1000));
    }
  }

  recordLoginFailure(ip: string, email: string): void {
    if (!this.config.enabled) {
      return;
    }
    this.consume(
      this.accountKey(ip, email),
      this.config.loginAccountMax,
      this.config.loginAccountWindowMs,
    );
  }

  clearLoginAccount(ip: string, email: string): void {
    this.buckets.delete(this.accountKey(ip, email));
  }

  enforceRefreshIp(ip: string): void {
    if (!this.config.enabled) {
      return;
    }
    this.consume(
      `refresh:ip:${normalizeIp(ip)}`,
      this.config.refreshIpMax,
      this.config.refreshIpWindowMs,
    );
  }

  private accountKey(ip: string, email: string): string {
    return `login:acct:${normalizeIp(ip)}:${email.trim().toLowerCase()}`;
  }

  private consume(key: string, max: number, windowMs: number): void {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      throw Errors.rateLimited(Math.ceil((bucket.resetAt - now) / 1000));
    }
  }
}

export function normalizeIp(ip: string): string {
  const trimmed = ip.trim() || 'unknown';
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export function clientIpFromRequest(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || 'unknown';
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
