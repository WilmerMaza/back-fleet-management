/**
 * Claims del access JWT. `familyId` enlaza con auth_refresh_sessions (SEC-02).
 * Los permisos del claim no autorizan por sí solos: el Guard los recalcula (SEC-03).
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  activeBusinessId: string;
  businessIds: string[];
  roles: string[];
  permissions: string[];
  /** Familia de refresh; obligatorio tras endurecimiento SEC-02. */
  familyId: string;
  /** Sesión de refresh actual (informativo). */
  sid?: string;
}
