# 00 — Arquitectura backend

## Responsabilidades

```text
API REST → Application services → Domain → Infrastructure (DB, Storage, Queue)
```

## Multitenancy

KONTI es multi-tenant. El tenant es `businesses` (empresa que contrata la plataforma), no `customers`.

Contrato canónico: [00-multitenancy.md](./00-multitenancy.md).

- Toda tabla operativa incluye `business_id` (UUID, NOT NULL, indexado).
- Identidad en `users`; roles por negocio en `user_business_roles`.
- El middleware resuelve negocio desde `X-Business-Id` o claim JWT (`activeBusinessId` ⊆ `businessIds`).
- Queries siempre filtran por negocio del usuario autenticado.
- Cross-tenant access = 403.

## Auth

- Access token JWT (corto) + refresh token rotativo.
- Claims mínimos: `sub` (userId), `businessIds[]`, `roles[]`.

## Paginación estándar

Request: `?page=1&pageSize=20&search=`

Response:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

## Errores

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Stock insuficiente",
  "details": { "productId": "..." }
}
```

Códigos sugeridos: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INVALID_TRANSITION`.

## Auditoría

Tabla `audit_logs` append-only. Contrato, FKs y metadata: [07-audit.md](./07-audit.md).

Persistir al menos:

- CUSTOMER_CREATED/UPDATED
- VEHICLE_CREATED/UPDATED / MILEAGE_UPDATED
- SERVICE_ORDER_CREATED / STATUS_CHANGED / COMPLETED
- INVENTORY_MOVEMENT_CREATED
- ATTACHMENT_UPLOADED / ATTACHMENT_DELETED
- MAINTENANCE_SCHEDULE_UPSERTED

`actor_user_id` = usuario autenticado. En órdenes también se persisten `created_by`, `operator_user_id`, `technician_user_id`, `closed_by_user_id` y fechas `created_at` / `opened_at` / `closed_at`. En evidencias, `uploaded_by` + `uploaded_at` (+ snapshot `uploaded_by_name`).

## Storage

- Upload via URL firmada (PUT) o multipart.
- Guardar solo metadata + object key en DB.
- Tipos permitidos MVP1: `image/jpeg`, `image/png`, `application/pdf`.

## Ambientes

- DEV / QA / PROD con secrets separados.
- Migraciones versionadas.
- Jobs/cron para evaluación de mantenimientos y vencimientos documentales.
