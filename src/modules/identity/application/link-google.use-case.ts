/**
 * Vincula Google a un usuario ya autenticado (D3).
 *
 * Exige email Google verificado e igual al email de la cuenta KONTI.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Errors } from '../../../shared/common/app-error.js';
import { googleClientIdOrNull } from '../../../shared/config/google.config.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { GoogleTokenVerifier } from './google-token.verifier.js';

@Injectable()
export class LinkGoogleUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleTokenVerifier,
  ) {}

  async execute(userId: string, idToken: string): Promise<{ linked: true }> {
    if (!googleClientIdOrNull()) {
      throw Errors.googleNotConfigured();
    }
    const claims = await this.google.verifyIdToken(idToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }
    if (claims.email !== user.email.trim().toLowerCase()) {
      throw Errors.forbidden();
    }

    const existing = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: 'GOOGLE', providerUserId: claims.sub },
      },
    });
    if (existing && existing.userId !== userId) {
      throw Errors.googleAlreadyLinked();
    }
    if (existing) {
      return { linked: true };
    }

    await this.prisma.authIdentity.create({
      data: {
        id: randomUUID(),
        userId,
        provider: 'GOOGLE',
        providerUserId: claims.sub,
      },
    });
    return { linked: true };
  }
}
