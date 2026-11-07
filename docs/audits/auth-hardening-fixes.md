# Endurecimiento de autenticación — SEC-01 / SEC-02 / SEC-03

| | |
| --- | --- |
| Repo | `back-fleet-management` |
| Fecha | 2026-11-04 |
| Alcance | Solo SEC-01, SEC-02, SEC-03 |
| No tocar | Inventario, OC-01…OC-04, H-01, H-04 (no regresionar) |

## 1. Causa raíz

| ID | Causa |
| --- | --- |
| **SEC-01** | `/auth/login` y `/auth/refresh` eran públicos sin techo de intentos; Argon2 encarece pero no limita abuso. |
| **SEC-02** | Logout/revocación solo marcaban `auth_refresh_sessions`; el access JWT se aceptaba solo con `jwt.verify` hasta `JWT_EXPIRES_IN` (default 8h). |
| **SEC-03** | El Guard autorizaba con `permissions[]` embebidos en el JWT (copia de `user_business_roles.permissions`), sin recalcular desde `roleCodes` ni revalidar membresía ACTIVE. |

## 2. Decisiones de arquitectura (antes de implementar)

### 2.1 Rate limiting sin Redis (SEC-01)

- **No** se introduce Redis: un solo proceso Nest; almacenamiento **in-memory** por proceso es suficiente y evita dependencia nueva.
- **No** `@nestjs/throttler` por ahora: el caso necesita buckets compuestos IP+email y reset tras login OK; un limiter propio es más claro.
- Login: techo por **IP** (todos los intentos) + techo por **IP+email** solo tras fallos (evita DoS de bloqueo de cuenta desde IPs distintas).
- Refresh: techo por **IP** (el token ya tiene alta entropía).
- Lockouts **temporales** (ventana fija corta); nunca permanentes.
- Respuestas 429 con código `RATE_LIMITED`; login fallido sigue siendo 401 genérico (no oráculo de existencia).
- No se registran contraseñas ni tokens en logs del limiter.

### 2.2 Revocación de access tokens (SEC-02)

**Rechazado:** solo bajar TTL. Reduce ventana pero no cumple “tras logout el access muere”.

**Elegido:**

1. El access JWT incluye `familyId` (+ `sid` informativo), alineado a la familia de refresh (H-04).
2. `AuthGuard` **revalida** que exista al menos una fila `auth_refresh_sessions` con esa `familyId`, `revoked_at IS NULL` y `expires_at > now()`.
3. Logout / reuso de refresh → `revokeFamily` → los access de esa familia fallan en el siguiente request.
4. TTL de access por defecto pasa de `8h` → **`15m`** (defensa en profundidad; el cliente ya tiene refresh).
5. Caché de presencia de familia **opcional** (`AUTH_SESSION_CACHE_TTL_MS`, default `0` = off). Si se activa, se invalida **después del commit** de revocación.

**Impacto UX:** clientes deben refrescar access ~cada 15 min; tras logout el access deja de servir de inmediato (con cache off).

**Impacto rendimiento:** 1–2 consultas indexadas por request autenticado cuando el cache está off.

### 2.3 Frescura de permisos (SEC-03)

**Elegido:** en cada request autenticado (misma pasada que SEC-02):

1. Usuario `ACTIVE`.
2. Membresía `ACTIVE` para `payload.activeBusinessId`.
3. Permisos efectivos = `permissionsForRoles(roleCodes)` — **única fuente** de autorización.
4. Emisión (login/refresh/switch): el access usa también `permissionsForRoles`.
5. `activeBusinessId` sigue siendo la frontera H-01; switch emite nueva sesión con roles del destino.

**No** se versiona `permissionsVersion` en DB en este corte.

## 3. Estrategia de revocación

```text
login/switch → crea familyId + sid (refresh persistido) → access con familyId
logout / reuse refresh → revokeFamily(familyId) → invalidate cache
AuthGuard → JWT ok → EXISTS sesión activa de familyId → carga membresía → permisos live
```

## 4. Estrategia de frescura de permisos

```text
roleCodes (membresía ACTIVE) → permissionsForRoles → RequestContext.permissions
JWT.permissions es informativo; el Guard sobrescribe con el cálculo live
```

## 5. Configuración de rate limiting

