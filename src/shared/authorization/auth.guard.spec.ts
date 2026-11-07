/**
 * Aislamiento H-01 + frescura SEC-02/03: el AuthGuard no mezcla permisos entre negocios
 * y autoriza con el contexto revalidado (no claims stale).
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import { REQUEST_CONTEXT, type RequestContext } from '../tenant/request-context.js';
import type { AccessSessionService } from './access-session.service.js';
import { AuthGuard, type AccessTokenPayload } from './auth.guard.js';
import { Permission, permissionsForRoles } from './permissions.js';
import { PERMISSION_KEY } from './require-permission.decorator.js';

const BUSINESS_A = '11111111-1111-4111-8111-111111111111';
const BUSINESS_B = '22222222-2222-4222-8222-222222222222';
const FAMILY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function tokenFor(
  activeBusinessId: string,
  roles: string[],
  overrides: Partial<AccessTokenPayload> = {},
): AccessTokenPayload {
  return {
    sub: 'user-1',
    email: 'multi@fleet.local',
    activeBusinessId,
    businessIds: [BUSINESS_A, BUSINESS_B],
    roles,
    permissions: permissionsForRoles(roles),
    familyId: FAMILY,
    sid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ...overrides,
  };
}

function liveContext(activeBusinessId: string, roles: string[]): RequestContext {
  return {
    userId: 'user-1',
    email: 'multi@fleet.local',
    businessId: activeBusinessId,
    businessIds: [BUSINESS_A, BUSINESS_B],
    roles,
    permissions: permissionsForRoles(roles),
  };
}

function createContext(input: {
  authorization?: string;
  xBusinessId?: string;
  pathBusinessId?: string;
  permission?: string;
}): ExecutionContext {
  const request: {
    headers: Record<string, string | undefined>;
    params: { businessId?: string };
    [REQUEST_CONTEXT]?: RequestContext;
  } = {
    headers: {
      authorization: input.authorization,
      'x-business-id': input.xBusinessId,
    },
    params: { businessId: input.pathBusinessId },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('AuthGuard (H-01 negocio activo único)', () => {
  let jwt: { verify: ReturnType<typeof vi.fn> };
  let reflector: Reflector;
  let sessions: { resolveContext: ReturnType<typeof vi.fn> };
  let guard: AuthGuard;
  let permissionNeeded: string | undefined;

  beforeEach(() => {
    jwt = { verify: vi.fn() };
    sessions = {
      resolveContext: vi.fn(async (payload: AccessTokenPayload) =>
        liveContext(payload.activeBusinessId, payload.roles),
      ),
    };
    permissionNeeded = Permission.CustomersWrite;
    reflector = {
      getAllAndOverride: vi.fn((_key: string) => permissionNeeded),
    } as unknown as Reflector;
    guard = new AuthGuard(
      jwt as unknown as JwtService,
      reflector,
      sessions as unknown as AccessSessionService,
    );
  });

  it('token de A + solicitud a A: permitido si tiene permiso', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    const ctx = createContext({
      authorization: 'Bearer access-a',
      xBusinessId: BUSINESS_A,
      pathBusinessId: BUSINESS_A,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
    const stored = ctx.switchToHttp().getRequest()[REQUEST_CONTEXT];
    expect(stored?.businessId).toBe(BUSINESS_A);
    expect(stored?.permissions).toContain(Permission.CustomersWrite);
    expect(stored?.permissions).toContain(Permission.InventoryWrite);
    expect(sessions.resolveContext).toHaveBeenCalled();
  });

  it('token de A + ruta B: rechazado aunque B esté en businessIds', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    const ctx = createContext({
      authorization: 'Bearer access-a',
      pathBusinessId: BUSINESS_B,
    });

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: 'TENANT_ACCESS_DENIED',
      statusCode: 403,
    });
    expect(sessions.resolveContext).not.toHaveBeenCalled();
  });

  it('token de A + header B: rechazado', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    const ctx = createContext({
      authorization: 'Bearer access-a',
      xBusinessId: BUSINESS_B,
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AppError);
  });

  it('token de A + ruta B + header A: rechazado', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    const ctx = createContext({
      authorization: 'Bearer access-a',
      xBusinessId: BUSINESS_A,
      pathBusinessId: BUSINESS_B,
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AppError);
  });

  it('token de A + ruta A + header B: rechazado', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    const ctx = createContext({
      authorization: 'Bearer access-a',
      xBusinessId: BUSINESS_B,
      pathBusinessId: BUSINESS_A,
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AppError);
  });

  it('sin header ni path usa activeBusinessId (p. ej. switch-business)', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    permissionNeeded = undefined;
    const ctx = createContext({ authorization: 'Bearer access-a' });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(ctx.switchToHttp().getRequest()[REQUEST_CONTEXT]?.businessId).toBe(BUSINESS_A);
  });

  it('tras switch a B, token nuevo con permisos de B permite acceso autorizado', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_B, ['OPERATOR']));
    permissionNeeded = Permission.CustomersRead;
    const ctx = createContext({
      authorization: 'Bearer access-b',
      xBusinessId: BUSINESS_B,
      pathBusinessId: BUSINESS_B,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
    const stored = ctx.switchToHttp().getRequest()[REQUEST_CONTEXT];
    expect(stored?.businessId).toBe(BUSINESS_B);
    expect(stored?.roles).toEqual(['OPERATOR']);
    expect(stored?.permissions).toContain(Permission.CustomersRead);
    expect(stored?.permissions).not.toContain(Permission.InventoryWrite);
    expect(stored?.permissions).not.toContain(Permission.CustomersWrite);
  });

  it('token de B (OPERATOR) no hereda escritura de ADMIN del negocio A', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_B, ['OPERATOR']));
    permissionNeeded = Permission.CustomersWrite;
    const ctx = createContext({
      authorization: 'Bearer access-b',
      xBusinessId: BUSINESS_B,
      pathBusinessId: BUSINESS_B,
    });

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  it('usuario sin el permiso requerido recibe FORBIDDEN en el negocio activo', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['OPERATOR']));
    permissionNeeded = Permission.InventoryWrite;
    const ctx = createContext({
      authorization: 'Bearer access-a',
      xBusinessId: BUSINESS_A,
      pathBusinessId: BUSINESS_A,
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AppError);
  });

  it('pertenencia a A y B no autoriza operar B con token de A: debe switch-business', async () => {
    const adminOnA = tokenFor(BUSINESS_A, ['ADMIN']);
    expect(adminOnA.businessIds).toEqual([BUSINESS_A, BUSINESS_B]);
    expect(adminOnA.permissions).toContain(Permission.CustomersWrite);

    jwt.verify.mockReturnValue(adminOnA);
    permissionNeeded = Permission.CustomersWrite;

    await expect(
      guard.canActivate(
        createContext({
          authorization: 'Bearer access-a',
          xBusinessId: BUSINESS_B,
          pathBusinessId: BUSINESS_B,
        }),
      ),
    ).rejects.toBeInstanceOf(AppError);

    jwt.verify.mockReturnValue(tokenFor(BUSINESS_B, ['OPERATOR']));
    permissionNeeded = Permission.CustomersRead;
    expect(
      await guard.canActivate(
        createContext({
          authorization: 'Bearer access-b',
          xBusinessId: BUSINESS_B,
          pathBusinessId: BUSINESS_B,
        }),
      ),
    ).toBe(true);
  });

  it('rechaza JWT inválido con UNAUTHORIZED', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid');
    });
    await expect(
      guard.canActivate(createContext({ authorization: 'Bearer bad' })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('SEC-03: autoriza con permisos live aunque el JWT traiga permisos inflados', async () => {
    const inflated = tokenFor(BUSINESS_A, ['OPERATOR'], {
      permissions: [...permissionsForRoles(['OPERATOR']), Permission.InventoryAdjust],
    });
    jwt.verify.mockReturnValue(inflated);
    sessions.resolveContext.mockResolvedValue(liveContext(BUSINESS_A, ['OPERATOR']));
    permissionNeeded = Permission.InventoryAdjust;
    const ctx = createContext({
      authorization: 'Bearer inflated',
      pathBusinessId: BUSINESS_A,
    });

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('SEC-02: si la sesión revalidada falla, no autoriza', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    sessions.resolveContext.mockRejectedValue(ErrorsUnauthorized());
    permissionNeeded = undefined;
    await expect(
      guard.canActivate(createContext({ authorization: 'Bearer access-a' })),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('Reflector lee el permiso del handler', async () => {
    jwt.verify.mockReturnValue(tokenFor(BUSINESS_A, ['ADMIN']));
    permissionNeeded = Permission.FleetsRead;
    const ctx = createContext({
      authorization: 'Bearer access-a',
      pathBusinessId: BUSINESS_A,
    });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSION_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });
});

function ErrorsUnauthorized() {
  return new AppError('UNAUTHORIZED', 'No autenticado.', 401);
}
