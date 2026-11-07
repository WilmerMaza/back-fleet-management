# 07 — Auditoría (`audit_logs`)

Fuente de verdad de **quién**, **qué** y **cuándo**. Las tablas operativas guardan FKs vigentes; este log es **append-only** (no UPDATE, no DELETE físico). Toda fila lleva `business_id`.

## Tabla

| Columna         | Tipo        | Notas                                                     |
| --------------- | ----------- | --------------------------------------------------------- |
| `id`            | UUID        | PK                                                        |
| `business_id`   | UUID        | Tenant. NOT NULL, indexado                                |
| `actor_user_id` | UUID        | FK `users.id`. Claim JWT `sub` de quien ejecutó la acción |
| `action`        | text        | Ver acciones                                              |
| `entity_type`   | text        | Recurso auditado                                          |
| `entity_id`     | UUID        | PK del recurso                                            |
| `metadata`      | jsonb       | Snapshot (nombres, transiciones, padre de un adjunto)     |
| `created_at`    | timestamptz | Momento del hecho. No se reescribe                        |

Índices sugeridos: `(business_id, created_at desc)`, `(business_id, entity_type, entity_id)`, `(business_id, actor_user_id, created_at desc)`.

No hay endpoint de listado en MVP1 para el portal. El back lo usa para cumplimiento y para proyectar la hoja de vida. Si se expone después: `GET /businesses/{businessId}/audit-logs?entityType=&entityId=&actorUserId=`.

## Relaciones

```text
users.id  <── audit_logs.actor_user_id
users.id  <── service_orders.created_by
users.id  <── service_orders.operator_user_id
users.id  <── service_orders.technician_user_id
users.id  <── service_orders.closed_by_user_id
users.id  <── attachments.uploaded_by
users.id  <── vehicle_mileage_logs.recorded_by

service_orders.id  <── attachments.entity_id   (entity_type = SERVICE_ORDER)
service_orders.id  <── audit_logs.entity_id    (entity_type = SERVICE_ORDER)
attachments.id     <── audit_logs.entity_id    (entity_type = ATTACHMENT)
```

Roles en una orden (pueden ser el mismo usuario):

| Campo operativo                   | Significado                                      |
| --------------------------------- | ------------------------------------------------ |
| `created_by` + `created_at`       | Quién **generó el registro** y cuándo            |
| `opened_at`                       | Apertura operativa (puede coincidir con el alta) |
| `operator_user_id`                | Quién **operó** (cabina / recepción)             |
| `technician_user_id`              | Quién ejecutó el trabajo                         |
| `closed_by_user_id` + `closed_at` | Quién **cerró** y cuándo                         |

En evidencias:

| Campo              | Significado                           |
| ------------------ | ------------------------------------- |
| `uploaded_by`      | Quién adjuntó (FK)                    |
| `uploaded_by_name` | Snapshot de `users.fullName` al subir |
| `uploaded_at`      | Cuándo se confirmó el metadata        |

El front **no** resuelve nombres con un directorio de usuarios en la hoja de vida. El back denormaliza `actorName` / `operatorName` / `uploadedByName` en la proyección.

## Acciones mínimas

| `action`                        | `entity_type`          | Cuándo                                             |
| ------------------------------- | ---------------------- | -------------------------------------------------- |
| `SERVICE_ORDER_CREATED`         | `SERVICE_ORDER`        | POST create                                        |
| `SERVICE_ORDER_STATUS_CHANGED`  | `SERVICE_ORDER`        | Cambio de estado no terminal vía `/status`         |
| `SERVICE_ORDER_COMPLETED`       | `SERVICE_ORDER`        | POST complete (incluye efectos)                    |
| `ATTACHMENT_UPLOADED`           | `ATTACHMENT`           | Confirmación de metadata tras upload               |
| `ATTACHMENT_DELETED`            | `ATTACHMENT`           | Borrado lógico o físico                            |
| `MILEAGE_UPDATED`               | `VEHICLE`              | Cambio de km (manual, import o efecto de complete) |
| `CUSTOMER_CREATED` / `UPDATED`  | `CUSTOMER`             | Alta / edición                                     |
| `VEHICLE_CREATED` / `UPDATED`   | `VEHICLE`              | Alta / edición                                     |
| `INVENTORY_MOVEMENT_CREATED`    | `INVENTORY_MOVEMENT`   | Cada movimiento                                    |
| `MAINTENANCE_SCHEDULE_UPSERTED` | `MAINTENANCE_SCHEDULE` | Upsert al completar                                |

`actor_user_id` **nunca** se omite: si el mock no tiene sesión, no es válido en backend real (usar el JWT).

## Metadata por acción

### `SERVICE_ORDER_CREATED`

```json
{
  "orderNumber": "000124",
  "vehicleId": "...",
  "customerId": "...",
  "mileage": 84200,
  "openedAt": "ISO",
  "createdByUserId": "...",
  "createdByName": "Operador Demo",
  "operatorUserId": "...",
  "operatorName": "Operador Demo",
  "technicianUserId": "...",
  "technicianName": "Carlos Pérez"
}
```

### `SERVICE_ORDER_STATUS_CHANGED`

```json
{
  "orderNumber": "000124",
  "fromStatus": "OPEN",
  "toStatus": "IN_PROGRESS"
}
```

### `SERVICE_ORDER_COMPLETED`

```json
{
  "orderNumber": "000124",
  "vehicleId": "...",
  "mileage": 84200,
  "closedAt": "ISO",
  "fromStatus": "IN_PROGRESS",
  "operatorUserId": "...",
  "operatorName": "...",
  "technicianUserId": "...",
  "technicianName": "...",
  "closedByUserId": "...",
  "closedByName": "..."
}
```

En la misma transacción: `MILEAGE_UPDATED` (si cambió km), `INVENTORY_MOVEMENT_CREATED` por cada EXIT, `MAINTENANCE_SCHEDULE_UPSERTED` si aplica.

### `ATTACHMENT_UPLOADED`

`entity_id` = PK del adjunto (no el de la orden). El padre va en metadata para consultar “evidencias de esta orden” también por log.

```json
{
  "parentEntityType": "SERVICE_ORDER",
  "parentEntityId": "...",
  "fileName": "tablero.jpg",
  "mimeType": "image/jpeg",
  "uploadedByName": "Carlos Pérez"
}
```

## Proyección `life-history`

Cada ítem `SERVICE` debe incluir, si existen en origen:

- `registeredAt` ← `service_orders.created_at`
- `occurredAt` ← `closed_at` o `opened_at`
- `actorUserId` / `actorName` ← `created_by`
- `operatorUserId` / `operatorName`
- `technicianUserId` / `technicianName`
- `closedByUserId` / `closedByName`

Ítem `MILEAGE`: `actorUserId` ← `recorded_by`. Ítem `EVIDENCE`: `actorUserId` ← `uploaded_by`.

Los adjuntos listados bajo la orden llevan `uploadedBy` + `uploadedByName` + `uploadedAt`.

## Criterios de aceptación (back)

- Completar una orden escribe al menos `SERVICE_ORDER_COMPLETED` con `actor_user_id` = usuario autenticado y `closed_by_user_id` en la orden.
- Cada evidencia confirmada escribe `ATTACHMENT_UPLOADED` con `uploaded_by` y snapshot de nombre.
- Un log no se muta. Corrección = nuevo log (p. ej. `ATTACHMENT_DELETED`).
- Consultar hoja de vida no requiere `GET /users` en el cliente.
