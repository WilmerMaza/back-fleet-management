# 03 — Vehicles

## Endpoints

- `GET /businesses/{businessId}/vehicles?search=&plate=&customerId=&fleetId=&status=&page=&pageSize=`
- `GET /businesses/{businessId}/vehicles/{id}`
- `POST /businesses/{businessId}/vehicles`
- `PATCH /businesses/{businessId}/vehicles/{id}`
- `GET /businesses/{businessId}/vehicles/{id}/mileage-logs`
- `GET /businesses/{businessId}/vehicles/{id}/life-history`

## Reglas

- PK = UUID. Placa indexada para búsqueda, unique por negocio recomendada pero no identidad absoluta.
- `fleetId` (query de listado) restringe a vehículos con asignación abierta a esa flota. El mock ya lo aplica; el HTTP debe paginar en servidor.
- `currentMileage` no puede bajar al actualizar (salvo ajuste ADMIN auditado).
- Cada cambio de km crea `vehicle_mileage_logs` con `source` y `recordedBy` (FK usuario).
- `life-history` agrega servicios, mantenimientos, evidencias, documentos y logs de km ordenados desc. Actores: [07-audit.md](./07-audit.md).

## Response life-history

```json
{
  "vehicle": { "...": "..." },
  "items": [
    {
      "id": "...",
      "type": "SERVICE|MAINTENANCE|EVIDENCE|DOCUMENT|ALERT|MILEAGE",
      "title": "...",
      "description": "...",
      "occurredAt": "ISO",
      "registeredAt": "ISO",
      "mileage": 85430,
      "relatedEntityType": "SERVICE_ORDER",
      "relatedEntityId": "...",
      "actorUserId": "...",
      "actorName": "Operador Demo",
      "operatorUserId": "...",
      "operatorName": "Operador Demo",
      "technicianUserId": "...",
      "technicianName": "Carlos Pérez",
      "closedByUserId": "...",
      "closedByName": "Operador Demo"
    }
  ]
}
```
