# Cuenta de usuario y miembros del negocio

Implementación integral (perfil, seguridad, notificaciones personales y directorio tenant).

## API

| Método | Ruta | Permiso | Descripción |
| --- | --- | --- | --- |
| GET | `/auth/me` | sesión | Perfil extendido (`hasPassword`, `googleLinkedAt`, `notificationPreferences`) |
| PATCH | `/auth/me` | sesión | Actualizar `fullName` |
| POST | `/auth/set-password` | sesión | Establecer/cambiar contraseña (política ≥ 8) |
| POST | `/auth/link/google` | sesión | Vincular Google (ID token verificado en backend) |
| POST | `/auth/unlink/google` | sesión | Desvincular (exige contraseña local) |
| PATCH | `/auth/me/notifications` | sesión | Preferencias `inAppOperational` / `emailOperational` |
| GET | `/businesses/:businessId/users` | `users.read` | Listado de miembros |
| GET | `/businesses/:businessId/users/:userId` | `users.admin` | Detalle |
| PATCH | `/businesses/:businessId/users/:userId` | `users.admin` | Roles / estado membresía |
| POST | `/businesses/:businessId/users/invitations` | `users.admin` | Invitación + correo (sin token en respuesta) |

Permisos nuevos en seed: `users.read`, `users.admin` (rol `ADMIN`).

## Frontend

- Menú usuario: **Mi perfil**, **Seguridad y acceso**, **Notificaciones**, **Cerrar sesión**.
- Rutas: `/app/cuenta/perfil`, `/app/cuenta/seguridad`, `/app/cuenta/notificaciones`.
- **Usuarios** (`/app/users`): listado HTTP + **Invitar miembro** (correo + rol).

## Migración

`20261111010000_user_notification_preferences` — columna `users.notification_preferences` (JSONB).

Tras desplegar: `npx prisma migrate deploy` y `npx prisma db seed` (o actualizar `role_permissions` en BD existente).

## Pendiente (fuera de este corte)

- §8.3+ del brief original (reenvío tenant, suspender/remover con estados dedicados, `createdAt` de membresía).
- Recuperación de contraseña en UI de seguridad (reutilizar endpoint si existe).
- Avatar / teléfono en perfil (sin campo en modelo actual).
