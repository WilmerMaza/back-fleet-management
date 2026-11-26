/**
 * Autenticación mínima: JWT válido + usuario ACTIVE, sin tenant operativo.
 *
 * Para onboarding (empresa pendiente) y consulta de estado sin permisos de taller.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { REQUEST_CONTEXT, type RequestContext } from '../tenant/request-context.js';
import type { AccessTokenPayload } from './access-token.js';

@Injectable()
export class JwtUserGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      [REQUEST_CONTEXT]?: RequestContext;
    }>();

    const header = request.headers.authorization;
    const raw = typeof header === 'string' ? header : header?.[0];
    if (!raw?.startsWith('Bearer ')) {
      throw Errors.unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(raw.slice(7));
    } catch {
      throw Errors.unauthorized();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true, platformRole: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const ctx: RequestContext = {
      userId: user.id,
      email: user.email,
      businessId: null,
      businessIds: [],
      roles: [],
      permissions: [],
      platformRole: user.platformRole ?? null,
      sessionFamilyId: payload.familyId,
    };
    request[REQUEST_CONTEXT] = ctx;
    return true;
  }
}
