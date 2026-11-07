/**
 * Cache opcional de autorización de access (familia + permisos live).
 *
 * Default TTL 0 (desactivado). Tras revokeFamily debe invalidarse post-commit.
 */
import { Injectable } from '@nestjs/common';
import { authSessionCacheTtlMs } from '../config/auth-rate-limit.config.js';
import type { RequestContext } from '../tenant/request-context.js';

interface CacheEntry {
  expiresAt: number;
  ctx: RequestContext;
}

@Injectable()
export class AccessSessionCache {
  private readonly entries = new Map<string, CacheEntry>();
  private ttlMs = authSessionCacheTtlMs();

  setTtlMs(ttlMs: number): void {
    this.ttlMs = Math.max(0, ttlMs);
  }

  get(familyId: string, businessId: string): RequestContext | null {
    if (this.ttlMs <= 0) {
      return null;
    }
    const key = this.key(familyId, businessId);
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry.ctx;
  }

  set(familyId: string, businessId: string, ctx: RequestContext): void {
    if (this.ttlMs <= 0) {
      return;
    }
    this.entries.set(this.key(familyId, businessId), {
      expiresAt: Date.now() + this.ttlMs,
      ctx: { ...ctx, businessIds: [...ctx.businessIds], roles: [...ctx.roles], permissions: [...ctx.permissions] },
    });
  }

  invalidateFamily(familyId: string): void {
    const prefix = `${familyId}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  private key(familyId: string, businessId: string): string {
    return `${familyId}:${businessId}`;
  }
}