| Variable | Default | Significado |
| --- | --- | --- |
| `AUTH_RATE_LIMIT_ENABLED` | `true` | Master switch |
| `AUTH_LOGIN_IP_MAX` | `30` | Intentos login / ventana / IP |
| `AUTH_LOGIN_IP_WINDOW_MS` | `60000` | Ventana IP login |
| `AUTH_LOGIN_ACCOUNT_MAX` | `10` | Fallos login / ventana / (IP+email) |
| `AUTH_LOGIN_ACCOUNT_WINDOW_MS` | `900000` | Ventana cuenta (15 min) |
| `AUTH_REFRESH_IP_MAX` | `60` | Refresh / ventana / IP |
| `AUTH_REFRESH_IP_WINDOW_MS` | `60000` | Ventana IP refresh |
| `JWT_EXPIRES_IN` | `15m` | TTL access (antes 8h) |
| `AUTH_SESSION_CACHE_TTL_MS` | `0` | Cache presencia familia (0 = off) |

## 6. Impacto en rendimiento

| Camino | Antes | Después |
| --- | --- | --- |
| Request autenticado | `jwt.verify` CPU | + EXISTS sesión + lectura membresía (cache opcional) |
| Login/refresh públicos | Sin techo | Contadores memoria O(1) |
| Multi-instancia | N/A | Rate limit y cache **por proceso** (sin Redis; edge/WAF si hay N réplicas) |

## 7. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `src/shared/authorization/auth.guard.ts` | Async; revalida sesión + permisos live |
| `src/shared/authorization/access-token.ts` | Claims tipados (`familyId`, `sid`) |
| `src/shared/authorization/access-session.service.ts` | SEC-02/03 revalidación |
| `src/shared/authorization/access-session.cache.ts` | Cache opcional + invalidate |
| `src/shared/authorization/auth-rate-limiter.ts` | SEC-01 in-memory |
| `src/shared/authorization/auth.module.ts` | Providers nuevos |
| `src/shared/config/auth-rate-limit.config.ts` | Env de rate limit / cache |
| `src/shared/config/jwt.config.ts` | Default access `15m` |
| `src/shared/common/app-error.ts` | `RATE_LIMITED` 429 |
| `src/modules/identity/application/session.issuer.ts` | `familyId` en access; `permissionsForRoles` |
| `src/modules/identity/application/refresh-session.use-case.ts` | Pasa family/sid; invalidate |
| `src/modules/identity/application/logout.use-case.ts` | Invalidate post-commit |
| `src/modules/identity/presentation/auth.controller.ts` | Enforce rate limit |
| `.env.example` / `test/setup.ts` | Nuevas vars |
| `docs/audits/auth-hardening-fixes.md` | Este documento |
| `test/auth-hardening.int.spec.ts` | Suite SEC |
| `src/shared/authorization/auth.guard.spec.ts` | Async + SEC-02/03 |
| `src/shared/authorization/auth-rate-limiter.spec.ts` | Unit SEC-01 |

## 8. Pruebas y resultados

| Suite | Resultado |
| --- | --- |
| `npm test` | 9 files / **36** tests OK |
| `npm run build` + `tsc` | OK |
| `npm run test:int` | 8 files / **64** tests OK (incluye hardening, sessions H-04, tenancy H-01, OC, inventario) |
| `npm run db:verify-constraints` | 9/9 OK |

Cobertura SEC añadida:

- Rate limit login IP → 429
- Rate limit refresh IP → 429
- Logout → access posterior 401
- Familia revocada → access 401
- Membresía INACTIVE → 403
- Cambio `roleCodes` → permisos frescos
- `permissions` infladas en DB → no escalan
- Switch-business → permisos del destino + H-01
- Reuso refresh → familia muerta + access 401 (H-04)

## 9. Riesgos pendientes

| Riesgo | Severidad | Nota |
| --- | --- | --- |
| Rate limit in-memory no compartido entre réplicas | P2 | Edge/WAF o store compartido si hay N instancias |
| Access sin `familyId` (tokens pre-deploy) | P3 | Requieren re-login |
| SEC-04 switch no revoca familia anterior | P2 | Fuera de alcance de este corte |
| Columna `permissions` en DB puede quedar stale | P3 | Ya no autoriza; alinear en futuro CRUD users |
| Cache de sesión >0 | P3 | Default off; invalidate post-commit si se activa |
