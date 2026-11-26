export interface RequestContext {
  userId: string;
  email: string;
  /** Null en sesión solo-plataforma (SUPER_ADMIN sin tenant activo). */
  businessId: string | null;
  businessIds: string[];
  roles: string[];
  permissions: string[];
  platformRole?: 'SUPER_ADMIN' | null;
  /** Familia de refresh del access token actual (SEC-04 en switch-business). */
  sessionFamilyId?: string;
}

export const REQUEST_CONTEXT = 'konti:request-context';
