import { afterEach, describe, expect, it } from 'vitest';
import { assertJwtSecret, expiresAtFromDuration } from './jwt.config.js';

describe('jwt.config', () => {
  const previous = process.env.JWT_SECRET;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previous;
    }
  });

  it('rechaza secreto ausente, corto o placeholder inseguro', () => {
    expect(() => assertJwtSecret(undefined)).toThrow(/obligatorio/i);
    expect(() => assertJwtSecret('short')).toThrow(/32/i);
    expect(() => assertJwtSecret('dev-secret-change-me')).toThrow(/32|inseguro/i);
    expect(() =>
      assertJwtSecret('dev-secret-change-me-padded-to-32chars!!'),
    ).toThrow(/inseguro/i);
  });

  it('acepta secreto largo aleatorio', () => {
    const secret = 'local-dev-jwt-secret-konti-min-32b!';
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(assertJwtSecret(secret)).toBe(secret);
  });

  it('calcula expiresAt desde duración', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(expiresAtFromDuration('1h', from).toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(expiresAtFromDuration('2d', from).toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });
});
