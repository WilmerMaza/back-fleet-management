# Auditoría — autenticación, Google Identity y autorización multiempresa

| | |
| --- | --- |
| Fecha | 2026-11-09 |
| Post-auditoría | 2026-11-09 — P0 Google sin auto-provisión; SEC-04 switch-business; invite+Google |
| Alcance | `back-fleet-management` + `fleet-management` |
| Método | Inspección de código (no solo documentación) |
| Fase | 1 — auditoría (pre-implementación objetivo) |

Referencias cruzadas: [`docs/authentication/DECISIONS.md`](../authentication/DECISIONS.md), [`docs/authentication/PENDING.md`](../authentication/PENDING.md), [`docs/api-contracts/01-auth.md`](../api-contracts/01-auth.md), [`docs/audits/auth-hardening-fixes.md`](../audits/auth-hardening-fixes.md).

---

## A. Estado actual

### A.1 Backend (NestJS + Prisma)

**Módulo `identity/` (LEGACY)** — controlador `AuthController` (`src/modules/identity/presentation/auth.controller.ts`):

| Método | Ruta | Implementado |
| --- | --- | --- |
| POST | `/auth/login` | Sí — Argon2, rate limit IP+cuenta |
| POST | `/auth/google` | Sí — `GoogleTokenVerifier` + `GoogleLoginUseCase` |
| POST | `/auth/refresh` | Sí — rotación + detección reuso familia |
| POST | `/auth/logout` | Sí — revoca fila refresh |
| POST | `/auth/switch-business` | Sí — nueva familia sesión |
| GET | `/auth/me` | Sí — bajo `AuthGuard` |
| POST | `/auth/link/google` | Sí — sesión previa requerida |
| POST | `/auth/set-password` | Sí |
| GET | `/auth/invitations/:token` | Sí — validación pública |
| POST | `/auth/invitations/:token/accept` | Sí — TX atómica |

**No implementado en API** (contrato 01 los prevé o el alcance objetivo los exige): `POST /auth/register`, forgot/reset password, directorio `/users` CRUD, endpoints dedicados approve/reject empresa, invitaciones bajo `/businesses/:id/invitations` (hoy viven en plataforma).

**Módulo `platform/`** — consola SUPER_ADMIN (`admin-businesses.controller.ts`):

- `GET/POST/PATCH /admin/businesses` — crear empresa + invitar admin por email.
- Invitaciones y miembros por negocio de plataforma.
- Cambio de estado empresa vía `PATCH` (`status`: `PENDING` \| `ACTIVE` \| `SUSPENDED` \| `REJECTED`), no rutas semánticas `approve`/`reject`.

**Modelo de datos** (`prisma/schema.prisma`):

| Entidad | Estado |
| --- | --- |
| `User` | Email único; `passwordHash` nullable; `status` reutiliza enum `MembershipStatus` (ACTIVE/INACTIVE) — no hay `deleted_at` ni `username` |
| `AuthIdentity` | `provider` + `providerUserId` (Google `sub`); **sin** `provider_issuer` ni `provider_email`/`revoked_at` |
| `Business` | `BusinessStatus` completo en BD; default Prisma `ACTIVE` (no `pending_approval` al crear vía seed/platform) |
| `UserBusinessMembership` | PK compuesta `(userId, businessId)`; `roleCodes[]` + `permissions[]` denormalizados |
| `Invitation` | `tokenHash` único; estados PENDING/ACCEPTED/EXPIRED/REVOKED |
| `AuthRefreshSession` | Hash refresh, `familyId`, rotación, `activeBusinessId` opcional |
| `RegistrationRequest` | **No existe** |

**Login tradicional** (`login.use-case.ts`): solo usuarios con `passwordHash`; membresías filtradas a `membership.status === ACTIVE` **y** `business.status === ACTIVE`. Multi-empresa: error `SELECT_BUSINESS` si >1 membership y sin `businessId`.

**Google** (`google-token.verifier.ts`): valida firma JWKS, `aud`, `iss` implícito en librería, `exp`, exige `email_verified === true`. Identidad estable = `sub` en `AuthIdentity`.

**Google login** (`google-login.use-case.ts`):

1. Busca identidad por `(GOOGLE, sub)`.
2. Si no existe y hay usuario con mismo email sin Google → `ACCOUNT_EXISTS` (no auto-link por email).
3. Si no existe usuario → **crea usuario + identidad Google sin invitación** (contradice escenario C objetivo: no auto-provisión en login normal).
4. Emite sesión vía `SessionIssuer` (mismas reglas de negocio ACTIVE).

