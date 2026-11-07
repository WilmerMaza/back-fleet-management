# 06 — Service orders

## Endpoints

- `GET /businesses/{businessId}/service-orders?status=&vehicleId=&search=&page=&pageSize=&sortBy=&sortDir=`
- `GET /businesses/{businessId}/service-orders/{id}`
- `POST /businesses/{businessId}/service-orders`
- `PATCH /businesses/{businessId}/service-orders/{id}`
- `POST /businesses/{businessId}/service-orders/{id}/status`
- `POST /businesses/{businessId}/service-orders/{id}/complete`

## Estados y transiciones

```text
DRAFT → OPEN | CANCELLED
OPEN → IN_PROGRESS | CANCELLED
IN_PROGRESS → COMPLETED | CANCELLED
COMPLETED → (terminal)
CANCELLED → (terminal)
```

Body status: `{ "status": "IN_PROGRESS" }`

## Complete — efectos transaccionales

`POST .../complete` debe ejecutar atómicamente:

1. Validar transición a COMPLETED.
2. Validar `mileage >= vehicle.currentMileage`.
3. Actualizar kilometraje + mileage log (`source=SERVICE_ORDER`).
4. Por cada product usage: validar stock, EXIT movement, decrementar stock.
5. Si hay regla/próximo mantenimiento: upsert `maintenance_schedules`.
6. `closedAt = now()`, `closedByUserId =` usuario autenticado, status COMPLETED.
7. audit `SERVICE_ORDER_COMPLETED` con metadata de actores (ver [07-audit.md](./07-audit.md)).
8. (MVP2) encolar notificaciones.

Alta (`POST`): persistir `createdBy` (JWT), `createdAt`, `openedAt`, `operatorUserId`, `technicianUserId` y audit `SERVICE_ORDER_CREATED`. Cambio de estado no-complete: `SERVICE_ORDER_STATUS_CHANGED` (`fromStatus` / `toStatus`).

Si falla stock u otra regla → rollback completo + 409/422.

## Payload create (resumen)

```json
{
  "customerId": "...",
  "vehicleId": "...",
  "status": "OPEN",
  "openedAt": "ISO",
  "mileage": 85430,
  "technicianUserId": "...",
  "operatorUserId": "...",
  "observations": "...",
  "nextMaintenanceMileage": 95430,
  "nextMaintenanceDate": "2027-01-02",
  "maintenanceRule": "WHICHEVER_FIRST",
  "items": [
    {
      "serviceTypeId": "...",
      "notes": "...",
      "productUsages": [{ "productId": "...", "quantity": 4 }]
    }
  ]
}
```

## Actores (FK `users.id`)

| Campo                         | Quién               |
| ----------------------------- | ------------------- |
| `createdBy` + `createdAt`     | Generó el registro  |
| `operatorUserId`              | Operó la orden      |
| `technicianUserId`            | Ejecutó el servicio |
| `closedByUserId` + `closedAt` | Completó / cerró    |

El back rellena `createdBy` / `closedByUserId` desde la sesión. El cliente puede enviar operador y técnico.

`search` filtra el conjunto completo (no la página). Mínimo: `orderNumber`. El mock también coincide placa, cliente y nombres de servicio; el HTTP debe documentar el mismo alcance o devolver 400 si no lo soporta.

`sortBy` admitido en mock: `orderNumber` | `openedAt` (default) | `updatedAt` | `status` | `mileage`. Default `sortDir=desc`.

Historial de la ficha: hasta que exista `GET .../audit-logs?entityType=SERVICE_ORDER&entityId=`, el repositorio expone `listActivity` (mock lee `audit_logs` de la orden y adjuntos cuyo padre es la orden). No hay estado ni evidencias por ítem: `attachments.entityType=SERVICE_ORDER`.

## Criterios de aceptación

- No editar órdenes COMPLETED/CANCELLED.
- Completar descuenta inventario exactamente una vez.
- Hoja de vida muestra la orden cerrada, quién registró, quién operó y fecha de alta (`registeredAt`).
- Cada create/status/complete deja fila en `audit_logs`.

## Extensión de alcance (mock, 2026-11-02)

El alta sigue sin descontar inventario. Las líneas pueden guardar cantidad prevista, precio copiado y origen. El cierre descuenta la cantidad **consumida** (o la prevista, si la orden es anterior a este cambio) y omite servicios marcados como no realizados. Servicios agregados durante la ejecución no se marcan realizados sin una autorización aprobada. El contrato HTTP de esas operaciones está en [16-service-suggestions.md](./16-service-suggestions.md); todavía no hay `HttpRepository`.
