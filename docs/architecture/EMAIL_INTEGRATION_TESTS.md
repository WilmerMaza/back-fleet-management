# Pruebas de integración — correo e invitaciones

## Infraestructura

Reutiliza el patrón existente del repo:

| Pieza | Ubicación |
| --- | --- |
| Runner | `vitest.config.int.ts` |
| Comando | `npm run test:int` |
| BD | PostgreSQL 16 vía `@testcontainers/postgresql` |
| Datos | `prisma migrate deploy` + `prisma/seed.ts` en `beforeAll` |
| App | `AppModule` + `ValidationPipe` + `HttpExceptionFilter` |

No hay segunda pila de testing.

## Archivo principal

`test/email-invitations.int.spec.ts`

### Override de correo

Se sustituye `EMAIL_PROVIDER` por un proveedor en memoria que:

- Captura `EmailMessage` para extraer el token del HTML/texto (solo en tests).
- Respeta `process.env.TEST_EMAIL_FAIL=1` para simular fallo SMTP.

Los módulos de negocio no se modifican.

## Escenarios cubiertos

| Escenario | Qué valida |
| --- | --- |
| Creación | SUPER_ADMIN, persistencia, `email_delivery` `SENT`, JSON sin `inviteToken` / `inviteUrl` |
| Reenvío | Rotación de `token_hash` tras éxito, auditoría `invitation.resent`, token anterior inválido |
| Aceptación | Membresía + `ACCEPTED`; invitación vencida (`410`); revocada (`409`) |
| Multi-tenant | Reenvío con `businessId` ajeno → `404`; operador sin permiso plataforma → `403` |
| Fallo proveedor | Un solo registro `invitations`; `email_delivery` `FAILED`; hash sin rotar en reenvío |

## Ejecución

```bash
npm run test:int
```

Requisitos: Docker disponible para Testcontainers (como el resto de `test/*.int.spec.ts`).

## Limitaciones

- No prueba proveedor comercial real.
- No cubre reenvíos concurrentes (rate limit / idempotencia).
- El token solo es legible en tests vía captura del mock; en runtime solo viaja por correo.