**Vincular Google** (`link-google.use-case.ts`): ID token validado; rechaza si `sub` pertenece a otro usuario; no exige reconfirmación de contraseña en backend.

**Invitaciones** (`accept-invitation.use-case.ts`): hash token con `hashRefreshToken`; expiración lazy; aceptación en `$transaction`; email usuario debe coincidir con invitación; puede fusionar roles si ya había membresía.

**Sesiones** (`session.issuer.ts` + `refresh-session.use-case.ts` + `revoke-session-family.ts`):

- Access JWT corto; refresh en body; solo hash en BD.
- Rotación refresh; reuso revoca familia (cubierto en tests int).
- `AccessSessionService` revalida usuario/membresía/negocio/rol en cada request autenticado (SEC-03).

**Autorización** (`shared/authorization/`):

- `AuthGuard` + `@RequirePermission`.
- Permisos desde BD con fallback `permissionsForRoles` en código.
- Contexto tenant: JWT + header `X-Business-Id`; validación membresía en guard/session service.

**Multi-tenancy operativo**: módulos de dominio filtran `businessId` del contexto. Empresas `PENDING`/`REJECTED`/`SUSPENDED` **no** entran al set de memberships operativas en login/google/me.

**Tests auth** (`test/auth-hardening.int.spec.ts`, `auth-sessions.int.spec.ts`, `auth-tenancy.int.spec.ts`, `token-hash.spec.ts`): login, refresh rotation/reuse, tenancy cross-business, rate limit parcial. **Sin** tests dedicados Google JWKS mock, invitación doble aceptación concurrente, ni registro empresa self-serve.

### A.2 Frontend (Angular)

**Rutas auth**: `auth/login` (guest guard), `auth/invitation/:token` (pública).

**Sesión** (`core/auth/auth.service.ts`): signal en memoria; limpia legacy `localStorage`; **F5 ⇒ sin sesión**. Refresh token almacenado pero **`AuthService` no invoca refresh**; interceptor no hace 401→retry.

**HTTP** (`environment.useHttpBackend: true` en dev): auth real contra `localhost:3000/api/v1`. Google GIS vía `google-identity.service.ts` + `environment.googleClientId` (prod vacío).

**Login**: password + Google + selector radio en `SELECT_BUSINESS`. Sin pantalla registro/autoregistro empresa.

**Invitación**: pantalla completa validate/accept; redirect login con `returnUrl`.

**Google link**: ítem menú shell “Vincular Google”, no página perfil ni reconfirmación contraseña (salvo flujo `loginAndLinkGoogle` en ACCOUNT_EXISTS).

**Empleados**: módulo `admin/users` crea usuarios **con contraseña** vía repositorio que en HTTP **lanza** (no hay API). Invitaciones solo en UI plataforma (`features/platform/businesses`).

**SUPER_ADMIN**: nav `platform-businesses`; alineado con API admin.

**Documentación front** `docs/authentication/PENDING.md`: **obsoleta** — marca invitaciones y panel superadmin como diferidos cuando ya existen en código.

---

## B. Hallazgos

### P0 — Críticos

| ID | Hallazgo | Evidencia |
| --- | --- | --- |
| P0-01 | Login Google **provisiona usuarios** sin invitación ni flujo controlado | `google-login.use-case.ts` crea `user` + `AuthIdentity` si no hay match por `sub` |
| P0-02 | Front **no rota refresh**; access expira ⇒ UX rota sin recuperación silenciosa | `auth.service.ts`, `api-auth.interceptor.ts` |

### P1 — Arquitectura / seguridad importantes

| ID | Hallazgo | Evidencia |
| --- | --- | --- |
| P1-01 | Identidad externa sin **issuer (`iss`)** almacenado; riesgo multi-provider futuro y desalineación con arquitectura objetivo | `AuthIdentity` solo `provider` + `providerUserId` |
| P1-02 | **Autoregistro empresa + aprobación** (escenario A) ausente; solo SUPER_ADMIN crea tenant | No `RegistrationRequest`; `CreatePlatformBusinessUseCase` |
| P1-03 | **Invitaciones tenant-side** y empleados invite-only no cerrados | Invitaciones en `platform/`; front Users con password |
| P1-04 | **Link Google** sin reconfirmación contraseña en backend | `link-google.use-case.ts` |
| P1-05 | Aceptación invitación amarrada a **email** (no a identidad Google `sub`) | `accept-invitation.use-case.ts` L56 |
| P1-06 | `User.status` usa enum de membresía; sin estados suspendido/borrado explícitos de cuenta | `schema.prisma` |
| P1-07 | Contrato HTTP users/auth incompleto vs front con `useHttpBackend` | `auth-http.repository.ts` throws en CRUD users |

