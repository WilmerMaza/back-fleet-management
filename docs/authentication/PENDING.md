# Auth multiempresa — Pendiente (backlog)

| | |
| --- | --- |
| Estado | Alcance diferido a propósito (D10) |
| Fecha | 2026-11-07 |
| Relacionado | Decisiones en `DECISIONS.md` · diseño FASE 2 en chat |

Documento vivo de lo **no implementado aún**. No anticipar suscripciones ni cobros.

## Diferido — producto / flujos

| Ítem | Notas |
| --- | --- |
| Invitaciones **tenant** (crear / revocar desde taller) | **MVP plataforma listo** (`/admin/businesses/:id/invitations` + aceptar en `/auth/invitations/*`). Falta: API/UI por empresa sin consola plataforma |
| Solicitudes de registro de empresa | `BusinessRegistrationRequest` + aprobación superadmin |
| Solicitudes de vinculación (join) | `BusinessJoinRequest` + aprobación admin empresa |
| Onboarding UI (`/onboarding/*`) | Sin membresía → opciones invitación / join / registro |
| Panel superadmin completo | Listado + **crear** + **suspender/reactivar** (`PATCH` status) + invitaciones. Falta: aprobar solicitudes, usuarios globales |
| Admin empresa: invitar colaboradores | Depende de invitaciones tenant |
| Estados ricos de membresía | `PENDING` / `REVOKED` (hoy solo `ACTIVE` / `INACTIVE`) |
| Notificación por email (otros flujos) | Aprobación/rechazo empresa; **invitaciones: MVP con proveedor `dev`** (ver `EMAIL_NOTIFICATIONS.md`) |

## Diferido — seguridad / sesión

| Ítem | Notas |
| --- | --- |
| ~~Refresh en cookie HttpOnly + Secure + SameSite~~ | **Hecho** (D4): `konti_refresh` + CSRF |
| ~~Protección CSRF~~ | **Hecho** en refresh/logout con cookie (`X-XSRF-TOKEN`) |
| ~~Persistencia de sesión tras F5~~ | **Hecho** (front restore via refresh cookie) |
| `APP_GUARD` global + `@Public()` | SEC-05 abierto |
| Rate limit distribuido | Hoy in-memory por proceso |
| Revocar familia anterior en `switch-business` | **Implementado** (2026-11-09, SEC-04) |
| Helmet / security headers | SEC-11 |
| Forgot / reset password | Contrato 01; sin implementación |
| OTP extra al vincular Google | Política D3 actual: sesión password + link, o invitación futura |

## Diferido — modelo / RBAC

| Ítem | Notas |
| --- | --- |
| UI/API completa de roles custom por empresa | Base HTTP 18 parcialmente; CRUD fino y matriz UI |
| Tabla puente `membership_roles` | Hoy `role_codes[]` + roles sembrados en BD |
| Eliminar columna denormalizada `permissions[]` en membresía | Tras estabilizar lectura desde BD |
| Eliminar fallback `ROLE_PERMISSIONS` hardcodeado | Tras dual-read estable |
| FK `auth_refresh_sessions.active_business_id` | H-07 / auditoría sesiones |
| Búsqueda pública empresa por NIT | Exponer mínimo; sin auto-vínculo |

## Diferido — comercial (explícitamente fuera)

Suscripciones · planes · pagos · facturación · trials · límites por plan · licencias.

## Criterio para reabrir

Abrir un ítem de este backlog solo con ticket/alcance explícito. Actualizar esta lista al completar.
