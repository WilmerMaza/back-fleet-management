# Auditoría — infraestructura de correo (pre-implementación)

| | |
| --- | --- |
| Fecha | 2026-11-10 |
| Repo | `back-fleet-management` |

## Hallazgos

| Área | Estado |
| --- | --- |
| Módulo `notifications/` | **No existía** (contrato 12 = MVP2 stub in-app) |
| SDK SES / SendGrid / Resend | **No** presentes en `package.json` |
| Invitaciones | Implementadas en `platform/` + `identity/`; enlace vía `APP_FRONTEND_URL` |
| Envío de correo en invitar | **No** — la API devolvía `inviteUrl` / `inviteToken` en JSON |
| Tabla de trazabilidad de envíos | **No** |
| Patrón de configuración | Reutilizable: `shared/config/*.ts` + `ConfigModule` global |
| Logging | `AppLogger` (canónico) |

## Decisión

Crear módulo greenfield `notifications/` con puerto `EmailProvider`, sin acoplar proveedores comerciales.

## Reutilizado

- `AppLogger`, `PrismaService`, `AuditModule` (sin cambios de contrato)
- `create-invitation-token` + flujo de persistencia de invitaciones
- `frontend-url` centralizado para enlaces

## Creado

Ver [`EMAIL_NOTIFICATIONS.md`](./EMAIL_NOTIFICATIONS.md).
