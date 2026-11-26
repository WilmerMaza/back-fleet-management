import { describe, expect, it } from 'vitest';
import { hashRefreshToken } from '../../identity/domain/token-hash.js';
import { createInvitationToken } from './create-invitation-token.js';

describe('createInvitationToken', () => {
  it('genera token de alta entropía y hash SHA-256 distinto del token', () => {
    const { token, tokenHash } = createInvitationToken();
    expect(token).not.toBe(tokenHash);
    expect(tokenHash).toBe(hashRefreshToken(token));
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