### P2 — Funcional / producto

| ID | Hallazgo |
| --- | --- |
| P2-01 | Estados `PENDING`/`REJECTED` en BD sin flujo UX “empresa en revisión” para admin solicitante |
| P2-02 | Approve/reject no son operaciones auditables dedicadas (solo PATCH status) |
| P2-03 | Membresía solo ACTIVE/INACTIVE; sin `suspended`/`removed` ricos |
| P2-04 | Onboarding `/onboarding/*` ausente |
| P2-05 | Forgot/reset password stub en UI y API |
| P2-06 | `GET /auth/identities` y `DELETE /auth/google/link` no existen |
| P2-07 | `permissionGuard` denegación redirige solo `NAVIGATION_CONFIG` (rompe SUPER_ADMIN) |

### P3 — Deuda / mejoras

| ID | Hallazgo |
| --- | --- |
| P3-01 | Docs `PENDING.md` (back y front) parcialmente obsoletos vs código |
| P3-02 | Cookies HttpOnly, CSRF, rate limit distribuido, APP_GUARD global — en backlog DECISIONS |
| P3-03 | `permissions[]` denormalizado en membresía |
| P3-04 | `rememberMe` en UI sin efecto |
| P3-05 | Microsoft button mock en login |
| P3-06 | Falta auditoría explícita en todos los eventos auth listados en alcance objetivo |

---

## C. Matriz de evaluación

| Componente | Estado actual | Problema principal | Acción |
| --- | --- | --- | --- |
| Registro | No hay `POST /auth/register` ni UI autoregistro | Escenario A ausente | **MISSING** (+ diseño `RegistrationRequest`) |
| Login tradicional | Funcional, rate limit, multi-tenant select | Sin registro; sin forgot | **KEEP** + **FIX** (forgot) |
| Google | JWKS OK; login por `sub` | Auto-provisión usuario; sin `iss`; prod clientId vacío en front | **REFACTOR** |
| Identidades | Tabla `auth_identities` | Sin issuer/revoked; sin list/unlink endpoints | **REFACTOR** |
| Empresas | CRUD plataforma; estados en BD | Creación solo SUPER_ADMIN; default ACTIVE | **REFACTOR** |
| Aprobaciones | PATCH status | Sin solicitud ni approve/reject dedicados | **MISSING** / **FIX** |
| Membresías | PK compuesta, multi-empresa | Estados pobres; permisos denormalizados | **KEEP** + **REFACTOR** |
| Invitaciones | Hash, TX accept, platform API | No tenant API; email-gate; sin tests concurrencia | **FIX** + **REFACTOR** |
| Roles | BD + fallback código | Custom roles UI incompleto | **KEEP** |
| Permisos | Revalidación live en guard | Fallback código aún activo | **KEEP** + **FIX** gradual |
| Multi-tenancy | ACTIVE-only ops; cross-tenant tests | Cliente debe enviar `X-Business-Id` (correcto) | **KEEP** |
| Sesiones | Rotación + familia en back | Front sin refresh; memoria-only F5 | **FIX** (front) + backlog cookies |
| Frontend | Login+invitation+platform fuertes | Registro, perfil, refresh, users HTTP, onboarding | **REFACTOR** |

---

## D. Arquitectura objetivo (resumen)

Alineada al brief del proyecto y a [`multi-tenant-authorization.md`](./multi-tenant-authorization.md):

1. **Users** KONTI canónicos; Google solo como `AuthIdentity (provider, issuer, subject)`.
2. **Login Google**: solo si identidad ya vinculada; si no → mensaje “vincula o usa contraseña”; creación de cuenta Google **solo** en aceptación de invitación (u onboarding explícito).
3. **Registro empresa**: usuario + `Business` `pending_approval` + membresía `company_admin` + `RegistrationRequest` auditable; sin módulos operativos hasta `active`.
4. **Plataforma**: approve/reject/suspend/reactivate con auditoría.
5. **Invitaciones** tenant: token aleatorio, hash, un uso, expiración; aceptación TX; rol desde invitación; sin `user_id` arbitrario del cliente.
6. **Vincular Google**: sesión + **reconfirmar contraseña** (o prueba posesión equivalente).
7. **Sesiones**: mantener rotación actual; front debe refresh; cookies HttpOnly en fase posterior.
8. **Separación auth/authz**: sin cambios de principio; reforzar estados empresa/membresía/usuario en emisión de sesión y guards.

