/**
 * Login con Google ID token.
 *
 * - Identidad por `sub` (AuthIdentity).
 * - Sin auto-provisión en login normal (escenario C).
 * - Con `invitationToken`: alta + aceptación en el flujo de invitación válida.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Errors } from '../../../shared/common/app-error.js';
import { googleClientIdOrNull } from '../../../shared/config/google.config.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { AcceptInvitationUseCase } from './accept-invitation.use-case.js';
import { GoogleTokenVerifier } from './google-token.verifier.js';
import { hashRefreshToken } from '../domain/token-hash.js';
import { SessionIssuer, type SessionResponse } from './session.issuer.js';

export interface GoogleLoginInput {
  idToken: string;
  businessId?: string;
  invitationToken?: string;
}

@Injectable()
export class GoogleLoginUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleTokenVerifier,
    private readonly sessions: SessionIssuer,
    private readonly acceptInvitation: AcceptInvitationUseCase,
  ) {}

  async execute(input: GoogleLoginInput): Promise<SessionResponse> {
    if (!googleClientIdOrNull()) {
      throw Errors.googleNotConfigured();
    }
    const claims = await this.google.verifyIdToken(input.idToken);

    if (input.invitationToken?.trim()) {
      return this.executeWithInvitation(input.invitationToken.trim(), claims, input.idToken);
    }

    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: 'GOOGLE', providerUserId: claims.sub },
      },
    });

    if (existingIdentity) {
      return this.issueForUser(existingIdentity.userId, input.businessId);
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: claims.email },
      include: { identities: true },
    });

    if (byEmail) {
      const hasGoogle = byEmail.identities.some((item) => item.provider === 'GOOGLE');
      if (!hasGoogle) {
        throw Errors.accountExistsUsePassword();
      }
      throw Errors.unauthorized();
    }

    throw Errors.googleNotLinked();
  }

  private async executeWithInvitation(
    invitationToken: string,
    claims: { sub: string; email: string; name?: string },
    _idToken: string,
  ): Promise<SessionResponse> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashRefreshToken(invitationToken) },
      select: { email: true },
    });
    if (!invitation) {
      throw Errors.invitationNotFound();
    }
    if (invitation.email.toLowerCase() !== claims.email.toLowerCase()) {
      throw Errors.invitationEmailMismatch();
    }
    const userId = await this.ensureUserForInvitation(claims);
    const accepted = await this.acceptInvitation.execute(userId, invitationToken);
    return accepted.session;
  }

  private async ensureUserForInvitation(claims: {
    sub: string;
    email: string;
    name?: string;
  }): Promise<string> {
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: 'GOOGLE', providerUserId: claims.sub },
      },
    });
    if (existingIdentity) {
      return existingIdentity.userId;
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: claims.email },
      include: { identities: true },
    });

    if (byEmail) {
      const hasGoogle = byEmail.identities.some((item) => item.provider === 'GOOGLE');
      if (!hasGoogle) {
        throw Errors.accountExistsUsePassword();
      }
      throw Errors.unauthorized();
    }

    const userId = randomUUID();
    await this.prisma.user.create({
      data: {
        id: userId,
        email: claims.email,
        fullName: claims.name || claims.email,
        passwordHash: null,
        status: 'ACTIVE',
        identities: {
          create: {
            id: randomUUID(),
            provider: 'GOOGLE',
            providerUserId: claims.sub,
          },
        },
      },
    });
    return userId;
  }

  private async issueForUser(userId: string, businessId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { business: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }
    const memberships = user.memberships.filter(
      (item) => item.status === 'ACTIVE' && item.business.status === 'ACTIVE',
    );
    if (memberships.length > 1 && !businessId) {
      throw Errors.selectBusiness(
        memberships.map((item) => ({ id: item.business.id, name: item.business.name })),
      );
    }
    return this.sessions.issue(userId, businessId);
  }
}
