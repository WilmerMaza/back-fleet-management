# Autorización multi-tenant (MVP actual)

| | |
| --- | --- |
| Decisiones | [`../authentication/DECISIONS.md`](../authentication/DECISIONS.md) |
| Pendiente | [`../authentication/PENDING.md`](../authentication/PENDING.md) |

## Conceptos

| Concepto | Implementación |
| --- | --- |
| Identidad | `users` (+ `auth_identities` para Google `sub`) |
| Autenticación | Password Argon2 y/o Google ID token |
| Autorización | Permisos recalculados en `AuthGuard` desde roles BD |
| Contexto | Un `activeBusinessId` por access token (o null si solo plataforma) |
| Plataforma | `users.platform_role = SUPER_ADMIN` |

## Aislamiento

- `X-Business-Id` y `:businessId` de ruta deben coincidir con el negocio activo del JWT.
- Membresía `ACTIVE` + empresa `ACTIVE`.
- Permisos de claim JWT no autorizan solos (SEC-03).

## RBAC

- Tablas: `permissions`, `roles`, `role_permissions`.
- Roles de sistema por negocio (`ADMIN`, `OPERATOR`, …).
- Rol plataforma `SUPER_ADMIN` (`business_id` null).
- Fallback temporal: mapa código `ROLE_PERMISSIONS` si no hay filas en BD.
