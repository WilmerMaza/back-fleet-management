# Auditoría de seguridad y calidad — correo e invitaciones

| | |
| --- | --- |
| Fecha | 2026-11-10 |
| Repo | `back-fleet-management` |
| Alcance | Ciclo de vida del token, reenvío, `email_deliveries`, configuración, pruebas |

Referencias: [`EMAIL_NOTIFICATIONS.md`](./EMAIL_NOTIFICATIONS.md), [`EMAIL_INFRASTRUCTURE_AUDIT.md`](./EMAIL_INFRASTRUCTURE_AUDIT.md).

## Resumen ejecutivo

La infraestructura greenfield `notifications/` cumple el diseño (puerto `EmailProvider`, trazabilidad sin cuerpos). Se encontró **exposición P0 del token y del enlace en respuestas administrativas** y una **condición de carrera P1** entre reenvío y aceptación. Ambas fueron corregidas. El proveedor `dev` no registra HTML ni tokens (verificado por prueba).

**Estado final:** apto para entornos donde el enlace solo viaja por correo; pendiente proveedor real y pruebas de integración HTTP del flujo admin.

---

## Hallazgos y correcciones

### P0 — Token y enlace en respuestas API administrativas

| Evidencia | Corrección |
| --- | --- |
| `CreatePlatformInvitationUseCase` devolvía `inviteToken` y `inviteUrl`. | Eliminados del contrato de salida; solo metadatos seguros + `emailSent` / `emailDeliveryId`. |
| `CreatePlatformBusinessUseCase` anidaba los mismos campos en `invitation`. | Igual. |
| `ResendPlatformInvitationUseCase` devolvía `inviteUrl`. | Eliminado; respuesta con `emailSent` y `deliveryId`. |

**Verificado:** `platform-invitation-security.spec.ts` — `JSON.stringify(result)` no contiene `/auth/invitation/`.

**Frontend hermano:** modelos y pantallas de plataforma actualizados para no depender del enlace en JSON (`fleet-management`).

### P1 — Carrera reenvío vs. aceptación

| Evidencia | Corrección |
| --- | --- |
| `AcceptInvitationUseCase` marcaba `ACCEPTED` con `update` por `id` tras validar `tokenHash` fuera de TX. Un reenvío concurrente podía rotar el hash y aun así permitir aceptación con el token antiguo ya invalidado en BD pero membresía creada. | Reclamación atómica: `updateMany` con `id`, `tokenHash`, `status: PENDING`, `expiresAt > now` **dentro** de la transacción, antes de crear membresía. |

**Verificado:** `accept-invitation.use-case.spec.ts` — `count: 0` → `INVITATION_NOT_PENDING`.

### P1 — Reenvío sin auditoría ni actor

| Evidencia | Corrección |
| --- | --- |
| `POST .../resend` no registraba auditoría ni pasaba `actorUserId`. | `invitation.resent` vía `AuditService`; controller inyecta `ctx.userId`. |

**Verificado:** aserción en `platform-invitation-security.spec.ts`.

### P1 — Reenvío sobre invitación vencida (estado aún `PENDING`)

| Evidencia | Corrección |
| --- | --- |
| Solo se comprobaba `status === 'PENDING'`, no `expiresAt`. | Si `expiresAt <= now`, transición a `EXPIRED` y `INVITATION_EXPIRED`. Rotación con `updateMany` exige `expiresAt > now`. |

**Verificado:** prueba de expiración en `platform-invitation-security.spec.ts`.

### P2 — Rotación de token en reenvío sin condición de estado

| Evidencia | Corrección |
| --- | --- |
| `invitation.update` incondicional por `id`. | `updateMany` con `businessId`, `status: PENDING`, `expiresAt > now`; fallo → `INVITATION_NOT_PENDING`. |

**Verificado:** prueba de rotación de `tokenHash` distinto al anterior.

### P2 — Riesgo de `dev` en producción (cerrado en Fase 1)

