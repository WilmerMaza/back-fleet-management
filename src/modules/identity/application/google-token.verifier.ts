/**
 * Valida ID tokens de Google (firma JWKS, audience, issuer, expiración).
 *
 * Usa `sub` como identificador estable; no confía en el correo sin `email_verified`.
 */
import { Injectable } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { googleClientId } from '../../../shared/config/google.config.js';
import { Errors } from '../../../shared/common/app-error.js';

export interface GoogleIdentityClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

@Injectable()
export class GoogleTokenVerifier {
  private client: OAuth2Client | null = null;

  private getClient(): OAuth2Client {
    if (!this.client) {
      this.client = new OAuth2Client(googleClientId());
    }
    return this.client;
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdentityClaims> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.getClient().verifyIdToken({
        idToken,
        audience: googleClientId(),
      });
      payload = ticket.getPayload();
    } catch {
      throw Errors.invalidGoogleToken();
    }
    if (!payload?.sub) {
      throw Errors.invalidGoogleToken();
    }
    if (!payload.email) {
      throw Errors.invalidGoogleToken();
    }
    if (payload.email_verified !== true) {
      throw Errors.emailNotVerified();
    }
    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      emailVerified: true,
      name: payload.name?.trim() || undefined,
    };
  }
}
