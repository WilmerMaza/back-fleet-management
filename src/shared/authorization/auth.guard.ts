/**
 * Autenticación JWT y aislamiento del negocio activo del token.
 *
 * Un access token fija un único `activeBusinessId` con sus roles/permisos.
 * Cambiar de negocio requiere `POST /auth/switch-business` (nueva sesión).
 * `X-Business-Id` y el `businessId` de ruta, si vienen, deben coincidir con
 * ese negocio activo; no basta con aparecer en `businessIds`.
 *
 * SEC-02/SEC-03: tras verificar la firma se revalida la familia de refresh y
 * se recalculan permisos desde la membresía ACTIVE (no se confía en claims stale).
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Errors } from '../common/app-error.js';
import { REQUEST_CONTEXT, type RequestContext } from '../tenant/request-context.js';
import { AccessSessionService } from './access-session.service.js';
import type { AccessTokenPayload } from './access-token.js';
import { PERMISSION_KEY } from './require-permission.decorator.js';

export type { AccessTokenPayload } from './access-token.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly sessions: AccessSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      params: { businessId?: string };
      [REQUEST_CONTEXT]?: RequestContext;
    }>();

    const header = readHeader(request.headers.authorization);
    if (!header?.startsWith('Bearer ')) {
      throw Errors.unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(header.slice(7));
    } catch {
      throw Errors.unauthorized();
    }

    const activeBusinessId = payload.activeBusinessId;
    if (
      !activeBusinessId ||
      !Array.isArray(payload.businessIds) ||
      !payload.businessIds.includes(activeBusinessId)
    ) {
      throw Errors.tenantDenied();
    }

    const headerBusiness = readHeader(request.headers['x-business-id']);
    const pathBusiness = request.params.businessId;

    if (headerBusiness && headerBusiness !== activeBusinessId) {
      throw Errors.tenantDenied();
    }
    if (pathBusiness && pathBusiness !== activeBusinessId) {
      throw Errors.tenantDenied();
    }

    const ctx = await this.sessions.resolveContext(payload);
    if (ctx.businessId !== activeBusinessId) {
      throw Errors.tenantDenied();
    }
    request[REQUEST_CONTEXT] = ctx;

    const needed = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (needed && !ctx.permissions.includes(needed)) {
      throw Errors.forbidden();
    }
    return true;
  }
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return undefined;
}
