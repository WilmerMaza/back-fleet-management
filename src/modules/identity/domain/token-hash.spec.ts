import { describe, expect, it } from 'vitest';
import { hashRefreshToken } from './token-hash.js';

describe('hashRefreshToken', () => {
  it('produce hex de 64 caracteres estable', () => {
    const hash = hashRefreshToken('refresh-token-value');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
    expect(hashRefreshToken('refresh-token-value')).toBe(hash);
  });

  it('cambia si el token cambia', () => {
    expect(hashRefreshToken('a')).not.toBe(hashRefreshToken('b'));
  });
});