---

## E. Plan de migración

### E.1 Base de datos (incremental)

1. Extender `auth_identities`: `provider_issuer` (NOT NULL para nuevos), `provider_email` opcional, `revoked_at`, `updated_at`; unique `(provider, provider_issuer, provider_subject)` — migrar `provider_user_id` → `provider_subject` o alias.
2. Nueva tabla `business_registration_requests` (o reutilizar patrón documentado) desacoplada de `businesses.status`.
3. `businesses`: campos `approved_by`, `approved_at`, `rejection_reason`, `suspended_at` (varios ya parcialmente en platform update — unificar).
4. Opcional: enum `UserStatus` separado de membresía; `MembershipStatus` → `active` \| `suspended` \| `removed`.
5. `invitations`: `accepted_by`, `revoked_at` si faltan.
6. Backfill: issuer Google estándar `https://accounts.google.com` para filas existentes.

### E.2 Backend (orden sugerido)

1. **Google login**: eliminar auto-create; devolver códigos `GOOGLE_NOT_LINKED` / onboarding.
2. **Register + registration request** + transición approve → business active.
3. **Admin** endpoints semánticos approve/reject + auditoría.
4. **Invitations** bajo tenant (`businesses/:id/invitations`) reutilizando use cases platform.
5. **Link/unlink/list identities** + password check en link.
6. **Invitación accept**: permitir match por identidad vinculada además de email (sin sustituir email como canal de entrega).
7. Tests obligatorios del brief §10.
8. Actualizar Swagger y contrato `01-auth.md`.

### E.3 Frontend (orden sugerido)

1. Refresh interceptor + `AuthService.refresh()` antes de expiry.
2. Flujos registro admin + empresa pendiente (pantalla seguimiento).
3. Perfil “Métodos de acceso” + link/unlink Google con reconfirmación.
4. Reemplazar Users password-create por invitaciones en taller.
5. Onboarding sin membresía.
6. Corregir `permissionGuard` redirect platform.
7. `environment.prod.ts` `googleClientId`.
8. Actualizar `docs/authentication/PENDING.md` (front y back).

### E.4 Compatibilidad

- No reset BD; migraciones additive.
- Usuarios creados por Google-login legacy: inventariar en deploy; política merge o bloqueo según ticket.
- Seeds demo intactos hasta migración explícita.

---

## F. Prioridades para fase de implementación

| Orden | Tema | Acción |
| --- | --- | --- |
| 1 | Google auto-provisión | **REPLACE** comportamiento login |
| 2 | Refresh en front | **FIX** |
| 3 | Registro + aprobación empresa | **MISSING** |
| 4 | AuthIdentity + issuer | **REFACTOR** |
| 5 | Invitaciones tenant + invite-only UI | **FIX** |
| 6 | Perfil / link Google seguro | **FIX** |
| 7 | Tests + docs arquitectura restantes | **MISSING** |

---

## Anexo — verificación checklist seguridad

| Pregunta | Resultado |
| --- | --- |
| ¿Google ID token validado (firma, aud, iss, exp)? | **Sí** (librería); nonce no usado (One Tap / prompt) |
| ¿Auto-link por email en login Google? | **No** en login; **sí** gate por email en aceptar invitación |
| ¿Empresa pendiente accede a ops? | **No** (filtro `business.status === ACTIVE`) |
| ¿Reuso invitación? | **No** tras ACCEPTED; falta test concurrencia |
| ¿Roles validados en backend? | **Sí** vía permisos + membresía |
| ¿Usuario suspendido opera? | **Parcial** — `user.status` INACTIVE bloquea; sin “suspended” dedicado |
| ¿Sesión tras revocar membresía? | **Sí** — próximo request/refresh falla (SEC-03) |

---

*Documento generado en Fase 1. La implementación (Fases 2–9 del brief) debe actualizar este archivo con estado IMPLEMENTED al cierre.*
