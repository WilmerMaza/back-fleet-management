# Notificaciones por correo — arquitectura

## Capas

```text
Platform (invitaciones) → SendInvitationEmailUseCase
                        → EmailNotificationService → EmailProvider (adapter)
                        → email_deliveries (trazabilidad)
                        → invitation-email.template (HTML + texto)
```

Los módulos de negocio **no** importan SDK externos.

## Proveedor intercambiable

| Pieza | Ruta |
| --- | --- |
| Puerto | `src/modules/notifications/domain/email-provider.port.ts` |
| Token DI | `EMAIL_PROVIDER` en `notifications.tokens.ts` |
| Adaptador dev | `infrastructure/providers/dev-email.provider.ts` |

Selección en `NotificationsModule` según `EMAIL_PROVIDER`:

| Valor | Envío real |
| --- | --- |
| `dev` | No (solo logs) |
| `resend` | Sí — adapter `resend-email.provider.ts` |

### Resend (desarrollo y primeros despliegues)

1. Cuenta en [resend.com](https://resend.com) → API key → `RESEND_API_KEY`.
2. `.env`: `EMAIL_PROVIDER=resend`, `EMAIL_FROM=onboarding@resend.dev` (pruebas) o correo de dominio verificado.
3. Sin dominio verificado, Resend solo entrega al email de la cuenta que creó la API key.
4. Reiniciar API (`npm run start:dev`).

### Producción

- `NODE_ENV=production` **rechaza** `EMAIL_PROVIDER=dev` en `loadEmailConfig()` (fallo de arranque).
- Identificadores reservados en configuración (`ses`, `resend`, `sendgrid`) validan `EMAIL_FROM`; el adapter debe registrarse en `NotificationsModule` antes de desplegar.
- Vitest / `test:int` siguen usando `dev` vía bypass `VITEST`.

### Añadir un proveedor real (futuro)

1. Implementar `EmailProvider` en `infrastructure/providers/<name>-email.provider.ts`.
2. Registrar en factory de `notifications.module.ts` cuando `EMAIL_PROVIDER=<name>`.
3. Documentar variables de entorno / secretos del proveedor en `.env.example`.
4. **No** tocar `EmailNotificationService` ni los use cases de invitación.

## Variables de entorno

| Variable | Obligatorio | Descripción |
| --- | --- | --- |
| `EMAIL_PROVIDER` | No (default `dev`) | Proveedor activo |
| `EMAIL_FROM` | Sí (excepto tests) | Remitente |
| `EMAIL_FROM_NAME` | No (default `KONTI`) | Nombre remitente |
| `EMAIL_REPLY_TO` | No | Reply-To opcional |
| `APP_FRONTEND_URL` | No (default `http://localhost:4200`) | Base para enlaces de invitación |

Validación: `loadEmailConfig()` al iniciar `NotificationsModule`.

## Trazabilidad (`email_deliveries`)

- Sin tokens ni cuerpos HTML completos.
- Campos: tipo, destinatario, estado (`PENDING`/`SENT`/`FAILED`), proveedor, `provider_message_id`, intentos, error sanitizado (≤500 chars), entidad relacionada (`invitation` + id).

## Invitaciones

1. La invitación se persiste en transacción (comportamiento previo).
2. Después se llama `SendInvitationEmailUseCase`.
3. Fallo de correo → invitación **permanece** `PENDING`; respuesta incluye `emailSent: false` (sin `inviteUrl` / `inviteToken`).
4. Reenvío: `POST /api/v1/admin/businesses/:id/invitations/:invitationId/resend` — misma fila `invitations`.
5. **Reenvío y fallo de correo:** primero se intenta el envío; **solo si `emailSent: true`** se rota `token_hash` y se registra auditoría `invitation.resent`. Si falla el proveedor, el enlace anterior sigue válido; `email_deliveries` queda en `FAILED`.
6. **Creación con fallo de correo:** la invitación ya está persistida con hash; el usuario puede reenviar cuando el correo esté disponible (riesgo documentado: sin correo ni API con token, solo reenvío).

## Reintentos

- Cada intento (crear o reenviar) crea una fila en `email_deliveries` (no se reutiliza la misma fila).
- No hay cola ni worker: reintento = nueva llamada HTTP (p. ej. reenvío).

## Pruebas

Unitarias (`npm test`):

- `invitation-email.template.spec.ts`
- `dev-email.provider.spec.ts`
- `email-notification.service.spec.ts`
- `email.config.spec.ts`
- `platform-invitation-security.spec.ts`
- `accept-invitation.use-case.spec.ts`

Integración (`npm run test:int`): ver [`EMAIL_INTEGRATION_TESTS.md`](./EMAIL_INTEGRATION_TESTS.md).

## Estado comercial

**No hay envío real** hasta configurar un proveedor distinto de `dev` e implementar su adapter. El proveedor `dev` solo registra en logs.
