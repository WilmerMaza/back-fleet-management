import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Errors } from '../common/app-error.js';
import { PERMISSION_KEY } from './require-permission.decorator.js';
import { REQUEST_CONTEXT, type RequestContext } from '../tenant/request-context.js';

interface AccessToken {
  sub: string;
  email: string;
  activeBusinessId: string;
  businessIds: string[];
  roles: string[];
  permissions: string[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      params: { businessId?: string };
      [REQUEST_CONTEXT]?: RequestContext;
    }>();

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw Errors.unauthorized();
    }

    let payload: AccessToken;
    try {
      payload = this.jwt.verify<AccessToken>(header.slice(7));
    } catch {
      throw Errors.unauthorized();
    }

    const headerBusiness = request.headers['x-business-id'];
    const pathBusiness = request.params.businessId;
    const requested = headerBusiness || pathBusiness || payload.activeBusinessId;

    if (!requested || !payload.businessIds.includes(requested)) {
      throw Errors.tenantDenied();
    }
    if (pathBusiness && pathBusiness !== requested) {
      throw Errors.tenantDenied();
    }

    const ctx: RequestContext = {
      userId: payload.sub,
      email: payload.email,
      businessId: requested,
      businessIds: payload.businessIds,
      roles: payload.roles,
      permissions: payload.permissions,
    };
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
