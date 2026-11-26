/**
 * Genera token de invitación (plaintext una vez) y su hash SHA-256.
 */
import { randomBytes } from 'node:crypto';
import { frontendInvitationUrl } from '../../../shared/config/frontend-url.js';
import { hashRefreshToken } from '../../identity/domain/token-hash.js';

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

export function invitationExpiresAt(days = 7): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function frontendInviteUrl(token: string): string {
  return frontendInvitationUrl(token);
}