| Evidencia | Corrección |
| --- | --- |
| `EMAIL_PROVIDER=dev` con solo warning en producción. | `loadEmailConfig()` lanza error y la API no arranca — ver `EMAIL_FINAL_VALIDATION.md`. |

**Verificado:** `email.config.spec.ts`.

### P3 — Reenvíos concurrentes

Dos peticiones simultáneas pueden rotar el hash dos veces y enviar dos correos; solo el último token es válido. Comportamiento aceptable para MVP; mitigación futura: idempotencia o rate limit por `invitationId`.

### P3 — `email_deliveries.relatedEntityId`

Sin FK Prisma hacia `invitations` (referencia lógica). Integridad depende de la aplicación; coherente con diseño actual.

---

## Aspectos verificados sin hallazgo crítico

| Área | Resultado |
| --- | --- |
| Persistencia | Solo `token_hash` (SHA-256) en `invitations` — `create-invitation-token.spec.ts`, schema Prisma. |
| Listado admin | `ListPlatformInvitationsUseCase` no expone hash ni enlaces. |
| Validación pública | `ValidateInvitationUseCase` no devuelve token; solo metadatos de negocio. |
| `DevEmailProvider` | Logs: `to`, `subject`, `providerMessageId`; **sin** HTML ni URL con token — `dev-email.provider.spec.ts`. |
| `EmailNotificationService` | No persiste HTML; `lastError` ≤ 500 chars; estados `PENDING` → `SENT`/`FAILED` — specs existentes. |
| Fallo de correo | No duplica filas de invitación; crea/actualiza `email_deliveries` — prueba reenvío con `emailSent: false`. |
| Autorización reenvío | `@RequirePermission(PlatformBusinessesWrite)` + filtro `businessId` en consulta — revisión estática. |
| Configuración | `loadEmailConfig`: proveedor acotado, `EMAIL_FROM` obligatorio fuera de Vitest — `email.config.spec.ts`. |

---

## Pruebas ejecutadas

```text
npm test  — 17 archivos, 54 tests, todos OK (2026-11-10)
```

Nuevas / ampliadas:

- `platform-invitation-security.spec.ts`
- `accept-invitation.use-case.spec.ts`
- `create-invitation-token.spec.ts`
- `dev-email.provider.spec.ts` (sin fuga de token en logs)

**No ejecutadas en esta auditoría:** `npm run test:int` (flujo HTTP end-to-end admin + auth invitación con BD real).

---

## Riesgos pendientes

1. **Proveedor real:** sin adapter comercial; producción requiere implementar `EmailProvider` y secretos solo en servidor.
2. **Integración HTTP:** sin spec que golpee `POST /admin/businesses/:id/invitations` y compruebe ausencia de campos sensibles en JSON.
3. **Reenvío en UI Angular:** endpoint disponible en API; falta botón «Reenviar» en consola (fuera de alcance backend).
4. **Rate limiting** en reenvío/creación masiva de invitaciones.
5. **FK** opcional `email_deliveries` → `invitations` si se exige integridad referencial estricta.

---

## Estado final de la implementación

| Componente | Estado |
| --- | --- |
| Módulo `notifications/` | Operativo (`dev`); listo para adapter adicional |
| Tokens en API admin | **No expuestos** (post-corrección) |
| Reenvío | Rotación de hash, auditoría, multitenancy por `businessId` |
| Aceptación | Acoplamiento atómico token + estado |
| Trazabilidad `email_deliveries` | Independiente del estado de invitación |
| Logs | Sin cuerpos de correo ni enlaces con token (proveedor `dev`) |

---

## Archivos tocados en la remediación

**Backend**

- `create-platform-invitation.use-case.ts`
- `create-platform-business.use-case.ts`
- `resend-platform-invitation.use-case.ts`
- `admin-businesses.controller.ts`
- `accept-invitation.use-case.ts`
- `notifications.module.ts`
- Specs nuevos/ampliados bajo `platform/`, `identity/`, `notifications/`

**Frontend (alineación de contrato)**

- `platform-business.model.ts`, mock repository, páginas create/detail plataforma
